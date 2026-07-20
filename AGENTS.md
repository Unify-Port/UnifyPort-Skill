# Repository instructions / 仓库协作说明

## 中文

- 默认使用简体中文交流；代码标识符、命令、协议字段和错误码保持英文。
- 代码注释使用中文，只解释 why：安全边界、兼容原因、外部约束或风险。
- 本仓库必须独立维护。不得从同级仓库读取、复制或运行代码；公开契约只能来自已部署的 UnifyPort Device API 文档，并经人工审核后更新。
- ClawHub 唯一发布目录是 `skills/unifyport-device-api/`。不得发布仓库根目录，也不得依赖 `.clawhubignore` 代替 `npm run check:bundle`。
- runtime 和维护工具均只能使用 Node.js 标准库；不得增加 `dependencies` 或 `devDependencies`。
- API key 只能通过 `UNIFYPORT_API_KEY` 读取，不能写入文件、示例、日志、测试夹具或错误消息。
- 所有写入操作使用基于 API key、带 domain separation 的 HMAC-SHA-256 确认；credential 和 destructive 操作还必须匹配对应 opt-in。
- 调整公开操作或事件时，同步更新双语说明、catalog、`scripts/public-contract.json` 和测试。精确 allowlist 的变更必须人工复核公开文档证据。
- 修改后至少运行 `npm run check`。若无法运行，必须说明未验证原因。
- 不回退或覆盖其他协作者的并行修改；发生冲突时按当前契约适配。

## English

- Communicate in Simplified Chinese by default. Keep code identifiers, commands, protocol fields, and error codes in English.
- Write code comments in Chinese and explain only why a boundary, compatibility rule, external constraint, or risk exists.
- Keep this repository independent. Do not read, copy, or execute sibling repositories. Only reviewed, deployed public Device API documentation may change the public contract.
- The only ClawHub publish root is `skills/unifyport-device-api/`. Never publish the repository root, and never treat `.clawhubignore` as a replacement for `npm run check:bundle`.
- Runtime and maintenance tooling must use only Node.js built-ins. Do not add runtime or development packages.
- Read the API key only from `UNIFYPORT_API_KEY`; never place it in files, examples, logs, fixtures, or errors.
- Confirm writes with API-keyed, domain-separated HMAC-SHA-256. Credential and destructive operations also require their matching opt-in.
- When the public operation/event contract changes, update both languages, the catalogs, `scripts/public-contract.json`, and tests together. A human must verify public-doc evidence before changing the exact allowlist.
- Run at least `npm run check` after changes, or explicitly report why verification was not possible.
- Preserve concurrent contributors' work and adapt to the current contract instead of reverting it.
