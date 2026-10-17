# CodeAtlas as an Agentic Harness: Research Notes

> Status: research only. Nothing in this file is implemented.
> Sources: search snippets for Claude Code and OpenCode, plus a code search of
> CodeAtlas. Full vendor docs were not read, so the feature lists are a snapshot.

## 1. Current state

CodeAtlas is an **orchestrator over external AI CLIs**, not an agent loop.
It launches Claude, Gemini, Codex, and OpenCode, and feeds them context.
Claude Code and OpenCode run their own model-and-tool loops.

What CodeAtlas already has:

- Deterministic, budgeted context: graph traversal, `ContextPackage` with a
  secret deny-filter, a repo digest, and honest staleness.
- Cross-vendor handoff through a task ledger (ADR-025).
- Orchestrator: plan, parallel or sequential roles, per-role timeouts,
  isolated context scopes, and conflict detection.
- Usage tracking with tri-state actual/estimated/unknown cost.
- MCP server and skills.
- Approval gates, but only for tool installs.

## 2. Gaps versus Claude Code and OpenCode

1. Per-action permissions and hooks (Pre/PostToolUse, Stop).
2. Checkpoints and undo (OpenCode uses git snapshots).
3. Compaction for long sessions.
4. Its own tool loop. Rejected for now by ADR-026.
5. LSP diagnostics. CodeAtlas has static structure, not live type errors.
6. MCP client. CodeAtlas is only an MCP server.

## 3. Decision

The user chose to **stay an orchestrator** over external CLIs. This keeps
ADR-026 intact and avoids building a new agent loop.

## 4. Proposed plan (orchestrator-compatible)

1. **Pre-edit impact gate.** Before launch, run the existing `analyze_impact`
   on seed files and attach the blast radius to the context package.
   Read-only, uses the existing graph.
2. **Policy hooks.** Deterministic checks at launch and run end: budget
   limits, secret deny-filter, required verify step. Lives in
   `context-integration`. Keep to a few typed hook points. Needs its own ADR
   because it adds an extension point.
3. **Checkpoints tied to the task ledger.** Record a git ref at each launch and
   handoff. Expose `rollback` per task. Git-based, no new storage.
4. **Post-run verification loop.** Run project checks through
   `@prof-bilal/atlas-verifier`. Failure output goes into the next handoff.
5. **Compaction (later).** Summarize long captured output before handoff, using
   the existing `ContextBriefing` cache.

Items 1 and 3 are the smallest and rely most on existing code.

## 5. Diff improvements

Today the only diff is file-hash comparison (`packages/hashing/src/diff.ts`).
It reports which files changed, not what changed inside them.

Proposed, in order:

1. **Hunks to symbols.** Map each changed hunk to the symbol whose line range
   contains it. Depends on the symbol index storing line ranges. Not yet
   verified.
2. **Outside-diff impact.** From changed symbols, add callers and dependents
   the diff does not touch. Largest expected gain.
3. **Cosmetic-change detection.** Hash each symbol's normalized syntax tree,
   ignoring whitespace and comments, to separate formatting changes from
   structural ones. Tree-sitter parsers exist for Python, Go, Java, C#, Rust;
   ts-morph covers TypeScript.
4. **Diff-scoped context.** Add `--diff <ref>` to `atlas context build` to
   build a budgeted package around changed symbols and their impact.

Constraints:

- Read git diffs with `spawn(file, args)`, never a shell string (AGENTS.md §4.7).
- Measure before claiming improvement. The §5 eval corpus in `freebuff.md`
  does not exist yet. Start with a deterministic check: does the right set of
  symbols and callers appear for a fixed commit?

## 6. Limitations

- Feature lists come from search snippets, not full docs.
- Symbol line-range availability is unverified.
- No code has been changed or measured.
- Related research is in `freebuff.md` §10–§13.
