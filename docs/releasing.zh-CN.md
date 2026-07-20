# 发布流程

[English](releasing.md) | [简体中文](releasing.zh-CN.md)

Release 是对精确目录 `skills/unifyport-device-api/` 的主动、可审核 promotion。仓库测试通过是必要条件，但不能证明 Skill 已发布、可安装或已在 ClawHub 可见。

## 1. 准备版本

1. 确认已部署的公开文档仍与 catalog baseline 一致。
2. 使用 Semantic Versioning 更新 canonical `SKILL.md` 中的 `version`。
3. 针对 user-visible change 更新配对文档与 release note。
4. 确认 metadata 中的 `UNIFYPORT_API_KEY` 仍为 optional，且唯一允许的 live origin 是 `https://api.unifyport.ai`。
5. 独立于 implementation change 审核 catalog risk、sensitive field 与 confirmation change。

不能复用已经发布的 version。

## 2. 运行本地门禁

```sh
npm test
npm run check:catalog
npm run check:bundle
npm run check:repository
npm run check
```

Candidate bundle 就是真实的 `skills/unifyport-device-api/` 目录，不信任单独的 copy 或 package transform。`check:bundle` 必须检查 exact allowlist、frontmatter、双语结构、size limit、dependency 与 symlink 缺失、public host 与 endpoint 边界，以及 secret/PII pattern。`check:repository` 另行扫描完整 tracked repository surface，检查发布根目录之外的泄露。

检查完成后直接审核该目录的 Git diff。自动化 scan 可能缺少上下文，也无法判断示例是否包含真实客户数据。

## 3. 执行 ClawHub Dry Run

使用已认证且为当前版本的 ClawHub CLI：

```sh
clawhub skill publish ./skills/unifyport-device-api \
  --owner unifyport \
  --slug unifyport-device-api \
  --name "UnifyPort Device API" \
  --version 1.0.0 \
  --dry-run \
  --json
```

将 `1.0.0` 替换为经过审核的 `SKILL.md` version。正式发布使用同一命令，但去掉 `--dry-run`。

检查返回的 owner、Skill name、version、file list、license 与 warning。Dry run 成功不会上传内容，也不能作为 public release 的证据。

Pull request 通过 `.github/workflows/clawhub.yml` 执行相同的 dry-run path。Third-party 或 reusable action 必须固定到 immutable commit SHA。

## 4. 手动发布

正式发布必须是从已审核 commit 发起的 protected manual action。批准前验证：

- `clawhub whoami` 精确返回 `unifyport`，其他账号一律不能继续；
- 仓库 secret `CLAWHUB_TOKEN` 由 `unifyport` 账号创建，不能来自个人 fallback 账号；
- 手工 workflow input `publisher_handle` 必须精确输入 `unifyport`；
- 同一 commit 的 `.github/workflows/ci.yml` 已通过；
- 预期 publisher account 拥有该 namespace；
- 精确 version 是新的且符合预期；
- candidate file list 仅包含批准的文本文件；
- publication job 不加载 UnifyPort API 凭据或客户数据；只向 publish job 提供 scoped ClawHub release token。

不能在每次 merge 或 catalog drift 时自动发布。

## 5. 验证外部状态

Upload 后，分别验证以下状态：

1. ClawHub 对精确 owner 与 version 报告 security scan 通过。
2. Public listing 展示预期 name、description、version、file 与 MIT-0 license。
3. Clean environment 可以安装精确 released version。
4. 不设置 `UNIFYPORT_API_KEY` 时，documentation-only question 正常工作。
5. 使用 disposable test credential 的 mocked 或 controlled allowlisted read 正常工作，且不泄露凭据。
6. Write 在缺少精确 confirmation 时被拒绝，catalog 外 URL 始终被拒绝。

所有必需 external check 通过前，不能宣布 release 完成。

## 6. Rollback 与事件处理

如果已发布 bundle 包含安全或功能缺陷：

1. 在 ClawHub 支持的范围内禁用或撤下受影响版本。
2. 立即撤销任何可能暴露的凭据。
3. 发布递增 version 的修复，不得原地替换旧 version。
4. 记录影响时不能复现 secret 或 customer data。
5. 增加检查最终 bundle 的 regression check。

固定到受影响 version 的用户可能无法自动获得修复，因此必须提供清晰的 upgrade notice。
