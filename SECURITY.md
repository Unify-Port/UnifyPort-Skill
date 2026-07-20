# Security Policy / 安全策略

## English

### Public boundary

Everything under `skills/unifyport-device-api/` must be treated as permanently public under ClawHub's MIT-0 terms. The bundle contains only reviewed public API instructions, a fixed public operation/event catalog, and a dependency-free Node.js client. It must not contain internal routes, pre-production hosts, source-repository details, real request/response captures, credentials, personal data, telemetry, or local files.

The exact maintainer contract lives in `scripts/public-contract.json`. `npm run check:catalog` verifies 68 documented actions, 64 unique method/path routes, 18 webhook events, method distribution, bilingual documentation URLs, risk classification, sensitive-field declarations, and confirmation policy. Unknown operations and events fail closed even if aggregate counts still match.

### Runtime safeguards

- `https://api.unifyport.ai` is the only API origin; redirects and configurable origins are not permitted.
- `UNIFYPORT_API_KEY` is optional for documentation-only use and required only when an API call is executed.
- Read operations may execute directly. Every write uses an API-keyed, domain-separated HMAC-SHA-256 confirmation token. Credential and destructive operations also require explicit matching opt-in.
- Logs and errors must redact authorization headers, message content, contact identifiers, sessions, passwords, tokens, and fields marked sensitive by the catalog.
- The bundle does not install packages, run package managers, execute child processes, collect telemetry, or persist API data.

### Release safeguards

`npm run check:bundle` scans the physical publish directory, not an ignore-derived approximation. It enforces an exact file allowlist, valid UTF-8 text, no symlinks or hidden files, a 50 MB cap, ClawHub frontmatter, bilingual parity, standard-library-only imports, declared environment access, and secret/PII/private-host/internal-path detection. `.clawhubignore` is defense in depth only.

Pull requests receive a tokenless ClawHub dry run. A real release can run only through a confirmed `workflow_dispatch` on `main`, targets the `unifyport` publisher, and requires `CLAWHUB_TOKEN`. Publisher access is a prerequisite; the workflow does not fall back to a personal namespace.

### Reporting a vulnerability

Please use [GitHub private vulnerability reporting](https://github.com/Unify-Port/UnifyPort-Skill/security/advisories/new). Do not include production credentials, personal data, or unredacted API payloads. Include a minimal synthetic reproduction, affected version or commit, impact, and suggested mitigation when possible. Do not open a public issue for an unpatched vulnerability.

## 中文

### 公开边界

`skills/unifyport-device-api/` 下的所有内容都必须视为依据 ClawHub MIT-0 条款永久公开。bundle 仅包含经审核的公开 API 指引、固定的公开操作/事件目录，以及不依赖第三方包的 Node.js 客户端。严禁包含内部路由、预发布主机、源码仓库细节、真实请求/响应抓包、凭据、个人数据、遥测或本地文件。

维护侧精确契约位于 `scripts/public-contract.json`。`npm run check:catalog` 会验证 68 个文档动作、64 个唯一 method/path 路由、18 个 webhook event、方法分布、双语文档 URL、风险分类、敏感字段声明和确认策略。即使总数不变，未知操作或事件也会 fail closed。

### 运行时保护

- 唯一 API origin 是 `https://api.unifyport.ai`；禁止重定向和可配置 origin。
- `UNIFYPORT_API_KEY` 对纯文档使用是可选的，仅在真实 API 调用时要求提供。
- 读操作可直接执行。每个写操作都使用以 API key 为 key、带 domain separation 的 HMAC-SHA-256 确认 token；credential 和 destructive 操作还必须显式提供匹配的 opt-in。
- 日志和错误必须脱敏 authorization header、消息正文、联系人标识、session、password、token，以及 catalog 标记的敏感字段。
- bundle 不安装外部包、不运行 package manager 或子进程、不采集遥测，也不持久化 API 数据。

### 发布保护

`npm run check:bundle` 扫描物理发布目录，而不是由 ignore 推断的近似结果。它会强制执行精确文件 allowlist、UTF-8 文本、无 symlink/隐藏文件、50 MB 上限、ClawHub frontmatter、双语一致性、仅标准库 import、已声明环境变量访问，以及 secret/PII/私有 host/内部 path 扫描。`.clawhubignore` 只作为纵深防御。

Pull request 只执行不带 token 的 ClawHub dry run。真实发布只能在 `main` 上经显式确认的 `workflow_dispatch` 触发，固定发布到 `unifyport` publisher，并要求 `CLAWHUB_TOKEN`。publisher 权限是前置条件；流水线不会自动降级到个人 namespace。

### 报告漏洞

请使用 [GitHub 私密漏洞报告](https://github.com/Unify-Port/UnifyPort-Skill/security/advisories/new)。不要提交生产凭据、个人数据或未脱敏 API payload。尽量提供最小化合成复现、受影响版本或 commit、影响和修复建议。未修复漏洞不得通过公开 issue 披露。
