import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { URL, fileURLToPath } from "node:url";
import { promisify } from "node:util";

/* global console, process */

const exec = promisify(execFile);
const ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const MAX_OUTPUT = 12000;
const DEFAULT_BUDGET = 16000;

function argsFrom(argv) {
  const options = {};
  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith("--")) throw new Error(`Unexpected argument: ${key}`);
    const name = key.slice(2).replaceAll("-", "_");
    const value = argv[i + 1];
    if (value === undefined || value.startsWith("--")) options[name] = true;
    else {
      options[name] = value;
      i += 1;
    }
  }
  return options;
}

function required(options, name) {
  const value = options[name];
  if (typeof value !== "string" || value.length === 0)
    throw new Error(`Missing --${name.replaceAll("_", "-")}`);
  return value;
}

function bounded(text) {
  return String(text ?? "").slice(0, MAX_OUTPUT);
}

function sanitized(text) {
  return bounded(text)
    .replaceAll(/sk-[A-Za-z0-9_-]{20,}/g, "[REDACTED_TOKEN]")
    .replaceAll(/AKIA[0-9A-Z]{16}/g, "[REDACTED_AWS_KEY]")
    .replaceAll(/-----BEGIN [^-]+-----[\s\S]*?-----END [^-]+-----/g, "[REDACTED_PRIVATE_KEY]");
}

async function run(command, args, cwd, env = {}, timeoutMs = 5 * 60 * 1000) {
  const started = Date.now();
  try {
    const result = await exec(command, args, {
      cwd,
      env: { ...process.env, ...env },
      maxBuffer: 2 * 1024 * 1024,
      timeout: timeoutMs,
      killSignal: "SIGTERM",
    });
    return {
      exitCode: 0,
      stdout: sanitized(result.stdout),
      stderr: sanitized(result.stderr),
      durationMs: Date.now() - started,
    };
  } catch (error) {
    return {
      exitCode: typeof error.code === "number" ? error.code : 1,
      stdout: sanitized(error.stdout),
      stderr: sanitized(error.stderr ?? error.message),
      durationMs: Date.now() - started,
      timedOut: error.killed === true || error.signal === "SIGTERM",
    };
  }
}

async function git(repo, args) {
  return run("git", args, repo);
}

async function assertClean(repo) {
  const status = await git(repo, ["status", "--porcelain"]);
  const unexpected = status.stdout
    .split("\n")
    .filter((line) => line.trim() !== "" && line !== "?? node_modules")
    .join("\n");
  if (status.exitCode !== 0 || unexpected !== "")
    throw new Error(`Repository is not clean: ${repo}`);
}

async function linkDependencies(source, worktree) {
  const sourceModules = join(source, "node_modules");
  try {
    await lstat(sourceModules);
    await symlink(sourceModules, join(worktree, "node_modules"), "junction");
  } catch {
    // Dependencies are optional for the packet-only preflight; verification
    // will report a missing install if the task requires package execution.
  }
}

function hash(value) {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function parseResult(result, condition, task, repetition, worktree, packet) {
  return {
    condition,
    taskId: task.id,
    repetition,
    worktree,
    packetId: packet?.id ?? null,
    packetTokens: packet?.budget?.estimatedTokens ?? null,
    packetEvidence: packet?.evidence?.length ?? null,
    packetDeferred: packet?.evidence?.filter((item) => item.deferred).length ?? null,
    exitCode: result.exitCode,
    timedOut: result.timedOut ?? false,
    durationMs: result.durationMs,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

async function runVerification(task, worktree) {
  const results = [];
  for (const command of task.verify) {
    results.push({ ...command, ...(await run(command.command, command.args ?? [], worktree)) });
  }
  return results;
}

async function main() {
  const options = argsFrom(process.argv);
  const repo = resolve(required(options, "repo"));
  const tasksPath = resolve(required(options, "tasks"));
  const model = required(options, "model");
  const out = resolve(options.out ?? join(repo, ".codeatlas-large-prompt-pilot"));
  const repetitions = Number(options.repetitions ?? 2);
  const budget = Number(options.budget ?? DEFAULT_BUDGET);
  const opencode = options.opencode ?? "opencode";
  if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 3)
    throw new Error("--repetitions must be 1..3");
  if (!Number.isInteger(budget) || budget < 512) throw new Error("--budget must be at least 512");
  await assertClean(repo);
  const manifest = JSON.parse(await readFile(tasksPath, "utf8"));
  if (!/^[0-9a-f]{7,40}$/i.test(manifest.repositoryCommit))
    throw new Error("Manifest must pin repositoryCommit");
  if (!Array.isArray(manifest.tasks) || manifest.tasks.length !== 2)
    throw new Error("Manifest must contain exactly two tasks");
  for (const task of manifest.tasks) {
    if (task.briefFile) {
      task.brief = await readFile(resolve(repo, task.briefFile), "utf8");
    }
    if (!task.id || !task.brief || task.brief.length < 24000)
      throw new Error(`Task ${task.id ?? "?"} is not a large brief`);
    if (!Array.isArray(task.scopePaths) || !Array.isArray(task.verify) || !task.goldEvidence)
      throw new Error(`Task ${task.id} is incomplete`);
  }
  const head = await git(repo, ["rev-parse", "HEAD"]);
  if (head.exitCode !== 0 || head.stdout.trim() !== manifest.repositoryCommit)
    throw new Error("Repository HEAD does not match manifest commit");
  const version = await run(opencode, ["--version"], repo, {}, 30_000);
  if (version.exitCode !== 0) throw new Error(`OpenCode preflight failed: ${version.stderr}`);
  await mkdir(out, { recursive: true });
  const results = [];
  const workRoot = join(out, "worktrees");
  await mkdir(workRoot, { recursive: true });
  for (const task of manifest.tasks) {
    for (let repetition = 1; repetition <= repetitions; repetition += 1) {
      for (const condition of ["baseline", "codeatlas"]) {
        const worktree = join(workRoot, `${task.id}-${condition}-${repetition}`);
        await run(
          "git",
          ["worktree", "add", "--detach", worktree, manifest.repositoryCommit],
          repo,
        );
        await linkDependencies(repo, worktree);
        try {
          const prompt =
            condition === "baseline"
              ? task.brief
              : `${task.brief}\n\nUse the supplied CodeAtlas context as evidence. Preserve scope and verify the result.`;
          let packet;
          let launch;
          if (condition === "codeatlas") {
            const sdk = await import(join(ROOT, "packages/sdk/dist/index.js"));
            const indexed = await sdk.indexProject({ repositoryPath: worktree, mode: "build" });
            if (!indexed.ok) throw new Error(indexed.error.message);
            const context = sdk.createContextSDK({ repositoryPath: worktree });
            const sessions = sdk.createSessionManager();
            const integration = sdk.createContextIntegration({ context, sessions });
            packet = await sdk.buildWorkPacket(context, {
              task: task.brief,
              scopePaths: task.scopePaths,
              maxTokens: budget,
              requireFresh: true,
              verificationRequired: true,
            });
            launch = await integration.launch({
              task: task.brief,
              provider: "opencode",
              repositoryPath: worktree,
              deliveryMode: "workPacket",
              maxTokens: budget,
              args: ["--model", model],
              captureOutput: true,
            });
            if (!launch.ok) throw new Error(launch.error.message);
            const finished = sessions.waitForSession
              ? await sessions.waitForSession(launch.value.id, 5 * 60 * 1000)
              : launch;
            const output = sessions.getSessionOutput?.(launch.value.id);
            const runResult = {
              exitCode: finished.ok ? (finished.value.exitCode ?? 1) : 1,
              stdout: sanitized(output?.stdout),
              stderr: sanitized(output?.stderr),
              durationMs: 0,
              timedOut: !finished.ok,
            };
            const verification = await runVerification(task, worktree);
            results.push({
              ...parseResult(runResult, condition, task, repetition, worktree, packet),
              verification,
              changed: (await git(worktree, ["status", "--porcelain"])).stdout,
            });
            context.close();
          } else {
            const runResult = await run(opencode, ["run", prompt, "--model", model], worktree);
            const verification = await runVerification(task, worktree);
            results.push({
              ...parseResult(runResult, condition, task, repetition, worktree, null),
              verification,
              changed: (await git(worktree, ["status", "--porcelain"])).stdout,
            });
          }
        } finally {
          if (!options.keep_worktrees)
            await run("git", ["worktree", "remove", "--force", worktree], repo);
        }
      }
    }
  }
  const report = {
    repositoryCommit: manifest.repositoryCommit,
    model,
    opencodeVersion: version.stdout,
    budget,
    repetitions,
    results,
    generatedAt: new Date().toISOString(),
    resultHash: hash(JSON.stringify(results)),
  };
  await writeFile(
    join(out, "results.jsonl"),
    `${results.map((item) => JSON.stringify(item)).join("\n")}\n`,
  );
  await writeFile(join(out, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(
    JSON.stringify({ out, runs: results.length, resultHash: report.resultHash }, null, 2),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
