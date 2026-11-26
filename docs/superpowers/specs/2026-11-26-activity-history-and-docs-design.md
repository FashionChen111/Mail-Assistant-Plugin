# Agent Activity History, Chinese README & GitHub Repo Polish — Design Spec

## Intent & Why
Users running `@local/dsh-exchange` (Mail Assistant) in DeepSeek Harness `v0.2.2-rc.3` have two immediate needs:
1. **Bilingual Documentation & GitHub Discoverability:** The repository currently has an English-only `README.md` with no top badges, and the GitHub repository (`FashionChen111/Mail-Assistant-Plugin`) has empty `description` and `topics` metadata. Users want a full Chinese README (`README.zh-CN.md`), sleek README status badges (Shields.io), and proper GitHub repository topics/description.
2. **Visible Agent Operation History in the UI:** Today, tool calls only write a strictly redacted security audit log (`$DSH_HOME/dsh-exchange/audit.jsonl`) on disk with no UI view and no human-readable email/draft subjects. Users want to inspect what the Agent actually did inside the Mail Assistant page—e.g. which emails it read, which drafts it created/updated, what searches/summaries it ran, and whether any calls were blocked (`PERM_001`)—without weakening any existing security guarantees.

## Goals, Non-Goals, Anti-Goals
- **Goals:**
  - Keep `$DSH_HOME/dsh-exchange/audit.jsonl` (`src/security/audit.js`) **100% untouched, append-only, and strictly redacted** (zero subject, body, snippet, or credentials—preserving PRD §3.2.4 and all existing security tests).
  - Add a dedicated local-only Agent Activity History store (`$DSH_HOME/dsh-exchange/activity.jsonl`, mode `0600`, rolling cap 500 newest entries) that records every Agent tool invocation with structured, human-readable safe summaries (email subject/sender/folder, draft subject/recipients/char count, search query/hit count, Jira issue keys, project name, attachment filename/size, move/mark/delete action, outcome, error code, elapsed ms).
  - Strictly forbid storing passwords, tokens, email body content (`body_text`/`body_html`), or attachment binary payloads (`content_base64`) in `activity.jsonl` or HTTP responses; denied `read_email` calls never leak forbidden email subjects/senders.
  - Seamlessly include pre-existing `audit.jsonl` entries as baseline history (`source: 'audit'`) when reading history so existing installations immediately see past activity, while respecting a `clearedAt` watermark when the user clears UI history (never mutating `audit.jsonl`).
  - Expose trust-fenced HTTP routes:
    - `GET /dsh-exchange/api/history` (query params: `limit`, `offset`, `category`, `outcome`, `q`; returns paginated items, `total`, `hasMore`, and aggregate `stats`).
    - `POST /dsh-exchange/api/history/clear` (requires `application/json`, resets `activity.jsonl` to a `clearedAt` watermark without touching `audit.jsonl`).
  - Add a clean segmented tab bar (`Configuration` / `Activity History (N)`, Chinese: `配置与权限` / `操作历史 (N)`) inside `ExchangeSettingsPanel`—available across all three entry points (Top-left Mail Assistant main page, Settings → Mail Assistant, and Plugins → Mail Assistant)—keeping the Emergency Lock bar permanently pinned above the tabs for immediate access.
  - Provide category filters (`All`, `Read`, `Drafts`, `Search`, `Analyze`, `Organize`, `Blocked / Failed`), keyword search, live refresh, load-more pagination, 2-step inline Clear History confirmation, and full EN/ZH localization in both Light and Dark themes.
  - Add a comprehensive `README.zh-CN.md`, upgrade `README.md` with Shields.io badges + language switcher + v1.4.0 documentation, include `README.zh-CN.md` in `package.json` `files`, and configure GitHub repository `description` and `topics`.
- **Non-Goals:**
  - Opening or rendering full email bodies or editing Exchange drafts inside the Activity History UI (scope is transparent observability of Agent actions; draft review/sending stays in Outlook/OWA).
  - Syncing activity history across machines or to any external telemetry endpoint (strictly local `$DSH_HOME/dsh-exchange/activity.jsonl`).
  - Modifying the 15 tool schemas or adding any email-sending capability.
- **Anti-Goals:**
  - Writing subjects, bodies, or credentials into `audit.jsonl`.
  - Writing email bodies (`body_text`/`body_html`), raw attachment bytes, or credentials into `activity.jsonl`.
  - Truncating or deleting `audit.jsonl` when the user clears UI activity history.
  - Crashing history reads when `activity.jsonl` or `audit.jsonl` is absent (`ENOENT`) or contains a truncated/corrupt JSON line.
  - Breaking headless DSH profiles (no `webServer`) or older backend processes that lack `/api/history`.

## Global Constraints
- DSH `>=0.2.2-rc.3 <0.3.0`, Node.js `^22.19.0 || >=24`, zero new npm runtime dependencies.
- `client.js` remains a classic script (`window.__ModuleLoader__.load`), `require('react')` ONLY, document-relative fetch URLs (`dsh-exchange/api/...`), and `--dsw-alias-*` CSS tokens.
- Both `audit.jsonl` and `activity.jsonl` enforce directory mode `0700` and file mode `0600`.
- All HTTP routes enforce `checkTrustFence(ctx, req, res)` (fail-closed `403` when `connection` is unavailable), `Cache-Control: no-store`, method validation (`405`), and JSON body bounds (`415` / `413` / `400`).

## Approaches Considered
1. **Separate local `activity.jsonl` (rich safe summaries, clearable with `clearedAt` watermark) + untouched redacted `audit.jsonl` + legacy fallback merge + tabbed UI inside `ExchangeSettingsPanel` (Chosen):** Preserves every PRD §3.2.4 security invariant on `audit.jsonl` while delivering the exact email-subject / draft-subject visibility the user asked for, surfaces existing `audit.jsonl` history automatically, keeps the Settings layout uncluttered via segmented tabs, and works identically across all three DSH UI surfaces.
2. **Add `subject`/`from`/`to` directly into `audit.jsonl` (Rejected):** Directly violates PRD §3.2.4 ("不记主题、不记正文、不记凭据") and breaks existing security audit unit tests; also forces a conflict between immutable security auditing and user-clearable UI history.
3. **Append an Activity History card at the bottom of the Settings scroll view without tabs (Rejected):** Forces users to scroll past EWS credentials and 40+ Exchange folders just to check recent Agent actions, and mixes high-frequency inspection with low-frequency configuration.
