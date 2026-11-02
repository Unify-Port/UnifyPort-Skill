# Public contract review (pending)

[English](contract-review.md) | [简体中文](contract-review.zh-CN.md)

Retrieved 2026-11-02 from deployed public documentation only. The 14 candidate routes below were checked for a matching page title and displayed HTTP method/path. This is review evidence, not an active allowlist or a claim that every request/response field has been reviewed.

`AGENTS.md` requires human verification of public-doc evidence before changing the exact allowlist. The active catalog, `scripts/public-contract.json`, runtime, confirmation HMAC and opt-ins remain unchanged. No sibling repository is an implementation source for this independent Skill. No package is published.

| Deployed reference | Candidate route | Human review |
| --- | --- | --- |
| [EN](https://www.unifyport.ai/docs/accounts/get-account-operation/) / [ZH-CN](https://www.unifyport.ai/zh-CN/docs/accounts/get-account-operation/) | `GET /v1/account-operations/{operation_id}` | pending |
| [EN](https://www.unifyport.ai/docs/authentication/create-auth-session/) / [ZH-CN](https://www.unifyport.ai/zh-CN/docs/authentication/create-auth-session/) | `POST /v1/accounts/{account_id}/auth-sessions` | pending |
| [EN](https://www.unifyport.ai/docs/authentication/submit-passkey-response/) / [ZH-CN](https://www.unifyport.ai/zh-CN/docs/authentication/submit-passkey-response/) | `POST /v1/accounts/{account_id}/auth/passkey-response` | pending |
| [EN](https://www.unifyport.ai/docs/authentication/confirm-passkey/) / [ZH-CN](https://www.unifyport.ai/zh-CN/docs/authentication/confirm-passkey/) | `POST /v1/accounts/{account_id}/auth/passkey-confirm` | pending |
| [EN](https://www.unifyport.ai/docs/contacts/add-contact/) / [ZH-CN](https://www.unifyport.ai/zh-CN/docs/contacts/add-contact/) | `POST /v1/accounts/{account_id}/contacts/add` | pending |
| [EN](https://www.unifyport.ai/docs/contacts/get-contact-membership/) / [ZH-CN](https://www.unifyport.ai/zh-CN/docs/contacts/get-contact-membership/) | `GET /v1/accounts/{account_id}/contacts/membership` | pending |
| [EN](https://www.unifyport.ai/docs/conversations/request-conversation-history/) / [ZH-CN](https://www.unifyport.ai/zh-CN/docs/conversations/request-conversation-history/) | `POST /v1/accounts/{account_id}/conversations/history/request` | pending |
| [EN](https://www.unifyport.ai/docs/accounts/list-posts/) / [ZH-CN](https://www.unifyport.ai/zh-CN/docs/accounts/list-posts/) | `GET /v1/accounts/{account_id}/posts` | pending |
| [EN](https://www.unifyport.ai/docs/accounts/get-post/) / [ZH-CN](https://www.unifyport.ai/zh-CN/docs/accounts/get-post/) | `POST /v1/accounts/{account_id}/posts/info` | pending |
| [EN](https://www.unifyport.ai/docs/accounts/list-post-comments/) / [ZH-CN](https://www.unifyport.ai/zh-CN/docs/accounts/list-post-comments/) | `POST /v1/accounts/{account_id}/posts/comments/list` | pending |
| [EN](https://www.unifyport.ai/docs/accounts/reply-post-comment/) / [ZH-CN](https://www.unifyport.ai/zh-CN/docs/accounts/reply-post-comment/) | `POST /v1/accounts/{account_id}/posts/comments/reply` | pending |
| [EN](https://www.unifyport.ai/docs/calls/create-call/) / [ZH-CN](https://www.unifyport.ai/zh-CN/docs/calls/create-call/) | `POST /v1/calls` | pending |
| [EN](https://www.unifyport.ai/docs/calls/get-active-call/) / [ZH-CN](https://www.unifyport.ai/zh-CN/docs/calls/get-active-call/) | `GET /v1/calls/active` | pending |
| [EN](https://www.unifyport.ai/docs/calls/hangup-call/) / [ZH-CN](https://www.unifyport.ai/zh-CN/docs/calls/hangup-call/) | `POST /v1/calls/{call_id}/hangup` | pending |

Machine-readable route evidence is in [public-contract-review.json](public-contract-review.json). Every entry remains `humanReviewed: false`.

## Review before activation

- Review each linked page's required fields, provider restrictions, identifiers, statuses and error codes; a method/path match alone is insufficient.
- Explicitly approve catalog action names, request/response field allowlists, data classifications, confirmation policy and credential/destructive opt-ins. Writes keep API-keyed, domain-separated HMAC confirmation.
- Treat browser authorization and call join URLs as credentials. Never echo them into prompts, logs or model-safe output. `201 preparing` prepares a call and does not dial; ending a call is destructive.
- History acceptance is asynchronous, best effort and not completion; callbacks can be absent, duplicate or late. Do not add implicit retries.
- Account operations require bounded polling and reconciliation; operation state does not prove authorization, refund credit or immediate free capacity.
- Independently review [standard events](https://www.unifyport.ai/docs/receiving-events/webhook-events/) and [delivery](https://www.unifyport.ai/docs/receiving-events/webhook-delivery/) before changing the event allowlist or verification code. This route review does not authorize an event or signature change.
- After human review, update both languages, catalogs, exact public contract and tests together, then run `npm run check`. Review any release separately.
