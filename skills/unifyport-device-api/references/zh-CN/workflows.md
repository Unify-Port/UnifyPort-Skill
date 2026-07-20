# 安全 Workflow

[English](../en/workflows.md) | [简体中文](workflows.md)

## 回答文档问题

1. 保持 `docs-only`，不能读取 `UNIFYPORT_API_KEY`。
2. 找到相关 guide、catalog `id`、`operationId` 或 event type。
3. 阅读 catalog metadata，以及符合用户语言的公开文档链接。
4. 解释 request field 与 provider caveat，但不能虚构默认值。
5. 使用 `<ACCOUNT_ID>`、`<YOUR_API_KEY>` 等 placeholder；不能将之前 output 中的真实值代入示例。

## 查看当前数据

1. 确认用户需要 live call，而不是示例。
2. 只选择一个 allowlist read operation。
3. 只收集必需的 path/query input，并选择最小可用 page。Identifier 属于敏感数据时，按 runner 要求通过 `--input-stdin` 提供完整 `{params,query,body}` object。
4. 预览固定 origin、method、脱敏后的 path value 与 operation ID。
5. 通过内置 runner 执行，并总结脱敏结果。

Read result 可能包含 personal data。除非用户有明确需求且 output 能够被安全处理，否则不能粘贴完整 contact、conversation、membership 或 message dataset。

## 发送或修改 Message

1. 在公开 provider capability guide 中检查请求的 message type 或 action。
2. 确认精确 account、recipient 或 conversation、content/action 与用户意图。
3. 即使多个 action 共享 `POST /v1/messages`，也要选择 message-specific catalog entry。
4. 使用完整 `--input-stdin` object 提供敏感 identifier 与 content，生成脱敏 preview，并请求 runner 要求的精确 confirmation。
5. 只执行一次。Preview token 五分钟后过期；即使仍有效，execution attempt 后也不能复用。Ambiguous timeout 后不能自动 retry；应先使用 `request_id` 与 provider state 对账，明确需要再次 attempt 时重新生成 preview。

## 管理 Account 与 Runtime

Account create/update/delete、authorization、start/stop/reconnect 和 group membership change 都是状态变更 action。Delete、leave group、revoke 等不可逆或对外可见 action 需要用户明确表达 destructive intent。

Authentication code、two-factor password、QR payload 与 imported session 都是敏感数据。不能放入 prompt 或普通 output；只能从受控 input channel 通过 `--input-stdin` 提供完整 request。

## 注册 Webhook Endpoint

1. 使用用户拥有的 HTTPS destination；不能虚构或探测 callback URL。
2. 只选择必需的标准 event subscription，或有意识地使用文档定义的 wildcard。
3. 将 `signing_secret` 与 endpoint URL 视为敏感 input，通过 `--input-stdin` 发送完整 request，输入后不能展示 secret。
4. 在解析 JSON 前，基于精确 raw request body 实现 signature verification。
5. 快速 acknowledgement、保持 handler idempotent，并只保存必要数据。

当前 header、signature、retry 与 ordering contract 以公开 webhook delivery guide 为准。

## 创建或轮换 API Key

这些属于 `credential` operation。执行前确认预期的 key scope/status 与安全目的地。公开 API 可能只返回一次 plaintext，但本 safe runner 会脱敏；产品确需接收时，必须使用 Agent chat 之外由 caller 控制的 secure destination。不能将其写入 Agent history、console log 或 repository file。Rotate 还会改变旧凭据的有效性，不能作为常规 troubleshooting 操作执行。

## 处理 API Error

1. 记录 HTTP status、public error code 与 `request_id`。
2. 解释失败前先脱敏 request/response field。
3. 检查公开 error reference 与 provider capability guide。
4. 请求缺失的非敏感 input；不能要求用户粘贴 API Key 或 session。
5. 只在合适时 retry read。不能盲目 retry write、destructive action 或 credential operation。
