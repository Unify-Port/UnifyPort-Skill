# Contributing

[English](CONTRIBUTING.md) | [简体中文](CONTRIBUTING.zh-CN.md)

Thank you for improving the UnifyPort Device API Skill. Every contribution must preserve the public API boundary, the dependency-free installed runtime, and English/Simplified Chinese parity.

## Before you start

- Read [Architecture](docs/architecture.md), [Security](docs/security.md), and [Maintenance](docs/maintenance.md).
- Never use a real API key, phone number, contact, message, webhook payload, session, password, or signing secret in source, tests, screenshots, issues, or pull requests.
- Do not copy server implementation, private schemas, private endpoints, internal hostnames, or production fixtures into this repository.
- Keep changes narrowly scoped. A catalog change and its safety classification must be reviewable as one unit.

## Development

The installed Skill uses the Node.js standard library only. Do not add a runtime dependency, install hook, native binary, or network download. Run:

```sh
npm test
npm run check:catalog
npm run check:bundle
npm run check:repository
npm run check
```

`check:bundle` validates the actual publication root, `skills/unifyport-device-api/`, including its exact file allowlist, size, frontmatter, bilingual structure, public-boundary rules, and data-loss prevention checks. `check:repository` independently scans the complete tracked repository surface so sensitive data cannot hide outside the bundle.

## Catalog changes

The deployed public API documentation is the publication boundary. To add or change an operation:

1. Link to the deployed English and Simplified Chinese documentation.
2. Update the reviewed deterministic snapshot directly, preserving stable ordering and the catalog schema.
3. Review `method`, `path`, request fields, `risk`, `sensitiveFields`, `confirmation.mode`, and `confirmation.optIn`.
4. Add positive tests and fail-closed tests for unexpected input, missing confirmation, redaction, and rejection of sensitive values outside `--input-stdin`.
5. Run the exact-contract validator and update operation/event baselines only after reviewing why each count changed.
6. Obtain review from a maintainer responsible for the public API boundary and security classification.

An endpoint found only in server code is not eligible. Missing risk or confirmation metadata makes an entry documentation-only.

## Bilingual parity

Update every English/Simplified Chinese pair in the same pull request:

- `README.md` / `README.zh-CN.md`;
- `CONTRIBUTING.md` / `CONTRIBUTING.zh-CN.md`;
- `docs/<name>.md` / `docs/<name>.zh-CN.md`;
- `skills/unifyport-device-api/references/en/` / `references/zh-CN/`;
- `SKILL.md` / `SKILL.zh-CN.md` when Agent behaviour changes.

Keep headings, tables, links, code blocks, warnings, and counts structurally aligned. Keep protocol identifiers in English: paths, methods, JSON fields, operation IDs, event types, error codes, enums, commands, and environment variables.

## Pull request checklist

- [ ] The change stays within the deployed public documentation boundary.
- [ ] No credential, personal data, private endpoint, or internal implementation is present.
- [ ] Runtime code still has no external dependency or install hook.
- [ ] Risk, sensitive fields, and confirmation behaviour were reviewed.
- [ ] Sensitive params/query/body values cannot enter argv and require full `--input-stdin` transport.
- [ ] English and Simplified Chinese content is structurally aligned.
- [ ] `npm run check` passes.
- [ ] `clawhub skill publish ./skills/unifyport-device-api --owner unifyport --slug unifyport-device-api --name "UnifyPort Device API" --version 1.0.0 --dry-run --json` succeeds when the CLI is available (replace the version with the release version).
- [ ] The diff of the final publication root was reviewed directly.

## Security disclosure

Do not open a public issue containing an exposed secret or private datum. Revoke or rotate the value first, then contact the maintainers through an approved private channel without copying the sensitive value into the report.
