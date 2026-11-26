# Top-Left Global Sidebar Shortcut & Visibility Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a native top-left global sidebar shortcut (`sidebar.panellist` + `main` page) for direct Mail Assistant configuration, controlled by an instant persisted visibility toggle available in Settings, Plugins, and the shortcut page itself.

**Architecture:** Extend `state.json` normalization (`src/state.js`) and HTTP API routes (`src/routes.js`) with backward-compatible `ui: { showSidebarEntry: true }`. In `client.js`, introduce a shared reactive sidebar-visibility controller that dynamically mounts/disposes both `main` (`key: 'dsh-exchange'`) and `sidebar.panellist` (`id: 'dsh-exchange'`, `order: 20`), syncs with `state.json` and `localStorage`, safely exits the panel via `layout.selectPanel(null)` only when active, and renders an instant toggle switch inside `ExchangeSettingsPanel`.

**Tech Stack:** Node.js ESM (`src/state.js`, `src/routes.js`), Vanilla React via `window.__ModuleLoader__` (`client.js`), `node:test` + `vm` (`tests/unit/`).

**Spec:** `docs/superpowers/specs/2026-11-26-sidebar-shortcut-entry-design.md`

## Global Constraints
- DSH `>=0.2.2-rc.3 <0.3.0`, Node `^22.19.0 || >=24`, zero new runtime dependencies.
- `client.js` must remain classic script (`window.__ModuleLoader__.load`), `require('react')` ONLY, document-relative fetch URLs (`dsh-exchange/api/...`), and `--dsw-alias-*` styling.
- `state.json` keeps `version: '1.1.0'` and `0600` atomic writes; legacy `state.json` lacking `ui` must default `ui.showSidebarEntry` to `true`.
- `POST /dsh-exchange/api/save` with `{ reset: true }` must preserve `ui.showSidebarEntry` alongside `account`.
- Disposing the sidebar entry must call `layout.selectPanel(null)` ONLY when `activePanelId === 'dsh-exchange'`, never when another panel is selected.

## Review Focus
- Legacy `state.json` on disk without a `ui` key (like existing v1.1.0/v1.2.0 installations) must default `ui.showSidebarEntry` to `true` without errors or schema migration breakage.
- Toggling `showSidebarEntry` OFF while currently viewing the `dsh-exchange` main page must call `layout.selectPanel(null)` before disposing `main` + `sidebar.panellist`; toggling it OFF while viewing `plugins` or `conversation` must NOT alter the active panel.
- Calling `POST /dsh-exchange/api/save` with `{ ui: { showSidebarEntry: false } }` must NOT overwrite or clear `account`, `access`, or credentials; calling `{ reset: true }` must NOT reset `ui.showSidebarEntry`.
- If a running DSH backend predates `ui` support (response omits `ui`), `client.js` must keep the user's `localStorage` toggle state intact instead of resetting it to `true` on reload.
- In live DSH `v0.2.2-rc.3`, the sidebar entry appears below **Automation tasks** and above **More**, opens the centered scrollable Mail Assistant page on click, navigates back via **Back to Chat**, and disappears/reappears immediately when toggled in Settings or Plugins in both Light and Dark themes.

---

### Task 1: Add backward-compatible `ui.showSidebarEntry` persistence to `src/state.js` and `src/routes.js`

**Files:**
- Modify: `src/state.js:12-27`, `src/state.js:75-100`
- Modify: `src/routes.js:153-167`, `src/routes.js:252-298`
- Test: `tests/unit/core.test.js`, `tests/unit/routes-client.test.js`

**Interfaces:**
- Consumes: `defaultState()`, `normalizeState()`, `readState()`, `writeState()` in `src/state.js`; `registerExchangeRoutes()` in `src/routes.js`.
- Produces:
  - `state.ui = { showSidebarEntry: boolean }` (default `true`) returned by `defaultState()`, `normalizeState()`, `readState()`, `writeState()`, `GET /dsh-exchange/api/status` (`{ ..., ui: { showSidebarEntry } }`), and `POST /dsh-exchange/api/save` (`{ ..., state: { ..., ui: { showSidebarEntry } } }`).
  - Partial save support: `POST /dsh-exchange/api/save` accepts `{ ui: { showSidebarEntry: boolean } }` without touching `account` or `access`.

- [ ] **Step 1: Write failing unit tests in `tests/unit/core.test.js` and `tests/unit/routes-client.test.js`**

1. In `tests/unit/core.test.js`: assert `defaultState().ui` equals `{ showSidebarEntry: true }`, `normalizeState({})` (legacy state without `ui`) yields `ui: { showSidebarEntry: true }`, `normalizeState({ ui: { showSidebarEntry: false } })` yields `ui: { showSidebarEntry: false }`, and `writeState` / `readState` round-trip `ui.showSidebarEntry: false`.
2. In `tests/unit/routes-client.test.js`: assert `GET /status` returns `ui: { showSidebarEntry: true }` by default; `POST /save` with `{ ui: { showSidebarEntry: false } }` persists `ui.showSidebarEntry === false` while preserving existing `account` and `access`; `POST /save` with `{ reset: true }` resets `access` while preserving `ui.showSidebarEntry === false`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/unit/core.test.js tests/unit/routes-client.test.js`
Expected: FAIL because `state.ui` is `undefined`.

- [ ] **Step 3: Implement `ui.showSidebarEntry` in `src/state.js` and `src/routes.js`**

- In `src/state.js`: add `ui: { showSidebarEntry: true }` to `defaultState()` and `ui: { showSidebarEntry: raw?.ui?.showSidebarEntry !== false }` to `normalizeState()`.
- In `src/routes.js`: include `ui: state.ui` in `GET /dsh-exchange/api/status`; preserve `ui: current.ui` on `body.reset === true`; compute `nextUi = { showSidebarEntry: typeof body.ui?.showSidebarEntry === 'boolean' ? body.ui.showSidebarEntry : current.ui.showSidebarEntry }` on normal save.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/unit/core.test.js tests/unit/routes-client.test.js && npm test`
Expected: PASS — all unit tests pass with 0 failures.

- [ ] **Step 5: Commit**

```bash
git add src/state.js src/routes.js tests/unit/core.test.js tests/unit/routes-client.test.js
git commit -m "feat(state): persist ui.showSidebarEntry preference in state.json and HTTP API"
```

---

### Task 2: Register dynamic `sidebar.panellist` + `main` page and instant visibility toggle in `client.js`

**Files:**
- Modify: `client.js`
- Modify: `README.md`
- Test: `tests/unit/routes-client.test.js`

**Interfaces:**
- Consumes: `GET dsh-exchange/api/status` (`data.ui?.showSidebarEntry`), `POST dsh-exchange/api/save` (`{ ui: { showSidebarEntry } }`), DSH `ctx.slots.inject('sidebar.panellist' | 'main', ...)`, DSH `ctx.get('layout')` (`selectPanel`, `panelInfo`).
- Produces:
  - Dynamic `sidebar.panellist` registration (`id: 'dsh-exchange'`, `order: 20`, `label: () => t('nav')`, `locale: NS`, `MailSvgIcon`) and `main` keyed slot (`key: 'dsh-exchange'`, `locale: NS`, `MailAssistantMainPage`).
  - Reactive visibility controller synced across all mounted `ExchangeSettingsPanel` views (Settings, Plugins, Sidebar Main Page), exported for unit tests as `plugin.__createSidebarVisibilityController` (or exercised directly via `plugin.apply(mockCtx)`).
  - Instant visibility toggle UI inside `ExchangeSettingsPanel` (`role="switch"`, localized EN/ZH labels and status pills) + **Back to Chat** action in `MailAssistantMainPage`.

- [ ] **Step 1: Write failing unit tests in `tests/unit/routes-client.test.js`**

Add a dedicated test verifying `client.js` sidebar shortcut behavior:
1. On `plugin.apply(mockCtx)` with default visibility (`true`), both `sidebar.panellist` (`id: 'dsh-exchange'`, `order: 20`, `label() === 'Mail Assistant'`) and `main` (`key: 'dsh-exchange'`) are registered.
2. Calling `setVisible(false)` while `layout.panelInfo.getSnapshot().activePanelId === 'dsh-exchange'` calls `layout.selectPanel(null)` AND disposes both `sidebar.panellist` and `main` registrations.
3. Calling `setVisible(false)` while `activePanelId === 'plugins'` disposes both slots WITHOUT calling `layout.selectPanel(null)`.
4. Calling `setVisible(true)` re-registers both `sidebar.panellist` and `main` cleanly (idempotent if called twice).
5. `localStorage` `'false'` suppresses initial registration of `sidebar.panellist` and `main`, while keeping `settings.section` and `plugins.bundle.config` registered; backend status sync reconciles when `data.ui.showSidebarEntry` is a boolean and preserves `localStorage` when `data.ui` is omitted.
6. Rendered `ExchangeSettingsPanel` includes the sidebar visibility toggle control (`role: 'switch'`) and `MailAssistantMainPage` renders a Back to Chat button wired to `layout.selectPanel(null)`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/unit/routes-client.test.js`
Expected: FAIL because `sidebar.panellist` and `main` slots are not yet registered in `client.js`.

- [ ] **Step 3: Implement sidebar shortcut, main page, reactive visibility controller, and toggle UI in `client.js`, and update `README.md`**

- In `client.js`:
  - Add EN/ZH dictionary entries for the sidebar shortcut toggle card (`sectionInterface`, `sidebarShortcutLabel`, `sidebarShortcutHint`, `sidebarShortcutVisible`, `sidebarShortcutHidden`, `sidebarShortcutShownOk`, `sidebarShortcutHiddenOk`, `backToChatBtn`).
  - Add native main-page CSS (`.dsh-ex-main-page`, `.dsh-ex-main-scroll`, `.dsh-ex-main-content` with `calc(var(--dsh-frame-top-clearance, 0px) + 28px)` top clearance, `.dsh-ex-back-btn`, `.dsh-ex-switch` toggle styling compatible with Light & Dark modes).
  - Implement `createSidebarVisibilityController(ctx, t, MainPageComponent)` with `readStoredSidebarVisibility()`, `writeStoredSidebarVisibility()`, idempotent `mountSlots()` / `unmountSlots()` (calling `leaveMainPanelIfActive(ctx)` only when `activePanelId === PANEL_ID`), `subscribe()`, `getSnapshot()`, `setVisible()`, and `syncFromServer(data)`.
  - Implement `MailAssistantMainPage` wrapping `ExchangeSettingsPanel` with a **Back to Chat** button.
  - Render the instant **Left Sidebar Shortcut** toggle card inside `ExchangeSettingsPanel` (calling `POST dsh-exchange/api/save` with `{ ui: { showSidebarEntry: next } }` and updating the controller immediately with clean feedback and rollback only on non-400 network/auth failure).
  - Sync initial status on plugin apply (`GET dsh-exchange/api/status`) and clean up slots + active panel on plugin disposal.
- In `README.md`: briefly document the top-left **Mail Assistant** global sidebar shortcut and its visibility toggle in Settings/Plugins.

- [ ] **Step 4: Run full unit and integration test suites**

Run: `node --test tests/unit/routes-client.test.js && npm test && npm run test:integration`
Expected: PASS — all unit and integration tests green with 0 failures.

- [ ] **Step 5: Commit**

```bash
git add client.js README.md tests/unit/routes-client.test.js
git commit -m "feat(ui): add configurable top-left sidebar shortcut and main settings page"
```
