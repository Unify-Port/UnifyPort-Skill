# 公开契约复核（待人工审核）

[English](contract-review.md) | [简体中文](contract-review.zh-CN.md)

2026-11-02 仅从已部署的公开文档取证。下列 14 个候选路由已核对页面标题和展示的 HTTP method/path。这是审核证据，不是运行中的 allowlist，也不表示所有请求/响应字段已审核。

`AGENTS.md` 要求精确 allowlist 变更前人工复核公开文档证据，因此当前 catalog、`scripts/public-contract.json`、runtime、确认 HMAC 及 opt-in 均保持原样。本独立 Skill 不以任何同级仓库作为实现来源。本次不发布。

| 已部署文档 | 候选路由 | 人工审核 |
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

机器可读路由证据见 [public-contract-review.json](public-contract-review.json)，所有条目仍为 `humanReviewed: false`。

## 开放前复核

- 逐页审核必填字段、渠道限制、标识符、状态和错误码；method/path 相符不足以开放接口。
- 明确批准 catalog action 名称、请求/响应字段 allowlist、数据分类、确认策略及 credential/destructive opt-in；写入继续使用基于 API key、带 domain separation 的 HMAC 确认。
- 浏览器授权链接及通话 join URL 按凭证处理，不回显到 prompt、日志或模型安全输出。`201 preparing` 只是准备通话，不代表已经拨号；结束通话属于 destructive。
- 历史请求为异步 best effort，接收不等于完成；回调可能缺失、重复或晚到，不增加隐式重试。
- 账号操作应有界轮询及核对，操作状态不证明授权、退款到账或容量立即可用。
- 调整事件 allowlist 或校验代码前，应独立复核[标准事件](https://www.unifyport.ai/docs/receiving-events/webhook-events/)和[投递说明](https://www.unifyport.ai/docs/receiving-events/webhook-delivery/)；本次路由证据不授权事件或签名变更。
- 人工审核后一起更新双语说明、catalog、精确公开契约及测试，运行 `npm run check`，发布另行评审。
