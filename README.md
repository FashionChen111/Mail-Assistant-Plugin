# Mail Assistant (`@local/dsh-exchange`)

Microsoft Exchange (EWS + NTLM) enterprise email plugin bundle for **DeepSeek Harness (DSH) `>=0.2.2-rc.3 <0.3.0`**.

Designed for certification project management workflows (Widevine, AirPlay2, DTS, Dolby, etc.): folder-scoped email search and reading, conversation thread reconstruction, heuristic Jira notification & todo extraction, certification project summarization, and **draft-only** email composition triggered on demand via `@mail`.

---

## Safety & Privacy Guarantees

- **Draft-only (structural):** No `exchange_send_email` tool exists, and the codebase contains zero EWS `Send` / `SendAndSaveCopy` execution paths. All drafted emails are saved to Exchange Drafts for manual review and sending in Outlook/OWA.
- **No permanent deletion:** `exchange_delete_email` with `permanent: true` is unconditionally rejected with `PERM_001` before any EWS request. Supported deletion only moves messages to **Deleted Items**.
- **On-demand `@mail` activation:** All 15 `exchange_*` tools and Exchange prompt instructions remain hidden from the model until the user explicitly sends a standalone `@mail` token (word-bounded; ignores `@mail2`, `user@mail.company.com`, and assistant/tool messages).
- **Folder-level access control:** Supports `whitelist` (exact path match, no implicit inheritance) and `blacklist` (path + all subfolders denied), plus an instant **Emergency Lock** switch. `state.json` (`0600`, atomic writes) is read fresh on every tool call so policy updates take effect immediately without restarting DSH.
- **Credential isolation:** Passwords are stored exclusively in DSH's host credential service (`ctx.credentials` → `$DSH_HOME/.credentials.yaml`, mode `0600`) or supplied via the `DSH_EXCHANGE_PASSWORD` environment variable. Passwords are never written to `state.json`, config files, logs, or API responses.
- **Strict HTTPS:** Plain `http://` EWS endpoints are rejected at both save time and connect time (`NET_001`).
- **Redacted audit log:** Every tool invocation appends a single JSONL record to `$DSH_HOME/dsh-exchange/audit.jsonl` (`0600`) containing only metadata (`ts`, `action`, `folder`, `emailId`, `outcome`, `code`, `count`, `elapsedMs`)—never subjects, bodies, or credentials.
- **Attachment cap & path safety:** Attachments strictly capped at **25 MiB** (`26,214,400` bytes) checked before download and before disk write (`ATT_001`). Filenames are sanitized to safe basenames.

---

## Requirements

- **DSH Harness:** `>=0.2.2-rc.3 <0.3.0`
- **Node.js:** `^22.19.0 || >=24`
- **Exchange Server:** On-premises Microsoft Exchange Server with HTTPS EWS + NTLM authentication (verified against Exchange Server SE 15.2.2562.49; EWS negotiated as Exchange 2013 for compatibility with 2013/2016/2019/SE). Microsoft 365 / OAuth2 is out of scope.

---

## Installation

### From Local Directory

```bash
dsh plugin --profile <your-profile> add /path/to/Mail-Assistant-Plugin
```

Or in the DSH Web UI: open **Plugins → Add plugin** and select the local directory of this package.

### From Packed Tarball

```bash
npm pack
dsh plugin --profile <your-profile> add ./local-dsh-exchange-1.1.0.tgz
```

### Verify Composition

```bash
dsh --profile <your-profile> --dump-config
```

You should see the `# == @local/dsh-exchange` layer with default limits and trigger configuration.

---

## Configuration

### 1. Account & Folder Permissions (Settings UI)

Open **Mail Assistant** directly from the top-left global sidebar (alongside **Plugins** and **Automation tasks**), or via **Settings → Mail Assistant** / **Plugins → Mail Assistant**:

1. Enter your HTTPS **EWS URL** (e.g. `https://exchange.company.com/EWS/Exchange.asmx`), **Email**, **Domain** (optional if logging in with email), **Username**, and **Password** (or set `DSH_EXCHANGE_PASSWORD` in your environment).
2. Click **Connect & Load Folders** to test connectivity and fetch your mail folder hierarchy.
3. Choose **Whitelist** or **Blacklist** mode and check the desired folders. (Checking a parent folder cascades to all its subfolders in the UI so saved paths remain explicit.)
4. Toggle **Emergency Lock** at any time to immediately block all Agent mailbox access.
5. Toggle **Show shortcut in top-left global sidebar** under **Navigation Shortcut** in Settings or Plugins to hide or restore the top-left sidebar entry at any time.
6. Click **Save** — changes persist atomically (`0600`) and take effect on the very next tool call.

### 2. Tunable Limits (`~/.dsh/profiles/<profile>/cordis.patch.yml`)

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

In any DSH conversation, type `@mail` (or select `@mail` from the `@` composer menu):

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
