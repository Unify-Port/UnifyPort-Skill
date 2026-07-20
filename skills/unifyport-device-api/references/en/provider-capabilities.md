# Provider capability snapshot

[English](provider-capabilities.md) | [简体中文](../zh-CN/provider-capabilities.md)

This snapshot reproduces the three public provider matrices without request or response samples. Columns are exactly the providers covered by those matrices; TikTok is mentioned by the introduction but has no column here, so no TikTok capability may be inferred.

Guide IDs: `provider-message-support`, `provider-actions-support`, `provider-webhook-events`. Matrix IDs: `message-sending`, `actions`, `webhook-events`.

Legend: `F` = full support, `P` = partial support, `-` = unsupported.

## Message sending

These rows describe payload types and extensions accepted by `POST /v1/messages`.

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

Notes from the public guide:

- WhatsApp audio uses a JSON string with `url` required and optional `seconds` and `waveform`.
- Telegram fully honors `parse_mode` values such as Markdown or HTML; other providers currently ignore it.
- X accepts audio only as a media attachment, not a standalone voice note, and does not accept arbitrary document attachments.
- WhatsApp quoted replies require the opaque inbound `data.message.reply_token` to be returned unchanged. Other providers return `501 unsupported_by_provider`; a modified or unreadable token returns `400 invalid_reply_token`.
- WhatsApp group mentions use ids in `mentions` and matching `{{@<id>}}` anchors in text or caption. Other providers ignore the field and send the placeholder literally; `provider_data.mentions` is deprecated.

## Message, conversation, contact, and group actions

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

Unimplemented provider/action combinations return `501 unsupported_by_provider` without an API side effect. This provider rule does not bypass the Skill's preview and confirmation gates. X member listing is limited to user-type conversations because X direct messages have no group construct.

Action identifiers map back to webhook data: `conversation_id` corresponds to `data.chat_id`, `message_id` to `data.message.id`, and `sender_id` to `data.sender`; omitted `sender_id` defaults to the account itself. `conversations/pin` affects the chat-list item, while `messages/pin` affects one message and accepts pin state plus optional duration.

## Standard webhook events

These cells represent end-to-end delivery. Unsupported means the provider does not emit that standard event even though the platform event catalog defines it.

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

Provider-specific reliability notes:

- WhatsApp read and delivery receipts are partial; group receipts are filtered to control volume, and sent/failed states are not separately surfaced by the documented status signal.
- WhatsApp reactions use `message.reaction`; the emoji is `data.event.reaction` and the referenced message is `data.message.target_message_id`.
- Telegram inbound payloads can carry `edit_message_id` when the input represents an edit.
- X has no real-time read receipt; its provider status updates are limited.
- Zalo status events are best-effort and can be delayed or omitted in low-traffic conditions.

For field-level event semantics, read `webhooks.md`. For execution, also check the exact operation entry because provider support and operation risk are separate decisions.
