<div align="center">

<img src="./icon.svg" width="60" height="60" alt="Mail Assistant Logo" />

# Mail Assistant (`@local/dsh-exchange`)

**Draft-only, privacy-first Microsoft Exchange (EWS + NTLM) plugin bundle for DeepSeek Harness (`0.2.3-alpha.2`)**

**English** | [简体中文](./README.zh-CN.md)

[![Release](https://img.shields.io/github/v/release/FashionChen111/Mail-Assistant-Plugin?style=flat-square&logo=github&color=4176e6&label=Release)](https://github.com/FashionChen111/Mail-Assistant-Plugin/releases)
[![DeepSeek Harness](https://img.shields.io/badge/DeepSeek_Harness-0.2.3--alpha.2-2563eb?style=flat-square)](#requirements)
[![Node.js](https://img.shields.io/badge/Node.js-%5E24.22.3_%7C%7C_%3E%3D26.13.1-339933?style=flat-square&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Exchange](https://img.shields.io/badge/Exchange-EWS_%2B_NTLM-0078d4?style=flat-square)](#requirements)

[![Safety](https://img.shields.io/badge/Safety-Draft--Only_%C2%B7_Zero_Send-16a34a?style=flat-square)](#safety--privacy-guarantees)
[![Delete Guard](https://img.shields.io/badge/Delete-Recoverable_Only-d97706?style=flat-square)](#safety--privacy-guarantees)
[![Privacy](https://img.shields.io/badge/Privacy-Folder_ACL_%C2%B7_Local_0600-4f46e5?style=flat-square)](#safety--privacy-guarantees)
[![Trigger](https://img.shields.io/badge/Trigger-%40mail_On--Demand-7c3aed?style=flat-square)](#usage)
[![Tools](https://img.shields.io/badge/Tools-15_EWS_Actions-0ea5e9?style=flat-square)](#tool-reference-15-tools)

</div>

---

Designed for enterprise and certification project management workflows (Widevine, AirPlay2, DTS, Dolby, etc.): folder-scoped email search and reading, conversation thread reconstruction, heuristic Jira notification & todo extraction, certification project summarization, transparent **Agent Activity History**, and **draft-only** email composition triggered on demand via `@mail`.

---

## Highlights

- **One-Click Global Sidebar Access:** Dedicated **Mail Assistant** entry in DSH's top-left global navigation rail (alongside **Plugins** and **Automation tasks**), toggleable anytime from Settings, Plugins, or the Mail Assistant page itself.
- **Agent Activity History Tab:** Review every email the Agent read (subject, sender, folder), every draft it created or updated (subject, recipients, char count), searches, analyses, and blocked (`PERM_001`) attempts—with KPI counters, category filter chips, keyword search, and 2-step Clear History.
- **Zero-Send & Zero-Permanent-Delete Safety:** Structurally impossible for the Agent to send emails or permanently delete messages.
- **Live Folder ACL & Emergency Lock:** Fine-grained whitelist/blacklist folder permissions and a top-pinned one-click **Emergency Access Lock** that takes effect immediately without restarting DSH.

---

## Safety & Privacy Guarantees

- **Draft-only (structural):** No `exchange_send_email` tool exists, and the codebase contains zero EWS `Send` / `SendAndSaveCopy` execution paths. All drafted emails are saved to Exchange Drafts for manual review and sending in Outlook/OWA.
- **No permanent deletion:** `exchange_delete_email` with `permanent: true` is unconditionally rejected with `PERM_001` before any EWS request. Supported deletion only moves messages to **Deleted Items**.
- **On-demand `@mail` activation:** All 15 `exchange_*` tools and Exchange prompt instructions remain hidden from the model until the user explicitly sends a standalone `@mail` token (word-bounded; ignores `@mail2`, `user@mail.company.com`, and assistant/tool messages).
- **Folder-level access control:** Supports `whitelist` (exact path match, no implicit inheritance) and `blacklist` (path + all subfolders denied), plus an instant **Emergency Lock** switch. `state.json` (`0600`, atomic writes) is read fresh on every tool call so policy updates take effect immediately without restarting DSH.
- **Credential isolation:** Passwords are stored exclusively in DSH's host credential service (`ctx.credentials` → `$DSH_HOME/.credentials.yaml`, mode `0600`) or supplied via the `DSH_EXCHANGE_PASSWORD` environment variable. Passwords are never written to `state.json`, config files, logs, or API responses.
- **Strict HTTPS:** Plain `http://` EWS endpoints are rejected at both save time and connect time (`NET_001`).
- **Dual-layer local logging (`0600`):**
  - **Security Audit Log (`$DSH_HOME/dsh-exchange/audit.jsonl`, append-only, `0600`):** Strictly metadata-only (`ts`, `action`, `folder`, `emailId`, `outcome`, `code`, `count`, `elapsedMs`)—never subjects, bodies, or credentials, and never modified when clearing UI history.
  - **Agent Activity History (`$DSH_HOME/dsh-exchange/activity.jsonl`, rolling cap 500, `0600`):** Stores human-readable safe summaries (email/draft subjects, senders/recipients, search queries, Jira keys, attachment filenames) for the in-app **Activity History** tab, while strictly stripping passwords, email bodies (`body_text`/`body_html`), and raw attachment payloads (`content_base64`). Denied `read_email` calls never record forbidden email subjects or senders.
- **Attachment cap & path safety:** Attachments strictly capped at **25 MiB** (`26,214,400` bytes) checked before download and before disk write (`ATT_001`). Filenames are sanitized to safe basenames.

---

## Requirements

- **DSH Harness:** `0.2.3-alpha.2`
- **Node.js:** `^24.22.3 || >=26.13.1`
- **Exchange Server:** On-premises Microsoft Exchange Server with HTTPS EWS + NTLM authentication (verified against Exchange Server SE 15.2.2562.49; EWS negotiated as Exchange 2013 for compatibility with 2013/2016/2019/SE). Microsoft 365 / OAuth2 is out of scope.

---

## Installation

The settings and activity history UI use the `web` profile. Install DSH 0.2.3-alpha.2 and ensure `pnpm` is on your PATH. In your local plugin checkout, switch to the compatibility branch and build the bundled EWS runtime:

```bash
git switch 0.2.3-alpha.2
npm ci
```

### Option 1: Pack and install

```bash
npm pack
dsh plugin --profile web add ./local-dsh-exchange-1.4.0.tgz
```

### Option 2: Install from the local directory

```bash
dsh plugin --profile web add "file:$(pwd)"
```

You can also open **Plugins → Add plugin** in DSH Web and select the built `.tgz` package.

### Verify Composition

```bash
dsh --profile web --dump-config
```

You should see the `# == @local/dsh-exchange` layer with default limits and trigger configuration.

---

## Configuration & Activity History UI

Open **Mail Assistant** directly from the top-left global sidebar (alongside **Plugins** and **Automation tasks**), or via **Settings → Mail Assistant** / **Plugins → Mail Assistant**.

### 1. Configuration Tab (`Configuration`)

1. **Emergency Access Lock (pinned at top):** One-click instant lock/unlock across all tabs—blocks every Exchange tool immediately with `PERM_001`.
2. **Exchange Connection:** Enter your HTTPS **EWS URL** (e.g. `https://exchange.company.com/EWS/Exchange.asmx`), **Email**, **Domain** (optional if logging in with email), **Username**, and **Password** (or set `DSH_EXCHANGE_PASSWORD` in your environment).
3. **Connect & Load Folders:** Tests connectivity and loads your full Exchange mail folder hierarchy.
4. **Folder Access Policy:** Choose **Whitelist** or **Blacklist** mode and select folders. Checking a parent folder cascades to all subfolders in the UI so saved paths remain explicit.
5. **Navigation Shortcut:** Toggle **Show shortcut in top-left global sidebar** to hide or restore the top-left global entry at any time.
6. **Save:** Persists atomically (`0600`) and takes effect on the very next tool call.

### 2. Agent Activity History Tab (`Activity History`)

Switch to the **Activity History** tab on any Mail Assistant entry point to inspect what the Agent has done:

- **KPI Summary Strip:** Total actions, Emails Read, Drafts saved/updated, and Blocked/Failed attempts.
- **Filters & Search:** Filter by category (`All`, `Read`, `Drafts`, `Search`, `Analysis`, `Organize`, `Blocked`) or search by subject, sender, folder, project keyword, or Jira key.
- **Legacy Compatibility:** Automatically displays pre-existing `audit.jsonl` entries alongside rich `activity.jsonl` summaries.
- **2-Step Clear History:** Clears visible UI history cleanly using a `clearedAt` watermark while keeping the underlying `audit.jsonl` security audit log completely intact on disk.

### 3. Tunable Limits (`~/.dsh/profiles/<profile>/cordis.patch.yml`)

```yaml
- insert:
    - id: dsh-exchange
      name: '@local/dsh-exchange'
      config:
        limits:
          max_search_results: 100
          max_attachment_mb: 25
          max_body_chars: 20000
          request_timeout_seconds: 30
        trigger:
          explicit_prefix: '@mail'
```

---

## Usage

In any DSH conversation, type `@mail` (or pick `@mail` from the `@` composer menu):

- `@mail 看下最近 Widevine 的邮件，support 三天没回，帮我起草一封温柔客气的提醒草稿`
- `@mail 看下最近 AirPlay2 周期情况的邮件，汇总当前项目的计划排期`
- `@mail 看下最近 Jira 有没有什么和我相关的工单通知`
- `@mail 汇总最近 7 天的邮件，列出我的待办事项`

Subsequent turns in the same session keep `exchange_*` tools enabled; unrelated sessions without `@mail` never see any email tools.

---

## Tool Reference (15 Tools)

| Tool | Priority | Description |
| --- | --- | --- |
| `exchange_list_folders` | P0 | List mail folders (`path`, `name`, `readable`) without internal IDs or unread counts |
| `exchange_search_emails` | P0 | Search emails inside a single permitted folder (pre-checked before EWS call) |
| `exchange_read_email` | P0 | Read full email text/HTML, headers, and attachment metadata (re-checks live folder) |
| `exchange_list_recent_emails` | P0 | Merge recent emails across all currently readable folders (1–90 days) |
| `exchange_save_draft` | P0 | Save a new draft to Exchange Drafts (supports `in_reply_to` threading headers) |
| `exchange_update_draft` | P0 | Update specified fields of an existing draft |
| `exchange_delete_draft` | P0 | Move an existing draft to Deleted Items |
| `exchange_get_thread` | P1 | Reconstruct full thread chronologically (`ConversationId` + `References`); denies whole thread if any member is in a restricted folder |
| `exchange_parse_jira_notifications` | P1 | Heuristically extract Jira issue updates (`issue_key`, status transition, assignee, priority, comment) |
| `exchange_extract_todos` | P1 | Heuristically extract candidate deadlines, reply requests, and action items with verbatim `context` |
| `exchange_summarize_project` | P1 | Summarize certification project timeline, blocking issues, and next actions with traceable `source_email_id` |
| `exchange_download_attachment` | P1 | Download attachment ≤ 25 MiB with sanitized filename (`content_base64` returned if ≤ 1 MiB) |
| `exchange_move_email` | P1 | Move email between two permitted folders |
| `exchange_mark_email` | P1 | Mark email read/unread and/or flagged/unflagged |
| `exchange_delete_email` | P1 | Move email to Deleted Items (`permanent: true` always returns `PERM_001`) |

---

## Error Codes

| Code | Meaning | Retry Policy |
| --- | --- | --- |
| `AUTH_001` | Invalid/expired credentials or locked account | No retry |
| `EMAIL_001` | Email, attachment, or folder not found | No retry |
| `PERM_001` | Forbidden folder, emergency lock, ambiguous path, or permanent delete attempt | No retry |
| `NET_001` | Non-HTTPS endpoint, DNS, TLS certificate, connection, or timeout failure | No retry |
| `RATE_001` | Server busy / throttled (`429` / `503` / `ErrorServerBusy`) | 3 retries (`1s` / `2s` / `4s`) |
| `ATT_001` | Attachment exceeds 25 MiB limit | No retry |

---

## Development & Testing

```bash
# Install dependencies
npm install

# Run full unit test suite (node --test)
npm test

# Run local HTTPS+NTLM wire integration test (real Exchange tests auto-skip unless env vars are set)
npm run test:integration
```

To run optional live Exchange server integration tests:

```bash
DSH_EXCHANGE_TEST_URL="https://exchange.company.com/EWS/Exchange.asmx" \
DSH_EXCHANGE_TEST_EMAIL="user@company.com" \
DSH_EXCHANGE_TEST_DOMAIN="COMPANY" \
DSH_EXCHANGE_TEST_USERNAME="user123" \
DSH_EXCHANGE_PASSWORD="your-password" \
npm run test:integration
```
