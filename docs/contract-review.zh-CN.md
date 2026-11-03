# 公开契约复核

[English](contract-review.md) | [简体中文](contract-review.zh-CN.md)

按用户授权完成本地实现，2026-11-03 重新抓取并比对部署文档；82 个动作、78 条路由、24 个事件。最终人工复核待完成，humanReviewed=false；尚未发布。

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

机器记录包含字段、风险、敏感输出与中英文可见正文的 SHA256，便于复核同一文档快照。只使用公开部署页面，不使用 SDK 或其他仓库代码。

Facebook 已有公开授权指南与矩阵：session、runtime、E2EE 单聊和单媒体；四类回调已复核，received 可入站/出站。权限、HMAC、凭证 opt-in 与默认脱敏保持适用。最终人工复核应覆盖字段、渠道、标识符、错误码、链接敏感性、异步完成边界及真实账号验收。

[Machine-readable evidence](public-contract-review.json)
