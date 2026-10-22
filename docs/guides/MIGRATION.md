# CodeAtlas → RepoSpine migration

CodeAtlas is now RepoSpine: **the code-intelligence backbone for AI coding
agents**.

## What changed

- The canonical CLI is `repospine`.
- The published CLI package is `repospine-cli`.
- The public product name, README, CLI description, and editor status text use
  RepoSpine.

## Compatibility retained

Existing projects continue to use their current `.codeatlas/` directory and
database. The `atlas` executable remains an alias, and existing MCP/editor
command identifiers are retained so current integrations do not break.

These compatibility identifiers will be deprecated in a future major release,
after a migration command and an explicit deprecation timeline are available.

## New installation

```bash
npm install --global repospine-cli
repospine init --repo /path/to/project
repospine context "fix the authentication tests" --repo /path/to/project
```

## Existing installation

The old command continues to work:

```bash
atlas update --repo /path/to/project
```

Switch new scripts and documentation to `repospine` when convenient. Do not
rename `.codeatlas/` manually; it contains persisted context, usage, Skills,
tools, and task data and will be migrated by a future dedicated migration
release.
