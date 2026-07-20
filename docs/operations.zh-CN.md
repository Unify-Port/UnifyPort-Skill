# Operation 覆盖范围

[English](operations.md) | [简体中文](operations.zh-CN.md)

## 覆盖基线

Catalog 反映发布时的 UnifyPort 公开 API 文档。当前基线包含：

- 68 个文档 action；
- 64 组唯一 `method + path`；
- 14 个概念或 workflow guide；
- 18 个标准 webhook event type。

HTTP method 分布为 `GET 19`、`POST 43`、`PATCH 4` 与 `DELETE 2`。经过审核的 risk classification 为 `read 16`、`write 34`、`credential 11` 与 `destructive 7`；不能根据 method 推导 risk。

其中 5 个 message action 共享 `POST /v1/messages`，因此 action 数量与 route 数量不同。它们的 request shape 和用户意图不同，所以仍然是独立的 catalog entry。

完整的机器可读 inventory 位于：

- `skills/unifyport-device-api/references/operations.json`；
- `skills/unifyport-device-api/references/events.json`。

Validator 与 runner 直接使用这些文件，而不是复制一份 Markdown endpoint list。

## 按分类统计 Action

| 公开文档分类 | 文档 action 数 |
| --- | ---: |
| Workspace | 2 |
| Accounts | 5 |
| Authentication | 8 |
| Runtime | 4 |
| Messages | 9 |
| Conversations | 13 |
| Contacts | 6 |
| Groups | 10 |
| API Keys | 4 |
| Webhook Endpoints | 6 |
| Providers | 1 |
| **总计** | **68** |

## Guide 与 Event

Skill 还覆盖公开文档中的 introduction、quickstart、account lifecycle、provider authorization、provider capability matrix、error reference、webhook delivery 与 signature verification、标准 event payload，以及各 event reference。

Event name 是协议值，永不翻译。当前基线包含 message、conversation、group、account runtime 和 account authentication 域的 18 个 event type。

## 覆盖不等于执行权限

Catalog 覆盖表示 Skill 能识别并解释某个 action，不代表它可以自动执行。

- 每个 catalog action 和 guide 都可使用 `docs-only`。
- Live read 需要用户明确请求并提供 `UNIFYPORT_API_KEY`。
- Write 需要脱敏 preview 与其 HMAC-SHA-256 confirmation token。Token 五分钟后过期，且最多用于一次 execution attempt；过期、已经 attempt 或 input 变化都必须重新 preview。
- Destructive 或 credential-sensitive action 需要更严格的显式 opt-in。
- Provider 是否支持仍取决于 provider capability 文档与 caller 的 account 状态。

缺少完整 risk 与 confirmation classification 的 operation 在修正前只能用于文档说明。

## Drift 策略

Coverage test 必须断言预期的 action、unique route、guide 与 event 数量。数量变化是 review signal，不能自动接受。更新基线前，维护者必须检查新增、删除、duplicate route、documentation URL、schema、sensitive field 与 risk 变化。

已部署的公开文档始终是发布边界。Implementation detail 或 private schema 不能单独把 operation 加入本 Skill。
