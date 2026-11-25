# Mail Assistant (`@local/dsh-exchange`) Design Specification

**Date:** 2026-11-25  
**Target Harness Version:** DeepSeek Harness (DSH) `0.2.2-rc.3`  
**PRD Authority:** [DSH-Exchange-Plugin-PRD.md](file:///Users/fashionchen/AI/Plugins/Mail-Assistant-Plugin/docs/DSH-Exchange-Plugin-PRD.md) (v1.1.0)  
**Runtime:** Node.js `^22.19.0 || >=24`, ESM Host + Lazy-CJS Web Client bundle

---

## 1. Intent & Why

Certification project managers using DSH need their AI Agent to read enterprise Microsoft Exchange (EWS + NTLM) mail context on demand—tracking certification timelines (Widevine, AirPlay2, DTS, Dolby), parsing Jira notification emails, extracting actionable todos/deadlines, and drafting polite follow-up emails—without ever risking unauthorized email sends, permanent deletions, credential leakage, or exposure of private folders.

## 2. Goals, Non-Goals & Anti-Goals

### Goals
- Deliver a standalone, installable DSH bundle `@local/dsh-exchange` (`dsh.bundle.patch` + `dsh.client`) targeting `dsh-v0.2.2-rc.3`.
- Provide all **15** `exchange_*` tools (7 P0 + 8 P1) with strict `defineTool` parameter and output schemas, `AbortSignal` propagation, and `HarnessError`-derived `ExchangeError` codes (`AUTH_001`, `EMAIL_001`, `PERM_001`, `NET_001`, `RATE_001`, `ATT_001`).
- Enforce **on-demand per-session activation** via independent `@mail` mention: all `exchange_*` tools and Exchange prompt instructions are hidden by default and activate immediately on the turn the user mentions `@mail`.
- Enforce **folder-level access control** (whitelist exact-match, blacklist subtree-match, emergency lock) evaluated fresh from `state.json` before every EWS call, plus post-lookup re-verification by current folder for email-ID operations and all-or-nothing checks for threads.
- Keep secrets strictly isolated in DSH `ctx.credentials` (`0600`, `$DSH_HOME/.credentials.yaml`) with `DSH_EXCHANGE_PASSWORD` env override; store non-secret account metadata and access policy in atomically written `state.json` (`0600`); emit redacted JSONL audit logs (`audit.jsonl`).
- Deliver a native Web Client (`client.js`) providing the Settings page (`settings.section` + `settings.section.icon` + `plugins.bundle.config`), `@mail` composer trigger (`inputTriggers`), localized display metadata (`locale/en.json`, `locale/zh.json`), and custom SVG icon (`icon.svg`).

### Non-Goals & Anti-Goals
- **Zero send capability (structural):** No `exchange_send_email` tool and zero code paths calling EWS `Send` / `SendAndSaveCopy`.
- **Zero permanent deletion:** `exchange_delete_email` with `permanent: true` is unconditionally denied (`PERM_001`) before any EWS request; deletion only moves to Deleted Items.
- **No generic EWS passthrough**, **no calendar/contacts/tasks**, **no OAuth2 / Microsoft 365**, **no multi-account**, **no auto-keyword triggering**, **no stale-cache fallback** when Exchange is unreachable.

## 3. Verified `dsh-v0.2.2-rc.3` API Alignment & Autonomous Decisions

Because the user granted full autonomy ("不要问我，直接开干，中途遇到一些决策问题，你可以先自己决定，后续开发完成后再和我说"), every open technical integration point flagged in PRD v1.1.0 was verified directly against `/Users/fashionchen/AI/Project/deepseek-harness` (`dsh-v0.2.2-rc.3`) and resolved as follows:

### Approaches Considered

1. **Per-session `@mail` Tool Visibility (`scope.js`)**
   - *Option A:* `agent.ctx.tools.restrict()` managed via `agent/created` + `session/event` listeners. Trade-off: requires manual per-agent disposer maps across plugin reload, and listening only to `user/message` fires *after* `ReactLoopAgent.preStep()` runs `tools.resolve()`, causing a 1-turn delay!
   - *Option B (Chosen):* `ctx.sessionProjections.register()` folding both `agent/inbox/spliced` (committed synchronously before `preStep`) and `user/message` (for resume/fork), paired with `{ when: ({ agent }) => scope.isSessionActivated(agent.session) }` on every `ctx.tools.register()` call and conditional rendering in `ctx.systemPrompt.section()`.
   - *Why Option B:* Official pattern used by `dsh-plan-mode` and `dsh-tool-agent-team` in `dsh-v0.2.2-rc.3`; activates on Turn 1 with zero delay, survives session resume/fork from durable session log, and needs zero external `zod` dependency (the runtime only invokes `stateSchema.parse(v)`). Includes a clean fallback when `sessionProjections` is absent in minimal test harnesses.

2. **Browser Client Bundle Format (`client.js`)**
   - *Option A:* TypeScript/JSX + custom tsdown/rolldown build pipeline replicating DSH's internal `packages/client/tsdown.client.ts`. Trade-off: adds build toolchain and requires pnpm `allowBuilds` for git installs.
   - *Option B (Chosen):* Author `client.js` directly in DSH's verified classic-script lazy-CJS factory format (`window.__ModuleLoader__.load({ id: '@local/dsh-exchange', factory(require) { ... } })`), using `require('react')` + `React.createElement` and DSH `--dsw-alias-*` CSS theme tokens (no `@deepseek-ai/dsh-client-ui-primitives` import, per DSH `dsh-doc` third-party plugin rules).
   - *Why Option B:* Zero build step, matches official `dsh-doc/templates/decoration/client.js`, works identically for local linked installs (`dsh plugin add ./path`) and packed tarballs, and renders cleanly in both light and dark themes.

3. **Settings Page Local HTTP Routes (`routes.js`)**
   - *Option A:* `ctx.connection.fetch.register()` under `/api/dsh-exchange/{status,probe,save}`. Trade-off: changes the 3 route paths specified verbatim in PRD §3.2.4 (`/dsh-exchange/api/{status,probe,save}`).
   - *Option B (Chosen):* Register the exact PRD paths (`/dsh-exchange/api/status`, `/dsh-exchange/api/probe`, `/dsh-exchange/api/save`) via `ctx.webServer.register(...)` wrapped in `ctx.effect`, and enforce DSH's Host/Origin/cookie trust fence via `ctx.connection?.requestRejection(req)` (matching `packages/host/open-in-app/src/index.ts`). On the client, call document-relative URLs (`fetch('dsh-exchange/api/status')`, no leading `/`) so both `dsh web`, reverse-proxy mounts, and Desktop Electron (`dsh-app://app/`) work seamlessly.
   - *Why Option B:* Preserves exact PRD route contracts while maintaining identical Host/Origin/cookie authentication security.

4. **Credential Storage (`ctx.credentials`)**
   - Verified against `packages/credentials/credentials/src/index.ts`: uses `credentialKey('dsh-exchange', 'account')` (strict `/^[a-z][a-z0-9-]*$/` segment rule) with `readRecord` / `describeRecord` / `modifyRecord` / `deleteRecord`, storing `{ kind: 'api-key', key: password }` in `$DSH_HOME/.credentials.yaml` (`0600`). `process.env.DSH_EXCHANGE_PASSWORD` takes precedence when set.

5. **`HarnessError` Inheritance (`src/errors.js`)**
   - Verified against `packages/util/error/src/index.ts`: `HarnessError` is exported by `@deepseek-ai/dsh-error` (not `@deepseek-ai/dsh-tools`) with `constructor(message, code, options)` and `readonly code`. `ExchangeError` extends `HarnessError`, calling `super(message, code, options)` and attaching `this.details = details`.

6. **Settings Surface Discoverability**
   - Register the settings panel in **both** `settings.section` (`id: 'dsh-exchange'`, `order: 30`, with matching `settings.section.icon`) per PRD §3.2.4 **and** `plugins.bundle.config` (`key: '@local/dsh-exchange'`) so users find it immediately from either **Settings** or **Plugins → Mail Assistant**.

7. **NTLM Username Normalization**
   - Support both `DOMAIN\username` (PRD §3.2.2) and email-address login (PRD "已验证信息"): if `username` already contains `\` or `@`, pass verbatim; else if `domain` and `username` are set, use `${domain}\\${username}`; else `username || email`.

8. **EWS Client Testability**
   - `src/ews/connection.js` uses real `ews-javascript-api@0.15.3` + `@ewsjs/xhr` (`gzip: true`, NTLM, `ExchangeVersion.Exchange2013`), while exposing an injectable client factory seam so unit tests verify every tool/security/retry/abort/parsing rule deterministically AND a local HTTPS mock EWS SOAP server tests the real wire client end-to-end.

## 4. Constraints Summary

- Node `^22.19.0 || >=24`, `engines.dsh: ">=0.2.2-rc.3 <0.3.0"`.
- Dependencies: `ews-javascript-api@0.15.3` + `@ewsjs/xhr` only; DSH runtime packages declared as `peerDependencies` (and `devDependencies` for standalone `node --test`).
- Every explicit `type: 'object'` in `defineTool` `parameters` or `output.schema` MUST declare `additionalProperties: false` (or `true`).
- Every `execute` returns canonical JSON matching `output.schema`; `output.render(args, value)` produces `ContentBlock[]`.
- `AbortError` / `exec.signal.reason` propagates untouched.
- `state.json` & `audit.jsonl` written with mode `0600` (dir `0700`); `state.json` uses atomic tmp+rename; `audit.jsonl` never logs subject, body, or credentials.
- HTTPS strictly enforced at both save and connect time (`http://` → `NET_001`).
- Attachment hard cap `25 MiB` (`26,214,400` bytes) checked before download/write (`ATT_001`); filename sanitized to safe basename; `content_base64` returned only when `size <= 1 MiB`.
- Retries: 3 retries (1s / 2s / 4s) for rate-limit/server-busy (`RATE_001`); zero retries for `AUTH_001`.
- Test framework: built-in `node --test`.
