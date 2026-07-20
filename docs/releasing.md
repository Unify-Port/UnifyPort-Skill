# Release Process

[English](releasing.md) | [简体中文](releasing.zh-CN.md)

Releases are deliberate, reviewable promotions of the exact directory `skills/unifyport-device-api/`. Passing repository tests is necessary but does not prove that a Skill is published, installable, or visible on ClawHub.

## 1. Prepare the version

1. Confirm the deployed public documentation still matches the catalog baseline.
2. Update `version` in the canonical `SKILL.md` using Semantic Versioning.
3. Update paired documentation and release notes for user-visible changes.
4. Confirm `UNIFYPORT_API_KEY` is still optional in metadata and the only allowed live origin is `https://api.unifyport.ai`.
5. Review catalog risk, sensitive fields, and confirmation changes independently from implementation changes.

Never reuse an already published version.

## 2. Run local gates

```sh
npm test
npm run check:catalog
npm run check:bundle
npm run check:repository
npm run check
```

The candidate bundle is the real `skills/unifyport-device-api/` directory; no separate copy or package transformation is trusted. `check:bundle` must verify its exact allowlist, frontmatter, bilingual structure, size limit, absence of dependencies and symlinks, public host and endpoint boundary, and secret/PII patterns. `check:repository` separately scans the complete tracked repository surface for leakage outside the publication root.

Review the directory's Git diff directly after the checks. Automated scans can miss context and cannot decide whether an example contains real customer data.

## 3. Run the ClawHub dry run

With an authenticated, current ClawHub CLI:

```sh
clawhub skill publish ./skills/unifyport-device-api \
  --owner unifyport \
  --slug unifyport-device-api \
  --name "UnifyPort Device API" \
  --version 1.0.0 \
  --dry-run \
  --json
```

Replace `1.0.0` with the version in the reviewed `SKILL.md`. Formal publication uses the same command without `--dry-run`.

Inspect the returned owner, Skill name, version, file list, license, and warnings. A successful dry run uploads nothing and is not evidence of a public release.

Pull requests run the same dry-run path through `.github/workflows/clawhub.yml`. Third-party or reusable actions must be pinned to an immutable commit SHA.

## 4. Publish manually

Formal publication must be a protected manual action from the reviewed commit. Before approving it, verify:

- `clawhub whoami` reports exactly `unifyport`; never continue from another account;
- the `CLAWHUB_TOKEN` repository secret was created by the `unifyport` account and not copied from a personal fallback account;
- the manual workflow input `publisher_handle` is typed exactly as `unifyport`;
- CI at `.github/workflows/ci.yml` passed for the same commit;
- the expected publisher account owns the namespace;
- the exact version is new and intentional;
- the candidate file list contains only approved text files;
- no UnifyPort API credential or customer data is loaded; only the scoped ClawHub release token is available to the publish job.

Do not publish automatically on every merge or on catalog drift.

## 5. Verify the external state

After upload, verify each state independently:

1. ClawHub reports the security scan as passing for the exact owner and version.
2. The public listing displays the expected name, description, version, files, and MIT-0 license.
3. A clean environment can install the exact released version.
4. A documentation-only question works without `UNIFYPORT_API_KEY`.
5. A mocked or controlled allowlisted read works with a disposable test credential and does not reveal it.
6. A write is denied without the exact confirmation, and an uncatalogued URL is denied unconditionally.

Do not describe the release as complete until all required external checks pass.

## 6. Rollback and incident handling

If the released bundle contains a security or functional defect:

1. Disable or withdraw the affected version where ClawHub supports it.
2. Revoke any potentially exposed credential immediately.
3. Publish a corrected, incremented version; never replace the old version in place.
4. Document impact without reproducing secrets or customer data.
5. Add a regression check that inspects the final bundle.

Users pinned to the affected version may not receive the correction automatically, so include a clear upgrade notice.
