# 架构

[English](architecture.md) | [简体中文](architecture.zh-CN.md)

## 目标

本仓库将已发布的 UnifyPort Device API 契约转换为一个可维护的 ClawHub Skill。它必须在没有凭据时仍然可用、无需第三方 package 即可执行，并在 operation 或风险分类未知时 fail closed。

## 组件

```text
已发布的 API 文档
          |
          v
经过审核的公开 operation catalog ---- 经过审核的 webhook event catalog
          |                                      |
          +------------------+-------------------+
                             v
                   Canonical SKILL.md
                             |
                             v
                  无依赖 Node.js runner
                             |
                             v
                  https://api.unifyport.ai
```

仓库包含两条边界：

1. `skills/unifyport-device-api/` 是完整的 ClawHub bundle，包含 canonical Skill、runner、两个机器可读 catalog 和面向 Agent 的双语 reference。
2. 仓库根目录包含仅供维护者使用的工具、测试和文档。安装 Skill 后不依赖这些文件。

## 事实来源

已部署的公开 API 文档决定哪些内容可以被说明和暴露。`references/operations.json` 与 `references/events.json` 是该边界经过审核的快照，也是唯一 runtime allowlist。

Non-public implementation 与 schema 不是发布来源：不能复制进 bundle，也不能扩大 public catalog。未出现在已发布文档中的 route 始终不在范围内。

## Runtime 流程

1. Agent 判断请求属于 `docs-only`、`read`、`write` 或 `credential`。
2. 通过 `operations.json` 中的 `id` 或 `operationId` 解析用户请求的 action。
3. Runner 根据该 entry 校验 method、path parameter、query parameter、body shape、risk 和 confirmation policy。
4. Runner 为固定 public origin 构造请求；只有 live call 才读取 `UNIFYPORT_API_KEY`。
5. 改变状态或涉及敏感信息的 action 必须先预览，并按 catalog 规则确认后才能传输。
6. Response 经过大小限制和脱敏后才返回给 Agent。

任何步骤都不接受任意 URL、任意 method 或 catalog 之外的 path。

## 双语设计

机器可读协议值保持英文：operation ID、method、path、JSON field name、enum value、error code 和 event type。解释性正文按位置成对维护：

- 仓库文档：`docs/<name>.md` 与 `docs/<name>.zh-CN.md`；
- 安装后的 reference：`references/en/` 与 `references/zh-CN/`；
- 入口文档：`README.md` 与 `README.zh-CN.md`。

`SKILL.md` 是唯一 canonical ClawHub 入口。`SKILL.zh-CN.md` 是便于人工阅读的翻译，不是第二个 Skill 入口。

## 扩展规则

增加 operation 必须满足以下全部条件：

1. 有证据表明该 action 已存在于部署后的公开文档中。
2. Catalog entry 包含文档 URL、risk、sensitive field 和 confirmation policy。
3. 已增加 runtime validation 与 negative test。
4. 中英文文档同步更新。
5. 最终 bundle 已扫描 secret、private endpoint、internal hostname 与非文本 artifact。

这些规则使新增公开能力可被审核，同时避免 Skill 与 server implementation 耦合。
