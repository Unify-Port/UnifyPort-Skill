# Operation Coverage

[English](operations.md) | [简体中文](operations.zh-CN.md)

## Coverage baseline

The catalog mirrors the public UnifyPort API documentation at the time of release. The baseline contains:

- 82 documented actions;
- 78 unique `method + path` pairs;
- 15 conceptual or workflow guides;
- 24 standard webhook event types.

HTTP methods are distributed as `GET 23`, `POST 53`, `PATCH 4`, and `DELETE 2`. Reviewed risk classifications are `read 22`, `write 38`, `credential 14`, and `destructive 8`; risk is not inferred from the method.

Five documented message actions share `POST /v1/messages`, which explains the difference between action and route counts. They remain separate catalog entries because their request shapes and user intent differ.

The complete machine-readable inventories are:

- `skills/unifyport-device-api/references/operations.json`;
- `skills/unifyport-device-api/references/events.json`.

Those files, rather than a duplicated Markdown endpoint list, are validated for completeness and used by the runner.

## Actions by category

| Public documentation category | Documented actions |
| --- | ---: |
| Workspace | 2 |
| Accounts | 6 |
| Authentication | 11 |
| Runtime | 4 |
| Messages | 9 |
| Conversations | 14 |
| Contacts | 8 |
| Groups | 10 |
| API Keys | 4 |
| Webhook Endpoints | 6 |
| Providers | 1 |
| Posts | 4 |
| Calls | 3 |
| **Total** | **82** |

## Guides and events

The Skill also covers the public introduction, quickstart, account lifecycle, provider authorization, provider capability matrices, error reference, webhook delivery and signature verification, standard event payloads, and per-event references.

Event names remain protocol values and are never translated. The current baseline includes 24 event types across message, conversation, group, account runtime, and account authentication domains.

## Coverage versus permission

Catalog coverage means the Skill can identify and explain an action. It does not mean that the action may run automatically.

- `docs-only` is available for every cataloged action and guide.
- A live read requires an explicit request and `UNIFYPORT_API_KEY`.
- A write requires a redacted preview and its HMAC-SHA-256 confirmation token. The token expires after five minutes and is used for at most one execution attempt; expiry, an attempt, or changed input requires a new preview.
- A destructive or credential-sensitive action requires stricter explicit opt-in.
- Provider support still depends on the provider capability documentation and the state of the caller's account.

An operation without a complete risk and confirmation classification is treated as documentation-only until corrected.

## Drift policy

Coverage tests must assert the expected action, unique-route, guide, and event counts. A count change is a review signal, not something to accept automatically. Maintainers must inspect additions, removals, duplicate routes, documentation URLs, schemas, sensitive fields, and risk changes before updating the baseline.

The deployed public documentation remains the publication boundary. An implementation detail or private schema cannot independently add an operation to this Skill.
