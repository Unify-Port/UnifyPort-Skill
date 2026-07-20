# Maintenance

[English](maintenance.md) | [简体中文](maintenance.zh-CN.md)

## Maintainer invariants

Every change must preserve these invariants:

- `skills/unifyport-device-api/SKILL.md` is the only canonical Skill entry and its `name` matches the directory.
- `UNIFYPORT_API_KEY` remains optional in metadata so documentation use is never credential-gated.
- The runner has no third-party runtime dependency and has no install hook.
- Live requests use only `https://api.unifyport.ai` and only operations present in the reviewed catalog.
- Unknown risk, schema, sensitive-field, or confirmation data fails closed.
- English and Simplified Chinese explanatory content changes together.
- The published bundle contains no private implementation, private API, credential, customer data, or real production example.

## Public-contract update workflow

1. Review the deployed [English](https://www.unifyport.ai/docs/#introduction) and [Simplified Chinese](https://www.unifyport.ai/zh-CN/docs/#introduction) documentation.
2. Record additions, removals, and changed request or response semantics. A server-only route is not evidence of public support.
3. Update the reviewed deterministic snapshots `references/operations.json` and `references/events.json`, preserving stable ordering and schema.
4. For each changed operation, review `risk`, `sensitiveFields`, `confirmation.mode`, and `confirmation.optIn` independently of the HTTP method.
5. Add or update positive and negative runner tests. Negative tests must cover uncatalogued paths, unexpected fields, host overrides, redirects, missing confirmation, secret redaction, and rejection of sensitive input outside full `--input-stdin` transport.
6. Update matching files under `references/en/` and `references/zh-CN/`, plus paired repository documents when behaviour or policy changed.
7. Run the exact-contract validator, `check:bundle` on the real publication root, `check:repository` on the whole tracked repository surface, and the test suite.
8. Have a maintainer review the public boundary and security classification before release.

## Catalog review checklist

Each operation entry must have:

- a stable `id` and `operationId`;
- `category`, `title`, `method`, and a normalized public `path`;
- direct `docs.en` and `docs.zh-CN` URLs;
- an explicit `risk` value;
- `sensitiveFields`, even when the array is empty;
- a complete `confirmation` policy;
- enough parameter metadata for the runner to reject unknown input.

Duplicate `method + path` pairs are valid only when the public documentation describes distinct action shapes, such as the message variants on `POST /v1/messages`. The runner must still select one exact `operationId` before validating a payload.

## Bilingual maintenance

Protocol tokens are never translated. Keep `operationId`, `id`, JSON keys, event names, error codes, enum values, commands, paths, and environment variables identical in both languages.

When editing prose:

1. Update the English and Simplified Chinese pair in the same pull request.
2. Keep heading order, tables, code blocks, links, warnings, and operation counts structurally aligned.
3. Check that every local language-switch link resolves.
4. Prefer concise explanations over copying the full public API reference into this repository.

## Dependency policy

The installed Skill must run with the Node.js standard library alone. Adding a runtime dependency, package manager requirement, native binary, download step, or post-install action is an architecture change and requires explicit approval. Development tooling should also remain minimal and must never be copied into the published bundle.

## Versioning

Use Semantic Versioning for the Skill:

- patch: wording, links, redaction improvements, or compatible catalog corrections;
- minor: newly published operations or backward-compatible runner capability;
- major: command contract, confirmation semantics, catalog schema, or behavioural changes that can break existing Agent workflows.

Do not reuse a published version. Catalog drift alone does not justify an automatic release; every version is reviewed and published deliberately.

## Scheduled review

At least once per release cycle, verify:

- public documentation counts and URLs;
- public origin and authentication header;
- ClawHub format and metadata requirements;
- Node.js runtime compatibility;
- secret-scan rules and redaction fixtures;
- a clean install followed by a `docs-only` task and a mocked live-call test.

Never use a real API key or customer record in CI.
