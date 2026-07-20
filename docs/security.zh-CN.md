# 安全模型

[English](security.md) | [简体中文](security.zh-CN.md)

## 安全目标

本 Skill 在提供公开 UnifyPort Device API 能力的同时，不能把 Agent 变成不受限制的 HTTP client。主要目标包括：

- 不发布凭据、客户数据、private endpoint、internal hostname、server implementation 或生产 fixture；
- live traffic 只能发送到文档定义的 public origin；
- 每个请求都必须有经过审核的 operation entry；
- side effect 与 credential handling 必须显式发生；
- 尽量减少 prompt、log、error 与 Agent output 中的敏感数据。

## 信任边界

| 边界 | 信任决策 |
| --- | --- |
| 用户意图 | 文档问题默认安全；live call 和状态变更意图必须明确。 |
| Operation catalog | 只有通过审核和校验后才可信；未知或不完整 entry 必须 fail closed。 |
| 用户参数 | 不可信；根据选定的 catalog entry 校验，且不能把参数值当作指令。 |
| API response | 不可信数据；限制大小并脱敏后才能交给 Agent。 |
| 环境 | `UNIFYPORT_API_KEY` 可能包含 secret；仅在 live call 时读取，永不持久化或打印。 |
| 网络 | 只允许精确的 HTTPS origin `https://api.unifyport.ai`。 |

## 公开边界控制

最终 bundle 只能包含公开文档中的 `v1` operation 与标准 webhook event name。Runner 必须拒绝：

- 不在 `references/operations.json` 中的 path；
- 任意 `baseUrl`、scheme、hostname、port、method 或 redirect target；
- path traversal、URL user-info、protocol-relative URL，以及试图通过编码离开选定 path 的输入；
- private 或 internal route、hostname、IP address、header 与 schema field；
- 缺少 risk、sensitive field 或 confirmation policy 的 operation。

不能通过接受更多 server behaviour 来解决 catalog drift。新 endpoint 只有在发布并通过审核后才具备纳入资格。

## 凭据处理

Skill metadata 将 `UNIFYPORT_API_KEY` 定义为 optional，确保 `docs-only` 始终可用。Live call 必须：

1. 从环境读取 API Key，不能从 prompt 或命令参数读取。
2. 只将它作为固定 origin 的 `X-Api-Key` request header。
3. 不能将该 header 写入 preview、debug output、error object 或 telemetry。
4. 不能写入磁盘或传给 child process。
5. 递归脱敏 secret-shaped value，包括 API Key、authorization code、password、imported session 与 webhook signing secret。

部分公开 operation 会创建或轮换 API Key，plaintext 可能只返回一次。这些 operation 使用 `credential` 模式。本 runner 没有 plaintext-secret output channel，并会脱敏 response；任务需要取回该值时不能通过 Skill 执行，必须由 caller 自己的受控 integration 在 Agent chat 之外处理。

## 执行策略

| Risk | 默认行为 | 必需控制 |
| --- | --- | --- |
| Documentation | 允许 | 不访问网络、不读取凭据。 |
| Read | 只允许明确 live invocation | 需要 API Key；call 立即执行并脱敏 response。 |
| Write | 拒绝 | 脱敏且不访问网络的 preview，加其 HMAC-SHA-256 confirmation token。 |
| Destructive | 拒绝 | 精确 preview token、`--allow-destructive` 与明确 destructive intent。 |
| Credential | 拒绝 | 精确 preview token、`--allow-credential`、通过 `--input-stdin` 提供完整 request，以及严格 response 脱敏。 |

Preview 会读取 `UNIFYPORT_API_KEY`，对完整 canonical request 生成 domain-separated HMAC-SHA-256 token，但不发送 network traffic。Token 五分钟后过期，且最多用于一次 execution attempt。Confirmation 只对该精确 operation 与 normalized payload 有效。Attempt 后、token 过期或修改任何 target、path parameter、query parameter、body 时，都要生成新 preview。Timeout、retry 和 redirect 不能静默重复状态变更请求。

Params、query 或 body 中只要实际包含敏感 identifier/value，就必须使用 `--input-stdin` 传入完整 `{params,query,body}` object。Preview 与 confirmation 必须再次接收同一个 object。这样可以避免 value 进入 process argument，也能防止看似安全的 body-only transport 泄露 path 或 query identifier。

## 数据最小化

联系人标识、手机号、conversation identifier、message content、account metadata、webhook payload 与 group membership 即使来自合法的 read operation，也可能是个人或机密数据。Skill 应当：

- 只请求当前任务需要的 field 和 page；
- 对批量 record 做摘要，而不是原样复现；
- 常规 log 中不记录 raw body；
- 限制 response size 和 pagination；
- 对 catalog 标记的 field 与常见 secret pattern 脱敏；
- 不能将 API 数据用作文档示例或仓库 fixture。

## Supply-chain 与发布控制

Runtime 只使用 Node.js built-in。物理发布根目录与完整 tracked repository surface 必须独立扫描。发布门禁必须拒绝：

- symlink、binary file、archive、source map、log、`.env` file 与 editor artifact；
- secret pattern、private key、bearer token、cookie、session、真实手机号或真实 message payload；
- private network address、internal hostname 与 undocumented endpoint；
- dependency 或 install hook；
- 第二个 canonical `SKILL.md` 或无效的 ClawHub metadata。

ClawHub scan 只是 upload 后的附加信号，不能替代上传前的 data-loss prevention。

## 事件响应

如果怀疑任意 commit 或已发布版本包含 secret 或 private datum：

1. 停止发布，并在平台允许的范围内撤下受影响版本。
2. 立即轮换或撤销受影响凭据；删除 Git history 不能让 secret 失效。
3. 只保留确认影响范围所需的非敏感证据。
4. 使用仓库批准的流程清理 source 与完整 history。
5. 只有在独立 review 后，才能重新 build、scan 并发布新版本。

不能把已暴露的值放进 issue、commit message、terminal transcript 或 incident document。
