# Public contract review

[English](contract-review.md) | [简体中文](contract-review.zh-CN.md)

Local implementation follows user approval and deployed docs retrieved on 2026-11-03: 82 actions, 78 routes and 24 events. Final human verification remains pending (humanReviewed=false); no release is claimed.

| Action | Public docs | Query | Body | Risk |
| --- | --- | --- | --- | --- |
| `get-account-operation` | [EN](https://www.unifyport.ai/docs/accounts/get-account-operation/) / [ZH-CN](https://www.unifyport.ai/zh-CN/docs/accounts/get-account-operation/) |  |  | read |
| `create-auth-session` | [EN](https://www.unifyport.ai/docs/authentication/create-auth-session/) / [ZH-CN](https://www.unifyport.ai/zh-CN/docs/authentication/create-auth-session/) |  |  | credential |
| `submit-passkey-response` | [EN](https://www.unifyport.ai/docs/authentication/submit-passkey-response/) / [ZH-CN](https://www.unifyport.ai/zh-CN/docs/authentication/submit-passkey-response/) |  | webauthn_response | credential |
| `confirm-passkey` | [EN](https://www.unifyport.ai/docs/authentication/confirm-passkey/) / [ZH-CN](https://www.unifyport.ai/zh-CN/docs/authentication/confirm-passkey/) |  |  | credential |
| `add-contact` | [EN](https://www.unifyport.ai/docs/contacts/add-contact/) / [ZH-CN](https://www.unifyport.ai/zh-CN/docs/contacts/add-contact/) |  | phone_number, username, whatsapp_options | write |
| `get-contact-membership` | [EN](https://www.unifyport.ai/docs/contacts/get-contact-membership/) / [ZH-CN](https://www.unifyport.ai/zh-CN/docs/contacts/get-contact-membership/) | contact_id |  | read |
| `request-conversation-history` | [EN](https://www.unifyport.ai/docs/conversations/request-conversation-history/) / [ZH-CN](https://www.unifyport.ai/zh-CN/docs/conversations/request-conversation-history/) |  | conversation_id, before, limit | write |
| `list-posts` | [EN](https://www.unifyport.ai/docs/accounts/list-posts/) / [ZH-CN](https://www.unifyport.ai/zh-CN/docs/accounts/list-posts/) | cursor, limit |  | read |
| `get-post` | [EN](https://www.unifyport.ai/docs/accounts/get-post/) / [ZH-CN](https://www.unifyport.ai/zh-CN/docs/accounts/get-post/) |  | post_id | read |
| `list-post-comments` | [EN](https://www.unifyport.ai/docs/accounts/list-post-comments/) / [ZH-CN](https://www.unifyport.ai/zh-CN/docs/accounts/list-post-comments/) |  | post_id, cursor, limit | read |
| `reply-post-comment` | [EN](https://www.unifyport.ai/docs/accounts/reply-post-comment/) / [ZH-CN](https://www.unifyport.ai/zh-CN/docs/accounts/reply-post-comment/) |  | post_id, comment_id, text | write |
| `create-call` | [EN](https://www.unifyport.ai/docs/calls/create-call/) / [ZH-CN](https://www.unifyport.ai/zh-CN/docs/calls/create-call/) |  | account_id, to, media_type | write |
| `get-active-call` | [EN](https://www.unifyport.ai/docs/calls/get-active-call/) / [ZH-CN](https://www.unifyport.ai/zh-CN/docs/calls/get-active-call/) | account_id |  | read |
| `hangup-call` | [EN](https://www.unifyport.ai/docs/calls/hangup-call/) / [ZH-CN](https://www.unifyport.ai/zh-CN/docs/calls/hangup-call/) |  | account_id | destructive |

The machine record includes fields, risk, sensitive outputs and SHA256 of visible bilingual page text for snapshot reconciliation. Only deployed public docs were used, without SDK or sibling implementation input.

Facebook now has public auth guidance and matrices: session, runtime, E2EE direct conversations and single media, with four existing callbacks. Received can be inbound/outbound. Permissions, HMAC, credential opt-in and redaction still apply. Final human verification should check fields, providers, identifiers, error codes, secret links, asynchronous completion boundaries and real-account acceptance.

[Machine-readable evidence](public-contract-review.json)
