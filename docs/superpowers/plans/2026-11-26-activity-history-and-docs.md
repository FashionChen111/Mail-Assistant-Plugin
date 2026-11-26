# Agent Activity History, Chinese README & GitHub Repo Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a local-only, privacy-safe Agent Activity History feature (storage, tool instrumentation, HTTP APIs, and tabbed DSH Web UI across all three entry points) plus a full Chinese README (`README.zh-CN.md`), Shields.io badges, and GitHub repository topics/description.

**Architecture:** Introduce `src/activity.js` managing `$DSH_HOME/dsh-exchange/activity.jsonl` (`0600`, rolling cap 500, strict allowlist excluding secrets/bodies/attachment bytes, atomic `clearedAt` watermark, and deduplicated fallback merge with untouched `audit.jsonl`). Instrument `src/tools/index.js` so all 15 tools pass safe per-action `summary` metadata and a shared `ts` to both `audit.log` and `activity.log`. Expose trust-fenced `GET /dsh-exchange/api/history` and `POST /dsh-exchange/api/history/clear` in `src/routes.js`, and add a segmented tab bar (`Configuration` | `Activity History`) inside `ExchangeSettingsPanel` in `client.js`. Finish with `README.zh-CN.md`, upgraded `README.md` badges, `package.json` packaging update, GitHub repo metadata/topics, live Ego Lite verification, independent code/UX review, and `v1.4.0` release.

**Tech Stack:** Node.js ESM (`src/activity.js`, `src/tools/index.js`, `src/routes.js`, `index.js`), Vanilla React via `window.__ModuleLoader__` (`client.js`), `node:test` + `vm` (`tests/unit/`), GitHub REST API.

**Spec:** `docs/superpowers/specs/2026-11-26-activity-history-and-docs-design.md`

## Global Constraints
- DSH `>=0.2.2-rc.3 <0.3.0`, Node.js `^22.19.0 || >=24`, zero new npm runtime dependencies.
- `audit.jsonl` (`src/security/audit.js`) MUST remain strictly redacted (zero `subject`, `body_text`, `password`, `snippet`) and append-only; clearing UI history MUST NEVER truncate or delete `audit.jsonl`.
- `activity.jsonl` MUST enforce `0600` file permissions, cap retained entries at 500, and strip any secrets (`password`, `token`, `authorization`), email bodies (`body_text`, `body_html`), or raw attachment content (`content_base64`).
- `client.js` remains a classic script (`window.__ModuleLoader__.load`), `require('react')` ONLY, document-relative fetch URLs (`dsh-exchange/api/...`), and `--dsw-alias-*` CSS tokens.
- All HTTP routes enforce `checkTrustFence(ctx, req, res)` (fail-closed `403`), `Cache-Control: no-store`, method check (`405`), and JSON body guards (`415` / `413` / `400`).

## Review Focus
- Corrupt or truncated JSONL lines in `activity.jsonl` or `audit.jsonl` (e.g. abrupt process termination mid-write) must be skipped gracefully rather than crashing `GET /dsh-exchange/api/history` with `500`.
- Denied `exchange_read_email` calls (`PERM_001`) must NEVER record or expose the forbidden email's subject or sender in `activity.jsonl`.
- Clicking **Clear History** must write a `clearedAt` watermark so older `audit.jsonl` records do NOT reappear in the UI on refresh, while leaving `audit.jsonl` completely intact on disk and allowing subsequent new tool calls to appear normally.
- Concurrent `activity.log()` calls during burst tool execution (e.g. Agent reading multiple emails in parallel) must serialize compaction/writes safely without corrupting or dropping entries.
- Running the updated `client.js` against an older backend that lacks `/dsh-exchange/api/history` (404) must degrade cleanly in the History tab without breaking the Configuration tab.

---

### Task 1: Build local-only `src/activity.js` store with sanitization, rolling cap, legacy `audit.jsonl` merge, and `clearedAt` watermark

**Files:**
- Create: `src/activity.js`
- Create: `tests/unit/activity.test.js`

**Interfaces:**
- Consumes: `node:fs/promises`, `node:path`, `node:crypto` (`randomBytes`).
- Produces:
  - `ACTION_CATEGORIES`: frozen map from all 15 canonical action names (`list_folders`, `search_emails`, `read_email`, `list_recent_emails`, `save_draft`, `update_draft`, `delete_draft`, `get_thread`, `parse_jira_notifications`, `extract_todos`, `summarize_project`, `download_attachment`, `move_email`, `mark_email`, `delete_email`) to `'read' | 'draft' | 'search' | 'analyze' | 'modify'`.
  - `MAX_ACTIVITY_ENTRIES = 500`.
  - `formatActivityRecord(entry)`: returns sanitized, strictly-allowlisted record `{ id, ts, action, category, outcome, code, folder, emailId, count?, elapsedMs, source: 'activity', summary }`. Truncates strings (`<= 200` chars), caps arrays (`<= 6` items), strips any unknown/secret/body keys (`password`, `body_text`, `body_html`, `content_base64`, `token`).
  - `createActivityLogger(activityPath, { maxEntries = 500 } = {})`: `{ path, log(entry), clear(nowIso?) }` with `0700` dir / `0600` file permissions, serialized write queue, atomic compaction when line count exceeds `maxEntries + 100`, and `clear()` writing an atomic `0600` watermark line `{"_meta":"cleared","clearedAt": "<iso>"}`.
  - `readActivityHistory({ activityPath, auditPath, limit = 50, offset = 0, category = 'all', outcome = 'all', q = '' })`: returns `{ items, total, unfilteredTotal, hasMore, stats: { total, read, draft, search, analyze, modify, denied, error } }`, ordered newest-first, gracefully skipping malformed lines or `ENOENT`, merging legacy `audit.jsonl` entries (`ts > clearedAt`, deduplicated against `activity.jsonl` by `${ts}|${action}|${emailId ?? ''}|${folder ?? ''}`), and supporting category/outcome/keyword filtering + pagination.

- [ ] **Step 1: Write failing unit tests in `tests/unit/activity.test.js`**

Test all core behaviors and Review Focus edge cases:
1. `formatActivityRecord` strictly allowlists fields, strips `password`/`body_text`/`body_html`/`content_base64`, caps long subjects/arrays, and assigns correct `category` for all 15 actions.
2. `createActivityLogger` writes `0600` JSONL, persists across reads, enforces rolling `maxEntries` cap via atomic compaction, and handles 20 concurrent `log()` calls without data loss or corruption.
3. `readActivityHistory` merges legacy `audit.jsonl` entries (tagged `source: 'audit'`), deduplicates matching `ts|action|emailId|folder` entries favoring rich `activity.jsonl` records, skips corrupted JSONL lines, filters by `category`, `outcome`, and case-insensitive `q` (matching subject/from/to/folder/query/project/issueKeys/fileName/action), computes accurate `stats`, and paginates (`limit`/`offset`/`hasMore`).
4. `clear()` writes a `clearedAt` watermark so older `audit.jsonl` records do NOT reappear while `audit.jsonl` itself remains unmodified on disk, and new `log()` entries recorded after `clearedAt` appear normally.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/unit/activity.test.js`
Expected: FAIL with module-not-found error for `src/activity.js`.

- [ ] **Step 3: Implement `src/activity.js`**

Implement `ACTION_CATEGORIES`, `MAX_ACTIVITY_ENTRIES`, `formatActivityRecord`, `createActivityLogger`, and `readActivityHistory` with atomic temp-file-rename helpers (`0600`), serialized promise-chain write queue, and strict summary field allowlisting per action.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/unit/activity.test.js && npm test`
Expected: PASS — all tests pass with 0 failures.

- [ ] **Step 5: Commit**

```bash
git add src/activity.js tests/unit/activity.test.js
git commit -m "feat(activity): add local 0600 activity history store with audit fallback merge"
```

---

### Task 2: Instrument all 15 tools (`src/tools/index.js`), wire `index.js`, and add `/api/history` routes (`src/routes.js`)

**Files:**
- Modify: `src/tools/index.js`
- Modify: `src/routes.js`
- Modify: `index.js`
- Test: `tests/unit/tools.test.js`, `tests/unit/routes-client.test.js`

**Interfaces:**
- Consumes: `createActivityLogger`, `readActivityHistory` from `src/activity.js`.
- Produces:
  - `createExchangeTools({ ctx, config, statePath, auditPath, activityPath, ... })`: defaults `activityPath` to `join(dirname(auditPath), 'activity.jsonl')` when omitted for backward compatibility; `runAudited` shares one `ts` across both `audit.log` and `activity.log` and passes `setActivitySummary(obj)` / `setAuditMeta(meta)` to handlers; `audit.jsonl` NEVER receives `summary`.
  - `ROUTE_PATHS.history = '/dsh-exchange/api/history'` (`GET`) and `ROUTE_PATHS.historyClear = '/dsh-exchange/api/history/clear'` (`POST`) in `src/routes.js`, wired with `auditPath` and `activityPath` from `index.js` (defaulting cleanly relative to `statePath` when omitted in callers/tests).
  - `GET /dsh-exchange/api/history?limit=50&offset=0&category=all&outcome=all&q=...` returns `{ ok: true, items, total, unfilteredTotal, hasMore, stats }`.
  - `POST /dsh-exchange/api/history/clear` (requires `application/json`, trust fence) clears `activity.jsonl` via `clearedAt` watermark and returns `{ ok: true, clearedAt }`.

- [ ] **Step 1: Write failing unit tests in `tests/unit/tools.test.js` and `tests/unit/routes-client.test.js`**

1. In `tests/unit/tools.test.js`: assert that running all 15 tools writes rich entries to `activity.jsonl` (including `read_email` subject & sender, `save_draft` subject/recipients/bodyChars with ZERO `body_text`, `update_draft` updatedFields, `search_emails` query, `summarize_project` project & counts, `parse_jira_notifications` issueKeys, `download_attachment` filename & size with ZERO `content_base64`, and denied `delete_email` with `permanent: true`), while verifying `audit.jsonl` STILL contains zero subjects, bodies, or passwords, AND verifying a denied `read_email` (`PERM_001`) logs zero subject/sender in `activity.jsonl`.
2. In `tests/unit/routes-client.test.js`: assert `ROUTE_PATHS.history` and `ROUTE_PATHS.historyClear` are registered, enforce trust fence (`403` when rejected or `connection` missing), method check (`405`), `application/json` content-type check (`415`) on clear, return filtered/paginated history + stats from `GET /dsh-exchange/api/history`, and clear history cleanly via `POST /dsh-exchange/api/history/clear` without deleting `audit.jsonl`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/unit/tools.test.js tests/unit/routes-client.test.js`
Expected: FAIL because `activity.jsonl` is not written by tools and `/api/history` routes are not registered.

- [ ] **Step 3: Implement tool instrumentation in `src/tools/index.js`, route handlers in `src/routes.js`, and wiring in `index.js`**

- In `src/tools/index.js`: pass shared `ts` to both `audit.log` and `activity.log`; enrich each of the 15 tool handlers with safe `summary` fields (never body/password/base64, and never forbidden email details on `PERM_001`).
- In `src/routes.js`: add `ROUTE_PATHS.history` (`GET`) and `ROUTE_PATHS.historyClear` (`POST`), defaulting `auditPath`/`activityPath` to siblings of `statePath` when not explicitly passed, with strict query clamping (`limit` 1..200, `offset` >= 0).
- In `index.js`: compute `activityPath = join(config.dataDir, 'activity.jsonl')` and pass it to both `createExchangeTools` and `registerExchangeRoutes` (along with `auditPath`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/unit/tools.test.js tests/unit/routes-client.test.js && npm test`
Expected: PASS — all unit tests pass including strict `audit.jsonl` redaction checks.

- [ ] **Step 5: Commit**

```bash
git add src/tools/index.js src/routes.js index.js tests/unit/tools.test.js tests/unit/routes-client.test.js
git commit -m "feat(history): record safe per-tool summaries and expose trust-fenced history HTTP APIs"
```

---

### Task 3: Add tabbed Agent Activity History UI in `client.js`

**Files:**
- Modify: `client.js`
- Test: `tests/unit/routes-client.test.js`

**Interfaces:**
- Consumes: `GET dsh-exchange/api/history` (`{ ok, items, total, unfilteredTotal, hasMore, stats }`), `POST dsh-exchange/api/history/clear` (`{ ok, clearedAt }`).
- Produces:
  - Segmented tab bar inside `ExchangeSettingsPanel` (`role="tablist"`, `role="tab"`, `aria-selected`) switching between **Configuration (`配置与权限`)** and **Activity History (`操作历史`)** with live total count badge, keeping the Emergency Lock bar pinned above the tabs.
  - Pure formatting helper `formatActivityEntry(item, t)` exported as `plugin.__formatActivityEntry` for unit testing across all 15 action types (read, draft save/update/delete, search, list recent, list folders, thread, Jira, todos, project summary, attachment, move, mark, delete, plus legacy audit records and denied/error outcomes).
  - Full History view: 4 summary metric pills (Total / Read / Drafts / Blocked), category filter chips (`all`, `read`, `draft`, `search`, `analyze`, `modify`, `blocked`), search input, Refresh button, 2-step Clear History confirmation, chronological activity cards with readable Chinese/English descriptions, relative/formatted local timestamps, elapsed ms, folder & error code pills, Load More pagination, graceful empty/404-upgrade states, and local-storage privacy footnote.

- [ ] **Step 1: Write failing unit tests in `tests/unit/routes-client.test.js`**

Add a dedicated test exercising `client.js` Activity History UI:
1. `ExchangeSettingsPanel` renders `role="tablist"` with 2 tabs (`settings` selected by default, `history` showing count badge) while keeping Emergency Lock visible above the tabs.
2. `plugin.__formatActivityEntry` produces accurate localized EN & ZH headline/details for `read_email` (shows subject + sender + folder), `save_draft` (shows draft subject + recipients + bodyChars + draft-only hint), `search_emails` (shows query + hit count), `summarize_project` (shows project + related count), `delete_email` denied with `permanentAttempt: true` (shows permanent delete blocked), and legacy `source: 'audit'` records.
3. Switching to the `history` tab triggers `GET dsh-exchange/api/history` and renders activity cards, filter chips, and 2-step Clear History flow calling `POST dsh-exchange/api/history/clear` (and handles HTTP 404 from an older backend gracefully without breaking the panel).

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/unit/routes-client.test.js`
Expected: FAIL because tab bar and `__formatActivityEntry` do not exist yet.

- [ ] **Step 3: Implement segmented tabs, `formatActivityEntry`, and Activity History view in `client.js`**

Add EN/ZH strings, `--dsw-alias-*` CSS styles (Light & Dark compatible, crisp contrast, clean timeline card layout), `formatActivityEntry(item, t)`, `formatLocalTime(iso)`, `formatBytes(bytes)`, history fetch/filter/paginate/clear state, and accessible `role="tablist"` / `role="tabpanel"` rendering in `ExchangeSettingsPanel`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/unit/routes-client.test.js && npm test && npm run test:integration`
Expected: PASS — all unit and integration tests green with 0 failures.

- [ ] **Step 5: Commit**

```bash
git add client.js tests/unit/routes-client.test.js
git commit -m "feat(ui): add tabbed Agent Activity History view in Mail Assistant panel"
```

---

### Task 4: Create `README.zh-CN.md`, upgrade `README.md` with Shields.io badges, update `package.json`, and configure GitHub repo description & topics

**Files:**
- Create: `README.zh-CN.md`
- Modify: `README.md`
- Modify: `package.json` (`files` array to include `README.zh-CN.md`)
- Modify: `tests/unit/manifest.test.js` (verify both `README.md` and `README.zh-CN.md` exist and cross-link cleanly)

**Interfaces:**
- Consumes: GitHub REST API (`PATCH /repos/FashionChen111/Mail-Assistant-Plugin`, `PUT /repos/FashionChen111/Mail-Assistant-Plugin/topics`) using `git credential fill` token (never printed).
- Produces:
  - Sleek Shields.io badge header + `English | 简体中文` switcher in both `README.md` and `README.zh-CN.md`.
  - Complete, accurate documentation for v1.4.0 including top-left sidebar shortcut, Agent Activity History panel & privacy model (`audit.jsonl` vs `activity.jsonl`), 15 tools table, error codes, and installation instructions.
  - Populated GitHub repo `description` and curated `topics` (`deepseek-harness`, `dsh-plugin`, `microsoft-exchange`, `ews`, `ntlm`, `mail-assistant`, `ai-agent`, `draft-only`, `privacy-first`, `nodejs`, `enterprise-email`, `audit-log`).

- [ ] **Step 1: Add manifest test assertion in `tests/unit/manifest.test.js` and verify it fails**

Assert `README.md` links to `README.zh-CN.md`, `README.zh-CN.md` exists and links back to `README.md`, both include Shields.io release/safety badges, and `package.json` `files` includes `README.zh-CN.md`. Run `node --test tests/unit/manifest.test.js` and confirm FAIL.

- [ ] **Step 2: Write `README.zh-CN.md`, upgrade `README.md`, and add `README.zh-CN.md` to `package.json` `files`**

- [ ] **Step 3: Run tests to verify manifest test passes**

Run: `node --test tests/unit/manifest.test.js && npm test`
Expected: PASS.

- [ ] **Step 4: Update GitHub repository description & topics via GitHub REST API and verify response**

- [ ] **Step 5: Commit**

```bash
git add README.md README.zh-CN.md package.json tests/unit/manifest.test.js
git commit -m "docs: add Chinese README, Shields.io badges, and update v1.4.0 docs"
```

---

### Task 5: Live DSH Web UI + Ego Lite Verification, Independent Whole-Branch Review, Merge & Release `v1.4.0`

- [ ] **Step 1: Spin up an isolated temporary DSH `v0.2.2-rc.3` web server (`--port 0`, temp `DSH_HOME` with seeded realistic `activity.jsonl` + legacy `audit.jsonl` — leaving the user's running `task-665` untouched) and inspect the live UI in Ego Lite across Light & Dark themes**
  - Verify segmented tab bar on Mail Assistant main page, Settings → Mail Assistant, and Plugins → Mail Assistant
  - Verify legacy `audit.jsonl` + rich `activity.jsonl` entries (read email with subject/sender, saved draft with subject/recipients/chars, search query, Jira keys, blocked `PERM_001`) render cleanly with zero layout overlap or contrast issues
  - Verify category filtering, search box, Refresh, and 2-step Clear History (confirming `audit.jsonl` stays untouched on disk and cleared items stay cleared after reload!)
  - Shut down the temporary verification server cleanly after capturing verification evidence.
- [ ] **Step 2: Dispatch an independent Whole-Branch Code & UX Reviewer subagent (`research`) covering `main..HEAD`, fix any Critical/Important findings, and re-run full test suites**
- [ ] **Step 3: Merge `feat/activity-history-and-bilingual-docs` into `main`, bump version to `1.4.0` (`package.json`, `package-lock.json`, `tests/unit/manifest.test.js`), verify `npm test` + `npm run test:integration`, push `main` + tag `v1.4.0`, run `npm pack` (`local-dsh-exchange-1.4.0.tgz`), and publish GitHub Release `v1.4.0` with `.tgz` asset uploaded.**
