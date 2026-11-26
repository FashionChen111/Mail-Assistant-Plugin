# Remove Manual Folder Path Input Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the manual folder path input (`manualFolder` / `addFolderPlaceholder` / `addFolderBtn`) from `client.js` and update empty-state copy so folder permissions are populated cleanly from Exchange probing or previously saved state.

**Architecture:** All changes are localized to the Web Client bundle (`client.js`) and its unit test suite (`tests/unit/routes-client.test.js`), keeping backend API contracts (`src/routes.js`, `src/state.js`) and saved-folder hydration intact.

**Tech Stack:** Vanilla React via `window.__ModuleLoader__` (`client.js`), Node.js `node:test` + `vm` (`tests/unit/routes-client.test.js`).

**Spec:** `docs/superpowers/specs/2026-11-26-remove-manual-folder-input-design.md`

## Global Constraints
- `client.js` must remain a classic script loaded via `window.__ModuleLoader__.load`, requiring only `'react'`.
- Document-relative fetch URLs (`dsh-exchange/api/...`) must remain unchanged.
- Existing saved folders returned by `GET /dsh-exchange/api/status` must still hydrate `knownFolders` on load, and `badgeStale` detection after probing must remain intact.
- Both `DICTIONARIES.en` and `DICTIONARIES.zh` must stay synchronized with no dangling keys and no remaining copy referencing manual folder addition.

## Review Focus
- Empty-state rendering before probing shows `folderEmpty` pointing only to "Connect & Load Folders" / 「连接并加载文件夹」 with zero manual text input or `Add` button in the Folder Access Policy section.
- Previously saved folders in `state.json` still populate the folder tree on initial mount even before clicking **Connect & Load Folders**.
- Mode switching (Whitelist ↔ Blacklist), folder filter, Select All / Clear All, Save, Emergency Lock, and 2-step Reset Policy continue working with zero reference errors after removing `manualFolder` and `handleAddManualFolder`.
- Both `DICTIONARIES.en` and `DICTIONARIES.zh` omit `addFolderPlaceholder` / `addFolderBtn` and omit "manually" / "手动添加" from `folderEmpty`.
- Live DSH `v0.2.2-rc.3` Settings → Mail Assistant page renders cleanly without the manual path row and with zero console errors.

---

### Task 1: Remove manual folder path input and update empty-state copy in `client.js`

**Files:**
- Modify: `client.js:65-72`, `client.js:153-160`, `client.js:715-720`, `client.js:1029-1041`, `client.js:1456-1488`
- Test: `tests/unit/routes-client.test.js`

**Interfaces:**
- Consumes: `ExchangeSettingsPanel` component and `DICTIONARIES` registered via `ctx.locale.register('dsh-exchange', DICTIONARIES)` in `client.js`.
- Produces: Updated `ExchangeSettingsPanel` without manual folder path input/button and updated `DICTIONARIES.{en,zh}` without `addFolderPlaceholder` / `addFolderBtn`.

- [ ] **Step 1: Write the failing test**

Add assertions in `tests/unit/routes-client.test.js` inside the `client.js` test verifying:
1. `registeredLocales['dsh-exchange'].en` and `.zh` do NOT define `addFolderPlaceholder` or `addFolderBtn`.
2. `registeredLocales['dsh-exchange'].en.folderEmpty` does not match `/manual/i`, and `.zh.folderEmpty` does not match `/手动/`.
3. Rendering the registered `settings.section` component (`ExchangeSettingsPanel`) produces a React element tree containing zero `<input>` elements with placeholder matching `/manual|手动添加|认证项目\/Widevine/i` and zero `<button>` elements with text `'addFolderBtn'`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/unit/routes-client.test.js`
Expected: FAIL asserting `addFolderPlaceholder` / `addFolderBtn` absence and `folderEmpty` copy.

- [ ] **Step 3: Remove manual folder input from `client.js`**

In `client.js`:
- Update `DICTIONARIES.en.folderEmpty` to `'Click "Connect & Load Folders" above to load your Exchange folder tree.'` and remove `addFolderPlaceholder` and `addFolderBtn`.
- Update `DICTIONARIES.zh.folderEmpty` to `'点击上方「连接并加载文件夹」拉取您的 Exchange 目录树。'` and remove `addFolderPlaceholder` and `addFolderBtn`.
- Remove `const [manualFolder, setManualFolder] = useState('');` and `handleAddManualFolder`.
- Remove the manual folder `<div className="dsh-ex-inline">` input + Add button block beneath the folder tree in `ExchangeSettingsPanel`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/unit/routes-client.test.js && npm test && npm run test:integration`
Expected: PASS — all unit tests and integration tests green with 0 failures.

- [ ] **Step 5: Commit**

```bash
git add client.js tests/unit/routes-client.test.js
git commit -m "refactor(ui): remove manual folder path input from settings panel"
```
