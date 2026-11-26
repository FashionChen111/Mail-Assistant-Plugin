# Remove Manual Folder Path Input — Short Design

## Intent & Why
During user acceptance of `Mail Assistant` (`@local/dsh-exchange` v1.1.0) in DeepSeek Harness Web UI, the manual folder path input row (`手动添加路径` + `添加`) beneath the empty folder permissions state caused confusion for normal users. In regular usage, users connect to Exchange via **Connect & Load Folders** (`连接并加载文件夹`) and select folders directly from the live Exchange folder tree.

## Goals, Non-Goals, Anti-Goals
- **Goals:**
  - Remove the manual folder path text input and `Add` (`添加`) button from `ExchangeSettingsPanel` in `client.js`.
  - Remove dead state (`manualFolder`), handler (`handleAddManualFolder`), and dead locale keys (`addFolderPlaceholder`, `addFolderBtn`) from `client.js`.
  - Update the empty folder hint (`folderEmpty`) in both English and Chinese so it points solely to **Connect & Load Folders** (`连接并加载文件夹`) above.
- **Non-Goals:**
  - Do not change backend HTTP routes (`src/routes.js`) or `state.json` schema (`src/state.js`); `POST /dsh-exchange/api/save` still validates and normalizes `access.folders` identically.
  - Do not remove hydration of previously saved folders from `GET /dsh-exchange/api/status` or `badgeStale` (`Not found` / `服务器未找到`) detection when a server-side folder is renamed or deleted.
- **Anti-Goals:**
  - Leaving stale UI copy mentioning "add a folder path manually below" (`或在下方手动添加文件夹路径`).
  - Breaking existing folder tree controls (filter, Select All, Clear All, Whitelist/Blacklist mode separation, parent-child cascade, Emergency Lock, or Reset Policy).

## Constraints
- DSH Web Client contract: `client.js` must remain classic script (`window.__ModuleLoader__.load`), `require('react')` only, document-relative API URLs (`dsh-exchange/api/...`), and `--dsw-alias-*` styling.
- Existing unit (`npm test`) and integration (`npm run test:integration`) suites must pass with zero regressions.

## Approaches Considered
1. **Complete removal from Settings UI (Chosen):** Remove the manual input row, its state/handler, and its i18n keys, and tighten `folderEmpty` copy. Cleanest UX, zero visual clutter, directly matches user request.
2. **Collapsible "Advanced: manual path" accordion (Rejected):** User explicitly asked to remove the feature rather than hide it behind a toggle.

## Left to the Builder
- Exact wording of `folderEmpty` (EN/ZH) pointing clearly to "Connect & Load Folders" / 「连接并加载文件夹」 without referencing manual entry.
- Unit test assertions in `tests/unit/routes-client.test.js` proving the manual input/button and dead i18n keys are absent from rendered output and dictionaries.
