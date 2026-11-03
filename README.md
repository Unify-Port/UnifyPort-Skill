# UnifyPort Device API Skill

[English](README.md) | [简体中文](README.zh-CN.md)

Use the public UnifyPort Device API from an OpenClaw-compatible agent. The Skill can explain the API without credentials and can make allowlisted live calls when the user explicitly asks for them.

The published bundle is self-contained: it uses only the Node.js standard library, pins live traffic to `https://api.unifyport.ai`, and contains no internal source code, private endpoints, credentials, customer data, or production fixtures.

## What is included

- One canonical ClawHub Skill at `skills/unifyport-device-api/SKILL.md`.
- A public-document catalog covering 82 public documentation actions, 78 unique `method + path` pairs, and 24 standard webhook events.
- A dependency-free Node.js runner with an operation allowlist, secret redaction, and confirmation gates.
- English and Simplified Chinese agent references and maintainer documentation.
- Release checks for structure, bilingual parity, public-boundary safety, secret leakage, and bundle contents.

## Operating modes

| Mode | Credential | Behaviour |
| --- | --- | --- |
| `docs-only` | Not required | Explain concepts, find operations, and prepare examples without sending a request. |
| `read` | `UNIFYPORT_API_KEY` | Execute an allowlisted read only after an explicit live request; redact sensitive output. |
| `write` | `UNIFYPORT_API_KEY` | Preview without network, then require its HMAC-SHA-256 confirmation token for execution. |
| `credential` | `UNIFYPORT_API_KEY` plus explicit opt-in | Require the preview token, `--allow-credential`, full request input through stdin, and stricter output redaction. |

Destructive operations are a stricter subset of `write`: they never execute from an implied request and require the confirmation mechanism defined by the catalog.

## Install

```sh
openclaw skills install @unifyport/unifyport-device-api
```

Before the public ClawHub listing is available, clone this repository and install from the local Skill path:

```sh
openclaw skills install ./skills/unifyport-device-api --as unifyport-device-api
```

No API key is needed for documentation questions. For a live API call, provide the key only through the process environment:

```sh
export UNIFYPORT_API_KEY='<your-api-key>'
```

Do not paste the key into a prompt, command argument, configuration committed to Git, or issue report. The metadata keeps this environment variable optional so ClawHub does not block `docs-only` use.

## Use locally

Node.js 20 or newer is the only runtime requirement; no package installation step is needed.

```sh
npm run check
cd skills/unifyport-device-api
node scripts/api-client.mjs list
node scripts/api-client.mjs describe get-workspace
```

`list` and `describe` do not read the API key. `call <id>` is the only live command. Sensitive request values must use `--input-stdin` with a complete `{params,query,body}` object; see the canonical [SKILL.md](skills/unifyport-device-api/SKILL.md).

The canonical operation and event inventories are:

- `skills/unifyport-device-api/references/operations.json`
- `skills/unifyport-device-api/references/events.json`

Treat those files as reviewed, deterministic public-contract snapshots. Do not add an endpoint merely because it exists in implementation code: it must be present in the published UnifyPort API documentation first.

## Documentation

- [Architecture](docs/architecture.md)
- [Security model](docs/security.md)
- [Maintenance](docs/maintenance.md)
- [Release process](docs/releasing.md)
- [Operation coverage](docs/operations.md)
- [Contributing](CONTRIBUTING.md)
- [Public API documentation](https://www.unifyport.ai/docs/#introduction)

## Repository policy

Only `skills/unifyport-device-api/` is the ClawHub publication root. Repository tooling, tests, and maintainer documents stay outside the published bundle. Release automation must inspect the final candidate bundle as well as the source tree.

## License

MIT-0. See [LICENSE](LICENSE).

The 2026-11-03 local contract update awaits final human evidence review; see [review scope](docs/contract-review.md). This contract update remains unreleased.
