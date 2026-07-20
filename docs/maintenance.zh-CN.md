# 维护说明

[English](maintenance.md) | [简体中文](maintenance.zh-CN.md)

## 维护不变量

每次变更都必须保持以下不变量：

- `skills/unifyport-device-api/SKILL.md` 是唯一 canonical Skill entry，且 `name` 与目录一致。
- metadata 中的 `UNIFYPORT_API_KEY` 保持 optional，文档能力不能被凭据门禁阻断。
- Runner 没有第三方 runtime dependency，也没有 install hook。
- Live request 只能使用 `https://api.unifyport.ai`，且 operation 必须存在于经过审核的 catalog 中。
- Risk、schema、sensitive-field 或 confirmation 数据未知时必须 fail closed。
- 中英文解释性内容必须同步变更。
- 发布 bundle 不能包含 private implementation、private API、credential、customer data 或真实生产示例。

## 公开契约更新流程

1. 审核已部署的[英文](https://www.unifyport.ai/docs/#introduction)与[简体中文](https://www.unifyport.ai/zh-CN/docs/#introduction)文档。
2. 记录新增、删除以及 request/response semantics 的变化。只存在于 server 的 route 不能作为公开支持的证据。
3. 更新经过审核的 deterministic snapshot `references/operations.json` 与 `references/events.json`，并保持稳定顺序与 schema。
4. 针对每个变化的 operation，独立于 HTTP method 审核 `risk`、`sensitiveFields`、`confirmation.mode` 和 `confirmation.optIn`。
5. 增加或更新 runner 的 positive test 与 negative test。Negative test 必须覆盖 catalog 外 path、unexpected field、host override、redirect、缺失 confirmation、secret redaction，以及敏感 input 绕过完整 `--input-stdin` transport。
6. 同步更新 `references/en/` 与 `references/zh-CN/` 下的配对文件；如果 behaviour 或 policy 变化，还需同步 repository document。
7. 运行 exact-contract validator、针对真实发布根目录的 `check:bundle`、针对完整 tracked repository surface 的 `check:repository`，以及 test suite。
8. 发布前由维护者审核 public boundary 与 security classification。

## Catalog 审核清单

每个 operation entry 必须包含：

- 稳定的 `id` 与 `operationId`；
- `category`、`title`、`method` 与 normalized public `path`；
- 直接的 `docs.en` 与 `docs.zh-CN` URL；
- 明确的 `risk` value；
- `sensitiveFields`，即使它是空 array；
- 完整的 `confirmation` policy；
- 足够的 parameter metadata，使 runner 能拒绝未知输入。

只有公开文档描述了不同 action shape 时，才允许重复 `method + path`，例如 `POST /v1/messages` 的 message variant。Runner 在校验 payload 前仍必须先选定一个精确 `operationId`。

## 双语维护

协议 token 永不翻译。`operationId`、`id`、JSON key、event name、error code、enum value、command、path 与 environment variable 必须在两种语言中保持一致。

修改正文时：

1. 在同一个 pull request 中更新中英文配对文件。
2. 保持 heading order、table、code block、link、warning 与 operation count 的结构一致。
3. 检查每个本地 language-switch link 都能解析。
4. 优先使用简洁说明，不要把完整 public API reference 复制到本仓库。

## Dependency 策略

安装后的 Skill 必须只依赖 Node.js 标准库。新增 runtime dependency、package manager 要求、native binary、download step 或 post-install action 都属于架构变更，必须获得明确批准。Development tooling 也应保持最小化，并且绝不能复制进发布 bundle。

## 版本策略

Skill 使用 Semantic Versioning：

- patch：文案、链接、脱敏改进或兼容的 catalog 修正；
- minor：新增已发布 operation 或向后兼容的 runner capability；
- major：command contract、confirmation semantics、catalog schema，或可能破坏现有 Agent workflow 的 behaviour 变化。

不能复用已经发布的 version。仅发现 catalog drift 不代表可以自动发布；每个 version 都必须经过审核并主动发布。

## 定期审核

每个 release cycle 至少验证一次：

- 公开文档计数与 URL；
- public origin 与 authentication header；
- ClawHub format 与 metadata 要求；
- Node.js runtime compatibility；
- secret-scan rule 与 redaction fixture；
- clean install 后执行一个 `docs-only` task 与一个 mocked live-call test。

CI 绝不能使用真实 API Key 或客户 record。
