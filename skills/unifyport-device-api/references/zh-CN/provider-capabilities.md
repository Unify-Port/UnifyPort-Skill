# Provider Capability 快照

[English](../en/provider-capabilities.md) | [简体中文](provider-capabilities.md)

本快照准确复现 3 张公开 provider matrix，不包含 request 或 response sample。Column 只包含这些 matrix 覆盖的 provider；introduction 提到 TikTok，但这里没有 TikTok column，因此不能推断其 capability。

Guide ID：`provider-message-support`、`provider-actions-support`、`provider-webhook-events`。Matrix ID：`message-sending`、`actions`、`webhook-events`。

图例：`F` = 完整支持，`P` = 部分支持，`-` = 不支持。

## Message Sending

这些 row 描述 `POST /v1/messages` 接受的 payload type 与 extension。

| Capability | Telegram | WhatsApp | X | LINE | Zalo |
| --- | :---: | :---: | :---: | :---: | :---: |
| `text` | F | F | F | F | F |
| `image` | F | F | F | F | F |
| `video` | F | F | F | F | F |
| `audio` | F | F | P | F | F |
| `document` | F | F | - | F | F |
| `reply_to.reply_token` | - | F | - | - | - |
| `mentions` | - | F | - | - | - |
| `provider_data.parse_mode` | F | - | - | - | - |

公开 guide 的说明：

- WhatsApp audio 使用 JSON string，`url` 必填，`seconds` 与 `waveform` 可选。
- Telegram 完整支持 Markdown 或 HTML 等 `parse_mode`；其他 provider 当前会忽略它。
- X 只接受 media attachment 形式的 audio，不支持独立 voice note，也不接受任意 document attachment。
- WhatsApp quoted reply 要求将 inbound `data.message.reply_token` 作为 opaque value 原样回传。其他 provider 返回 `501 unsupported_by_provider`；修改或无法读取的 token 返回 `400 invalid_reply_token`。
- WhatsApp group mention 在 `mentions` 中声明 id，并在 text 或 caption 中放置对应 `{{@<id>}}` anchor。其他 provider 忽略该 field 并按字面发送 placeholder；`provider_data.mentions` 已 deprecated。

## Message、Conversation、Contact 与 Group Action

| Public action | Telegram | WhatsApp | X | LINE | Zalo |
| --- | :---: | :---: | :---: | :---: | :---: |
| `messages/pin` | - | F | - | - | - |
| `messages/revoke` | - | F | - | - | - |
| `messages/reaction` | - | F | - | - | - |
| `messages/edit` | - | F | - | - | - |
| `conversations` (list) | F | F | F | - | - |
| `conversations/info` | F | F | F | - | - |
| `conversations/members` | F | F | P | - | - |
| `conversations/read` | - | F | - | - | - |
| `conversations/unread` | - | F | - | - | - |
| `conversations/mute` | - | F | - | - | - |
| `conversations/unmute` | - | F | - | - | - |
| `conversations/pin` | - | F | - | - | - |
| `conversations/unpin` | - | F | - | - | - |
| `contacts` (list) | - | F | - | - | - |
| `contacts/info` | - | F | - | - | - |
| `contacts/block` | - | F | - | - | - |
| `contacts/unblock` | - | F | - | - | - |
| `contacts/blocklist` | - | F | - | - | - |
| `contacts/note` | - | F | - | - | - |
| `groups` (list) | - | F | - | - | - |
| `groups/info` | - | F | - | - | - |
| `groups/create` | - | F | - | - | - |
| `groups/leave` | - | F | - | - | - |
| `groups/members` | - | F | - | - | - |
| `groups/update-info` | - | F | - | - | - |
| `groups/join-requests` and `/update` | - | F | - | - | - |
| `groups/join-approval-mode` | - | F | - | - | - |
| `groups/invite-code` | - | F | - | - | - |

未实现的 provider/action 组合返回 `501 unsupported_by_provider`，且 API 不产生 side effect。该 provider 规则不能绕过 Skill 的 preview 与 confirmation gate。X member listing 仅限 user-type conversation，因为 X direct message 没有 group construct。

Action identifier 与 webhook data 对应：`conversation_id` 对应 `data.chat_id`，`message_id` 对应 `data.message.id`，`sender_id` 对应 `data.sender`；省略 `sender_id` 时默认为 account 自身。`conversations/pin` 影响 chat-list item，`messages/pin` 影响一条 message，并接受 pin state 与可选 duration。

## Standard Webhook Event

Cell 代表 end-to-end delivery。不支持表示该 provider 不会发出对应 standard event，即使 platform event catalog 定义了该 event。

| Event | Telegram | WhatsApp | X | LINE | Zalo |
| --- | :---: | :---: | :---: | :---: | :---: |
| `message.received` | F | F | F | F | F |
| `message.updated` | F | F | - | - | - |
| `message.deleted` | F | F | - | - | - |
| `message.read` | F | P | - | - | - |
| `message.reaction` | - | F | - | - | - |
| `message.delivered` | - | P | - | - | - |
| `conversation.updated` | - | F | - | - | - |
| `conversation.deleted` | - | F | - | - | - |
| `conversation.cleared` | - | F | - | - | - |
| `conversation.history` | - | F | - | - | - |
| `group.updated` | - | F | - | - | - |
| `group.join_request` | - | F | - | - | - |
| `account.status.updated` | F | F | F | F | F |
| `account.started` | F | F | F | - | - |
| `account.history.synced` | - | F | - | - | - |
| `account.auth.required` | F | F | - | F | F |
| `account.auth.succeeded` | F | F | F | F | F |
| `account.auth.failed` | F | F | F | F | F |

Provider-specific reliability 说明：

- WhatsApp read 与 delivery receipt 为部分支持；group receipt 会被过滤以控制流量，文档中的 status signal 不会单独提供 sent/failed state。
- WhatsApp reaction 使用 `message.reaction`；emoji 位于 `data.event.reaction`，被引用 message 位于 `data.message.target_message_id`。
- Telegram inbound payload 在输入属于 edit 时可能携带 `edit_message_id`。
- X 没有 real-time read receipt，其 provider status update 能力有限。
- Zalo status event 为 best-effort，在低流量条件下可能延迟或缺失。

字段级 event semantics 见 `webhooks.md`。执行时还需检查精确 operation entry，因为 provider support 与 operation risk 是两个独立决策。
