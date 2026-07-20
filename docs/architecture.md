# Architecture

[English](architecture.md) | [简体中文](architecture.zh-CN.md)

## Goals

This repository turns the published UnifyPort Device API contract into one maintainable ClawHub Skill. It must remain useful without credentials, become executable without third-party packages, and fail closed whenever an operation or risk classification is unknown.

## Components

```text
Published API documentation
          |
          v
Reviewed public operation catalog ---- Reviewed webhook event catalog
          |                                      |
          +------------------+-------------------+
                             v
                   Canonical SKILL.md
                             |
                             v
               Dependency-free Node.js runner
                             |
                             v
                  https://api.unifyport.ai
```

The repository has two boundaries:

1. `skills/unifyport-device-api/` is the complete ClawHub bundle. It contains the canonical Skill, the runner, the two machine-readable catalogs, and agent-facing bilingual references.
2. The repository root contains maintainer-only tooling, tests, and documentation. These files are never required after installing the Skill.

## Sources of truth

The deployed public API documentation defines what may be described and exposed. `references/operations.json` and `references/events.json` are reviewed snapshots of that boundary and are the only runtime allowlists.

Non-public implementation and schemas are not publication sources: they are never copied into the bundle and never expand the public catalog. A route missing from the published documentation remains out of scope.

## Runtime flow

1. The Agent decides whether the request is `docs-only`, `read`, `write`, or `credential`.
2. It resolves the requested action by `id` or `operationId` in `operations.json`.
3. The runner validates method, path parameters, query parameters, body shape, risk, and confirmation policy against that entry.
4. The runner builds a request for the fixed public origin. It reads `UNIFYPORT_API_KEY` only when a live call is required.
5. A state-changing or sensitive action is previewed and confirmed according to the catalog before transport.
6. The response is size-limited and redacted before it is returned to the Agent.

No step accepts an arbitrary URL, arbitrary method, or uncatalogued path.

## Bilingual design

Machine-readable protocol values remain English: operation IDs, methods, paths, JSON field names, enum values, error codes, and event types. Explanatory prose is paired by location:

- repository documents: `docs/<name>.md` and `docs/<name>.zh-CN.md`;
- installed references: `references/en/` and `references/zh-CN/`;
- entry documents: `README.md` and `README.zh-CN.md`.

`SKILL.md` is the single canonical ClawHub entry. `SKILL.zh-CN.md` is a human-readable translation and is not a second Skill entry.

## Extension rules

Adding an operation requires all of the following:

1. Evidence that the action is present in the deployed public documentation.
2. A catalog entry with documentation URLs, risk, sensitive fields, and confirmation policy.
3. Runtime validation and negative tests.
4. Matching English and Simplified Chinese documentation updates.
5. A scan of the final bundle for secrets, private endpoints, internal hostnames, and non-text artifacts.

These rules keep new public capabilities reviewable without coupling the Skill to the server implementation.
