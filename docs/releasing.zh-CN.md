# 发布流程

[English](releasing.md) | [简体中文](releasing.zh-CN.md)

**1.1.0** 已发布。只发布 `skills/unifyport-device-api/`。测试或 dry-run 通过不代表已发布、可安装或真实账号业务验收完成。

## 1. 准备版本

package.json、canonical SKILL.md frontmatter、中英文 Skill Version 标记、runner SKILL_VERSION 及双语发布/迁移说明必须同版。不能为升级发布号而更改确认 domain 或 catalog schema。阅读[发布说明](../skills/unifyport-device-api/references/zh-CN/release-notes.md)和[迁移说明](../skills/unifyport-device-api/references/zh-CN/migration.md)。确认版本尚未发布，不得复用任何已发布版本，包括 1.0.0 和 1.1.0。

## 2. 运行本地门禁

```sh
npm run check
node scripts/check-release.mjs
```

发布计划包含版本、固定 owner、精确 23 个上传文件、逐文件 SHA256、manifestSha256 及 registry fingerprint。manifest 同时签核上传文件和 controlFiles（含 .clawhubignore）；新增、删除或修改过滤规则都会使人工签核失效，即使上传 fingerprint 不变。扫描额外检查 .clawhubignore，共 24 个本地文件；该 ignore 文件不上传。bundle 和全仓库扫描分别执行。Skill 与维护 package 都不允许依赖。必须审查 Git diff 和公开证据，不能把动作数量当作完整参数覆盖证明。

## 3. 执行 ClawHub dry-run

固定的官方 reusable workflow 不支持显式版本。本仓库使用同一固定官方 CLI 源码 `openclaw/clawhub@ed9c8fdda2119176ba21d33e81823f8de79a6960` 及 Node.js 标准库 wrapper。Bun 1.3.10 仅用于按 frozen lockfile 安装官方源码依赖；使用 Node.js 24 构建和执行 CLI（官方 CLI 要求 Node.js >=22）。独立检出该源码并按 frozen lockfile 安装后运行：

```sh
CLAWHUB_SOURCE=/absolute/path/to/pinned/clawhub
node "$CLAWHUB_SOURCE/packages/clawhub/scripts/build.mjs"
CLAWHUB_CLI_ENTRY="$CLAWHUB_SOURCE/packages/clawhub/dist/cli.js" node --test tests/integration/clawhub-transport.test.mjs
node scripts/run-clawhub-release.mjs --cli-entry "$CLAWHUB_SOURCE/packages/clawhub/dist/cli.js"
```

默认执行不带 token 的 dry-run，显式传入 owner=unifyport、version=1.1.0、英文发布说明及精确 Skill 路径，并校验返回版本、文件数和 fingerprint。正式入口使用相同发布参数，仅在批准后添加 --publish。上传前再次执行无 token 的官方 CLI dry-run，核对实际版本、文件数和 fingerprint；匹配后才允许校验身份并上传，上传前还会复核 bundle 及过滤规则签核。任何不一致必须保证零上传。PR 只能 dry-run；main 上 workflow_dispatch 的 confirm_publish=false 也可 dry-run。workflow 保存两份 JSON artifact，第三方 action 和 CLI 源码均固定不可变 SHA。禁止上传仓库根目录。

wrapper 的 preflight 和上传都使用当前 Node 可执行文件，并拒绝在 Bun 下执行。固定 CLI 的 Bun transport 使用 curl `-F`，会把 JSON 中的分号解释为表单指令，导致发布说明截断。Node 原生 FormData 保留完整 JSON 和文件字节；集成回归使用真实官方 transport，仅连接 loopback，不带凭据、不发布，覆盖完整发布说明、分号、引号、换行、中文及类似文件引用的普通字符串。不能通过删除或转义发布说明来规避 transport 问题。

## 4. 手工发布

1.1.0 的人工复核已记录。后续任何 bundle 都需要维护者审核 docs/public-contract-review.json 中所有 operation、provider 及 fieldCorrections 记录，准确填写 humanReviewed；核对最终计划后，填写 releaseApproval.version、releaseApproval.manifestSha256 和 releaseApproval.humanReviewed，签核精确 bundle。人工签核不能由脚本自动生成；修改 bundle 或过滤规则后签核失效。manifest 必须同时包含上传字节和 controlFiles。质量测试允许准确的 pending 和 approved 状态，发布拒绝及成功路径分别使用隔离夹具验证。

```sh
node scripts/check-release.mjs --require-human-review
```

该门禁通过后仍需同一 main SHA 的 CI 成功，并取得单独发布授权；已有人工签核不代表允许再次发布。手工发布要求 main、publisher_handle=unifyport、confirm_publish=true；wrapper 还通过固定 ClawHub whoami 端点独立校验 token 身份必须为 unifyport。CLAWHUB_TOKEN 只传给实际发布步骤，不加载 UnifyPort API key 或客户数据。禁止合并后自动发布。批准前实时核对 namespace 权限及版本未被占用。

## 5. 核对外部状态

经授权上传后，分别验证安全扫描、精确 owner/version、MIT-0 公开页面、文件 fingerprint、干净环境精确版本安装、无凭据 docs-only、mock 安全读取及无确认拒绝写入。真实账号业务验收是独立状态。所需外部检查未完成前，不能宣称发布完成。

## 6. 回退及事件处理

平台支持时撤回缺陷版本；若有泄露则吊销凭据，并递增版本发布修复，不能覆盖不可变版本。用户可重装此前审查的 1.0.0 bundle，但功能范围较小。重装不能撤销 API 副作用、转移账号或迁移 Webhook 归属。记录影响并补回归测试，不能附带秘密或客户数据。
