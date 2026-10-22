import type { Result } from "@prof-bilal/atlas-shared";
import chokidar from "chokidar";
import { type IndexResult, indexProject } from "../indexing/indexer";

/** Options for {@link createWatcher}. */
export interface WatcherOptions {
  /** Repository root to watch and re-index. */
  readonly repositoryPath: string;
  /** Debounce window for bursts of file events (default 300ms). */
  readonly debounceMs?: number;
  /** Directory names never watched (default `.git`, `.codeatlas`, build dirs). */
  readonly ignoredDirs?: readonly string[];
  /** Called after each incremental re-index (success or failure). */
  readonly onIndex?: (result: Result<IndexResult>) => void | Promise<void>;
  /** Called on watcher/index errors. */
  readonly onError?: (error: Error) => void;
  /** Composition hook for a caller-owned execution lease; default remains the SDK indexer. */
  readonly runIndex?: () => Promise<Result<IndexResult>>;
  /** Narrow extra metadata paths (e.g. this checkout's Git HEAD/refs). */
  readonly additionalPaths?: readonly string[];
}

/** A running repository watcher. */
export interface Watcher {
  /** Resolve once the underlying watcher is ready. */
  start(): Promise<void>;
  /** Stop watching and release resources. */
  close(): Promise<void>;
  /** Run an incremental re-index immediately (manual trigger / tests). */
  trigger(): Promise<void>;
}

const DEFAULT_IGNORED_DIRS = [".git", ".codeatlas", "node_modules", "dist", "build", "coverage"];

/**
 * Watch a repository and run the existing incremental indexer (`indexProject`
 * with `mode: "update"`) after a debounced burst of file changes. Reuses the
 * hashing + no-op fast path, so only changed files are re-parsed and an idle
 * repo does no work. Changes under ignored directories are never watched.
 */
export function createWatcher(options: WatcherOptions): Watcher {
  const debounceMs = options.debounceMs ?? 300;
  const ignoredDirs = options.ignoredDirs ?? DEFAULT_IGNORED_DIRS;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false;
  let pending = false;
  let closed = false;
  let completion: Promise<void> | undefined;

  const additionalPaths = options.additionalPaths ?? [];
  const fsWatcher = chokidar.watch([options.repositoryPath, ...additionalPaths], {
    ignoreInitial: true,
    ignored: (path: string) => {
      if (
        additionalPaths.some(
          (extra) => path === extra || path.startsWith(`${extra}/`) || extra.startsWith(`${path}/`),
        )
      )
        return false;
      return ignoredDirs.some((dir) => path.includes(`/${dir}/`) || path.endsWith(`/${dir}`));
    },
  });
  const ready = new Promise<void>((resolve, reject) => {
    fsWatcher.once("ready", resolve);
    fsWatcher.once("error", reject);
  });
  // The error callback still reports initialization errors even if start is never awaited.
  void ready.catch(() => {});

  const runIndex = async (): Promise<void> => {
    if (closed) {
      return;
    }
    if (running) {
      pending = true;
      await completion;
      return;
    }
    running = true;
    try {
      const result = await (options.runIndex?.() ??
        indexProject({ repositoryPath: options.repositoryPath, mode: "update" }));
      await options.onIndex?.(result);
    } catch (error) {
      options.onError?.(error instanceof Error ? error : new Error(String(error)));
    } finally {
      running = false;
      if (pending) {
        pending = false;
        schedule();
      }
    }
  };

  const schedule = (): void => {
    if (closed) return;
    if (timer !== undefined) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      timer = undefined;
      completion = runIndex();
    }, debounceMs);
  };

  fsWatcher.on("all", () => schedule());
  fsWatcher.on("error", (error: unknown) => {
    options.onError?.(error instanceof Error ? error : new Error(String(error)));
  });

  return {
    start: () => ready,
    close: async () => {
      closed = true;
      if (timer !== undefined) {
        clearTimeout(timer);
      }
      await fsWatcher.close();
      await completion;
    },
    trigger: () => {
      completion = runIndex();
      return completion;
    },
  };
}
