# Mail Assistant (`@local/dsh-exchange`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and verify `@local/dsh-exchange` v1.1.0, a complete Microsoft Exchange (EWS + NTLM) Mail Assistant plugin bundle for DeepSeek Harness (DSH) `0.2.2-rc.3` with 15 safe tools, `@mail` session gating, folder-level access control, redacted audit logging, local Settings HTTP routes, and native Web Client UI.

**Architecture:** Zero-build Node.js ESM Host package (`index.js` + `src/`) paired with a classic-script lazy-CJS Web Client bundle (`client.js`) loaded by DSH's `window.__ModuleLoader__`. Host registers 15 `defineTool` tools gated by a `ctx.sessionProjections`-backed `@mail` activation projection (`{ when }`), reads `state.json` (`0600`, atomic write) fresh per call with secrets isolated in `ctx.credentials` (or `DSH_EXCHANGE_PASSWORD`), connects in-process via `ews-javascript-api@0.15.3` + `@ewsjs/xhr` (`gzip: true`), and serves 3 trust-fenced Settings routes (`/dsh-exchange/api/{status,probe,save}`).

**Tech Stack:** Node.js `^22.19.0 || >=24` (ESM + `node --test`), `ews-javascript-api@0.15.3`, `@ewsjs/xhr@^3.1.3`, DSH `0.2.2-rc.3` peer APIs (`@deepseek-ai/cordis`, `@deepseek-ai/schemastery`, `@deepseek-ai/dsh-tools`, `@deepseek-ai/dsh-error`, `@deepseek-ai/dsh-credentials`, `@deepseek-ai/dsh-home-paths`), React (from DSH browser module table via `require('react')`).

**Spec:** [2026-11-25-dsh-exchange-design.md](file:///Users/fashionchen/AI/Plugins/Mail-Assistant-Plugin/docs/superpowers/specs/2026-11-25-dsh-exchange-design.md) and [DSH-Exchange-Plugin-PRD.md](file:///Users/fashionchen/AI/Plugins/Mail-Assistant-Plugin/docs/DSH-Exchange-Plugin-PRD.md)

## Global Constraints

- Target DSH version: `engines.dsh: ">=0.2.2-rc.3 <0.3.0"`, Node `^22.19.0 || >=24`.
- Dependencies: `ews-javascript-api: "0.15.3"` and `@ewsjs/xhr: "^3.1.3"` only; shared DSH host packages declared in `peerDependencies` (and mirrored in `devDependencies` for standalone `node --test`).
- Structural safety: zero `exchange_send_email` tool and zero EWS `Send`/`SendAndSaveCopy` call paths; `permanent: true` on `exchange_delete_email` unconditionally throws `PERM_001` before any EWS call.
- Every `defineTool` explicit `{ type: 'object' }` node in `parameters` or `output.schema` MUST declare `additionalProperties: false` (or `true`). `execute` returns canonical JSON; `output.render` returns `ContentBlock[]`.
- Expected domain errors throw `ExchangeError extends HarnessError` (from `@deepseek-ai/dsh-error`) with exact codes `AUTH_001`, `EMAIL_001`, `PERM_001`, `NET_001`, `RATE_001`, `ATT_001`. `AbortError` / `exec.signal.reason` propagates untouched.
- Passwords live ONLY in `ctx.credentials` (`credentialKey('dsh-exchange', 'account')`) or `DSH_EXCHANGE_PASSWORD`; never written to `state.json`, config, logs, audit, or API responses.
- `state.json` and `audit.jsonl` have POSIX mode `0600` (parent dir `0700`); `state.json` uses atomic tmp+rename and is read fresh on every tool invocation (no in-memory caching).
- HTTPS strictly required for `serverUrl` at both save and connect time (`http://` → `NET_001`).
- Attachment cap `25 MiB` (`26,214,400` bytes) enforced before download and before disk write (`ATT_001`); filenames sanitized to safe basenames; `content_base64` included only when `size <= 1 MiB` (`1,048,576` bytes).
- Retries: 3 retries with `1s / 2s / 4s` backoff on rate-limit/server-busy (`RATE_001`); zero retries on `AUTH_001`; no stale-cache fallback.
- Browser `client.js`: classic-script `window.__ModuleLoader__.load({ id: '@local/dsh-exchange', factory(require) { ... } })`, zero imports of `@deepseek-ai/dsh-client-ui-primitives`, uses `--dsw-alias-*` CSS theme tokens and document-relative `fetch('dsh-exchange/api/...')` URLs.

## Review Focus

1. **Email addresses containing `@mail` (e.g. `alice@mail.company.com`) or suffix tokens (`@mail2`, `@mailbox`):** Must NOT activate Exchange tools; independent `@mail`, `@mail assistant`, and `@mail，查邮件` MUST activate on Turn 1. *(Pinned in Task 4)*
2. **Thread containing a mix of allowed and forbidden folders (or email moved to a forbidden folder after search):** `exchange_get_thread` MUST fail closed with `PERM_001` (zero partial leak), and `exchange_read_email` MUST re-check the item's live folder and deny with `PERM_001`. *(Pinned in Tasks 6 & 7)*
3. **Hostile attachment filenames (`../../.bashrc`, `C:\Windows\evil.exe`, `a/b/log.txt`) and exact 25 MiB boundary (`26,214,400` vs `26,214,401` bytes, including lying EWS metadata):** Filename MUST collapse to safe basename inside target dir; exact 25 MiB passes; 25 MiB + 1 byte (from metadata OR actual bytes) fails with `ATT_001` without writing a file. *(Pinned in Task 7)*
4. **Unauthenticated / cross-origin / oversized / non-JSON requests to `/dsh-exchange/api/*`, or saving `http://` server URL:** Trust fence MUST return 401/403, body > 64 KiB returns 413, non-JSON returns 415, `http://` returns 400 with `NET_001`, and `GET /status` NEVER echoes password material. *(Pinned in Task 10)*
5. **Cancellation (`AbortSignal`) during retries or multi-folder/multi-email reads:** Aborting during `RATE_001` backoff sleep or between folder fetches MUST propagate raw `AbortError` immediately (never wrapped as `NET_001` or `ExchangeError`). *(Pinned in Tasks 5, 6 & 9)*

---

## File Structure

- `package.json` — `@local/dsh-exchange` manifest, exports, `engines.dsh`, `dsh.bundle.patch`, `dsh.client`, deps/peers/devDeps
- `cordis.patch.yml` — bundle patch row inserting `dsh-exchange` with default `limits` and `trigger`
- `icon.svg` — 36×36 original transparent vector icon for Plugin Manager
- `locale/en.json`, `locale/zh.json` — static plugin display metadata (`meta.title`, `meta.description`)
- `index.js` — Host Cordis plugin entry (`name`, `inject`, `Config`, `apply`)
- `client.js` — Browser lazy-CJS module (`settings.section`, `settings.section.icon`, `plugins.bundle.config`, `inputTriggers` `@mail`, runtime i18n)
- `src/errors.js` — `ExchangeError extends HarnessError`, `ERROR_CODES`, `isAbortError`, `throwIfAborted`
- `src/config.js` — `@deepseek-ai/schemastery` `Config` schema and `resolveConfig(raw)`
- `src/state.js` — `DEFAULT_STATE`, `validateServerUrl`, atomic `0600` `readState`/`writeState`, `ctx.credentials` + `DSH_EXCHANGE_PASSWORD` password helpers
- `src/security/permissions.js` — `normalizeFolderPath`, `isFolderAllowed`, `assertFolderAllowed`
- `src/security/audit.js` — redacted `0600` JSONL `AuditLogger`
- `src/mention.js` — `containsMailTrigger`, `isUserMessageTriggeringMail`
- `src/scope.js` — `SessionScope` (`ctx.sessionProjections` + fallback) for per-session `@mail` gating
- `src/ews/connection.js` — `formatNtlmUsername`, `mapEwsError`, `withRetry`, `createEwsClient`, `EwsClient` (`ews-javascript-api` + `@ewsjs/xhr` with `gzip: true`)
- `src/ews/folders.js` — folder tree traversal, mail-folder filtering, path resolution with ambiguity/candidate reporting
- `src/ews/search.js` — `htmlToText`, `makeSnippet`, `searchEmails`, `listRecentEmails`, `readEmail`
- `src/ews/draft.js` — `saveDraft`, `updateDraft`, `deleteDraft` (structurally zero send capability)
- `src/ews/thread.js` — `getThread` (ConversationId fetch, all-member permission gate, Message-ID dedup, References topological + chronological sort)
- `src/ews/attachment.js` — `sanitizeAttachmentName`, `downloadAttachment` (25 MiB pre-download & pre-write gate, ≤ 1 MiB base64)
- `src/ews/mutate.js` — `moveEmail`, `markEmail`, `deleteEmail` (MoveToDeletedItems only; `permanent: true` denied)
- `src/nlp/jira.js` — `parseJiraEmail`, `parseJiraNotifications`
- `src/nlp/todo.js` — `extractTodosFromEmail`, `extractTodos`
- `src/nlp/summary.js` — `summarizeProjectEmails`, `summarizeProject`
- `src/tools/index.js` — all 15 `defineTool` definitions + registration + system prompt text
- `src/routes.js` — `registerExchangeRoutes` for `/dsh-exchange/api/{status,probe,save}`
- `README.md` — installation, configuration, 15-tool reference, security boundaries, integration testing guide
- `tests/unit/*.test.js` — comprehensive `node --test` unit suites
- `tests/integration/exchange.integration.test.js` — local HTTPS mock EWS wire test + opt-in real Exchange integration suite (skipped unless `DSH_EXCHANGE_TEST_URL` is set)

---

### Task 1: Package Skeleton, Manifest, Locale, Icon & Dependencies

**Files:**
- Create: `package.json`, `cordis.patch.yml`, `icon.svg`, `locale/en.json`, `locale/zh.json`, `index.js`, `client.js`
- Test: `tests/unit/manifest.test.js`

**Interfaces:**
- Produces: Installable npm package `@local/dsh-exchange` with `npm test` running `node --test tests/unit/*.test.js`, valid `exports`, `engines.dsh`, `dsh.bundle`, `dsh.client`, `locale/en.json`, `locale/zh.json`, `icon.svg`.

- [ ] **Step 1: Write the failing manifest & asset validation test in `tests/unit/manifest.test.js`**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, stat } from 'node:fs/promises'
import { resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '../..')

test('package.json declares valid DSH 0.2.2-rc.3 bundle and client manifest', async () => {
  const pkg = JSON.parse(await readFile(resolve(ROOT, 'package.json'), 'utf8'))
  assert.equal(pkg.name, '@local/dsh-exchange')
  assert.equal(pkg.type, 'module')
  assert.equal(pkg.engines.dsh, '>=0.2.2-rc.3 <0.3.0')
  assert.equal(pkg.dependencies['ews-javascript-api'], '0.15.3')
  assert.equal(pkg.dsh.bundle.patch, './cordis.patch.yml')
  assert.equal(pkg.dsh.client.platform, 'web')
  assert.equal(pkg.exports['.'], './index.js')
  assert.equal(pkg.exports['./client'], './client.js')
  assert.equal(pkg.exports['./locale/*.json'], './locale/*.json')
  assert.equal(pkg.exports['./icon'], './icon.svg')
  assert.equal(pkg.exports['./package.json'], './package.json')
})

test('locale/en.json, locale/zh.json, cordis.patch.yml, and icon.svg satisfy DSH metadata rules', async () => {
  const en = JSON.parse(await readFile(resolve(ROOT, 'locale/en.json'), 'utf8'))
  const zh = JSON.parse(await readFile(resolve(ROOT, 'locale/zh.json'), 'utf8'))
  assert.ok(en.meta.title && en.meta.description)
  assert.ok(zh.meta.title && zh.meta.description)
  const patch = await readFile(resolve(ROOT, 'cordis.patch.yml'), 'utf8')
  assert.match(patch, /id:\s*dsh-exchange/)
  assert.match(patch, /name:\s*['"]@local\/dsh-exchange['"]/)
  const iconBuf = await readFile(resolve(ROOT, 'icon.svg'), 'utf8')
  const iconStat = await stat(resolve(ROOT, 'icon.svg'))
  assert.ok(iconStat.size <= 256 * 1024)
  assert.match(iconBuf, /viewBox="0 0 36 36"/)
  assert.doesNotMatch(iconBuf, /<script|<style|<text|<image|foreignObject/i)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/unit/manifest.test.js`
Expected: FAIL with ENOENT reading `package.json`.

- [ ] **Step 3: Create `package.json`, `cordis.patch.yml`, `icon.svg`, `locale/en.json`, `locale/zh.json`, minimal `index.js` & `client.js`, and run `npm install`**

Create all manifest/skeleton files following DSH `0.2.2-rc.3` contracts; install `ews-javascript-api@0.15.3`, `@ewsjs/xhr@^3.1.3`, and `0.2.2-rc.3` DSH peer/devDependencies.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/unit/manifest.test.js`
Expected: PASS (2/2).

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json cordis.patch.yml icon.svg locale index.js client.js tests/unit/manifest.test.js
git commit -m "feat: scaffold @local/dsh-exchange DSH bundle package and metadata"
```

---

### Task 2: Errors, Config Schema, Atomic State & Credentials Adapter

**Files:**
- Create: `src/errors.js`, `src/config.js`, `src/state.js`
- Test: `tests/unit/core.test.js`

**Interfaces:**
- Produces `src/errors.js`:
  - `ERROR_CODES = { AUTH_001, EMAIL_001, PERM_001, NET_001, RATE_001, ATT_001 }`
  - `class ExchangeError extends HarnessError` — `constructor(code, message, details = {}, options?)` (`this.code === code`, `this.details === details`, `this.name === 'ExchangeError'`)
  - `isAbortError(err): boolean`
  - `throwIfAborted(signal): void`
- Produces `src/config.js`:
  - `Config` (`@deepseek-ai/schemastery` Schema object matching PRD `limits` + `trigger` + optional `data_dir`)
  - `resolveConfig(rawConfig?): { maxSearchResults, maxAttachmentMb, maxAttachmentBytes, maxBodyChars, requestTimeoutSeconds, requestTimeoutMs, explicitPrefix, dataDir }`
- Produces `src/state.js`:
  - `STATE_VERSION = '1.1.0'`, `CREDENTIAL_SCOPE = 'dsh-exchange'`, `CREDENTIAL_ID = 'account'`
  - `defaultState(): State`
  - `validateServerUrl(url): string` (enforces `https:`, throws `ExchangeError('NET_001', ...)` on `http:` or malformed URL)
  - `readState(statePath): Promise<State>` (fresh disk read, returns `defaultState()` on ENOENT)
  - `writeState(statePath, nextState): Promise<State>` (validates HTTPS, strips secrets, atomic tmp+rename, `0600` file / `0700` dir)
  - `getPassword(ctx, env?): Promise<string | undefined>` (`DSH_EXCHANGE_PASSWORD` env > `ctx.credentials.readRecord`)
  - `describePassword(ctx, env?): Promise<{ configured: boolean, source: 'env' | 'credentials' | 'none' }>`
  - `setPassword(ctx, password): Promise<void>`
  - `clearPassword(ctx): Promise<void>`

- [ ] **Step 1: Write failing tests in `tests/unit/core.test.js`**
  Test `ExchangeError instanceof HarnessError` & `.code`/`.details`; `isAbortError` & `throwIfAborted`; `Config` defaults and clamping (`max_attachment_mb` capped at 25, `request_timeout_seconds` 1–300); `readState` ENOENT default; `writeState` atomic write + POSIX `0600` mode + secret stripping + `http://` rejection (`NET_001`); `getPassword`/`describePassword`/`setPassword`/`clearPassword` with `DSH_EXCHANGE_PASSWORD` precedence over `ctx.credentials`.
- [ ] **Step 2: Run `node --test tests/unit/core.test.js` and verify FAIL**
- [ ] **Step 3: Implement `src/errors.js`, `src/config.js`, `src/state.js`**
- [ ] **Step 4: Run `node --test tests/unit/core.test.js` and verify PASS**
- [ ] **Step 5: Commit** (`feat: add ExchangeError, Config schema, atomic state and credentials store`)

---

### Task 3: Folder Permission Policy & Redacted Audit Logger

**Files:**
- Create: `src/security/permissions.js`, `src/security/audit.js`
- Test: `tests/unit/security.test.js`

**Interfaces:**
- Consumes: `ExchangeError`, `ERROR_CODES` from `../errors.js`
- Produces `src/security/permissions.js`:
  - `normalizeFolderPath(path): string`
  - `isFolderAllowed(folderPath, access): { allowed: boolean, reason?: string }`
  - `assertFolderAllowed(folderPath, access): string` (returns normalized path or throws `ExchangeError('PERM_001', ..., { folder })`)
- Produces `src/security/audit.js`:
  - `createAuditLogger(auditPath): { log(entry): Promise<void> }` — appends single JSONL line with strict allowlist `{ ts, action, folder, emailId, outcome, code, count?, elapsedMs }` and mode `0600`.

- [ ] **Step 1: Write failing tests in `tests/unit/security.test.js`**
  Test path normalization (`\`, repeated `/`, leading/trailing `/`, trim); whitelist exact-match ONLY (`收件箱` does NOT allow `收件箱/项目A`); blacklist exact + subtree (`人事资料` blocks `人事资料` AND `人事资料/薪资`, does NOT block `人事资料备份`); `emergencyLock: true` blocks all folders in both modes; `assertFolderAllowed` throws `ExchangeError('PERM_001')`; `AuditLogger` creates `0600` JSONL file and strips any accidentally passed `subject`/`body`/`password`/`snippet` fields.
- [ ] **Step 2: Run `node --test tests/unit/security.test.js` and verify FAIL**
- [ ] **Step 3: Implement `src/security/permissions.js` and `src/security/audit.js`**
- [ ] **Step 4: Run `node --test tests/unit/security.test.js` and verify PASS**
- [ ] **Step 5: Commit** (`feat: add folder access control policy and redacted audit logger`)

---

### Task 4: `@mail` Mention Detection & Session-Level Tool Scoping

**Files:**
- Create: `src/mention.js`, `src/scope.js`
- Test: `tests/unit/scope.test.js`

**Interfaces:**
- Produces `src/mention.js`:
  - `containsMailTrigger(text, explicitPrefix = '@mail'): boolean`
  - `isUserMessageTriggeringMail(message, explicitPrefix = '@mail'): boolean`
- Produces `src/scope.js`:
  - `createSessionScope(ctx, { explicitPrefix }): Promise<{ isSessionActivated(session): boolean, dispose(): Promise<void> }>`

- [ ] **Step 1: Write failing tests in `tests/unit/scope.test.js`**
  Test Review Focus #1: `@mail`, `@mail 看下`, `@mail assistant`, `请 @mail 查邮件`, `@mail，看看` → `true`; `@mail2`, `@mailbox`, `@mail-bot`, `alice@mail.company.com`, `邮件` (without `@mail`) → `false`; assistant/tool/system messages containing `@mail` → `false`; `createSessionScope` with mock `sessionProjections` activates on Turn 1 via `agent/inbox/spliced` AND on resume via `user/message`, stays false for unrelated sessions, and keeps session isolation across concurrent sessions; fallback mode without `sessionProjections` also works via `session/event`.
- [ ] **Step 2: Run `node --test tests/unit/scope.test.js` and verify FAIL**
- [ ] **Step 3: Implement `src/mention.js` and `src/scope.js`**
- [ ] **Step 4: Run `node --test tests/unit/scope.test.js` and verify PASS**
- [ ] **Step 5: Commit** (`feat: add @mail mention detection and per-session projection scoping`)

---

### Task 5: EWS Connection, NTLM Transport, Retry, Timeout & Error Mapping

**Files:**
- Create: `src/ews/connection.js`
- Test: `tests/unit/connection.test.js`

**Interfaces:**
- Consumes: `ExchangeError`, `ERROR_CODES`, `isAbortError`, `throwIfAborted` from `../errors.js`; `validateServerUrl` from `../state.js`
- Produces `src/ews/connection.js`:
  - `formatNtlmUsername({ email, domain, username }): string`
  - `mapEwsError(err, context?): ExchangeError`
  - `withRetry(fn, { signal, delaysMs?, onRetry? }): Promise<T>` (default delays `[1000, 2000, 4000]`)
  - `createEwsTransport({ serverUrl, email, domain, username, password, timeoutMs }): { service, xhrApi, loginUser }` (wires `ews-javascript-api` `ExchangeService(ExchangeVersion.Exchange2013)` + `@ewsjs/xhr` `XhrApi({ gzip: true, timeout: timeoutMs })` + `useNtlmAuthentication(loginUser, password)`)
  - `createEwsClient(options): EwsClient` (high-level EWS operations adapter with injectable backend for testing & real `ews-javascript-api` implementation)

- [ ] **Step 1: Write failing tests in `tests/unit/connection.test.js`**
  Test `formatNtlmUsername` (`DOMAIN\user`, `user@company.com`, already-qualified `CORP\alice`); `createEwsTransport` rejects `http://` with `NET_001`, rejects missing password with `AUTH_001`, configures `gzip: true` on `XhrApi`; `mapEwsError` distinguishes 401/403/`ErrorAccessDenied` → `AUTH_001`, 429/503/`ErrorServerBusy` → `RATE_001`, `ErrorItemNotFound`/`ErrorFolderNotFound` → `EMAIL_001`, `ENOTFOUND`/`ECONNREFUSED`/`ETIMEDOUT`/TLS → `NET_001`; `withRetry` retries 3 times on `RATE_001` with exact delays, NEVER retries `AUTH_001`/`PERM_001`/`EMAIL_001`, and propagates raw `AbortError` immediately during backoff sleep (Review Focus #5).
- [ ] **Step 2: Run `node --test tests/unit/connection.test.js` and verify FAIL**
- [ ] **Step 3: Implement `src/ews/connection.js`**
- [ ] **Step 4: Run `node --test tests/unit/connection.test.js` and verify PASS**
- [ ] **Step 5: Commit** (`feat: implement EWS NTLM connection, error mapping, and abort-aware retry`)

---

### Task 6: EWS Folder Tree, Search, Recent Emails & Read Email

**Files:**
- Create: `src/ews/folders.js`, `src/ews/search.js`
- Test: `tests/unit/read-search.test.js`

**Interfaces:**
- Consumes: `assertFolderAllowed`, `isFolderAllowed`, `normalizeFolderPath` from `../security/permissions.js`; `ExchangeError`, `ERROR_CODES`, `throwIfAborted` from `../errors.js`
- Produces `src/ews/folders.js`:
  - `buildFolderTree(rawFolders): FolderEntry[]` (`{ id, path, name, parentId }`, filters out non-mail folders like Calendar/Contacts/Tasks)
  - `listFolders({ ewsClient, state, readableOnly, signal }): Promise<{ folders: [{ path, name, readable }] }>`
  - `resolveFolder({ rawFolders, targetPath }): FolderEntry` (throws `PERM_001` with `candidates` on ambiguity, `EMAIL_001` with `candidates` on missing)
- Produces `src/ews/search.js`:
  - `htmlToText(html): string`
  - `makeSnippet(text, maxLen = 200): string`
  - `validateDateString(value, fieldName): string` (`YYYY-MM-DD`)
  - `searchEmails({ ewsClient, state, limits, args, signal }): Promise<{ emails, total }>`
  - `listRecentEmails({ ewsClient, state, limits, args, signal }): Promise<{ emails }>`
  - `readEmail({ ewsClient, state, limits, args, signal }): Promise<EmailDetail>`

- [ ] **Step 1: Write failing tests in `tests/unit/read-search.test.js`**
  Test `listFolders` hides IDs & unread counts and respects `readable_only`; `resolveFolder` returns closest candidates on missing/ambiguous paths; `searchEmails` rejects forbidden folder BEFORE calling `ewsClient` (assert 0 EWS calls), enforces `days` precedence over `date_from`/`date_to`, validates `YYYY-MM-DD`, clamps `limit` to `maxSearchResults`, sorts desc; `listRecentEmails` ONLY queries `readable: true` folders, merges and sorts desc, aborts cleanly between folders (Review Focus #5); `readEmail` re-verifies current folder after whitelist revocation and denies with `PERM_001` (Review Focus #2), converts HTML-only body to readable text, truncates at `maxBodyChars` with `body_chars`/`body_truncated`, supports `mark_as_read`.
- [ ] **Step 2: Run `node --test tests/unit/read-search.test.js` and verify FAIL**
- [ ] **Step 3: Implement `src/ews/folders.js` and `src/ews/search.js`**
- [ ] **Step 4: Run `node --test tests/unit/read-search.test.js` and verify PASS**
- [ ] **Step 5: Commit** (`feat: implement EWS folder resolution, search, recent view, and read`)

---

### Task 7: EWS Drafts, Thread Reconstruction, Attachments & Mutations

**Files:**
- Create: `src/ews/draft.js`, `src/ews/thread.js`, `src/ews/attachment.js`, `src/ews/mutate.js`
- Test: `tests/unit/draft-thread-att-mutate.test.js`

**Interfaces:**
- Consumes: `assertFolderAllowed`, `isFolderAllowed` from `../security/permissions.js`; `resolveFolder` from `./folders.js`; `htmlToText` from `./search.js`; `ExchangeError`, `ERROR_CODES`, `throwIfAborted` from `../errors.js`
- Produces:
  - `src/ews/draft.js`: `saveDraft`, `updateDraft`, `deleteDraft`
  - `src/ews/thread.js`: `sortThreadEmails(emails)`, `getThread({ ewsClient, state, limits, args, signal })`
  - `src/ews/attachment.js`: `sanitizeAttachmentName(name, fallbackId)`, `downloadAttachment({ ewsClient, state, limits, args, signal })`
  - `src/ews/mutate.js`: `moveEmail`, `markEmail`, `deleteEmail`

- [ ] **Step 1: Write failing tests in `tests/unit/draft-thread-att-mutate.test.js`**
  Test `saveDraft` validation (non-empty `to`, non-blank `subject`), `in_reply_to` populates `In-Reply-To`/`References` and gracefully degrades when target is missing/forbidden, `updateDraft` patches only provided fields, `deleteDraft` deletes draft; `getThread` reconstructs 10-email thread chronologically + topological `References`, deduplicates by `message_id`, and rejects entire thread with `PERM_001` if ANY member is in a forbidden folder (Review Focus #2); `downloadAttachment` allows exact `26,214,400` bytes (25 MiB) and rejects `26,214,401` bytes from metadata OR actual payload with `ATT_001` before writing disk, sanitizes `../../.bashrc` & `C:\Windows\evil.exe`, includes `content_base64` iff `size <= 1 MiB` (Review Focus #3); `moveEmail` checks both target (pre-EWS) and source folders; `markEmail` requires at least one flag; `deleteEmail` with `permanent: true` throws `PERM_001` with 0 EWS calls and `permanent: false` moves to Deleted Items.
- [ ] **Step 2: Run `node --test tests/unit/draft-thread-att-mutate.test.js` and verify FAIL**
- [ ] **Step 3: Implement `src/ews/draft.js`, `src/ews/thread.js`, `src/ews/attachment.js`, `src/ews/mutate.js`**
- [ ] **Step 4: Run `node --test tests/unit/draft-thread-att-mutate.test.js` and verify PASS**
- [ ] **Step 5: Commit** (`feat: implement drafts, thread reconstruction, attachment download, and mutations`)

---

### Task 8: Heuristic NLP Modules (Jira, Todos, Project Summary)

**Files:**
- Create: `src/nlp/jira.js`, `src/nlp/todo.js`, `src/nlp/summary.js`
- Test: `tests/unit/nlp.test.js`

**Interfaces:**
- Produces `src/nlp/jira.js`: `parseJiraEmail(email)`, `parseJiraNotifications({ emails, userEmail, userName, filterByUser })`
- Produces `src/nlp/todo.js`: `extractTodosFromEmail(email, now)`, `extractTodos({ emails, now })`
- Produces `src/nlp/summary.js`: `summarizeProjectEmails({ project, days, emails, now })`

- [ ] **Step 1: Write failing tests in `tests/unit/nlp.test.js`**
  Test Jira parser against PRD Scenario 3 (`CERT-1234`, `Open → In Progress`, `In Progress → Blocked`, assignee, priority, latest comment, `filter_by_user: true/false`); Todo extractor against PRD Scenario 4 (bilingual ZH/EN deadlines `本周五前`, `EOD today`, `Nov 25`, `11月25日前`, action types `reply_required`/`follow_up`/`review`/`submit`, unanswered `?` > 2 days, verbatim `context`, priority sorting); Project summarizer against PRD Scenario 2 (`AirPlay2` timeline, blocking issues, next actions, related emails, all carrying `source_email_id` and `context`).
- [ ] **Step 2: Run `node --test tests/unit/nlp.test.js` and verify FAIL**
- [ ] **Step 3: Implement `src/nlp/jira.js`, `src/nlp/todo.js`, `src/nlp/summary.js`**
- [ ] **Step 4: Run `node --test tests/unit/nlp.test.js` and verify PASS**
- [ ] **Step 5: Commit** (`feat: implement Jira, todo, and project summary heuristic NLP modules`)

---

### Task 9: All 15 `defineTool` Registrations & Host Entrypoint

**Files:**
- Create: `src/tools/index.js`
- Modify: `index.js`
- Test: `tests/unit/tools.test.js`

**Interfaces:**
- Consumes: `defineTool`, `ToolArgsError` from `@deepseek-ai/dsh-tools`; `Config`, `resolveConfig` from `./src/config.js`; `readState`, `getPassword` from `./src/state.js`; `createAuditLogger` from `./src/security/audit.js`; `createSessionScope` from `./src/scope.js`; `createEwsClient` from `./src/ews/connection.js`; all `src/ews/*` and `src/nlp/*` functions; `registerExchangeRoutes` from `./src/routes.js` (wired in Task 10).
- Produces `src/tools/index.js`:
  - `TOOL_NAMES` (exact 15 names from PRD §7.1)
  - `EXCHANGE_SYSTEM_PROMPT`
  - `createExchangeTools(deps): ToolDefinition[]`
  - `registerExchangeTools(ctx, deps): () => void`
- Produces `index.js`:
  - `export const name = 'dsh-exchange'`
  - `export const inject = { required: ['tools'], optional: ['systemPrompt', 'sessionProjections', 'credentials', 'webServer', 'connection'] }` (verified against Cordis `inject` object form or `ctx.inject([...])` for optional services!)
  - `export { Config } from './src/config.js'`
  - `export async function apply(ctx, rawConfig)`

- [ ] **Step 1: Write failing tests in `tests/unit/tools.test.js`**
  Register all 15 tools using real `@deepseek-ai/dsh-tools` `defineTool` (proving every `parameters` & `output.schema` passes DSH schema validation including `additionalProperties`); assert exact 15 tool names and NO `send` tool; verify `{ when }` returns `false` on non-`@mail` session and `true` immediately after `@mail` user message; verify `systemPrompt.section` returns `''` before `@mail` and non-empty guidance after `@mail`; execute each of the 15 tools end-to-end against an injected fake `ewsClient` and verify canonical output matches `output.schema`, `output.render` returns `ContentBlock[]`, `ExchangeError` preserves `.code`, `AbortError` propagates raw (Review Focus #5), and `audit.jsonl` records every call without subject/body/password.
- [ ] **Step 2: Run `node --test tests/unit/tools.test.js` and verify FAIL**
- [ ] **Step 3: Implement `src/tools/index.js` and `index.js`**
- [ ] **Step 4: Run `node --test tests/unit/tools.test.js` and verify PASS**
- [ ] **Step 5: Commit** (`feat: register all 15 defineTool tools, system prompt, and host plugin entry`)

---

### Task 10: Local HTTP Routes (`/dsh-exchange/api/*`) & Web Client UI (`client.js`)

**Files:**
- Create: `src/routes.js`
- Modify: `index.js`, `client.js`
- Test: `tests/unit/routes-client.test.js`

**Interfaces:**
- Consumes: `readState`, `writeState`, `defaultState`, `getPassword`, `describePassword`, `setPassword`, `clearPassword`, `validateServerUrl` from `./state.js`; `createEwsClient` from `./ews/connection.js`; `listFolders` from `./ews/folders.js`
- Produces `src/routes.js`:
  - `ROUTE_PATHS = { status: '/dsh-exchange/api/status', probe: '/dsh-exchange/api/probe', save: '/dsh-exchange/api/save' }`
  - `registerExchangeRoutes(ctx, deps): () => void`
- Produces `client.js`:
  - Classic script calling `window.__ModuleLoader__.load({ id: '@local/dsh-exchange', factory(require) { ... } })`
  - Registers `settings.section` (`id: 'dsh-exchange'`), `settings.section.icon` (`id: 'dsh-exchange'`), `plugins.bundle.config` (`key: '@local/dsh-exchange'`), `inputTriggers` (`@mail`), and `ctx.locale` (`en` + `zh`)
  - Includes pure folder cascade helper (checking/unchecking a parent folder toggles all descendants cleanly in whitelist & blacklist views)

- [ ] **Step 1: Write failing tests in `tests/unit/routes-client.test.js`**
  Test Review Focus #4: `ctx.connection.requestRejection` returning 401/403 blocks all 3 routes; wrong HTTP method returns 405; non-JSON `POST` returns 415; body > 64 KiB returns 413; `GET /dsh-exchange/api/status` returns `{ version, account, access, passwordSet, passwordSource, limits }` and NEVER contains password plaintext; `POST /dsh-exchange/api/probe` rejects `http://` with 400 + `NET_001`, falls back to stored password when omitted, returns folder tree on success and `AUTH_001`/`NET_001` on failure; `POST /dsh-exchange/api/save` saves password to `ctx.credentials` (not `state.json`), persists `state.json` with mode `0600`, rejects `http://`, supports `reset: true`; evaluate `client.js` in a real Node `vm` sandbox with a mock `window.__ModuleLoader__` and verify `id === '@local/dsh-exchange'`, zero forbidden `require()` calls, `settings.section`, `settings.section.icon`, `plugins.bundle.config`, `inputTriggers` (`candidates`, `lexicon`, `onPick` returning `{ text: '@mail ' }`), and parent->child folder cascade behavior.
- [ ] **Step 2: Run `node --test tests/unit/routes-client.test.js` and verify FAIL**
- [ ] **Step 3: Implement `src/routes.js`, wire into `index.js`, and implement `client.js`**
- [ ] **Step 4: Run `node --test tests/unit/routes-client.test.js` and verify PASS**
- [ ] **Step 5: Commit** (`feat: add trust-fenced settings HTTP routes and native Web Client UI`)

---

### Task 11: Real-Wire HTTPS EWS Integration Test, Live DSH `0.2.2-rc.3` + `ego-browser` Verification & README

**Files:**
- Create: `tests/integration/exchange.integration.test.js`, `README.md`

**Interfaces:**
- Produces:
  - Self-contained local HTTPS SOAP mock Exchange EWS test proving real `ews-javascript-api@0.15.3` + `@ewsjs/xhr` NTLM/HTTPS wire flow works end-to-end (folder discovery, search, read, draft save, no send) + opt-in real Exchange server test (skipped cleanly when `DSH_EXCHANGE_TEST_URL` is unset).
  - Complete `README.md` covering installation (`dsh plugin add`), configuration (`cordis.patch.yml` & Settings UI), all 15 tools, `@mail` activation, security boundaries, and testing.
- Verification:
  - Full `npm test` (all unit tests green)
  - `npm run test:integration` (local HTTPS wire test green; real Exchange tests cleanly skipped)
  - Live `dsh@0.2.2-rc.3` verification in isolated temp `DSH_HOME`: `dsh plugin add`, `--dump-config`, live `dsh web` server, **`ego-browser` (ego lite)** visual & functional verification of Plugin Manager row + icon, Settings → Mail Assistant page (light & dark themes), Probe/Save UI flow, `@mail` composer trigger, and zero console/slot errors!

- [ ] **Step 1: Write `tests/integration/exchange.integration.test.js` and run `npm run test:integration`**
- [ ] **Step 2: Write `README.md` documenting only verified implemented behavior**
- [ ] **Step 3: Commit (`feat: add EWS wire integration test and README`)**
- [ ] **Step 4: Run live DSH `0.2.2-rc.3` + `ego-browser` end-to-end verification and fix any discovered defects via TDD**
- [ ] **Step 5: Dispatch fresh-context Whole-Branch Code Reviewer (`code-reviewer.md`) and UI/UX Expert Reviewer, fix all Critical/Important issues via TDD, re-run full verification, and merge branch cleanly into `main`**
