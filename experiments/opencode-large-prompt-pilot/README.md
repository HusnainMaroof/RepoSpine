# OpenCode large-prompt pilot

This is an experimental, opt-in benchmark for the WorkPacket delivery path.
It compares the same OpenCode model and task in two isolated worktrees:

* `baseline`: the task brief only;
* `codeatlas`: the task brief rendered as a CodeAtlas WorkPacket.

The runner does not change the CLI, provider adapters, or control-plane defaults.
It requires a clean Git repository, a task manifest, a pinned OpenCode model, and
an already-built SDK (`pnpm build`). It never commits or pushes benchmark edits.

## Task manifest

Copy `tasks.example.json` and replace the example tasks with two repository-scale
briefs. Each task must declare its allowed paths, verification commands, and gold
evidence. The same brief is used in both conditions.

```json
{
  "repositoryCommit": "<commit>",
  "tasks": [
    {
      "id": "architecture-task",
      "brief": "A large, concrete task brief...",
      "briefFile": "docs/large-task-brief.md",
      "scopePaths": ["src", "tests"],
      "verify": [{ "command": "pnpm", "args": ["test"] }],
      "goldEvidence": {
        "paths": ["src/entry.ts"],
        "symbols": ["EntryPoint"],
        "constraints": ["Preserve the public API"]
      }
    }
  ]
}
```

## Run

```bash
pnpm build
node experiments/opencode-large-prompt-pilot/run.mjs \
  --repo /path/to/repo \
  --tasks experiments/opencode-large-prompt-pilot/tasks.json \
  --model opencode/model-id \
  --out /tmp/codeatlas-opencode-pilot \
  --repetitions 2
```

The runner records `results.jsonl` and `report.json`. Raw agent output is bounded
and sanitized. Worktrees are temporary and removed after each run unless
`--keep-worktrees` is supplied. The benchmark is directional: two repetitions
per task are not statistical evidence for general model improvement.

The model must be pinned explicitly. If OpenCode cannot be launched with the
requested model, the run fails before creating a result rather than silently
falling back to a different model.
