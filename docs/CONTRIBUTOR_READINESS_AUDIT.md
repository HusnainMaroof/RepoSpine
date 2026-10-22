# CodeAtlas portfolio, contributor, and open-source readiness plan

> Audit status: **current plan, not implementation**. Repository inspected on
> 2026-10-17 from branch `update_features`. This document records verified
> current state and the work required to make a fresh-clone contributor journey
> self-service. It does not claim that the recommendations below are implemented.

## Executive summary

CodeAtlas already has a credible technical foundation: a strict TypeScript/pnpm
monorepo, explicit ports in `packages/core`, feature-owned implementations,
SDK composition, an ESLint dependency matrix, deterministic indexing, persistent
SQLite context, MCP and CLI consumers, multi-language parser seams, and a large
offline test suite. The mutation-aware proof kernel is implemented but explicitly
experimental and opt-in.

The main readiness gap is not missing infrastructure. It is that the repository
asks a newcomer to reconstruct the project story from too many overlapping
documents, several package areas have no local README, and GitHub contribution
mechanics are incomplete. A new contributor can succeed today, but still needs
maintainer guidance to decide which document is authoritative, where a change
belongs, and which surfaces are stable versus experimental.

Recommended order:

1. Make one trustworthy path from README to CONTRIBUTING to the architecture map.
2. Make `docs/REPOSITORY_MAP.md` the definitive “where do I change X?” guide.
3. Remove or archive research artifacts from the product-facing root.
4. Add only package READMEs and fixtures that improve real contributor confidence.
5. Complete the lightweight GitHub issue/PR workflow.
6. Keep the existing quality gate and release smoke, adding only targeted gaps.
7. Make stable, partial, experimental, and planned surfaces impossible to confuse.

The local release gate is strong: build, typecheck, lint, formatting, 1,584 tests
across 163 files, and a cold installed CLI tarball smoke pass. That is evidence
for a public beta candidate, not evidence of universal correctness, live-agent
quality improvement, or remote CI success.

## Audit scope and evidence

Inspected root manifests/tooling, all apps and packages, tests and fixtures,
documentation, GitHub configuration, CI, release scripts, and the current
`update_features` working tree. Important evidence locations are:

- `package.json`, `pnpm-workspace.yaml`, `.npmrc`, `.nvmrc`, `pnpm-lock.yaml`;
- `tsconfig.base.json`, `vitest.config.ts`, `eslint.config.mjs`, `biome.json`;
- `apps/cli`, `apps/extension`, `apps/chatgpt-plugin`;
- every package under `packages/`;
- `packages/*/tests`, `apps/*/tests`, and `tests/fixtures`;
- `README.md`, `CONTRIBUTING.md`, `AGENTS.md`, `SECURITY.md`,
  `CODE_OF_CONDUCT.md`, `CHANGELOG.md`, and `docs/`;
- `.github/` and `scripts/`.

The CodeAtlas index was refreshed with:

```text
node apps/cli/dist/index.js update --repo /home/abdullah/Projects/CodeAtlas --tools none --json
```

The final refresh reported 591 scanned files, 13,597 symbols, 21,992
dependencies, zero changed files, zero unresolved imports, and zero skipped
references. The index is a navigation aid; source files and tests remain the
authority.

## Current strengths to preserve

| Strength | Verified location | Decision |
| --- | --- | --- |
| Single quality gate | root `package.json` (`pnpm check`) | Keep |
| Pinned workspace tooling | `package.json`, lockfile, `.nvmrc`, `.npmrc` | Keep and document |
| Dependency direction | `eslint.config.mjs`, `docs/architecture/DEPENDENCIES.md` | Keep and explain |
| Stable consumer boundary | `packages/sdk`, `createContextSDK` | Keep; consumers do not bypass SDK |
| Deterministic context pipeline | scanner → hashing → parser → graph → storage → search → SDK | Keep as the main story |
| Multi-language seam | `packages/parser/src/treesitter/**` | Keep; add fixtures selectively |
| Storage ownership | `packages/storage/src/schema.ts`, migrations, repositories | Keep; no ad-hoc consumer SQL |
| MCP implementation | `packages/mcp/src/server.ts`, handlers, resources | Keep |
| Context ranking | `packages/context/src`, `ContextBuilderService` | Keep deterministic and AI-independent |
| Provider/agent quarantine | `packages/providers`, `packages/agents`, core ports | Keep |
| Safety boundary | `SECURITY.md`, `docs/reference/SECURITY.md` | Keep argument-array execution and approvals |
| Proof kernel | `packages/proof`, `packages/sdk/src/proof` | Keep opt-in and experimental |
| Status tracking | `docs/CURRENT_STATE.md`, `docs/FEATURE_STATUS.md` | Keep, shorten entry layer |
| Release verification | `scripts/release-smoke.mjs`, `pnpm release:check` | Keep |
| Local diagnostics | `atlas doctor` | Keep and feature in bug reports |
| Test depth | SDK, MCP, parser, toolkit, storage, agents | Preserve; improve gaps |

## Current weaknesses and red flags

### Contributor friction

- `CONTRIBUTING.md`, `docs/contributing/CONTRIBUTING.md`,
  `DEVELOPMENT.md`, `DEVELOPMENT_WORKFLOW.md`, `TESTING.md`, `CODE_QUALITY.md`,
  and `CHANGE_POLICY.md` contain useful material but do not make their hierarchy
  obvious. The root guide should remain the entry point; the others need clear
  deep-document roles rather than another parallel guide.
- `docs/REPOSITORY_MAP.md` is useful but not yet a complete “where do I change X?”
  index for every major subsystem.
- Missing contributor-facing READMEs include `packages/agents`, `metrics`,
  `proof`, `search`, `toolkit`, `usage`, `verifier`, and `apps/extension`.
  `packages/toolkit` is the largest documentation gap; `packages/proof` is the
  most important status/semantics gap.
- The README explains the context engine, but the first screen needs a compact
  end-to-end demo with real output. Its broad feature list can otherwise make
  CodeAtlas look like a generic AI wrapper instead of a deterministic repository
  intelligence system.
- There is no tracked small example application. `tests/fixtures/mcp-audit-repo`
  is a strong test fixture, not a beginner demo.
- There is no `pnpm dev` script. That is fine if supported development loops are
  documented (`pnpm test:watch`, package builds, `atlas watch`); a fake script
  would add confusion.
- There is no general `pnpm benchmark` command with stable baselines. Existing
  proof/control-plane evaluations are not public performance claims.

### GitHub gaps

- `.github/ISSUE_TEMPLATE/bug_report.md` omits the exact command, package manager,
  target language, and `atlas doctor --json`; its sample version is stale.
- `feature_request.md` needs an affected-subsystem field and a “why CodeAtlas?”
  prompt.
- There is no `.github/PULL_REQUEST_TEMPLATE.md` or
  `.github/ISSUE_TEMPLATE/config.yml`.
- `CODEOWNERS` is appropriately maintainer-owned, but its “when they join” MCP
  comment is stale.
- `CODE_OF_CONDUCT.md` does not provide a clear enforcement contact.
- Remote labels were not inspected in this audit; the label system below is a
  proposal, not a claim about current GitHub state.

### Red-flag table

| Red flag | Evidence | Priority | Response |
| --- | --- | --- | --- |
| Product docs and research artifacts are mixed | root research markdown plus `docs/archive/research` | P0 | Keep product docs in root/docs; archive research |
| Status surface is broad and partly experimental | `CURRENT_STATE.md`, `FEATURE_STATUS.md`, proof docs | P0 | Add short status matrix and link detail |
| Duplicate contributor instructions | root and `docs/contributing` | P0 | Define one entry document and deep-doc roles |
| Missing package docs | eight contributor-relevant packages/apps | P1 | Add short READMEs where extension needs them |
| No PR template | `.github/` | P1 | Add a low-friction template |
| No benchmark command | no `pnpm benchmark` | P2 | Defer until corpus/metrics are selected |
| No structural goldens | no parser/graph golden files | P2 | Add narrow fixture outputs |
| Incremental graph limitation | `packages/sdk/src/indexing/indexer.ts` selectively carries usage edges | P1 | Document and regression-test |
| Untracked TUI differs from a clone | `apps/cli/src/tui` intentionally unshipped | P1 | Keep out of launch surface and state clearly |
| Proof can be mistaken for universal correctness | `packages/proof`, `docs/proof-system` | P0 | Keep experimental labels everywhere |

No evidence was found of fabricated benchmark results, missing licensing, a
missing test runner, or unsafe `shell: true` product execution.

## Portfolio-readiness plan

### First 30 seconds

The README answers “what is CodeAtlas?” but is not yet optimized for a portfolio
reader who wants to see it work immediately. The first screen should show:

1. one sentence explaining local, queryable, fresh, attributable repository context;
2. a short real terminal demo using `atlas init`, `atlas search`, and one MCP or
   proof command;
3. representative captured output, with no invented performance numbers;
4. a compact architecture diagram;
5. links to Quick Start, Architecture, Contributing, and limitations.

### README hierarchy to target

1. Product statement and public-beta/status badge.
2. 20–30 line real demo.
3. Why CodeAtlas: fresh, bounded, deterministic-first.
4. Engineering highlights: incremental hashes, parsers, graph, SQLite, SDK, MCP,
   proof invalidation.
5. Quick Start: Node 22.13+, pnpm 9.15, build, test, run.
6. CLI and MCP usage, including the default context profile and opt-in proof profile.
7. Architecture diagram and canonical-document links.
8. Supported languages and parser limitations.
9. Public-beta guarantees and limitations.
10. Contributing, roadmap, changelog, license.

Do not add claims about token reduction, agent success, false-done reduction,
latency, or recall until a reproducible benchmark command produces them.

### Technical showcase

Only list verified work: SHA-256 snapshots; incremental updates; TypeScript/
JavaScript plus lazy WASM parsers for Python/Go/Java/C#/Rust; normalized symbols
and references; injected module resolvers; SQLite repositories and migrations;
deterministic fuzzy search; budgeted context; PageRank and graph traversal; MCP
tools/resources; SDK-only consumers; provider/agent adapters; explicit tool
security gates; and revision-bound proof evidence/invalidation marked experimental.

## Contributor journey

### Current

```text
clone → install → build → check → run CLI → read several docs
      → infer package ownership → add tests → open PR without a PR template
```

The commands work and the gate is meaningful. The weak steps are orientation,
package ownership, experimental-feature boundaries, and PR guidance.

### Target

```text
clone → README demo/Quick Start → install → build → check → atlas doctor
      → REPOSITORY_MAP → package README/architecture guide → focused test
      → package test → check/release smoke when needed → practical PR template
```

## Architecture discoverability

```text
Developer / MCP client / VS Code
          │
          ├── apps/cli                 Commander CLI; delegates to SDK
          ├── packages/mcp              MCP tools/resources and protocol server
          └── apps/extension            VS Code adapter over SDK
                    │
                    ▼
              packages/sdk              composition root/public read API
                    │
      ┌─────────────┼─────────────────────────────┐
      ▼             ▼                             ▼
  scanner      indexing/update                 agents/providers/toolkit
      │             │                             │
      ▼             ▼                             ▼
  hashing      parser → graph → storage      sessions, tools, Skills, AI
                    │
                    ▼
             search → context assembly
                    │
                    ▼
            optional summaries / usage / metrics

  packages/core     contracts, entities, ports only
  packages/shared   Result types, IDs, constants, small utilities
  packages/verifier deterministic checks and command verification
  packages/proof    experimental temporal proof kernel/propagation
```

### Exact “where do I change X?” map

| Goal | Start here | Tests |
| --- | --- | --- |
| Add a language | `packages/parser/src/parser-registry.ts`, `LanguageParser`, `src/treesitter/`; then scanner map, resolver, SDK wiring | `packages/parser/tests` |
| Change discovery/ignore | `packages/scanner/src/` and manifest | `packages/scanner/tests` |
| Change incremental detection | `packages/hashing/src/`, then `packages/sdk/src/indexing/indexer.ts` | hashing + SDK indexer tests |
| Add symbols/references | parser extractors and `symbol-indexer.ts` | parser tests |
| Add graph relationship | `packages/graph/src/`, then persistence and SDK helpers | graph + SDK impact tests |
| Change ranking | `packages/search/src/`, `RelevanceScorer` | search tests |
| Change context budgeting | `packages/context/src/`, SDK deny/context integration | context + SDK tests |
| Change persistence | `packages/storage/src/schema.ts`, migrations, repositories | storage tests; additive migration |
| Add MCP capability | `packages/mcp/src/tools.ts`, handlers, resource registry | MCP handler/protocol tests |
| Add CLI command | `apps/cli/src/commands/<name>.ts`, registration | CLI tests |
| Change SDK composition | `packages/sdk/src/index.ts` and feature folder | SDK tests |
| Add provider | `packages/providers/src/adapters/` behind `ProviderPort` | provider fake-transport tests |
| Add agent/session behavior | `packages/agents/src/`, `packages/sdk/src/sessions/` | agents + SDK session tests |
| Add verification | `packages/verifier/src/` or proof action seam | verifier/proof tests |
| Change proof semantics | `packages/core/src/domain/proof.ts`, `packages/proof`, SDK proof | proof lifecycle/MCP tests + RFC/ADR |
| Add a Skill | `packages/toolkit/src/skills/prebuilt/<id>/SKILL.md`, `builtin.ts` | toolkit built-in tests |
| Add a Tool | `packages/toolkit/src/catalog.json` and relevant adapter | toolkit tests |

This table should become the practical top section of `docs/REPOSITORY_MAP.md`.
Do not create a second repository map.

## Public and internal API audit

Stable consumer surfaces are the CLI behavior/JSON contract in `apps/cli` and
`docs/reference/CLI.md`, the default/proof MCP profiles in `packages/mcp`,
`createContextSDK` and SDK factories in `packages/sdk`, core ports/entities, and
published package `exports`.

Contributors should not depend directly on SQLite tables, repository internals,
parser implementation classes, bundled output, `.codeatlas` internals, or
provider-specific branches. Storage remains inside `packages/storage`; consumers
read through the SDK.

Existing extension seams are sufficient: `LanguageParser`, parser registry,
`ModuleResolver`, `RelevanceScorer`, `ProviderPort`, `AgentPort`, `SessionPort`,
`VerifierPort`, `ContextBuilderPort`, toolkit ports, and proof evidence/action
ports. Do not add generic plugin registries without multiple real implementations
or a clear lifecycle/security boundary.

## Package documentation plan

Add short practical READMEs to:

- `packages/toolkit`: registry, Skills, manifests, compatibility, installer,
  configurator, security, tests, safe extension rules;
- `packages/search`: snapshot input, scorer, ranking seam, output, tests;
- `packages/agents`: CLI detection/connection and what is not the orchestrator;
- `packages/verifier`: deterministic checks, command approval, output handling;
- `packages/usage` and `packages/metrics`: separate stores, provenance, budgets,
  limits, privacy;
- `packages/proof`: **EXPERIMENTAL**, evidence model, invalidation limits, SDK role;
- `apps/extension`: build, VS Code host, SDK boundary, local debugging.

Existing READMEs for parser, graph, storage, scanner, providers, hashing, core,
shared, cache, context, summary, MCP, SDK, CLI, and plugin should be refreshed
for links/status, not rewritten wholesale.

## Testing and fixture strategy

Strong current coverage is in SDK integration, MCP protocol/handlers, parser and
resolvers, toolkit security/installers, agents/processes, storage, hashing, graph,
proof lifecycle, and CLI behavior. Weaker but important areas are `core`,
`context`, `cache`, and `summary`; add focused edge cases for empty input, budget
limits, denial, cache expiry/persistence, summary parse failure, and contracts.

Extend `tests/fixtures/` only where stable source corpora improve confidence:

```text
tests/fixtures/
├── mcp-audit-repo/       existing realistic TypeScript fixture
├── typescript-basic/     symbols/imports/exports/one cycle
├── python-basic/         small tree-sitter fixture
├── monorepo-workspace/   cross-package resolution
├── unresolved-imports/   honest diagnostics
└── incremental-change/   baseline/edit/add/delete snapshots
```

Add `symbols.json`, `edges.json`, and perhaps diagnostics goldens for stable
structural facts. Do not add full context/impact goldens while ranking is still
tunable; assert top-k properties, stable identity, budget, and freshness.

Add one offline CLI workflow test:

```text
atlas init → atlas search → atlas context → atlas doctor
```

The installed release smoke already tests real CLI packaging, Python WASM, 13
Skills, proof invalidation, and real MCP stdio. Keep that as the packaging gate.

## Benchmark plan

There is no general benchmark command. Existing proof/control-plane evaluations
are useful regression artifacts, not public performance or agent-quality claims.
When a corpus is agreed, add `pnpm benchmark` measuring cold/index and
incremental update time, memory, DB size, search/context latency, MCP startup and
tool latency, parser counts/unresolved imports, and proof fan-out/propagation.

Use tracked fixtures for deterministic smoke measurements and one documented
medium repository for scale. Emit machine-readable JSON with machine/runtime
metadata. Do not gate CI on thresholds until variance is understood, and do not
publish agent-quality numbers without held-out tasks and fixed budgets.

## CI plan

Keep `.github/workflows/ci.yml` as the primary PR gate: frozen pnpm install,
build, `pnpm check`, concurrency cancellation, timeout, Node 22.13/current 22/24,
macOS Node 24, and cold installed tarball smoke. This cost is justified for a
filesystem/SQLite package monorepo.

Next, add explicit `atlas --version` and `atlas --help` assertions if the release
smoke does not make the desired failure mode obvious. Add link checking only if it
is dependency-light and offline-friendly. Defer Windows and full platform/runtime
matrices, benchmark thresholds, auto-release, stale bots, and CLA tooling.

## GitHub contribution workflow

Improve the bug template with `atlas --version`, `node -v`, package-manager
version, OS, exact command, target language/size, expected/actual behavior,
`atlas doctor --json`, minimal reproduction, and sanitized logs. Improve the
feature template with affected subsystem, problem, proposed behavior, rationale,
and alternatives.

Add `.github/ISSUE_TEMPLATE/config.yml` only after verifying Discussions and the
private security-advisory URL. Add `.github/PULL_REQUEST_TEMPLATE.md` asking for:
what/why, related issue, tests, architecture/dependency impact, public CLI/MCP/
SDK impact, docs/status changes, and security/privacy considerations. Keep it
short for docs-only changes.

Use a compact label taxonomy:

- `type:bug`, `type:enhancement`, `type:docs`, `type:refactor`;
- `area:parser`, `area:graph`, `area:context`, `area:storage`, `area:mcp`,
  `area:sdk`, `area:cli`, `area:agents`, `area:toolkit`, `area:proof`;
- `good first issue`, `help wanted`, `difficulty:easy`, `difficulty:medium`,
  `difficulty:hard`.

Do not add a label for every package or persona.

## Real contribution opportunities

| Issue | Difficulty | Starting files | Acceptance |
| --- | --- | --- | --- |
| Add `packages/toolkit/README.md` | Easy | toolkit exports/catalog/installer/security | docs review + gate |
| Add experimental `packages/proof/README.md` | Easy | proof source, ADR-028, proof status | limits and links are explicit |
| Add search/verifier READMEs | Easy | package source and tests | purpose/API/tests documented |
| Add `apps/extension/README.md` | Easy | extension + VS Code guide | contributor can build/debug |
| Add TypeScript/parser/graph golden fixture | Medium | parser/graph tests | symbols/edges match stable JSON |
| Add offline CLI workflow smoke | Medium | CLI tests + tracked fixture | init/search/context/doctor works |
| Add weak-package edge-case tests | Medium | core/context/cache/summary tests | empty/budget/error cases covered |
| Document unresolved imports and incremental-edge limits | Easy | map/troubleshooting/indexer docs | missing edges cannot be mistaken for proof |
| Add incremental usage-edge regression | Medium | SDK indexer | changed declaration preserves consumer evidence |
| Add one missing parser syntax | Medium | parser extractor + fixture | syntax and graph behavior tested |

Intermediate work can add graph edges, ranking signals, MCP resources, import
diagnostics, or benchmark measurements. RFC/maintainer discussion is required
for proof semantics, storage/schema, public SDK/CLI/MCP contracts, parser IR,
incremental identity/algorithms, agent execution, provider trust, or security
boundaries.

## Documentation structure to converge on

```text
README.md                         product story, demo, quick start, status
CONTRIBUTING.md                   one contributor entry path
AGENTS.md                         agent-specific repository rules
docs/
├── README.md                     navigation
├── CURRENT_STATE.md              factual status + concise top summary
├── FEATURE_STATUS.md             implemented/partial/planned table
├── REPOSITORY_MAP.md             where-do-I-change-X guide
├── ROADMAP.md                    NOW / NEXT / LATER / RESEARCH
├── architecture/                 ownership, pipeline, dependencies
├── contributing/                 setup, testing, quality, change policy
├── decisions/                    accepted ADRs with unique IDs
├── rfcs/                         lightweight template and accepted RFCs
├── reference/                    CLI, SDK, MCP, security, privacy
├── guides/                       task-oriented user/integration guides
├── proof-system/                 experimental proof design and limits
└── archive/                      dated/superseded audits and research
```

Merge or explicitly cross-link duplicate workflow documents; do not create a
second contributor guide. Add `docs/rfcs/README.md` and `TEMPLATE.md` containing
Problem, Goals, Non-goals, Current Architecture, Proposal, Data/API Impact,
Alternatives, Migration, Risks, and Open Questions. Require an RFC only for
semantics, persistence, parser IR, security, or public contracts.

Add `docs/ROADMAP.md` after reconciling status docs:

- NOW: contributor path, reliability, parser/graph quality, beta feedback;
- NEXT: fixtures, diagnostics, proof usability hardening;
- LATER: measured coupling, verification planning, richer runtime evidence;
- RESEARCH: cross-repo proof, signed attestations, advanced incremental engines,
  semantic/vector retrieval.

## Security and governance

Keep `SECURITY.md` and `docs/reference/SECURITY.md` as sources of truth. Repeat
in contributor docs: do not inspect or commit secrets, never add shell strings
from repository/model input, keep provider calls explicit, respect deny filters
and symlink checks, and add regression tests for process/path changes. A full
penetration test is outside this readiness plan.

Keep governance lightweight: normal bug/docs/test/parser changes use direct PRs;
architecture, persistence, proof, public API, and process changes start with an
issue/RFC; breaking changes need a changelog/migration note; security issues use
the private channel. Add a real enforcement contact to `CODE_OF_CONDUCT.md`.

## Release and examples

The beta release process is credible: versions align at `0.7.0-beta.1`, beta
publication defaults are explicit, `release:check` runs the full gate, and
`scripts/release-smoke.mjs` validates an installed CLI, parser WASM, Skills,
proof invalidation, and MCP stdio. It remains a maintainer action; this plan does
not publish, tag, or push.

Before inviting contributors, reconcile changelog/status/version docs after beta
review, document whether only the CLI or the full workspace dependency train is
published, retain the Node 22.13 floor, and keep limitations visible.

If `examples/README.md` remains referenced, either make `examples/` tracked or
move the guidance to `docs/guides/`; a fresh clone must not link to an ignored
path. Prefer a small maintained `examples/simple-ts-app` only if it is tested.

`atlas doctor` already checks the right class of contributor problems and should
be requested in bug reports. Do not create a second diagnostic command.

## KEEP / IMPROVE / ADD / REMOVE

| Element | Decision | Reason |
| --- | --- | --- |
| README | Improve | Add demo, sharper hierarchy, architecture, honest status |
| Root CONTRIBUTING.md | Keep as entry | Best existing practical guide |
| `docs/contributing/*` | Improve/merge links | Avoid duplicate workflows |
| CURRENT_STATE / FEATURE_STATUS | Keep, improve | Factual arbiter; shorten top layer |
| REPOSITORY_MAP | Improve | Make exact change-location index |
| Architecture docs | Keep, improve | Add package map and API boundaries |
| Existing package READMEs | Keep, refresh | Useful foundation; do not rewrite all |
| Missing high-value READMEs | Add | Toolkit, proof, search, agents, verifier, usage, metrics, extension |
| Root research markdown | Move/archive | Product root should communicate CodeAtlas |
| `docs/archive` | Keep | Correct historical home |
| Tests | Keep, improve | Add focused gaps and CLI workflow |
| Golden fixtures | Add selectively | Stable parser/graph facts only |
| Benchmark command | Defer, then add | Corpus and variance must come first |
| CI | Keep, improve narrowly | Existing matrix/release smoke is justified |
| Issue templates | Improve | Capture actionable reproduction data |
| PR template | Add | Small review checklist |
| CODEOWNERS/FUNDING | Keep | Adequate current surface |
| Code of Conduct | Improve | Add enforcement contact |
| Security docs | Keep/cross-link | Existing guidance is substantive |
| Roadmap | Add after reconciliation | One NOW/NEXT/LATER/RESEARCH view |
| RFC process | Add lightweight | Needed for proof/API/storage/parser changes |
| `pnpm dev` | Defer unless real | Avoid misleading scripts |
| `atlas doctor` | Keep | Existing diagnostic entry |
| Proof system | Keep experimental | Do not market as universal correctness |
| TUI source | Keep out of launch | Existing decision says v2/unshipped |
| New governance bots | Remove from scope | No community scale justifies them |

## Prioritized backlog

### P0 — blocks contributors

1. Reconcile the contributor entry path and define each guide’s authority.
2. Put the change-location table into `docs/REPOSITORY_MAP.md`.
3. Make README/doc links work from a fresh clone, especially ignored examples.
4. Archive or remove root research artifacts from the product-facing tree.
5. Keep stable, partial, experimental, and planned status visible.
6. Add PR template, actionable issue templates, and conduct contact.
7. Run a clean-clone validation on Node 22.13 and record the exact result.

### P1 — high-value improvements

8. Add high-value package READMEs and link them from the architecture map.
9. Add offline CLI init/search/context/doctor workflow coverage.
10. Document and regression-test incremental usage-edge behavior.
11. Add small TypeScript/graph and incremental fixtures.
12. Resolve duplicate ADR numbering and make its README the one index.
13. Add lightweight RFC template and rule to `CHANGE_POLICY.md`.
14. Add a reconciled `docs/ROADMAP.md`.
15. Add explicit CLI/MCP smoke assertions where release smoke does not suffice.

### P2 — useful as community grows

16. Add focused tests for context, cache, summary, and core contracts.
17. Add a reproducible `pnpm benchmark` and non-blocking baseline.
18. Add dependency-light documentation link checking.
19. Introduce compact labels and mark real good-first issues.
20. Add platform coverage in response to observed risk or capacity.

### P3 — defer

21. Automatic releases, changelog/stale bots, CLA tooling, and community platforms.
22. Full platform × runtime matrices.
23. Generic plugin frameworks, alternative databases, or parallel graph stores.
24. Public agent-quality claims without held-out evaluation.

## Phased implementation plan

### Phase 1 — trusted contributor entry path

Goal: a newcomer can understand, install, build, test, diagnose, and locate code.

Why now: highest impact and lowest architectural risk.

Modify: `README.md`, `CONTRIBUTING.md`, `docs/README.md`,
`docs/REPOSITORY_MAP.md`, relevant contributing guides, `CURRENT_STATE.md`,
`FEATURE_STATUS.md`, and ignored-example references. Avoid adding a new guide.

Reuse: current architecture docs, release contract, `atlas doctor`, root scripts.

Risk: duplicating status or changing the source of truth.

Acceptance: one clone→install→build→check path; links resolve in a clean clone;
real demo output works; status labels are unambiguous. Difficulty: **MEDIUM**.

### Phase 2 — repository hygiene and GitHub intake

Goal: the tree looks maintained and a contributor can file/submit work cleanly.

Why now: root clutter and missing templates undermine trust before code review.

Modify/add `.github/ISSUE_TEMPLATE/bug_report.md`, `feature_request.md`,
`config.yml`, `PULL_REQUEST_TEMPLATE.md`, `CODEOWNERS`, `CODE_OF_CONDUCT.md`,
and archive/move root research after preserving links.

Reuse: existing security, ownership, conventional-commit, and quality rules.
Risk: broken historical links or discarded research.
Acceptance: actionable issue fields, short PR checklist, private security path,
and conduct enforcement contact. Difficulty: **LOW–MEDIUM**.

### Phase 3 — package and architecture discoverability

Goal: contributors find the implementation and extension seam in one minute.

Why now: reduces maintainer interruptions and architecture bypasses.

Add the seven package/app READMEs listed above; update the repository map,
architecture map, modules page, and docs index.

Reuse: package manifests, source/tests, and existing README style.
Risk: documenting internals as public API or creating inconsistent mini-guides.
Acceptance: every added README states purpose, input/output, API, extension
points, tests, and dependencies. Difficulty: **MEDIUM**.

### Phase 4 — testing confidence and fixtures

Goal: parser, graph, indexing, context, and packaging changes have focused proof.

Why now: structural contributors need stable expected outputs.

Add only justified tracked fixtures and goldens; update parser/graph/hashing/SDK/
CLI tests and weak core/context/cache/summary tests; update `TESTING.md`.

Reuse `mcp-audit-repo`, helpers, parser registry, Vitest, and release smoke.
Risk: brittle goldens or duplicate fixtures.
Acceptance: CLI workflow, parser/graph structural goldens, incremental regression,
and documented fixture conventions. Difficulty: **MEDIUM–HIGH**.

### Phase 5 — benchmark and CI evidence

Goal: reproducible performance evidence without slowing every PR unnecessarily.

Why now: only after fixtures and metrics are stable.

Add `scripts/bench/`, a root `pnpm benchmark`, benchmark documentation, and only
non-blocking CI reporting at first.

Reuse CLI/indexer/search/context APIs, existing evaluations, fixtures, and smoke.
Risk: noisy or misleading numbers.
Acceptance: cold/incremental/index/search/context/MCP measurements emit JSON with
runtime metadata; no public claim until repeatability is demonstrated.
Difficulty: **HIGH**.

### Phase 6 — lightweight open-source maturity

Goal: architecture and roadmap changes have a small, predictable decision process.

Why now: proof and public API work can otherwise drift.

Add `docs/rfcs/README.md`, `docs/rfcs/TEMPLATE.md`, `docs/ROADMAP.md`; update
`CHANGE_POLICY.md`, ADR index, and duplicate ADR names/links.

Reuse existing ADRs, status tables, proof audit, and change policy.
Risk: governance becoming heavier than the project.
Acceptance: contributors know when a direct PR, issue, ADR, or RFC is required;
roadmap has NOW/NEXT/LATER/RESEARCH and no unverified promises. Difficulty: **MEDIUM**.

## Final readiness score

Scores describe the repository before this plan is implemented:

| Dimension | Score | What prevents 10 |
| --- | ---: | --- |
| Portfolio readiness | 7/10 | README needs sharper demo and product kernel |
| Contributor onboarding | 6/10 | overlapping guides and incomplete map |
| Documentation quality | 7/10 | strong depth, too much entry-layer detail |
| Architecture discoverability | 7/10 | canonical docs exist; map needs consolidation |
| Testing confidence | 8/10 | 1,584 tests; weak packages and few structural goldens |
| CI quality | 8/10 | strong matrix/smoke; remote evidence and Windows absent |
| Issue quality | 5/10 | basic templates lack diagnostic fields |
| Extension friendliness | 6/10 | strong ports, incomplete extension docs |
| Open-source maturity | 6/10 | MIT/security/CoC exist; PR/RFC/roadmap incomplete |
| Release maturity | 7/10 | beta gate credible; publication evidence pending |

Overall: **6.7/10 for a public beta; 5.9/10 for effortless outside contribution**.

## Completion criteria

The repository is contributor-ready when a fresh contributor can, without
maintainer help:

- identify the product and see a real demo within 30 seconds;
- install the documented Node/pnpm versions;
- build, run `pnpm check`, and run CLI/MCP smoke paths;
- find the package and test directory for a stated change;
- distinguish public, internal, experimental, and planned surfaces;
- follow a package extension guide;
- create or extend a fixture without inventing conventions;
- know when an ADR/RFC is required;
- file a useful sanitized bug report with diagnostics; and
- submit a PR with tests, API/architecture impact, security considerations, and
  documentation status.

This bar requires clarity and workflow consolidation, not another architecture
rewrite, a second graph, a vector-search rewrite, or unsupported benchmark claims.
