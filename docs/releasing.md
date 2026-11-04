# Release Process

[English](releasing.md) | [简体中文](releasing.zh-CN.md)

Version **1.1.0** is published. Publish only `skills/unifyport-device-api/`. Passing tests or dry-run does not prove publication, installability or real-account acceptance.

## 1. Prepare the version

Keep package.json, canonical SKILL.md frontmatter, both Skill Version markers, runner SKILL_VERSION and both release/migration references at the same version. Do not change the confirmation domain or catalog schema just to bump a release. Read [release notes](../skills/unifyport-device-api/references/en/release-notes.md) and [migration](../skills/unifyport-device-api/references/en/migration.md). Confirm the version is not already published; never reuse a published version, including 1.0.0 or 1.1.0.

## 2. Run local gates

```sh
npm run check
node scripts/check-release.mjs
```

The release plan records version, fixed owner, exact 23 upload files, each SHA256, a manifestSha256 and the registry fingerprint. The manifest attests both upload bytes and controlFiles (including .clawhubignore); adding, removing or changing filtering rules invalidates human approval even when the upload fingerprint is unchanged. The scanner also checks .clawhubignore (24 local files); that ignore file is not uploaded. Bundle and repository scans are separate. No dependencies are allowed in the Skill or maintenance package. Review the Git diff and public evidence rather than accepting action counts as full parameter coverage.

## 3. Run the ClawHub dry run

The pinned official reusable workflow cannot accept an explicit version. This repository uses the same fixed official CLI source at `openclaw/clawhub@ed9c8fdda2119176ba21d33e81823f8de79a6960` and a Node.js standard-library wrapper. Bun 1.3.10 only installs the official source's frozen lockfile; build and run the CLI with Node.js 24 (the official CLI requires Node.js >=22). With that source checked out separately and its frozen lockfile installed:

```sh
CLAWHUB_SOURCE=/absolute/path/to/pinned/clawhub
node "$CLAWHUB_SOURCE/packages/clawhub/scripts/build.mjs"
CLAWHUB_CLI_ENTRY="$CLAWHUB_SOURCE/packages/clawhub/dist/cli.js" node --test tests/integration/clawhub-transport.test.mjs
node scripts/run-clawhub-release.mjs --cli-entry "$CLAWHUB_SOURCE/packages/clawhub/dist/cli.js"
```

This defaults to tokenless dry-run and explicitly passes owner=unifyport, version=1.1.0, the English release notes, and the exact Skill path. It validates the returned version, file count and fingerprint. The formal path uses identical publication parameters and adds `--publish` only after approval. Before uploading, it repeats the tokenless official CLI dry-run and compares the actual version, file count and fingerprint. Only a match permits identity verification and upload; the bundle and control-file approval are rechecked before upload. A mismatch must cause zero uploads. PRs run only dry-run; workflow_dispatch with confirm_publish=false can also dry-run on main. The workflow saves both JSON artifacts. All third-party actions and CLI source are immutable SHA pins. Do not upload the repository root.

The wrapper uses its current Node executable for both preflight and upload and rejects Bun execution. The pinned CLI's Bun transport uses curl `-F`, which interprets semicolons in JSON as form directives and can truncate a changelog. Node's native FormData preserves the complete JSON and file bytes; the integration test exercises that actual official transport against loopback only, without credentials or publication. It covers the full release notes, semicolons, quotes, newlines, Unicode and file-like literal strings. Do not remove or escape changelog content to work around the transport bug.

## 4. Publish manually

The 1.1.0 human review is recorded. For any future bundle, a maintainer must review every operation, provider and fieldCorrections record in docs/public-contract-review.json, then set humanReviewed accurately. Review the final plan, set releaseApproval.version, releaseApproval.manifestSha256 and releaseApproval.humanReviewed for that exact bundle. These are human attestations, never auto-generated approval. Bundle or filtering-rule edits invalidate the approval. The manifest must attest controlFiles as well as upload bytes. Quality tests accept accurate pending and approved states, and use isolated fixtures for the negative and positive publication paths.

```sh
node scripts/check-release.mjs --require-human-review
```

After this gate passes and CI is green for the reviewed main SHA, obtain separate release authorization. An existing approval is not authorization to publish again. Manual workflow publication requires main, publisher_handle=unifyport and confirm_publish=true. The wrapper independently checks the token identity via the fixed ClawHub whoami endpoint; the identity must be unifyport. CLAWHUB_TOKEN is available only to the actual release step. No UnifyPort API key or customer data may be loaded. Do not publish automatically after merge. Confirm namespace permissions and unused version live before approving.

## 5. Verify external state

After an authorized upload, independently verify the security scan, exact owner/version, MIT-0 listing, file fingerprint, clean exact-version installation, docs-only without a credential, mocked safe read, and write rejection without confirmation. Real-account business acceptance is a separate state. Publication is incomplete until the required external checks pass.

## 6. Rollback and incident handling

Withdraw a defective version if supported, revoke exposed credentials if any, and release an incremented fix. Never replace an immutable version. Users may reinstall the reviewed 1.0.0 bundle with its smaller feature set. Reinstalling cannot reverse API side effects, move accounts or migrate Webhook ownership. Record impact and a regression test without secrets or customer data.
