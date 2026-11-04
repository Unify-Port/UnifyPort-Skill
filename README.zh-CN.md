# UnifyPort Device API Skill

[English](README.md) | [简体中文](README.zh-CN.md)

在兼容 OpenClaw 的 Agent 中使用公开的 UnifyPort Device API。无需凭据即可用本 Skill 解释 API；只有用户明确要求时，才会执行 allowlist 中的 live call。

发布包完全自包含：仅使用 Node.js 标准库，将 live traffic 固定到 `https://api.unifyport.ai`，不包含内部源码、私有 endpoint、凭据、客户数据或生产 fixture。

## 包含内容

- 一个 canonical ClawHub Skill：`skills/unifyport-device-api/SKILL.md`。
- 按公开文档整理的 catalog，覆盖 82 个公开文档 action、78 组唯一 `method + path` 和 24 个标准 webhook event。
- 无第三方依赖的 Node.js runner，包含 operation allowlist、敏感信息脱敏和确认门禁。
- 中英文 Agent reference 与维护文档。
- 用于检查结构、双语一致性、公开边界、密钥泄露和 bundle 内容的发布门禁。

## 运行模式

| 模式 | 凭据 | 行为 |
| --- | --- | --- |
| `docs-only` | 不需要 | 解释概念、查找 operation、准备示例，但不发送请求。 |
| `read` | `UNIFYPORT_API_KEY` | 只有收到明确 live request 后才执行 allowlist read，并对敏感输出脱敏。 |
| `write` | `UNIFYPORT_API_KEY` | 不访问网络地生成 preview，再使用其 HMAC-SHA-256 confirmation token 执行。 |
| `credential` | `UNIFYPORT_API_KEY` 加显式 opt-in | 要求 preview token、`--allow-credential`、通过 stdin 提供完整 request input，以及更严格的输出脱敏。 |

破坏性 operation 是 `write` 的更严格子集：不能根据隐含意图执行，且必须经过 catalog 定义的确认机制。

## 安装

```sh
openclaw skills install @unifyport/unifyport-device-api
```

正式 ClawHub listing 上线前，可 clone 本仓库并从本地 Skill 路径安装：

```sh
openclaw skills install ./skills/unifyport-device-api --as unifyport-device-api
```

咨询文档不需要 API Key。只有 live API call 才通过进程环境提供 API Key：

```sh
export UNIFYPORT_API_KEY='<your-api-key>'
```

不要把 API Key 粘贴到 prompt、命令参数、提交到 Git 的配置或 issue 中。metadata 将该环境变量保持为 optional，因此 ClawHub 不会阻断 `docs-only` 模式。

## 本地使用

Node.js 20 或更高版本是唯一运行时要求，无需安装任何 package。

```sh
npm run check
cd skills/unifyport-device-api
node scripts/api-client.mjs list
node scripts/api-client.mjs describe get-workspace
```

`list` 与 `describe` 不读取 API Key。`call <id>` 是唯一 live command。敏感 request value 必须使用 `--input-stdin` 传入完整 `{params,query,body}` object；详见 canonical [SKILL.md](skills/unifyport-device-api/SKILL.md)。

canonical operation 与 event inventory 位于：

- `skills/unifyport-device-api/references/operations.json`
- `skills/unifyport-device-api/references/events.json`

这些文件是经过审核、deterministic 的公开契约快照。不能因为 implementation code 中存在某个 endpoint 就将其加入 catalog；该 endpoint 必须先出现在已发布的 UnifyPort API 文档中。

## 文档

- [架构](docs/architecture.zh-CN.md)
- [安全模型](docs/security.zh-CN.md)
- [维护说明](docs/maintenance.zh-CN.md)
- [发布流程](docs/releasing.zh-CN.md)
- [Operation 覆盖范围](docs/operations.zh-CN.md)
- [贡献指南](CONTRIBUTING.zh-CN.md)
- [公开 API 文档](https://www.unifyport.ai/zh-CN/docs/#introduction)

## 仓库策略

只有 `skills/unifyport-device-api/` 是 ClawHub 发布根目录。仓库工具、测试和维护文档不会进入发布包。发布自动化必须同时检查 source tree 与最终 candidate bundle。

## License

MIT-0，见 [LICENSE](LICENSE)。

候选版本 **1.1.0** 已完成本地准备，尚未发布。最终公开证据人工复核及精确 bundle 签核仍待完成，参见[复核范围](docs/contract-review.zh-CN.md)。

- [发布说明](skills/unifyport-device-api/references/zh-CN/release-notes.md)
- [从 1.0.0 迁移](skills/unifyport-device-api/references/zh-CN/migration.md)
