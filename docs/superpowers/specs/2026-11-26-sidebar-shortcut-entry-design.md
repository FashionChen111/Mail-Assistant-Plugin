# Top-Left Global Sidebar Shortcut & Visibility Toggle — Design Spec

## Intent & Why
Currently, users reach `Mail Assistant` configuration through two multi-click paths:
1. Bottom-left **More → Settings → Mail Assistant** (`settings.section`)
2. Top-left **Plugins → Installed → Mail Assistant** (`plugins.bundle.config`)

Users managing daily Exchange email workflows (folder policy adjustments, emergency lock, connection checks) want a direct one-click shortcut in DSH's top-left global panel list (alongside **Plugins** and **Automation tasks**, above **More**) that opens Mail Assistant configuration directly in the main area — plus a visibility toggle accessible from both Settings and Plugins (as well as the shortcut page itself) to hide or restore that sidebar entry at any time.

## Feasibility Verified Against DSH `v0.2.2-rc.3`
Verified directly in `/Users/fashionchen/AI/Project/deepseek-harness`:
- `@deepseek-ai/dsh-client-ui-sidebar` exposes root list slot `sidebar.panellist` (`Plugins` has `order: 0`, `Automation tasks` has `order: 10`). Registering `id: 'dsh-exchange', order: 20, label: () => t('nav'), locale: NS` with direct `<svg>` icon `MailSvgIcon` mounts natively below **Automation tasks** and above **More**, inheriting active selection styling, collapsed 56px rail + tooltip, and native unpin-to-More behavior.
- `@deepseek-ai/dsh-client-ui-layout` exposes root keyed slot `main` (`key: 'dsh-exchange'`) and `ctx.layout.selectPanel(id | null)`. Registering `MailAssistantMainPage` on `main` renders the full Mail Assistant configuration UI directly in the main workspace frame with `--dsh-frame-top-clearance` support and a **Back to Chat** action (`selectPanel(null)`).
- `ctx.slots.inject(...)` is declaration-aware and returns a disposer, allowing dynamic show/hide of both `sidebar.panellist` and `main` at runtime without reloading DSH.

## Goals, Non-Goals, Anti-Goals
- **Goals:**
  - Add a top-left global sidebar entry (`sidebar.panellist`, `id: 'dsh-exchange'`, `order: 20`) opening a dedicated scrollable main-area page (`main`, `key: 'dsh-exchange'`) that mounts `ExchangeSettingsPanel`.
  - Provide a clean **Back to Chat** (`返回对话`) button at the top of the main-area page calling `layout.selectPanel(null)`.
  - Persist `ui.showSidebarEntry` (boolean, default `true`) in atomic `0600` `state.json` via `GET /dsh-exchange/api/status` and partial `POST /dsh-exchange/api/save` (`{ ui: { showSidebarEntry } }`), without affecting `account`, `access`, or `reset: true`.
  - Provide an instant **Show shortcut in left sidebar** (`在左侧全局面板显示快捷入口`) toggle in `ExchangeSettingsPanel` (thus automatically available in Settings → Mail Assistant, Plugins → Mail Assistant, and the sidebar main page itself).
  - Sync visibility reactively across all mounted panel instances, mirror in `localStorage` for zero-flicker startup and graceful fallback against older running DSH backend processes, and cleanly navigate back to conversation (`selectPanel(null)`) before disposing `main` if the user disables the shortcut while currently viewing it.
- **Non-Goals:**
  - Building a separate inbox/email reader UI inside the sidebar page (scope is direct access to Mail Assistant configuration & folder policy).
  - Changing DSH's own native pin/unpin memory state inside `ui-sidebar`.
  - Breaking headless or minimal web profiles where `sidebar.panellist` / `main` / `layout` do not exist.
- **Anti-Goals:**
  - Leaving a dangling `sidebar.panellist` button whose `main` page is unregistered (or vice versa).
  - Calling `layout.selectPanel(null)` when another panel (e.g. Plugins or Automation tasks) is currently selected.
  - Resetting `ui.showSidebarEntry` when the user clicks **Reset Policy** (`{ reset: true }`).
  - Writing any secrets into `ui` or `localStorage`.

## Global Constraints
- DSH `>=0.2.2-rc.3 <0.3.0`, Node `^22.19.0 || >=24`, zero new npm dependencies.
- `client.js` remains a classic script (`window.__ModuleLoader__.load`), `require('react')` ONLY, document-relative fetch URLs (`dsh-exchange/api/...`), and `--dsw-alias-*` CSS tokens.
- `state.json` keeps `version: '1.1.0'` and atomic `0600` persistence; existing `state.json` files without `ui` must seamlessly default `ui.showSidebarEntry` to `true`.
- All existing security boundaries (zero send, zero permanent delete, HTTPS enforcement, credential isolation, trust fence) remain completely untouched.

## Approaches Considered
1. **Native `sidebar.panellist` + `main` keyed slot with dynamic registration & `state.json` + `localStorage` dual-synced persistence (Chosen):** Uses official DSH slots for authentic native sidebar & main-page behavior, persists server-side in `state.json` for cross-browser/Electron consistency, mirrors in `localStorage` for flicker-free boot and live compatibility with an already-running DSH backend without restart, and cleanly disposes both slots on toggle-off.
2. **Client-only `localStorage` without backend `state.json` persistence (Rejected):** Loses preference across browsers or Desktop Electron profiles and splits UI settings away from `state.json`.
3. **Permanent `sidebar.panellist` entry that opens the Settings modal (Rejected):** DSH `ui-sidebar` automatically calls `ctx.layout.selectPanel(id)` targeting `main[key=id]` and throws if `main[key=id]` is missing (`ui-sidebar/README.zh.md:42`). A real `main` page is required by DSH's contract and provides a superior full-page configuration experience.
