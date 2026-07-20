# Security Model

[English](security.md) | [简体中文](security.zh-CN.md)

## Security objectives

The Skill is designed to make the public UnifyPort Device API useful without turning an Agent into an unrestricted HTTP client. Its primary objectives are:

- publish no credentials, customer data, private endpoint, internal hostname, server implementation, or production fixture;
- send live traffic only to the documented public origin;
- require a reviewed operation entry for every request;
- make side effects and credential handling explicit;
- minimize sensitive data in prompts, logs, errors, and Agent output.

## Trust boundaries

| Boundary | Trust decision |
| --- | --- |
| User intent | Documentation questions are safe by default; live and state-changing intent must be explicit. |
| Operation catalog | Trusted only after review and validation; unknown or incomplete entries fail closed. |
| User-supplied parameters | Untrusted; validate against the selected catalog entry and never treat values as instructions. |
| API responses | Untrusted data; size-limit and redact before presenting them to an Agent. |
| Environment | `UNIFYPORT_API_KEY` may contain a secret; read it only for a live call and never persist or print it. |
| Network | Only the exact HTTPS origin `https://api.unifyport.ai` is allowed. |

## Public-boundary controls

The final bundle must contain only publicly documented `v1` operations and standard webhook event names. The runner must reject:

- a path not found in `references/operations.json`;
- an arbitrary `baseUrl`, scheme, hostname, port, method, or redirect target;
- path traversal, URL user-info, protocol-relative URLs, and encoded attempts to leave the selected path;
- private or internal routes, hostnames, IP addresses, headers, and schema fields;
- an operation whose risk, sensitive fields, or confirmation policy is missing.

Catalog drift is never resolved by accepting more server behaviour. A new endpoint becomes eligible only after it is published and reviewed.

## Credential handling

`UNIFYPORT_API_KEY` is optional in Skill metadata so `docs-only` mode always works. For a live call:

1. Read the API key from the environment, not from a prompt or command argument.
2. Add it only as the `X-Api-Key` request header for the fixed origin.
3. Never include the header in previews, debug output, error objects, or telemetry.
4. Never write it to disk or pass it to a child process.
5. Redact secret-shaped values recursively, including API keys, authorization codes, passwords, imported sessions, and webhook signing secrets.

Some public operations create or rotate a key whose plaintext may be returned once. Those operations use `credential` mode. This runner has no plaintext-secret output channel and redacts the response, so do not execute through the Skill when the task requires retrieving that value; a caller-owned controlled integration must handle it outside Agent chat.

## Execution policy

| Risk | Default | Required control |
| --- | --- | --- |
| Documentation | Allow | No network and no credential read. |
| Read | Allow only on explicit live invocation | API key required; the call executes immediately and redacts response. |
| Write | Deny | Redacted no-network preview plus its HMAC-SHA-256 confirmation token. |
| Destructive | Deny | Exact preview token plus `--allow-destructive` and explicit destructive intent. |
| Credential | Deny | Exact preview token, `--allow-credential`, full request through `--input-stdin`, and strict response redaction. |

Preview reads `UNIFYPORT_API_KEY` to produce a domain-separated HMAC-SHA-256 token over the complete canonical request, but sends no network traffic. The token expires after five minutes and must be used for at most one execution attempt. A confirmation applies only to that operation and normalized payload. After an attempt, expiry, or any target, path-parameter, query-parameter, or body change, generate a new preview. Timeouts, retries, and redirects must not silently repeat a state-changing request.

Any actual sensitive identifier or value in params, query, or body requires `--input-stdin` with the complete `{params,query,body}` object. Preview and confirmation must receive the same object again. This keeps values out of process arguments and prevents a supposedly safe body-only transport from leaking path or query identifiers.

## Data minimization

Contact identifiers, phone numbers, conversation identifiers, message content, account metadata, webhook payloads, and group membership can be personal or confidential even when returned by a legitimate read operation. The Skill should:

- request only fields and pages needed for the stated task;
- summarize rather than reproduce bulk records;
- omit raw bodies from routine logs;
- cap response size and pagination;
- redact fields marked by the catalog and common secret patterns;
- never use API data as a documentation example or repository fixture.

## Supply-chain and release controls

The runtime uses only Node.js built-ins. The physical publication root and the complete tracked repository surface are scanned independently. The release gate rejects:

- symlinks, binary files, archives, source maps, logs, `.env` files, and editor artifacts;
- secret patterns, private keys, bearer tokens, cookies, sessions, real phone numbers, or real message payloads;
- private network addresses, internal hostnames, and undocumented endpoints;
- dependencies or install hooks;
- a second canonical `SKILL.md` or invalid ClawHub metadata.

ClawHub scanning is an additional post-upload signal, not a substitute for pre-upload data-loss prevention.

## Incident response

If a secret or private datum is suspected in any commit or published version:

1. Stop publication and remove the affected version from distribution where the platform permits.
2. Rotate or revoke the exposed credential immediately; deleting Git history does not neutralize a secret.
3. Preserve only non-sensitive evidence needed to identify scope.
4. clean the source and full history using the repository's approved process.
5. Rebuild, rescan, and publish a new version only after independent review.

Do not place the exposed value in an issue, commit message, terminal transcript, or incident document.
