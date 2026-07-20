# 贡献指南

[English](CONTRIBUTING.md) | [简体中文](CONTRIBUTING.zh-CN.md)

感谢你改进 UnifyPort Device API Skill。每个贡献都必须保持公开 API 边界、安装后无依赖的 runtime，以及中英文 parity。

## 开始之前

- 阅读[架构](docs/architecture.zh-CN.md)、[安全模型](docs/security.zh-CN.md)和[维护说明](docs/maintenance.zh-CN.md)。
- 不能在 source、test、screenshot、issue 或 pull request 中使用真实 API Key、phone number、contact、message、webhook payload、session、password 或 signing secret。
- 不能将 server implementation、private schema、private endpoint、internal hostname 或 production fixture 复制到本仓库。
- 变更范围应保持最小。Catalog 变更及其安全分类必须可以作为一个整体审核。

## 开发

安装后的 Skill 只使用 Node.js 标准库。不能增加 runtime dependency、install hook、native binary 或 network download。运行：

```sh
npm test
npm run check:catalog
npm run check:bundle
npm run check:repository
npm run check
```

`check:bundle` 会校验真实发布根目录 `skills/unifyport-device-api/`，包括 exact file allowlist、size、frontmatter、双语结构、公开边界规则与 data-loss prevention check。`check:repository` 会独立扫描完整 tracked repository surface，避免敏感数据隐藏在 bundle 之外。

## Catalog 变更

已部署的公开 API 文档是发布边界。新增或修改 operation 时：

1. 链接已部署的中英文文档。
2. 直接更新经过审核的 deterministic snapshot，并保持稳定顺序与 catalog schema。
3. 审核 `method`、`path`、request field、`risk`、`sensitiveFields`、`confirmation.mode` 与 `confirmation.optIn`。
4. 增加 positive test，以及针对 unexpected input、missing confirmation、redaction 和敏感值绕过 `--input-stdin` 的 fail-closed test。
5. 运行 exact-contract validator；只有在审核每个计数变化的原因后，才能更新 operation 与 event baseline。
6. 由负责公开 API 边界与安全分类的维护者 review。

只在 server code 中发现的 endpoint 不具备纳入资格。缺少 risk 或 confirmation metadata 的 entry 只能用于文档说明。

## 双语 Parity

在同一个 pull request 中更新每一组中英文文件：

- `README.md` / `README.zh-CN.md`；
- `CONTRIBUTING.md` / `CONTRIBUTING.zh-CN.md`；
- `docs/<name>.md` / `docs/<name>.zh-CN.md`；
- `skills/unifyport-device-api/references/en/` / `references/zh-CN/`；
- Agent behaviour 变化时更新 `SKILL.md` / `SKILL.zh-CN.md`。

保持 heading、table、link、code block、warning 与 count 的结构一致。协议 identifier 保持英文：path、method、JSON field、operation ID、event type、error code、enum、command 与 environment variable。

## Pull Request 清单

- [ ] 变更没有超出已部署的公开文档边界。
- [ ] 不包含 credential、personal data、private endpoint 或 internal implementation。
- [ ] Runtime code 仍然没有 external dependency 或 install hook。
- [ ] 已审核 risk、sensitive field 与 confirmation behaviour。
- [ ] 敏感 params/query/body value 不能进入 argv，且必须使用完整 `--input-stdin` transport。
- [ ] 中英文内容结构一致。
- [ ] `npm run check` 通过。
- [ ] CLI 可用时，`clawhub skill publish ./skills/unifyport-device-api --owner unifyport --slug unifyport-device-api --name "UnifyPort Device API" --version 1.0.0 --dry-run --json` 成功（将 version 替换为本次 release version）。
- [ ] 已直接审核最终发布根目录的 diff。

## 安全披露

不能创建包含已暴露 secret 或 private datum 的公开 issue。应先撤销或轮换该值，再通过批准的私有渠道联系维护者，并且不能把敏感值复制到报告中。
