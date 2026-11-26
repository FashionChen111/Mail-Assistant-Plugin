window.__ModuleLoader__.load({
  id: '@local/dsh-exchange',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useState, useEffect, useCallback, useMemo, useRef } = React;

    const NS = 'dsh-exchange';
    const SECTION_ID = 'dsh-exchange';
    const PKG_ID = '@local/dsh-exchange';

    const DICTIONARIES = {
      en: {
        nav: 'Mail Assistant',
        title: 'Mail Assistant',
        subtitle: 'Configure on-premises Exchange (EWS + NTLM) access and folder-level privacy boundaries. Draft-only; never sends email.',
        loadingText: 'Loading Mail Assistant status...',
        retryBtn: 'Retry',
        emergencyTitle: 'Emergency Access Lock',
        emergencyActive: 'Locked — All Blocked',
        emergencyInactive: 'Normal Access',
        emergencyDescLocked: 'All Exchange tool calls immediately return PERM_001 without contacting the server.',
        emergencyDescUnlocked: 'Immediately block the Agent from reading, searching, or modifying any folder.',
        emergencyLockBtn: 'Lock All Access',
        emergencyUnlockBtn: 'Unlock Access',
        emergencyLockingBtn: 'Updating...',
        emergencyLockedOk: 'Emergency Lock enabled. All Exchange access is blocked immediately.',
        emergencyUnlockedOk: 'Emergency Lock disabled. Folder policy is active again.',
        sectionAccount: 'Exchange Connection',
        serverUrl: 'EWS URL',
        serverUrlPlaceholder: 'https://exchange.company.com/EWS/Exchange.asmx',
        httpsHint: 'HTTPS is strictly required. Plain http:// endpoints are rejected.',
        email: 'Email address',
        emailPlaceholder: 'user@company.com',
        domain: 'Domain',
        domainPlaceholder: 'COMPANY (optional if using email login)',
        username: 'Username',
        usernamePlaceholder: 'user123 or user@company.com',
        password: 'Password',
        passwordSetCred: 'Configured (credential store)',
        passwordSetEnv: 'Configured (DSH_EXCHANGE_PASSWORD env)',
        passwordUnset: 'Not configured',
        passwordEnvHint: 'Managed by the DSH_EXCHANGE_PASSWORD environment variable, which takes priority over stored credentials.',
        setPassword: 'Set Password',
        changePassword: 'Change',
        cancelChange: 'Cancel',
        clearPasswordBtn: 'Clear',
        passwordClearedOk: 'Stored password removed from host credential store.',
        showPassword: 'Show',
        hidePassword: 'Hide',
        passwordPlaceholder: 'Enter Exchange password (stored securely in host credentials)',
        probeBtn: 'Connect & Load Folders',
        probingBtn: 'Connecting...',
        probeSuccess: 'Connected to Exchange and loaded {count} mail folder(s).',
        probeUnsavedHint: 'Click Save below to persist connection settings.',
        sectionAccess: 'Folder Access Policy',
        policySummaryLocked: 'Emergency Lock active — all folders blocked',
        policySummaryWhitelist: 'Whitelist: {allowed} allowed · {blocked} blocked',
        policySummaryBlacklist: 'Blacklist: {blocked} blocked · {allowed} allowed',
        modeLabel: 'Access mode',
        modeWhitelist: 'Whitelist (allow only checked folders)',
        modeBlacklist: 'Blacklist (block checked folders and their subfolders)',
        folderTreeLabel: 'Folder permissions',
        folderFilterPlaceholder: 'Filter folders...',
        selectAllBtn: 'Select All',
        clearAllBtn: 'Clear All',
        folderEmpty: 'Click "Connect & Load Folders" above to load your Exchange folder tree.',
        folderFilterEmpty: 'No folders match the current filter.',
        badgeAllowed: 'Allowed',
        badgeDenied: 'Blocked',
        badgeInherited: 'Inherited',
        badgeStale: 'Not found',
        unsavedBadge: 'Unsaved changes',
        saveBtn: 'Save',
        savingBtn: 'Saving...',
        resetBtn: 'Reset Policy',
        resetConfirmText: 'Reset to default Blacklist (empty list) and turn off Emergency Lock? All folders will become accessible.',
        resetConfirmBtn: 'Confirm Reset',
        savedSuccess: 'Settings saved. Policy takes effect immediately.',
        resetSuccess: 'Access policy reset to default (blacklist, empty list, lock off).',
        limitsTitle: 'Active Runtime Limits',
        limitsSummary: 'Max search: {search} · Max attachment: {att} MiB · Max body: {body} chars · Timeout: {timeout}s · Trigger: {prefix}',
        loadError: 'Failed to load Mail Assistant status: {msg}',
        errHttpsOnly: 'Only https:// URLs are allowed. Plain http:// endpoints are rejected.',
        errInvalidUrl: 'Enter a valid https:// EWS URL (e.g. https://exchange.company.com/EWS/Exchange.asmx).',
        errAuth: 'Authentication failed. Check your email, domain, username, and password.',
        errRate: 'Exchange server is busy or rate-limited. Please retry shortly.',
        errPerm: 'Access denied by current folder policy or Emergency Lock.',
        errNetDns: 'Could not resolve Exchange server hostname (DNS failure).',
        errNetTls: 'HTTPS TLS certificate verification failed for the Exchange server.',
        errNetTimeout: 'Connection to the Exchange server timed out.',
        errNetConn: 'Could not reach the Exchange server. Check the URL, TLS certificate, or network.',
        errNetGeneric: 'Exchange request failed. Check server address and connectivity.',
        errUnauthorized: 'Session is not authorized to access Mail Assistant API (HTTP {status}).',
        errGeneric: 'Request failed (HTTP {status}).',
        triggerSection: 'Mail Assistant',
        triggerDescription: 'Activate Exchange email tools for this session (draft-only)',
        sectionInterface: 'Navigation Shortcut',
        sidebarShortcutLabel: 'Show shortcut in top-left global sidebar',
        sidebarShortcutHint: 'Places a one-click Mail Assistant entry alongside Plugins and Automation tasks. You can re-enable it anytime from Settings or Plugins.',
        sidebarShortcutVisible: 'Visible',
        sidebarShortcutHidden: 'Hidden',
        sidebarShortcutShownOk: 'Top-left sidebar shortcut is now visible.',
        sidebarShortcutHiddenOk: 'Top-left sidebar shortcut hidden. You can re-enable it anytime in Settings or Plugins.',
        backToChatBtn: '← Back to Chat',
        tabSettings: 'Configuration',
        tabHistory: 'Activity History',
        historyTitle: 'Agent Activity History',
        historySubtitle: 'Local log of emails read, drafts saved, searches, analyses, and blocked attempts. Never stores passwords or email bodies.',
        historyRefreshBtn: 'Refresh',
        historyRefreshingBtn: 'Refreshing...',
        historyClearBtn: 'Clear History',
        historyClearingBtn: 'Clearing...',
        historyClearConfirmText: 'Clear visible Agent activity history? The underlying redacted security audit log (audit.jsonl) stays intact.',
        historyClearConfirmBtn: 'Confirm Clear',
        historyClearedOk: 'Agent activity history cleared.',
        historySearchPlaceholder: 'Search subject, sender, folder, project, or keyword...',
        historyStatTotal: 'Total Actions',
        historyStatRead: 'Emails Read',
        historyStatDraft: 'Drafts',
        historyStatBlocked: 'Blocked / Failed',
        historyFilterAll: 'All',
        historyFilterRead: 'Read',
        historyFilterDraft: 'Drafts',
        historyFilterSearch: 'Search',
        historyFilterAnalyze: 'Analysis',
        historyFilterModify: 'Organize',
        historyFilterBlocked: 'Blocked',
        historyLoading: 'Loading Agent activity history...',
        historyEmpty: 'No Agent activity recorded yet. Invoke @mail in a conversation to see read emails, saved drafts, and analyses here.',
        historyFilterEmpty: 'No activity records match the current filter.',
        historyLoadMoreBtn: 'Load More ({remaining} remaining)',
        historyUnavailable: 'Activity history API is not available on the currently running DSH backend (HTTP 404). Restart DSH to enable it.',
        historyPrivacyNote: 'Stored locally in $DSH_HOME/dsh-exchange/activity.jsonl (mode 0600, up to 500 entries). Email bodies, attachment contents, and passwords are never saved.',
        historyOutcomeOk: 'Success',
        historyOutcomeDenied: 'Blocked',
        historyOutcomeError: 'Failed',
        historySourceAudit: 'Audit log',
        act_list_folders: 'List Folders',
        act_search_emails: 'Search Emails',
        act_read_email: 'Read Email',
        act_list_recent_emails: 'Recent Emails',
        act_save_draft: 'Save Draft',
        act_update_draft: 'Update Draft',
        act_delete_draft: 'Delete Draft',
        act_get_thread: 'Read Thread',
        act_parse_jira_notifications: 'Parse Jira',
        act_extract_todos: 'Extract Todos',
        act_summarize_project: 'Project Summary',
        act_download_attachment: 'Download Attachment',
        act_move_email: 'Move Email',
        act_mark_email: 'Mark Email',
        act_delete_email: 'Delete Email',
        histFrom: 'From: {val}',
        histTo: 'To: {val}',
        histCcCount: '+{count} CC',
        histFolder: 'Folder: {val}',
        histDraftReply: 'Reply draft',
        histDraftOnly: 'Draft-only (not sent)',
        histChars: '{count} chars',
        histMarkedRead: 'Marked as read',
        histAttachments: '{count} attachment(s)',
        histHits: '{count} matched',
        histReturned: '{count} returned',
        histDays: 'Last {days}d',
        histUnreadOnly: 'Unread only',
        histImportantOnly: 'Important only',
        histFoldersSummary: '{total} folder(s), {readable} readable',
        histFoldersCount: '{count} folder(s)',
        histThreadCount: '{count} message(s) in thread',
        histJiraSummary: 'Parsed Jira notifications ({days}d): {count} update(s)',
        histJiraNonOk: 'Jira notification scan ({days}d)',
        histIssues: 'Issues: {val}',
        histTodosSummary: 'Extracted todos ({days}d): {count} item(s)',
        histTodosNonOk: 'Todo extraction ({days}d)',
        histUrgentCount: '{count} high/urgent',
        histProjectSummary: 'Project "{project}" ({days}d)',
        histProjectCounts: '{related} email(s) · {blocking} blocker(s) · {actions} action(s)',
        histAttachmentHeadline: 'Downloaded attachment: {name}',
        histMoveHeadline: 'Moved email to {folder}',
        histMoveDenied: 'Blocked moving email to {folder}',
        histMoveFailed: 'Failed to move email to {folder}',
        histMarkRead: 'Read',
        histMarkUnread: 'Unread',
        histMarkFlagged: 'Flagged',
        histMarkUnflagged: 'Unflagged',
        histPermDeleteBlocked: 'Blocked permanent delete attempt (PERM_001)',
        histDeleteRecoverable: 'Moved email to Deleted Items (recoverable)',
        histDeleteEmailDenied: 'Blocked delete email attempt',
        histDeleteEmailFailed: 'Failed to delete email',
        histDeleteDraft: 'Moved draft to Deleted Items',
        histDeleteDraftDenied: 'Blocked delete draft attempt',
        histDeleteDraftFailed: 'Failed to delete draft',
        histUpdatedFields: 'Updated: {val}',
        histBlockedFolder: 'Blocked access to restricted folder',
        histSearchQuery: 'Query: "{q}"',
        histReadFallback: 'Read email in {folder}',
        histReadFallbackNoFolder: 'Read email',
        histDraftHeadline: 'Draft: "{subject}"',
        histUpdateDraftFallback: 'Updated existing draft',
        histRecentHeadline: 'Browsed recent emails ({days}d)',
        histSearchFallback: 'Searched emails',
        histFoldersFallback: 'Listed mailbox folders',
        histThreadFallback: 'Reconstructed conversation thread',
        histMarkFallback: 'Updated email flags',
      },
      zh: {
        nav: 'Mail Assistant',
        title: 'Mail Assistant 邮箱助理',
        subtitle: '配置自建 Microsoft Exchange（EWS + NTLM）连接与文件夹级隐私边界。仅保存草稿、不直接发送、不永久删除。',
        loadingText: '正在加载 Mail Assistant 状态...',
        retryBtn: '重试',
        emergencyTitle: '紧急访问锁定',
        emergencyActive: '已锁定 — 全部禁止',
        emergencyInactive: '正常运行',
        emergencyDescLocked: '已启用紧急锁定：所有邮箱工具调用将直接返回 PERM_001，不发起任何服务器请求。',
        emergencyDescUnlocked: '开启后将立即生效，阻止 Agent 访问或修改任意邮箱目录。',
        emergencyLockBtn: '立即紧急锁定',
        emergencyUnlockBtn: '解除紧急锁定',
        emergencyLockingBtn: '更新中...',
        emergencyLockedOk: '已启用紧急锁定，所有邮箱访问已立即阻断。',
        emergencyUnlockedOk: '已解除紧急锁定，当前目录权限策略已恢复生效。',
        sectionAccount: 'Exchange 连接配置',
        serverUrl: 'EWS 地址',
        serverUrlPlaceholder: 'https://exchange.company.com/EWS/Exchange.asmx',
        httpsHint: '强制使用 HTTPS，保存与连接两处均拒绝 http:// 端点。',
        email: '邮箱地址',
        emailPlaceholder: 'user@company.com',
        domain: '域',
        domainPlaceholder: 'COMPANY（使用邮箱地址登录时可留空）',
        username: '用户名',
        usernamePlaceholder: 'user123 或 user@company.com',
        password: '密码',
        passwordSetCred: '已设置（宿主凭据库）',
        passwordSetEnv: '已设置（环境变量 DSH_EXCHANGE_PASSWORD）',
        passwordUnset: '未设置',
        passwordEnvHint: '当前由环境变量 DSH_EXCHANGE_PASSWORD 提供密码，优先级高于宿主凭据库。',
        setPassword: '设置密码',
        changePassword: '修改',
        cancelChange: '取消',
        clearPasswordBtn: '清除已存密码',
        passwordClearedOk: '已从宿主凭据库清除存储的密码。',
        showPassword: '显示',
        hidePassword: '隐藏',
        passwordPlaceholder: '输入 Exchange 密码（仅存宿主凭据服务，不落盘配置文件）',
        probeBtn: '连接并加载文件夹',
        probingBtn: '连接中...',
        probeSuccess: '连接成功，已加载 {count} 个邮件文件夹。',
        probeUnsavedHint: '请点击下方「保存」以持久化连接配置。',
        sectionAccess: '文件夹权限控制',
        policySummaryLocked: '紧急锁定已启用 — 全部禁止',
        policySummaryWhitelist: '白名单：已允许 {allowed} 个 · 已禁止 {blocked} 个',
        policySummaryBlacklist: '黑名单：已禁止 {blocked} 个 · 已允许 {allowed} 个',
        modeLabel: '访问模式',
        modeWhitelist: '白名单（仅允许勾选的文件夹）',
        modeBlacklist: '黑名单（禁止勾选的文件夹及其子目录）',
        folderTreeLabel: '文件夹权限',
        folderFilterPlaceholder: '筛选文件夹...',
        selectAllBtn: '全选',
        clearAllBtn: '清空',
        folderEmpty: '点击上方「连接并加载文件夹」拉取您的 Exchange 目录树。',
        folderFilterEmpty: '没有匹配当前筛选条件的文件夹。',
        badgeAllowed: '允许',
        badgeDenied: '禁止',
        badgeInherited: '受上级继承',
        badgeStale: '服务器未找到',
        unsavedBadge: '有未保存的更改',
        saveBtn: '保存',
        savingBtn: '保存中...',
        resetBtn: '重置权限策略',
        resetConfirmText: '确认重置为默认黑名单（空列表）并关闭紧急锁定？重置后所有文件夹将恢复可访问。',
        resetConfirmBtn: '确认重置',
        savedSuccess: '配置已保存，新权限策略即时生效，无需重启。',
        resetSuccess: '已重置为默认访问策略（黑名单模式、空列表、关闭紧急锁定）。',
        limitsTitle: '当前运行时上限（来自 profile patch 配置）',
        limitsSummary: '搜索上限：{search} 条 · 附件上限：{att} MB · 正文上限：{body} 字符 · 超时：{timeout}s · 触发词：{prefix}',
        loadError: '加载 Mail Assistant 状态失败：{msg}',
        errHttpsOnly: '仅允许使用 https:// 协议，已拒绝非加密的 http:// 地址。',
        errInvalidUrl: '请输入合法的 https:// EWS 地址（例如 https://exchange.company.com/EWS/Exchange.asmx）。',
        errAuth: 'Exchange 认证失败，请检查邮箱、域、用户名及密码配置。',
        errRate: 'Exchange 服务器繁忙或触发速率限制，请稍后重试。',
        errPerm: '当前目录权限策略或紧急锁定已拒绝该访问。',
        errNetDns: '无法解析 Exchange 服务器域名（DNS 失败）。',
        errNetTls: 'Exchange 服务器 HTTPS 证书校验失败。',
        errNetTimeout: '连接 Exchange 服务器超时。',
        errNetConn: '无法连接到 Exchange 服务器，请检查地址、HTTPS 证书或网络连通性。',
        errNetGeneric: 'Exchange 请求失败，请检查服务器地址和网络状态。',
        errUnauthorized: '当前会话无权访问 Mail Assistant 接口（HTTP {status}）。',
        errGeneric: '请求失败（HTTP {status}）。',
        triggerSection: 'Mail Assistant',
        triggerDescription: '在本会话按需启用 Exchange 邮箱工具（仅草稿，不发送）',
        sectionInterface: '快捷入口',
        sidebarShortcutLabel: '在左上角全局面板显示快捷入口',
        sidebarShortcutHint: '在左上角「插件 / 自动化任务」区域显示 Mail Assistant 入口，一键直达邮箱配置；关闭后可随时在「设置」或「插件」中重新开启。',
        sidebarShortcutVisible: '显示中',
        sidebarShortcutHidden: '已隐藏',
        sidebarShortcutShownOk: '已在左上角全局面板显示 Mail Assistant 快捷入口。',
        sidebarShortcutHiddenOk: '已隐藏左上角快捷入口，可随时在「设置」或「插件」中重新开启。',
        backToChatBtn: '← 返回对话',
        tabSettings: '配置与权限',
        tabHistory: 'Agent 操作历史',
        historyTitle: 'Agent 操作历史',
        historySubtitle: '记录 Agent 最近阅读的邮件、生成的草稿、搜索分析及安全拦截明细。仅存本地，绝不记录密码或邮件正文。',
        historyRefreshBtn: '刷新',
        historyRefreshingBtn: '刷新中...',
        historyClearBtn: '清空历史',
        historyClearingBtn: '清空中...',
        historyClearConfirmText: '确认清空页面显示的 Agent 操作历史？底层脱敏安全审计日志（audit.jsonl）不会被删除。',
        historyClearConfirmBtn: '确认清空',
        historyClearedOk: '已清空 Agent 操作历史。',
        historySearchPlaceholder: '搜索主题、发件人、文件夹、项目或关键词...',
        historyStatTotal: '总操作',
        historyStatRead: '阅读邮件',
        historyStatDraft: '草稿操作',
        historyStatBlocked: '拦截 / 失败',
        historyFilterAll: '全部',
        historyFilterRead: '阅读邮件',
        historyFilterDraft: '草稿箱',
        historyFilterSearch: '搜索浏览',
        historyFilterAnalyze: '智能分析',
        historyFilterModify: '整理操作',
        historyFilterBlocked: '拦截 / 失败',
        historyLoading: '正在加载 Agent 操作历史...',
        historyEmpty: '暂无 Agent 操作历史。在对话中输入 @mail 调用邮箱能力后，阅读过的邮件与撰写的草稿会实时显示在这里。',
        historyFilterEmpty: '没有匹配当前筛选条件的操作记录。',
        historyLoadMoreBtn: '加载更多（剩余 {remaining} 条）',
        historyUnavailable: '当前运行的 DSH 后台服务尚未加载操作历史接口（HTTP 404），重启 DSH 后即可使用。',
        historyPrivacyNote: '仅存储在本地 $DSH_HOME/dsh-exchange/activity.jsonl（权限 0600，最多保留 500 条），绝不保存邮件正文、附件内容或密码。',
        historyOutcomeOk: '成功',
        historyOutcomeDenied: '已拦截',
        historyOutcomeError: '失败',
        historySourceAudit: '基础审计',
        act_list_folders: '查看文件夹',
        act_search_emails: '搜索邮件',
        act_read_email: '阅读邮件',
        act_list_recent_emails: '浏览最近邮件',
        act_save_draft: '新建草稿',
        act_update_draft: '更新草稿',
        act_delete_draft: '删除草稿',
        act_get_thread: '重建邮件会话',
        act_parse_jira_notifications: '解析 Jira 通知',
        act_extract_todos: '提取待办事项',
        act_summarize_project: '汇总项目进展',
        act_download_attachment: '下载附件',
        act_move_email: '移动邮件',
        act_mark_email: '标记邮件',
        act_delete_email: '删除邮件',
        histFrom: '发件人：{val}',
        histTo: '收件人：{val}',
        histCcCount: '抄送 {count} 人',
        histFolder: '目录：{val}',
        histDraftReply: '回复原邮件',
        histDraftOnly: '仅存草稿箱，未发送',
        histChars: '约 {count} 字',
        histMarkedRead: '已同步标为已读',
        histAttachments: '{count} 个附件',
        histHits: '命中 {count} 封',
        histReturned: '返回 {count} 封',
        histDays: '近 {days} 天',
        histUnreadOnly: '仅未读',
        histImportantOnly: '仅重要',
        histFoldersSummary: '共 {total} 个目录，可读 {readable} 个',
        histFoldersCount: '共 {count} 个目录',
        histThreadCount: '共 {count} 封往来邮件',
        histJiraSummary: '解析近 {days} 天 Jira 通知 · 命中 {count} 条',
        histJiraNonOk: '解析近 {days} 天 Jira 通知',
        histIssues: '工单：{val}',
        histTodosSummary: '提取近 {days} 天待办 · 共 {count} 项',
        histTodosNonOk: '提取近 {days} 天待办事项',
        histUrgentCount: '高优/紧急 {count} 项',
        histProjectSummary: '汇总项目「{project}」（近 {days} 天）',
        histProjectCounts: '关联 {related} 封邮件 · 阻塞 {blocking} 项 · 下一步 {actions} 项',
        histAttachmentHeadline: '下载附件：{name}',
        histMoveHeadline: '移动邮件至「{folder}」',
        histMoveDenied: '尝试移动邮件至「{folder}」（已拦截）',
        histMoveFailed: '移动邮件至「{folder}」失败',
        histMarkRead: '标为已读',
        histMarkUnread: '标为未读',
        histMarkFlagged: '加星标',
        histMarkUnflagged: '取消星标',
        histPermDeleteBlocked: '尝试永久删除邮件（已安全拦截 PERM_001）',
        histDeleteRecoverable: '移至「已删除项目」（可恢复）',
        histDeleteEmailDenied: '尝试删除邮件（已拦截）',
        histDeleteEmailFailed: '删除邮件失败',
        histDeleteDraft: '删除草稿（移至已删除项目）',
        histDeleteDraftDenied: '尝试删除草稿（已拦截）',
        histDeleteDraftFailed: '删除草稿失败',
        histUpdatedFields: '更新字段：{val}',
        histBlockedFolder: '尝试访问受限目录（已拦截）',
        histSearchQuery: '关键词：「{q}」',
        histReadFallback: '阅读「{folder}」中的邮件',
        histReadFallbackNoFolder: '阅读邮件',
        histDraftHeadline: '草稿：《{subject}》',
        histUpdateDraftFallback: '更新已有草稿',
        histRecentHeadline: '浏览近 {days} 天邮件',
        histSearchFallback: '按条件搜索邮件',
        histFoldersFallback: '获取邮箱目录列表',
        histThreadFallback: '重建邮件往来会话',
        histMarkFallback: '更新邮件状态标记',
      },
    };

    const STYLES = `
      .dsh-ex-root {
        display: flex;
        flex-direction: column;
        gap: 16px;
        color: var(--dsw-alias-label-primary, #111827);
        font-size: 13px;
        line-height: 1.5;
        max-width: 740px;
        color-scheme: light dark;
        accent-color: var(--dsw-alias-state-business-primary, #4176e6);
        padding-bottom: 12px;
      }
      .dsh-ex-root input[type="checkbox"],
      .dsh-ex-root input[type="radio"] {
        color-scheme: light dark;
        accent-color: var(--dsw-alias-state-business-primary, #4176e6);
      }
      .dsh-ex-header {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .dsh-ex-title {
        margin: 0;
        font-size: 16px;
        font-weight: 600;
        color: var(--dsw-alias-label-primary, #111827);
      }
      .dsh-ex-subtitle {
        margin: 0;
        font-size: 12px;
        color: var(--dsw-alias-label-secondary, #6b7280);
      }
      .dsh-ex-card {
        background: var(--dsw-alias-card-fill, var(--dsw-alias-bg-layer-1, transparent));
        border: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.2));
        border-radius: 10px;
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .dsh-ex-card-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        flex-wrap: wrap;
      }
      .dsh-ex-card-title {
        margin: 0;
        font-size: 13px;
        font-weight: 600;
        color: var(--dsw-alias-label-primary, #111827);
      }
      .dsh-ex-lock-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 12px 14px;
        border-radius: 10px;
        border: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.2));
        background: var(--dsw-alias-card-fill, var(--dsw-alias-bg-layer-1, transparent));
        flex-wrap: wrap;
      }
      .dsh-ex-lock-bar-active {
        color: var(--dsw-alias-state-error-primary, #dc2626);
        border-color: color-mix(in srgb, currentColor 40%, transparent);
        background: color-mix(in srgb, currentColor 10%, transparent);
      }
      .dsh-ex-lock-info {
        display: flex;
        flex-direction: column;
        gap: 3px;
        flex: 1;
        min-width: 220px;
      }
      .dsh-ex-field {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .dsh-ex-row-2 {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
      }
      .dsh-ex-label {
        font-size: 12px;
        font-weight: 500;
        color: var(--dsw-alias-label-secondary, #4b5563);
      }
      .dsh-ex-input {
        width: 100%;
        box-sizing: border-box;
        padding: 7px 10px;
        border-radius: 6px;
        border: 1px solid var(--dsw-alias-border-l3, rgba(128,128,128,0.3));
        background: var(--dsw-alias-bg-base, transparent);
        color: var(--dsw-alias-label-primary, inherit);
        font-size: 13px;
        outline: none;
      }
      .dsh-ex-input:focus {
        border-color: var(--dsw-alias-state-business-primary, #4176e6);
      }
      .dsh-ex-input-error {
        border-color: var(--dsw-alias-state-error-primary, #dc2626);
      }
      .dsh-ex-input:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }
      .dsh-ex-hint {
        font-size: 11px;
        color: var(--dsw-alias-label-tertiary, #6b7280);
      }
      .dsh-ex-error-text {
        font-size: 11px;
        color: var(--dsw-alias-state-error-primary, #dc2626);
      }
      .dsh-ex-inline {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }
      .dsh-ex-btn {
        appearance: none;
        border-radius: 6px;
        padding: 6px 12px;
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        border: 1px solid var(--dsw-alias-border-l3, rgba(128,128,128,0.3));
        background: var(--dsw-alias-button-floating-fill, transparent);
        color: var(--dsw-alias-label-primary, inherit);
        transition: background-color 120ms ease, opacity 120ms ease;
      }
      .dsh-ex-btn:hover:not(:disabled) {
        background: var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.1));
      }
      .dsh-ex-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .dsh-ex-btn-primary {
        background: var(--dsw-alias-button-primary-fill, #111827);
        color: var(--dsw-alias-label-primary-foreground, #ffffff);
        border-color: transparent;
      }
      .dsh-ex-btn-primary:hover:not(:disabled) {
        background: var(--dsw-alias-button-primary-hover, #374151);
      }
      .dsh-ex-btn-danger {
        color: var(--dsw-alias-state-error-primary, #dc2626);
        border-color: color-mix(in srgb, currentColor 45%, transparent);
        background: color-mix(in srgb, currentColor 10%, transparent);
      }
      .dsh-ex-btn-danger:hover:not(:disabled) {
        background: color-mix(in srgb, currentColor 18%, transparent);
      }
      .dsh-ex-banner {
        padding: 8px 12px;
        border-radius: 8px;
        font-size: 12px;
        border: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.2));
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
      }
      .dsh-ex-banner-ok {
        color: var(--dsw-alias-state-success-primary, #16a34a);
        border-color: color-mix(in srgb, currentColor 35%, transparent);
        background: color-mix(in srgb, currentColor 10%, transparent);
      }
      .dsh-ex-banner-err {
        color: var(--dsw-alias-state-error-primary, #dc2626);
        border-color: color-mix(in srgb, currentColor 35%, transparent);
        background: color-mix(in srgb, currentColor 10%, transparent);
      }
      .dsh-ex-banner-warn {
        color: var(--dsw-alias-state-warn-label, #d97706);
        border-color: color-mix(in srgb, currentColor 40%, transparent);
        background: color-mix(in srgb, currentColor 12%, transparent);
      }
      .dsh-ex-radios {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .dsh-ex-radio-row {
        display: flex;
        align-items: center;
        gap: 8px;
        cursor: pointer;
        font-size: 13px;
      }
      .dsh-ex-tree-toolbar {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }
      .dsh-ex-tree {
        display: flex;
        flex-direction: column;
        gap: 3px;
        max-height: 260px;
        overflow-y: auto;
        padding: 6px;
        border-radius: 6px;
        border: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.2));
        background: var(--dsw-alias-bg-base, transparent);
      }
      .dsh-ex-folder-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 4px 8px;
        border-radius: 5px;
      }
      .dsh-ex-folder-row:hover {
        background: var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.08));
      }
      .dsh-ex-folder-left {
        display: flex;
        align-items: center;
        gap: 8px;
        cursor: pointer;
        flex: 1;
        min-width: 0;
      }
      .dsh-ex-folder-left-disabled {
        cursor: not-allowed;
        opacity: 0.72;
      }
      .dsh-ex-folder-name {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .dsh-ex-folder-meta {
        font-size: 11px;
        color: var(--dsw-alias-label-tertiary, #6b7280);
        flex-shrink: 0;
      }
      .dsh-ex-pill {
        font-size: 11px;
        font-weight: 500;
        padding: 2px 9px;
        border-radius: 999px;
        border: 1px solid transparent;
        flex-shrink: 0;
      }
      .dsh-ex-pill-allow {
        color: var(--dsw-alias-state-success-primary, #16a34a);
        border-color: color-mix(in srgb, currentColor 35%, transparent);
        background: color-mix(in srgb, currentColor 12%, transparent);
      }
      .dsh-ex-pill-deny {
        color: var(--dsw-alias-state-error-primary, #dc2626);
        border-color: color-mix(in srgb, currentColor 35%, transparent);
        background: color-mix(in srgb, currentColor 12%, transparent);
      }
      .dsh-ex-pill-warn {
        color: var(--dsw-alias-state-warn-label, #d97706);
        border-color: color-mix(in srgb, currentColor 40%, transparent);
        background: color-mix(in srgb, currentColor 12%, transparent);
      }
      .dsh-ex-pill-neutral {
        color: var(--dsw-alias-label-secondary, #6b7280);
        border-color: var(--dsw-alias-border-l3, rgba(128,128,128,0.3));
        background: color-mix(in srgb, currentColor 8%, transparent);
      }
      .dsh-ex-footer-bar {
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding: 12px 14px;
        border-radius: 10px;
        border: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.22));
        background: var(--dsw-alias-card-fill, var(--dsw-alias-bg-layer-1, transparent));
      }
      .dsh-ex-actions {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        flex-wrap: wrap;
      }
      .dsh-ex-limits {
        font-size: 11px;
        color: var(--dsw-alias-label-tertiary, #6b7280);
      }
      .dsh-ex-main-page {
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100%;
        min-width: 0;
        min-height: 0;
        overflow: hidden;
        background: var(--dsw-alias-bg-base, transparent);
        color: var(--dsw-alias-label-primary, #111827);
      }
      .dsh-ex-main-scroll {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        scrollbar-gutter: stable;
      }
      .dsh-ex-main-content {
        max-width: 780px;
        margin: 0 auto;
        padding: calc(var(--dsh-frame-top-clearance, 0px) + 28px) clamp(20px, 4vw, 48px) 48px;
        display: flex;
        flex-direction: column;
        gap: 14px;
      }
      .dsh-ex-main-topbar {
        display: flex;
        align-items: center;
        justify-content: flex-start;
      }
      .dsh-ex-back-btn {
        display: inline-flex;
        align-items: center;
        gap: 4px;
      }
      .dsh-ex-switch-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }
      .dsh-ex-switch-info {
        display: flex;
        flex-direction: column;
        gap: 4px;
        flex: 1;
        min-width: 0;
      }
      .dsh-ex-switch {
        position: relative;
        flex-shrink: 0;
        width: 40px;
        height: 22px;
        border-radius: 999px;
        corner-shape: round;
        border: 1px solid var(--dsw-alias-border-l3, rgba(128,128,128,0.42));
        background: var(--dsw-alias-border-l3, rgba(128,128,128,0.38));
        padding: 0;
        cursor: pointer;
        transition: background-color 140ms ease, border-color 140ms ease;
      }
      .dsh-ex-switch:focus-visible {
        outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-alias-state-business-primary, #4176e6);
        outline-offset: 2px;
      }
      .dsh-ex-switch[aria-checked="true"] {
        background: var(--dsw-alias-state-business-primary, #4176e6);
        border-color: transparent;
      }
      .dsh-ex-switch:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .dsh-ex-switch-thumb {
        position: absolute;
        top: 2px;
        left: 2px;
        width: 16px;
        height: 16px;
        border-radius: 999px;
        corner-shape: round;
        background: var(--dsw-alias-switch-thumb, #ffffff);
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
        transition: transform 140ms ease;
      }
      .dsh-ex-switch[aria-checked="true"] .dsh-ex-switch-thumb {
        transform: translateX(18px);
      }
      .dsh-ex-tabs {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 4px;
        border-radius: 10px;
        border: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.2));
        background: var(--dsw-alias-bg-layer-1, rgba(128,128,128,0.06));
      }
      .dsh-ex-tab {
        appearance: none;
        flex: 1;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        padding: 7px 12px;
        border-radius: 7px;
        border: 1px solid transparent;
        background: transparent;
        color: var(--dsw-alias-label-secondary, #6b7280);
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        transition: background-color 140ms ease, color 140ms ease, border-color 140ms ease;
      }
      .dsh-ex-tab:hover:not(.dsh-ex-tab-active) {
        color: var(--dsw-alias-label-primary, #111827);
        background: var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.08));
      }
      .dsh-ex-tab-active {
        background: var(--dsw-alias-button-floating-fill, var(--dsw-alias-bg-base, #ffffff));
        color: var(--dsw-alias-label-primary, #111827);
        border-color: var(--dsw-alias-border-l2, rgba(128,128,128,0.22));
        font-weight: 600;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
      }
      .dsh-ex-tab-count {
        font-size: 11px;
        font-weight: 600;
        padding: 1px 7px;
        border-radius: 999px;
        corner-shape: round;
        background: color-mix(in srgb, var(--dsw-alias-state-business-primary, #4176e6) 14%, transparent);
        color: var(--dsw-alias-state-business-primary, #4176e6);
      }
      .dsh-ex-stat-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
        gap: 8px;
      }
      .dsh-ex-stat-card {
        display: flex;
        flex-direction: column;
        gap: 2px;
        padding: 10px 12px;
        border-radius: 8px;
        border: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.18));
        background: var(--dsw-alias-bg-base, transparent);
      }
      .dsh-ex-stat-val {
        font-size: 18px;
        font-weight: 700;
        line-height: 1.2;
        color: var(--dsw-alias-label-primary, #111827);
      }
      .dsh-ex-stat-val-warn {
        color: var(--dsw-alias-state-error-primary, #dc2626);
      }
      .dsh-ex-stat-label {
        font-size: 11px;
        color: var(--dsw-alias-label-tertiary, #6b7280);
      }
      .dsh-ex-chips {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-wrap: wrap;
      }
      .dsh-ex-chip {
        appearance: none;
        padding: 4px 10px;
        border-radius: 999px;
        corner-shape: round;
        border: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.24));
        background: var(--dsw-alias-bg-base, transparent);
        color: var(--dsw-alias-label-secondary, #4b5563);
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        transition: background-color 120ms ease, color 120ms ease, border-color 120ms ease;
      }
      .dsh-ex-chip:hover:not(.dsh-ex-chip-active) {
        background: var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.1));
        color: var(--dsw-alias-label-primary, #111827);
      }
      .dsh-ex-chip-active {
        background: color-mix(in srgb, var(--dsw-alias-state-business-primary, #4176e6) 14%, transparent);
        border-color: color-mix(in srgb, var(--dsw-alias-state-business-primary, #4176e6) 45%, transparent);
        color: var(--dsw-alias-state-business-primary, #4176e6);
        font-weight: 600;
      }
      .dsh-ex-activity-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .dsh-ex-activity-item {
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding: 11px 13px;
        border-radius: 8px;
        border: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.2));
        border-left-width: 3px;
        background: var(--dsw-alias-bg-base, transparent);
      }
      .dsh-ex-activity-cat-read { border-left-color: var(--dsw-alias-state-business-primary, #4176e6); }
      .dsh-ex-activity-cat-draft { border-left-color: var(--dsw-alias-state-success-primary, #16a34a); }
      .dsh-ex-activity-cat-search { border-left-color: #6366f1; }
      .dsh-ex-activity-cat-analyze { border-left-color: #9333ea; }
      .dsh-ex-activity-cat-modify { border-left-color: var(--dsw-alias-state-warn-label, #d97706); }
      .dsh-ex-activity-cat-denied { border-left-color: var(--dsw-alias-state-error-primary, #dc2626); }
      .dsh-ex-activity-top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        flex-wrap: wrap;
      }
      .dsh-ex-activity-headline {
        font-size: 13px;
        font-weight: 600;
        color: var(--dsw-alias-label-primary, #111827);
        word-break: break-word;
      }
      .dsh-ex-activity-details {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-wrap: wrap;
        font-size: 12px;
        color: var(--dsw-alias-label-secondary, #4b5563);
      }
      .dsh-ex-activity-tag {
        padding: 1px 7px;
        border-radius: 5px;
        background: var(--dsw-alias-bg-layer-1, rgba(128,128,128,0.08));
        border: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.16));
        font-size: 11px;
        color: var(--dsw-alias-label-secondary, #4b5563);
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .dsh-ex-activity-time {
        font-size: 11px;
        color: var(--dsw-alias-label-tertiary, #6b7280);
        font-variant-numeric: tabular-nums;
      }
      .dsh-ex-pill-info {
        color: var(--dsw-alias-state-business-primary, #4176e6);
        border-color: color-mix(in srgb, currentColor 35%, transparent);
        background: color-mix(in srgb, currentColor 11%, transparent);
      }
      .dsh-ex-empty-box {
        padding: 24px 16px;
        text-align: center;
        border-radius: 8px;
        border: 1px dashed var(--dsw-alias-border-l2, rgba(128,128,128,0.28));
        color: var(--dsw-alias-label-secondary, #6b7280);
        font-size: 12px;
      }
    `;

    const STORAGE_KEY_SIDEBAR = 'dsh-exchange:showSidebarEntry';
    const PANEL_ID = SECTION_ID;

    function readStoredSidebarVisibility() {
      try {
        if (typeof localStorage !== 'undefined' && localStorage) {
          const val = localStorage.getItem(STORAGE_KEY_SIDEBAR);
          if (val === 'false') return false;
          if (val === 'true') return true;
        }
      } catch {
        // Ignore storage errors in restricted contexts.
      }
      return true;
    }

    function writeStoredSidebarVisibility(visible) {
      try {
        if (typeof localStorage !== 'undefined' && localStorage) {
          localStorage.setItem(STORAGE_KEY_SIDEBAR, visible ? 'true' : 'false');
        }
      } catch {
        // Ignore storage errors in restricted contexts.
      }
    }

    function getLayoutService(ctx) {
      if (!ctx) return undefined;
      if (typeof ctx.get === 'function') return ctx.get('layout');
      return ctx.layout;
    }

    function leaveMainPanelIfActive(ctx) {
      const layout = getLayoutService(ctx);
      if (!layout || typeof layout.selectPanel !== 'function') return;
      const snap = layout.panelInfo && typeof layout.panelInfo.getSnapshot === 'function'
        ? layout.panelInfo.getSnapshot()
        : layout.panelInfo;
      if (snap && snap.activePanelId === PANEL_ID) {
        layout.selectPanel(null);
      }
    }

    function createSidebarVisibilityController(ctx, t, MainPageComponent) {
      let visible = readStoredSidebarVisibility();
      let slotDisposers = [];
      let disposed = false;
      let userExplicitlyToggled = false;
      const listeners = new Set();

      const notify = () => {
        for (const fn of listeners) {
          try {
            fn(visible);
          } catch {
            // Isolate listener errors.
          }
        }
      };

      const mountSlots = () => {
        if (disposed || slotDisposers.length > 0) return;
        const dMain = ctx.slots.inject('main', () =>
          ctx.slots.register(
            {
              name: 'main',
              key: PANEL_ID,
              locale: NS,
            },
            MainPageComponent,
          ),
        );
        const dPanel = ctx.slots.inject('sidebar.panellist', () =>
          ctx.slots.register(
            {
              name: 'sidebar.panellist',
              id: PANEL_ID,
              order: 20,
              label: () => t('nav'),
              locale: NS,
            },
            MailSvgIcon,
          ),
        );
        if (typeof dMain === 'function') slotDisposers.push(dMain);
        if (typeof dPanel === 'function') slotDisposers.push(dPanel);
      };

      const unmountSlots = () => {
        leaveMainPanelIfActive(ctx);
        for (const dispose of slotDisposers.splice(0)) {
          try {
            dispose();
          } catch {
            // Ignore disposal errors.
          }
        }
      };

      const setVisible = (next, opts) => {
        if (disposed) return;
        const boolNext = Boolean(next);
        if (!opts || opts.fromServer !== true) {
          userExplicitlyToggled = true;
        }
        if (!opts || opts.persistLocal !== false) {
          writeStoredSidebarVisibility(boolNext);
        }
        visible = boolNext;
        if (visible) mountSlots();
        else unmountSlots();
        notify();
      };

      const syncFromServer = (data, opts) => {
        if (disposed) return;
        if (opts && opts.fromBoot && userExplicitlyToggled) return;
        if (data && data.ui && typeof data.ui.showSidebarEntry === 'boolean') {
          setVisible(data.ui.showSidebarEntry, { fromServer: true });
        }
      };

      if (visible) {
        mountSlots();
      }

      return {
        getSnapshot() {
          return visible;
        },
        subscribe(listener) {
          listeners.add(listener);
          return () => {
            listeners.delete(listener);
          };
        },
        setVisible,
        syncFromServer,
        dispose() {
          disposed = true;
          unmountSlots();
          listeners.clear();
        },
      };
    }

    let activeSidebarController = null;

    function normalizePath(p) {
      return String(p || '')
        .trim()
        .replace(/\\/g, '/')
        .replace(/\/+/g, '/')
        .replace(/^\/+|\/+$/g, '');
    }

    /**
     * Segment-by-segment tree sort so parent + descendants always stay contiguous
     * ahead of hyphenated siblings (e.g. 认证项目, 认证项目/Widevine, 认证项目-归档).
     */
    function sortFolderPaths(paths) {
      return Array.from(paths || []).sort((a, b) => {
        const segA = String(a).split('/');
        const segB = String(b).split('/');
        const len = Math.min(segA.length, segB.length);
        for (let i = 0; i < len; i++) {
          if (segA[i] !== segB[i]) {
            return segA[i].localeCompare(segB[i]);
          }
        }
        return segA.length - segB.length;
      });
    }

    /**
     * Pure folder toggle with parent -> child cascade (PRD 3.2.4):
     * Checking or unchecking a folder toggles that folder AND all its known descendants.
     */
    function toggleFolderSelection(currentSelected, targetPath, checked, allKnownPaths) {
      const target = normalizePath(targetPath);
      if (!target) return Array.isArray(currentSelected) ? currentSelected.slice() : [];
      const set = new Set((currentSelected || []).map(normalizePath).filter(Boolean));
      const descendants = (allKnownPaths || [])
        .map(normalizePath)
        .filter((p) => p === target || p.startsWith(target + '/'));
      if (descendants.length === 0) descendants.push(target);

      for (const p of descendants) {
        if (checked) set.add(p);
        else set.delete(p);
      }
      return Array.from(set);
    }

    /**
     * Returns the nearest strict ancestor in selectedSet (used in Blacklist mode
     * so children inherited from a blocked parent show disabled + Inherited).
     */
    function getAncestorBlockedPath(path, selectedSet) {
      const norm = normalizePath(path);
      if (!norm || !selectedSet) return null;
      const segs = norm.split('/');
      for (let i = segs.length - 1; i >= 1; i--) {
        const prefix = segs.slice(0, i).join('/');
        if (selectedSet.has(prefix)) return prefix;
      }
      return null;
    }

    /**
     * In Whitelist mode, a parent folder that is itself unchecked while at least one
     * descendant is checked renders as indeterminate.
     */
    function isFolderIndeterminate(path, mode, selectedSet, allKnownPaths) {
      if (mode !== 'whitelist') return false;
      const norm = normalizePath(path);
      if (!norm || !selectedSet || selectedSet.has(norm)) return false;
      const prefix = norm + '/';
      for (const p of allKnownPaths || []) {
        if (p.startsWith(prefix) && selectedSet.has(p)) {
          return true;
        }
      }
      return false;
    }

    function computeRowAllowed(path, mode, selectedSet, emergencyLock) {
      if (emergencyLock) return false;
      if (mode === 'whitelist') {
        return selectedSet.has(path);
      }
      for (const blocked of selectedSet) {
        if (path === blocked || path.startsWith(blocked + '/')) {
          return false;
        }
      }
      return true;
    }

    function validateClientServerUrl(raw) {
      const trimmed = String(raw || '').trim();
      if (!trimmed) return null;
      let parsed;
      try {
        parsed = new URL(trimmed);
      } catch {
        return 'errInvalidUrl';
      }
      if (parsed.protocol !== 'https:') {
        return 'errHttpsOnly';
      }
      if (!parsed.hostname) {
        return 'errInvalidUrl';
      }
      return null;
    }

    function formatApiError(data, status, t) {
      const code = data && typeof data.error === 'string' ? data.error : '';
      const details = data && data.details && typeof data.details === 'object' ? data.details : {};
      if (status === 401 && !code) return t('errUnauthorized', { status: String(status) });
      if (status === 403 && !code) return t('errUnauthorized', { status: String(status) });

      let msg = '';
      if (code === 'AUTH_001') {
        msg = t('errAuth');
      } else if (code === 'RATE_001') {
        msg = t('errRate');
      } else if (code === 'PERM_001') {
        msg = t('errPerm');
      } else if (code === 'NET_001') {
        if (details.protocol && details.protocol !== 'https:') {
          msg = t('errHttpsOnly');
        } else if (details.serverUrl !== undefined) {
          msg = t('errInvalidUrl');
        } else if (details.category === 'dns') {
          msg = t('errNetDns');
        } else if (details.category === 'tls') {
          msg = t('errNetTls');
        } else if (details.category === 'timeout') {
          msg = t('errNetTimeout');
        } else if (details.category === 'connection') {
          msg = t('errNetConn');
        } else {
          msg = t('errNetGeneric');
        }
      } else if (data && typeof data.message === 'string' && data.message) {
        msg = data.message;
      } else {
        msg = t('errGeneric', { status: String(status || 0) });
      }
      return code ? `[${code}] ${msg}` : msg;
    }

    function extractTriggerToken(prefix) {
      const clean = String(prefix || '@mail').trim().replace(/^@+/, '');
      return clean || 'mail';
    }

    function matchesMailTrigger(query, triggerName) {
      const q = String(query || '').trim().toLowerCase();
      const target = String(triggerName || 'mail').trim().toLowerCase();
      if (q === '') return true;
      return target.startsWith(q);
    }

    function MailSvgIcon(props) {
      const size = props && props.size ? props.size : 16;
      return h(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.9,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': true,
        },
        h('rect', { x: 2.5, y: 4.5, width: 19, height: 15, rx: 2.5 }),
        h('path', { d: 'm3.5 6.5 8.5 6.2 8.5-6.2' }),
      );
    }

    async function readJsonSafely(resp) {
      const text = await resp.text();
      if (!text) return {};
      try {
        return JSON.parse(text);
      } catch {
        return { message: text.slice(0, 200) };
      }
    }

    function makeFormSnapshot({ serverUrl, email, domain, username, mode, folders }) {
      return JSON.stringify({
        serverUrl: String(serverUrl || '').trim(),
        email: String(email || '').trim(),
        domain: String(domain || '').trim(),
        username: String(username || '').trim(),
        mode,
        folders: sortFolderPaths(folders || []),
      });
    }

    const HISTORY_PAGE_SIZE = 50;
    const EMPTY_HISTORY_STATS = {
      total: 0,
      read: 0,
      draft: 0,
      search: 0,
      analyze: 0,
      modify: 0,
      denied: 0,
      error: 0,
    };

    function formatBytes(bytes) {
      const n = Number(bytes);
      if (!Number.isFinite(n) || n < 0) return '0 B';
      if (n < 1024) return `${Math.round(n)} B`;
      if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
      return `${(n / (1024 * 1024)).toFixed(2)} MB`;
    }

    function formatLocalTimestamp(iso) {
      if (!iso) return '';
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return String(iso);
      const pad = (x) => String(x).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    }

    function formatActivityEntry(item, t) {
      const action = String((item && item.action) || 'unknown');
      const outcome = (item && item.outcome) || 'ok';
      const folder = item && item.folder ? String(item.folder) : '';
      const s = (item && item.summary && typeof item.summary === 'object') ? item.summary : {};
      const actionKey = `act_${action}`;
      const translatedAction = t(actionKey);
      const actionLabel = translatedAction !== actionKey ? translatedAction : action;
      const details = [];
      let headline = actionLabel;

      if (action === 'read_email') {
        if (outcome === 'denied') {
          headline = t('histBlockedFolder');
        } else if (s.subject) {
          headline = s.subject;
        } else if (folder) {
          headline = t('histReadFallback', { folder });
        } else {
          headline = t('histReadFallbackNoFolder');
        }
        if (s.from) details.push(t('histFrom', { val: s.from }));
        if (folder) details.push(t('histFolder', { val: folder }));
        if (s.attachmentCount > 0) details.push(t('histAttachments', { count: String(s.attachmentCount) }));
        if (outcome === 'ok' && s.markAsRead) details.push(t('histMarkedRead'));
      } else if (action === 'save_draft') {
        headline = s.subject ? t('histDraftHeadline', { subject: s.subject }) : actionLabel;
        if (Array.isArray(s.to) && s.to.length > 0) {
          const toText = s.toCount > s.to.length ? `${s.to.join(', ')} (+${s.toCount - s.to.length})` : s.to.join(', ');
          details.push(t('histTo', { val: toText }));
        }
        if (s.ccCount > 0) details.push(t('histCcCount', { count: String(s.ccCount) }));
        if (s.isReply) details.push(t('histDraftReply'));
        if (typeof s.bodyChars === 'number' && s.bodyChars > 0) {
          details.push(t('histChars', { count: String(s.bodyChars) }));
        }
        if (outcome === 'ok') details.push(t('histDraftOnly'));
      } else if (action === 'update_draft') {
        headline = s.subject ? t('histDraftHeadline', { subject: s.subject }) : t('histUpdateDraftFallback');
        if (Array.isArray(s.updatedFields) && s.updatedFields.length > 0) {
          details.push(t('histUpdatedFields', { val: s.updatedFields.join(', ') }));
        }
        if (Array.isArray(s.to) && s.to.length > 0) {
          details.push(t('histTo', { val: s.to.join(', ') }));
        }
      } else if (action === 'delete_draft') {
        headline = outcome === 'denied'
          ? t('histDeleteDraftDenied')
          : outcome === 'error'
            ? t('histDeleteDraftFailed')
            : t('histDeleteDraft');
      } else if (action === 'search_emails') {
        headline = s.query
          ? t('histSearchQuery', { q: s.query })
          : s.subject
            ? t('histSearchQuery', { q: s.subject })
            : t('histSearchFallback');
        if (folder) details.push(t('histFolder', { val: folder }));
        const hitCount = typeof s.total === 'number' ? s.total : item.count;
        if (outcome === 'ok' && typeof hitCount === 'number') details.push(t('histHits', { count: String(hitCount) }));
        if (s.from) details.push(t('histFrom', { val: s.from }));
        if (typeof s.days === 'number') details.push(t('histDays', { days: String(s.days) }));
        if (s.unreadOnly) details.push(t('histUnreadOnly'));
        if (s.importantOnly) details.push(t('histImportantOnly'));
      } else if (action === 'list_recent_emails') {
        headline = t('histRecentHeadline', { days: String(s.days || 7) });
        const retCount = typeof s.returnedCount === 'number' ? s.returnedCount : item.count;
        if (outcome === 'ok' && typeof retCount === 'number') details.push(t('histReturned', { count: String(retCount) }));
        if (s.unreadOnly) details.push(t('histUnreadOnly'));
        if (Array.isArray(s.sampleSubjects) && s.sampleSubjects.length > 0) {
          details.push(s.sampleSubjects.join(' · '));
        }
      } else if (action === 'list_folders') {
        headline = t('histFoldersFallback');
        if (typeof s.folderCount === 'number' && typeof s.readableCount === 'number') {
          details.push(t('histFoldersSummary', { total: String(s.folderCount), readable: String(s.readableCount) }));
        } else if (outcome === 'ok' && typeof item.count === 'number') {
          details.push(t('histFoldersCount', { count: String(item.count) }));
        }
      } else if (action === 'get_thread') {
        if (outcome === 'denied') {
          headline = t('histBlockedFolder');
        } else {
          headline = s.subject ? s.subject : t('histThreadFallback');
        }
        const msgCount = typeof s.messageCount === 'number' ? s.messageCount : item.count;
        if (outcome === 'ok' && typeof msgCount === 'number') details.push(t('histThreadCount', { count: String(msgCount) }));
        if (folder) details.push(t('histFolder', { val: folder }));
      } else if (action === 'parse_jira_notifications') {
        if (outcome !== 'ok') {
          headline = t('histJiraNonOk', { days: String(s.days || 7) });
        } else {
          const cnt = typeof s.matchedCount === 'number' ? s.matchedCount : (item.count ?? 0);
          headline = t('histJiraSummary', { days: String(s.days || 7), count: String(cnt) });
        }
        if (Array.isArray(s.issueKeys) && s.issueKeys.length > 0) {
          details.push(t('histIssues', { val: s.issueKeys.join(', ') }));
        }
      } else if (action === 'extract_todos') {
        if (outcome !== 'ok') {
          headline = t('histTodosNonOk', { days: String(s.days || 7) });
        } else {
          const cnt = typeof s.todoCount === 'number' ? s.todoCount : (item.count ?? 0);
          headline = t('histTodosSummary', { days: String(s.days || 7), count: String(cnt) });
        }
        if (s.urgentCount > 0) details.push(t('histUrgentCount', { count: String(s.urgentCount) }));
        if (Array.isArray(s.sampleTitles) && s.sampleTitles.length > 0) {
          details.push(s.sampleTitles.join(' · '));
        }
      } else if (action === 'summarize_project') {
        headline = s.project
          ? t('histProjectSummary', { project: s.project, days: String(s.days || 30) })
          : actionLabel;
        if (outcome === 'ok' && typeof s.relatedCount === 'number') {
          details.push(t('histProjectCounts', {
            related: String(s.relatedCount),
            blocking: String(s.blockingCount || 0),
            actions: String(s.nextActionCount || 0),
          }));
        } else if (outcome === 'ok' && typeof item.count === 'number') {
          details.push(t('histHits', { count: String(item.count) }));
        }
      } else if (action === 'download_attachment') {
        headline = s.fileName ? t('histAttachmentHeadline', { name: s.fileName }) : actionLabel;
        if (typeof s.size === 'number') details.push(formatBytes(s.size));
      } else if (action === 'move_email') {
        const dest = s.targetFolder || folder;
        if (dest) {
          headline = outcome === 'denied'
            ? t('histMoveDenied', { folder: dest })
            : outcome === 'error'
              ? t('histMoveFailed', { folder: dest })
              : t('histMoveHeadline', { folder: dest });
        } else {
          headline = actionLabel;
        }
      } else if (action === 'mark_email') {
        const marks = [];
        if (s.isRead === true) marks.push(t('histMarkRead'));
        if (s.isRead === false) marks.push(t('histMarkUnread'));
        if (s.isFlagged === true) marks.push(t('histMarkFlagged'));
        if (s.isFlagged === false) marks.push(t('histMarkUnflagged'));
        headline = marks.length > 0 ? `${actionLabel}: ${marks.join(' · ')}` : t('histMarkFallback');
      } else if (action === 'delete_email') {
        if (s.permanentAttempt) {
          headline = t('histPermDeleteBlocked');
        } else if (outcome === 'denied') {
          headline = t('histDeleteEmailDenied');
        } else if (outcome === 'error') {
          headline = t('histDeleteEmailFailed');
        } else {
          headline = t('histDeleteRecoverable');
        }
        if (folder) details.push(t('histFolder', { val: folder }));
      } else {
        if (folder) details.push(t('histFolder', { val: folder }));
        if (typeof item.count === 'number') details.push(t('histReturned', { count: String(item.count) }));
      }

      return {
        actionLabel,
        headline,
        details,
      };
    }

    function ExchangeSettingsPanel(props) {
      const t = props.t || ((k) => k);
      const hideHeader = Boolean(props && props.hideHeader);
      const tRef = useRef(t);
      tRef.current = t;
      const mountedRef = useRef(true);

      useEffect(() => {
        mountedRef.current = true;
        return () => {
          mountedRef.current = false;
        };
      }, []);

      const [loading, setLoading] = useState(true);
      const [loadFailed, setLoadFailed] = useState(false);
      const [loadErrorMsg, setLoadErrorMsg] = useState('');

      const [serverUrl, setServerUrl] = useState('');
      const [email, setEmail] = useState('');
      const [domain, setDomain] = useState('');
      const [username, setUsername] = useState('');
      const [passwordSet, setPasswordSet] = useState(false);
      const [passwordSource, setPasswordSource] = useState('none');
      const [editingPassword, setEditingPassword] = useState(false);
      const [showPassword, setShowPassword] = useState(false);
      const [passwordInput, setPasswordInput] = useState('');

      const [mode, setMode] = useState('blacklist');
      // Separate per-mode folder sets prevent switching Whitelist <-> Blacklist from inverting sensitive folders (UX C4).
      const [modeFolders, setModeFolders] = useState({ whitelist: [], blacklist: [] });
      const [knownFolders, setKnownFolders] = useState([]);
      const [probedPaths, setProbedPaths] = useState(null);
      const [folderFilter, setFolderFilter] = useState('');
      const [emergencyLock, setEmergencyLock] = useState(false);
      const [togglingLock, setTogglingLock] = useState(false);
      const [showSidebarEntry, setShowSidebarEntry] = useState(() =>
        activeSidebarController ? activeSidebarController.getSnapshot() : readStoredSidebarVisibility(),
      );
      const [togglingSidebar, setTogglingSidebar] = useState(false);
      const [limits, setLimits] = useState(null);

      const [savedSnapshot, setSavedSnapshot] = useState('');
      const [probing, setProbing] = useState(false);
      const [saving, setSaving] = useState(false);
      const [confirmingReset, setConfirmingReset] = useState(false);
      const [feedback, setFeedback] = useState(null); // { scope: 'top' | 'bottom', tone: 'ok' | 'err' | 'warn', text: string }

      // Segmented tab & Agent Activity History states (declared after `loading` to preserve hook ordering)
      const [activeTab, setActiveTab] = useState('settings'); // 'settings' | 'history'
      const [historyItems, setHistoryItems] = useState([]);
      const [historyTotal, setHistoryTotal] = useState(0);
      const [historyHasMore, setHistoryHasMore] = useState(false);
      const [historyStats, setHistoryStats] = useState(EMPTY_HISTORY_STATS);
      const [historyCategory, setHistoryCategory] = useState('all');
      const [historyQuery, setHistoryQuery] = useState('');
      const [historyLoading, setHistoryLoading] = useState(false);
      const [historyError, setHistoryError] = useState('');
      const [historyFeedback, setHistoryFeedback] = useState(null); // { tone: 'ok' | 'err', text: string }
      const [confirmingClearHistory, setConfirmingClearHistory] = useState(false);
      const [clearingHistory, setClearingHistory] = useState(false);
      const historyReqSeqRef = useRef(0);
      const historyDebounceRef = useRef(null);
      const historyCategoryRef = useRef(historyCategory);
      historyCategoryRef.current = historyCategory;
      const historyQueryRef = useRef(historyQuery);
      historyQueryRef.current = historyQuery;

      const cancelHistoryDebounce = useCallback(() => {
        if (historyDebounceRef.current) {
          clearTimeout(historyDebounceRef.current);
          historyDebounceRef.current = null;
        }
      }, []);

      const selectedFolders = modeFolders[mode] || [];
      const setSelectedFoldersForMode = useCallback((targetMode, updater) => {
        setModeFolders((prev) => {
          const currentList = prev[targetMode] || [];
          const nextList = typeof updater === 'function' ? updater(currentList) : updater;
          return { ...prev, [targetMode]: nextList };
        });
      }, []);

      const loadStatus = useCallback(async () => {
        setLoading(true);
        setLoadFailed(false);
        setLoadErrorMsg('');
        try {
          const resp = await fetch('dsh-exchange/api/status', { method: 'GET' });
          const data = await readJsonSafely(resp);
          if (!resp.ok || !data.ok) {
            throw new Error(formatApiError(data, resp.status, tRef.current));
          }
          const nextUrl = data.account?.serverUrl || '';
          const nextEmail = data.account?.email || '';
          const nextDomain = data.account?.domain || '';
          const nextUser = data.account?.username || '';
          const nextPassSet = Boolean(data.passwordSet);
          const nextPassSource = data.passwordSource || 'none';
          const nextMode = data.access?.mode === 'whitelist' ? 'whitelist' : 'blacklist';
          const savedFolders = Array.isArray(data.access?.folders) ? data.access.folders : [];

          setServerUrl(nextUrl);
          setEmail(nextEmail);
          setDomain(nextDomain);
          setUsername(nextUser);
          setPasswordSet(nextPassSet);
          setPasswordSource(nextPassSource);
          // Auto-expand password input on first-time setup when not set via env or store (UX I3)
          setEditingPassword(!nextPassSet && nextPassSource !== 'env');
          setPasswordInput('');
          setMode(nextMode);
          setModeFolders({
            whitelist: nextMode === 'whitelist' ? savedFolders : [],
            blacklist: nextMode === 'blacklist' ? savedFolders : [],
          });
          setKnownFolders((prev) => {
            const byPath = new Map(prev.map((f) => [f.path, f]));
            for (const p of savedFolders) {
              if (!byPath.has(p)) {
                const segs = p.split('/');
                byPath.set(p, { path: p, name: segs[segs.length - 1] || p });
              }
            }
            return Array.from(byPath.values());
          });
          setEmergencyLock(Boolean(data.access?.emergencyLock));
          if (activeSidebarController) {
            activeSidebarController.syncFromServer(data);
            setShowSidebarEntry(activeSidebarController.getSnapshot());
          } else if (typeof data.ui?.showSidebarEntry === 'boolean') {
            setShowSidebarEntry(data.ui.showSidebarEntry);
            writeStoredSidebarVisibility(data.ui.showSidebarEntry);
          }
          setLimits(data.limits || null);
          setSavedSnapshot(
            makeFormSnapshot({
              serverUrl: nextUrl,
              email: nextEmail,
              domain: nextDomain,
              username: nextUser,
              mode: nextMode,
              folders: savedFolders,
            }),
          );
        } catch (err) {
          setLoadFailed(true);
          setLoadErrorMsg(tRef.current('loadError', { msg: err?.message || String(err) }));
        } finally {
          setLoading(false);
        }
      }, []);

      const loadHistory = useCallback(async ({
        category = historyCategory,
        q = historyQuery,
        offset = 0,
        append = false,
        silent = false,
      } = {}) => {
        const reqSeq = ++historyReqSeqRef.current;
        if (!silent) {
          setHistoryLoading(true);
          setHistoryError('');
        }
        try {
          const params = new URLSearchParams();
          params.set('limit', String(HISTORY_PAGE_SIZE));
          params.set('offset', String(offset));
          if (category && category !== 'all') params.set('category', category);
          if (q && q.trim()) params.set('q', q.trim());
          const resp = await fetch(`dsh-exchange/api/history?${params.toString()}`, { method: 'GET' });
          const data = await readJsonSafely(resp);
          if (!mountedRef.current || reqSeq !== historyReqSeqRef.current) return;
          if (resp.status === 404) {
            if (!silent) setHistoryError(tRef.current('historyUnavailable'));
            return;
          }
          if (!resp.ok || !data.ok) {
            if (!silent) setHistoryError(formatApiError(data, resp.status, tRef.current));
            return;
          }
          const incoming = Array.isArray(data.items) ? data.items : [];
          setHistoryItems((prev) => {
            if (!append) return incoming;
            const seen = new Set(prev.map((x) => x.id).filter(Boolean));
            const uniqueNew = incoming.filter((x) => !x.id || !seen.has(x.id));
            return prev.concat(uniqueNew);
          });
          setHistoryTotal(Number.isFinite(Number(data.total)) ? Number(data.total) : incoming.length);
          setHistoryHasMore(Boolean(data.hasMore));
          if (data.stats && typeof data.stats === 'object') {
            setHistoryStats({ ...EMPTY_HISTORY_STATS, ...data.stats });
          }
        } catch (err) {
          if (!mountedRef.current || reqSeq !== historyReqSeqRef.current) return;
          if (!silent) setHistoryError(err?.message || String(err));
        } finally {
          if (mountedRef.current && reqSeq === historyReqSeqRef.current) {
            setHistoryLoading(false);
          }
        }
      }, [historyCategory, historyQuery]);

      useEffect(() => {
        void loadStatus();
        void loadHistory({ category: 'all', q: '', offset: 0, append: false, silent: true });
      }, [loadStatus]);

      useEffect(() => {
        return () => {
          cancelHistoryDebounce();
        };
      }, [cancelHistoryDebounce]);

      const handleSelectTab = async (nextTab) => {
        cancelHistoryDebounce();
        setActiveTab(nextTab);
        setHistoryFeedback(null);
        setConfirmingClearHistory(false);
        if (nextTab === 'history') {
          await loadHistory({
            category: historyCategoryRef.current,
            q: historyQueryRef.current,
            offset: 0,
            append: false,
            silent: false,
          });
        }
      };

      const handleSelectHistoryCategory = async (nextCat) => {
        cancelHistoryDebounce();
        historyCategoryRef.current = nextCat;
        setHistoryCategory(nextCat);
        setHistoryFeedback(null);
        await loadHistory({
          category: nextCat,
          q: historyQueryRef.current,
          offset: 0,
          append: false,
          silent: false,
        });
      };

      const handleHistoryQueryChange = (nextQ) => {
        historyQueryRef.current = nextQ;
        setHistoryQuery(nextQ);
        cancelHistoryDebounce();
        historyDebounceRef.current = setTimeout(() => {
          historyDebounceRef.current = null;
          void loadHistory({
            category: historyCategoryRef.current,
            q: historyQueryRef.current,
            offset: 0,
            append: false,
            silent: false,
          });
        }, 220);
      };

      const handleClearHistoryConfirmed = async () => {
        if (clearingHistory) return;
        cancelHistoryDebounce();
        // Invalidate any in-flight GET /api/history so older items can never resurrect after clear.
        historyReqSeqRef.current += 1;
        setClearingHistory(true);
        setHistoryLoading(false);
        setHistoryFeedback(null);
        try {
          const resp = await fetch('dsh-exchange/api/history/clear', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({}),
          });
          const data = await readJsonSafely(resp);
          if (!mountedRef.current) return;
          if (!resp.ok || !data.ok) {
            setHistoryFeedback({ tone: 'err', text: formatApiError(data, resp.status, t) });
            return;
          }
          setHistoryItems([]);
          setHistoryTotal(0);
          setHistoryHasMore(false);
          setHistoryStats(EMPTY_HISTORY_STATS);
          setConfirmingClearHistory(false);
          setHistoryFeedback({ tone: 'ok', text: t('historyClearedOk') });
        } catch (err) {
          if (mountedRef.current) {
            setHistoryFeedback({ tone: 'err', text: err?.message || String(err) });
          }
        } finally {
          if (mountedRef.current) setClearingHistory(false);
        }
      };

      useEffect(() => {
        if (!activeSidebarController) return undefined;
        setShowSidebarEntry(activeSidebarController.getSnapshot());
        return activeSidebarController.subscribe((next) => {
          setShowSidebarEntry(next);
        });
      }, []);

      const urlErrorKey = useMemo(() => validateClientServerUrl(serverUrl), [serverUrl]);

      const allKnownPaths = useMemo(() => {
        const set = new Set();
        for (const f of knownFolders) set.add(f.path);
        for (const p of selectedFolders) set.add(p);
        return sortFolderPaths(set);
      }, [knownFolders, selectedFolders]);

      const visiblePaths = useMemo(() => {
        const q = folderFilter.trim().toLowerCase();
        if (!q) return allKnownPaths;
        return allKnownPaths.filter((p) => p.toLowerCase().includes(q));
      }, [allKnownPaths, folderFilter]);

      const selectedSet = useMemo(() => new Set(selectedFolders), [selectedFolders]);

      const currentSnapshot = useMemo(
        () =>
          makeFormSnapshot({
            serverUrl,
            email,
            domain,
            username,
            mode,
            folders: selectedFolders,
          }),
        [serverUrl, email, domain, username, mode, selectedFolders],
      );

      const isDirty = !loading && !loadFailed && (currentSnapshot !== savedSnapshot || passwordInput.length > 0);
      const controlsDisabled = loading || loadFailed;

      const policySummaryText = useMemo(() => {
        if (emergencyLock) return t('policySummaryLocked');
        let allowed = 0;
        let blocked = 0;
        for (const p of allKnownPaths) {
          if (computeRowAllowed(p, mode, selectedSet, false)) allowed += 1;
          else blocked += 1;
        }
        return mode === 'whitelist'
          ? t('policySummaryWhitelist', { allowed: String(allowed), blocked: String(blocked) })
          : t('policySummaryBlacklist', { blocked: String(blocked), allowed: String(allowed) });
      }, [emergencyLock, allKnownPaths, mode, selectedSet, t]);

      const handleToggleSidebarShortcut = async () => {
        if (controlsDisabled || togglingSidebar) return;
        const next = !showSidebarEntry;
        setTogglingSidebar(true);
        setFeedback(null);
        try {
          const resp = await fetch('dsh-exchange/api/save', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ ui: { showSidebarEntry: next } }),
          });
          const data = await readJsonSafely(resp);
          if (!resp.ok || !data.ok) {
            if (mountedRef.current) {
              setFeedback({ scope: 'bottom', tone: 'err', text: formatApiError(data, resp.status, t) });
            }
            return;
          }
          if (activeSidebarController) {
            activeSidebarController.setVisible(next);
          } else {
            writeStoredSidebarVisibility(next);
          }
          if (mountedRef.current) {
            setShowSidebarEntry(next);
            setFeedback({
              scope: 'bottom',
              tone: 'ok',
              text: next ? t('sidebarShortcutShownOk') : t('sidebarShortcutHiddenOk'),
            });
          }
        } catch (err) {
          if (mountedRef.current) {
            setFeedback({ scope: 'bottom', tone: 'err', text: err?.message || String(err) });
          }
        } finally {
          if (mountedRef.current) {
            setTogglingSidebar(false);
          }
        }
      };

      const handleToggleEmergencyLock = async () => {
        if (controlsDisabled || togglingLock) return;
        const nextLock = !emergencyLock;
        setTogglingLock(true);
        setFeedback(null);
        try {
          const resp = await fetch('dsh-exchange/api/save', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ access: { emergencyLock: nextLock } }),
          });
          const data = await readJsonSafely(resp);
          if (!resp.ok || !data.ok) {
            setFeedback({ scope: 'lock', tone: 'err', text: formatApiError(data, resp.status, t) });
            return;
          }
          setEmergencyLock(nextLock);
          setFeedback({
            scope: 'lock',
            tone: nextLock ? 'warn' : 'ok',
            text: nextLock ? t('emergencyLockedOk') : t('emergencyUnlockedOk'),
          });
        } catch (err) {
          setFeedback({ scope: 'lock', tone: 'err', text: err?.message || String(err) });
        } finally {
          setTogglingLock(false);
        }
      };

      const handleProbe = async () => {
        if (urlErrorKey) return;
        setFeedback(null);
        setProbing(true);
        try {
          const resp = await fetch('dsh-exchange/api/probe', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              serverUrl,
              email,
              domain,
              username,
              ...(editingPassword && passwordInput ? { password: passwordInput } : {}),
            }),
          });
          const data = await readJsonSafely(resp);
          if (!resp.ok || !data.ok) {
            setFeedback({ scope: 'top', tone: 'err', text: formatApiError(data, resp.status, t) });
            return;
          }
          const loaded = Array.isArray(data.folders) ? data.folders : [];
          setKnownFolders(loaded);
          setProbedPaths(new Set(loaded.map((f) => f.path)));
          const baseMsg = t('probeSuccess', { count: String(loaded.length) });
          setFeedback({
            scope: 'top',
            tone: 'ok',
            text: isDirty ? `${baseMsg} ${t('probeUnsavedHint')}` : baseMsg,
          });
        } catch (err) {
          setFeedback({ scope: 'top', tone: 'err', text: err?.message || String(err) });
        } finally {
          setProbing(false);
        }
      };

      const handleClearStoredPassword = async () => {
        if (controlsDisabled || saving) return;
        setFeedback(null);
        setSaving(true);
        try {
          const resp = await fetch('dsh-exchange/api/save', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ clearPassword: true }),
          });
          const data = await readJsonSafely(resp);
          if (!resp.ok || !data.ok) {
            setFeedback({ scope: 'top', tone: 'err', text: formatApiError(data, resp.status, t) });
            return;
          }
          const nextSet = Boolean(data.passwordSet);
          const nextSource = data.passwordSource || 'none';
          setPasswordSet(nextSet);
          setPasswordSource(nextSource);
          setEditingPassword(!nextSet && nextSource !== 'env');
          setPasswordInput('');
          setFeedback({ scope: 'top', tone: 'ok', text: t('passwordClearedOk') });
        } catch (err) {
          setFeedback({ scope: 'top', tone: 'err', text: err?.message || String(err) });
        } finally {
          setSaving(false);
        }
      };

      const handleSave = async (scope = 'bottom') => {
        if (controlsDisabled || saving || urlErrorKey) return;
        setFeedback(null);
        setConfirmingReset(false);
        setSaving(true);
        try {
          const payload = {
            account: { serverUrl, email, domain, username },
            access: { mode, folders: selectedFolders, emergencyLock },
          };
          if (passwordSource !== 'env' && editingPassword && passwordInput) {
            payload.password = passwordInput;
          }
          const resp = await fetch('dsh-exchange/api/save', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload),
          });
          const data = await readJsonSafely(resp);
          if (!resp.ok || !data.ok) {
            setFeedback({ scope, tone: 'err', text: formatApiError(data, resp.status, t) });
            return;
          }
          const nextSet = Boolean(data.passwordSet);
          const nextSource = data.passwordSource || 'none';
          setPasswordSet(nextSet);
          setPasswordSource(nextSource);
          setEditingPassword(!nextSet && nextSource !== 'env');
          setPasswordInput('');
          setShowPassword(false);
          setSavedSnapshot(
            makeFormSnapshot({
              serverUrl,
              email,
              domain,
              username,
              mode,
              folders: selectedFolders,
            }),
          );
          setFeedback({ scope, tone: 'ok', text: t('savedSuccess') });
        } catch (err) {
          setFeedback({ scope, tone: 'err', text: err?.message || String(err) });
        } finally {
          setSaving(false);
        }
      };

      const handleResetConfirmed = async () => {
        if (controlsDisabled || saving) return;
        setFeedback(null);
        setSaving(true);
        try {
          const resp = await fetch('dsh-exchange/api/save', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ reset: true }),
          });
          const data = await readJsonSafely(resp);
          if (!resp.ok || !data.ok) {
            setFeedback({ scope: 'bottom', tone: 'err', text: formatApiError(data, resp.status, t) });
            return;
          }
          setMode('blacklist');
          setModeFolders({ whitelist: [], blacklist: [] });
          setEmergencyLock(false);
          setConfirmingReset(false);
          setSavedSnapshot(
            makeFormSnapshot({
              serverUrl,
              email,
              domain,
              username,
              mode: 'blacklist',
              folders: [],
            }),
          );
          setFeedback({ scope: 'bottom', tone: 'ok', text: t('resetSuccess') });
        } catch (err) {
          setFeedback({ scope: 'bottom', tone: 'err', text: err?.message || String(err) });
        } finally {
          setSaving(false);
        }
      };

      const handleSelectAllVisible = () => {
        setSelectedFoldersForMode(mode, (prev) => {
          const set = new Set(prev);
          for (const p of visiblePaths) set.add(p);
          return Array.from(set);
        });
      };

      const handleClearAllVisible = () => {
        setSelectedFoldersForMode(mode, (prev) => {
          const vis = new Set(visiblePaths);
          return prev.filter((p) => !vis.has(p));
        });
      };

      const passwordBadgeText = passwordSet
        ? (passwordSource === 'env' ? t('passwordSetEnv') : t('passwordSetCred'))
        : t('passwordUnset');

      return h(
        'div',
        { className: 'dsh-ex-root', 'data-testid': 'dsh-exchange-settings' },
        h('style', null, STYLES),
        !hideHeader
          ? h(
              'div',
              { className: 'dsh-ex-header' },
              h('h2', { className: 'dsh-ex-title' }, t('title')),
              h('p', { className: 'dsh-ex-subtitle' }, t('subtitle')),
            )
          : null,
        loading
          ? h('div', { className: 'dsh-ex-banner', role: 'status' }, t('loadingText'))
          : null,
        loadFailed
          ? h(
              'div',
              { className: 'dsh-ex-banner dsh-ex-banner-err', role: 'alert' },
              h('span', null, loadErrorMsg),
              h(
                'button',
                { type: 'button', className: 'dsh-ex-btn', onClick: () => void loadStatus() },
                t('retryBtn'),
              ),
            )
          : null,
        // Prominent top Emergency Lock bar — persists immediately to disk (UX C2)
        h(
          'section',
          { className: `dsh-ex-lock-bar ${emergencyLock ? 'dsh-ex-lock-bar-active' : ''}` },
          h(
            'div',
            { className: 'dsh-ex-lock-info' },
            h(
              'div',
              { className: 'dsh-ex-inline' },
              h('strong', { style: { fontSize: '13px' } }, t('emergencyTitle')),
              h(
                'span',
                { className: `dsh-ex-pill ${emergencyLock ? 'dsh-ex-pill-deny' : 'dsh-ex-pill-allow'}` },
                emergencyLock ? t('emergencyActive') : t('emergencyInactive'),
              ),
            ),
            h(
              'span',
              { className: 'dsh-ex-hint' },
              emergencyLock ? t('emergencyDescLocked') : t('emergencyDescUnlocked'),
            ),
          ),
          h(
            'button',
            {
              type: 'button',
              className: `dsh-ex-btn ${emergencyLock ? '' : 'dsh-ex-btn-danger'}`,
              disabled: controlsDisabled || togglingLock,
              onClick: handleToggleEmergencyLock,
            },
            togglingLock
              ? t('emergencyLockingBtn')
              : emergencyLock
                ? t('emergencyUnlockBtn')
                : t('emergencyLockBtn'),
          ),
        ),
        feedback && feedback.scope === 'lock'
          ? h(
              'div',
              {
                role: feedback.tone === 'err' ? 'alert' : 'status',
                className: `dsh-ex-banner ${feedback.tone === 'ok' ? 'dsh-ex-banner-ok' : feedback.tone === 'warn' ? 'dsh-ex-banner-warn' : 'dsh-ex-banner-err'}`,
              },
              feedback.text,
            )
          : null,
        // Segmented Tabs: Configuration | Agent Activity History
        h(
          'div',
          { className: 'dsh-ex-tabs', role: 'tablist', 'aria-label': t('title') },
          h(
            'button',
            {
              type: 'button',
              role: 'tab',
              id: 'dsh-ex-tab-settings',
              'aria-selected': activeTab === 'settings',
              'aria-controls': 'dsh-ex-tabpanel-settings',
              className: `dsh-ex-tab ${activeTab === 'settings' ? 'dsh-ex-tab-active' : ''}`,
              onClick: () => handleSelectTab('settings'),
            },
            t('tabSettings'),
          ),
          h(
            'button',
            {
              type: 'button',
              role: 'tab',
              id: 'dsh-ex-tab-history',
              'aria-selected': activeTab === 'history',
              'aria-controls': 'dsh-ex-tabpanel-history',
              className: `dsh-ex-tab ${activeTab === 'history' ? 'dsh-ex-tab-active' : ''}`,
              onClick: () => handleSelectTab('history'),
            },
            h('span', null, t('tabHistory')),
            historyStats.total > 0
              ? h('span', { className: 'dsh-ex-tab-count' }, String(historyStats.total))
              : null,
          ),
        ),
        activeTab === 'history'
          ? h(
              'div',
              {
                role: 'tabpanel',
                id: 'dsh-ex-tabpanel-history',
                'aria-labelledby': 'dsh-ex-tab-history',
                style: { display: 'flex', flexDirection: 'column', gap: '14px' },
              },
              h(
                'section',
                { className: 'dsh-ex-card' },
                h(
                  'div',
                  { className: 'dsh-ex-card-header' },
                  h(
                    'div',
                    { style: { display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0, flex: 1 } },
                    h('h3', { className: 'dsh-ex-card-title' }, t('historyTitle')),
                    h('span', { className: 'dsh-ex-hint' }, t('historySubtitle')),
                  ),
                  h(
                    'div',
                    { className: 'dsh-ex-inline' },
                    h(
                      'button',
                      {
                        type: 'button',
                        className: 'dsh-ex-btn',
                        'data-testid': 'dsh-ex-history-refresh-btn',
                        disabled: historyLoading,
                        onClick: () => {
                          cancelHistoryDebounce();
                          return loadHistory({
                            category: historyCategoryRef.current,
                            q: historyQueryRef.current,
                            offset: 0,
                            append: false,
                            silent: false,
                          });
                        },
                      },
                      historyLoading ? t('historyRefreshingBtn') : t('historyRefreshBtn'),
                    ),
                    h(
                      'button',
                      {
                        type: 'button',
                        className: 'dsh-ex-btn dsh-ex-btn-danger',
                        'data-testid': 'dsh-ex-history-clear-btn',
                        disabled: clearingHistory || confirmingClearHistory || historyStats.total === 0,
                        onClick: () => {
                          setHistoryFeedback(null);
                          setConfirmingClearHistory(true);
                        },
                      },
                      t('historyClearBtn'),
                    ),
                  ),
                ),
                // Summary KPI strip
                h(
                  'div',
                  { className: 'dsh-ex-stat-grid' },
                  h(
                    'div',
                    { className: 'dsh-ex-stat-card' },
                    h('span', { className: 'dsh-ex-stat-val' }, String(historyStats.total)),
                    h('span', { className: 'dsh-ex-stat-label' }, t('historyStatTotal')),
                  ),
                  h(
                    'div',
                    { className: 'dsh-ex-stat-card' },
                    h('span', { className: 'dsh-ex-stat-val' }, String(historyStats.read)),
                    h('span', { className: 'dsh-ex-stat-label' }, t('historyStatRead')),
                  ),
                  h(
                    'div',
                    { className: 'dsh-ex-stat-card' },
                    h('span', { className: 'dsh-ex-stat-val' }, String(historyStats.draft)),
                    h('span', { className: 'dsh-ex-stat-label' }, t('historyStatDraft')),
                  ),
                  h(
                    'div',
                    { className: 'dsh-ex-stat-card' },
                    h(
                      'span',
                      {
                        className: `dsh-ex-stat-val ${historyStats.denied + historyStats.error > 0 ? 'dsh-ex-stat-val-warn' : ''}`,
                      },
                      String(historyStats.denied + historyStats.error),
                    ),
                    h('span', { className: 'dsh-ex-stat-label' }, t('historyStatBlocked')),
                  ),
                ),
                // Category filter chips + search input
                h(
                  'div',
                  { className: 'dsh-ex-chips', role: 'group', 'aria-label': t('historyTitle') },
                  ...[
                    ['all', 'historyFilterAll'],
                    ['read', 'historyFilterRead'],
                    ['draft', 'historyFilterDraft'],
                    ['search', 'historyFilterSearch'],
                    ['analyze', 'historyFilterAnalyze'],
                    ['modify', 'historyFilterModify'],
                    ['blocked', 'historyFilterBlocked'],
                  ].map(([catKey, labelKey]) =>
                    h(
                      'button',
                      {
                        key: catKey,
                        type: 'button',
                        className: `dsh-ex-chip ${historyCategory === catKey ? 'dsh-ex-chip-active' : ''}`,
                        'aria-pressed': historyCategory === catKey,
                        onClick: () => handleSelectHistoryCategory(catKey),
                      },
                      t(labelKey),
                    ),
                  ),
                ),
                h('input', {
                  className: 'dsh-ex-input',
                  type: 'search',
                  value: historyQuery,
                  placeholder: t('historySearchPlaceholder'),
                  onChange: (e) => handleHistoryQueryChange(e.target.value),
                  onKeyDown: (e) => {
                    if (e.key === 'Enter') {
                      cancelHistoryDebounce();
                      void loadHistory({
                        category: historyCategoryRef.current,
                        q: historyQueryRef.current,
                        offset: 0,
                        append: false,
                        silent: false,
                      });
                    }
                  },
                }),
                historyFeedback
                  ? h(
                      'div',
                      {
                        role: historyFeedback.tone === 'err' ? 'alert' : 'status',
                        className: `dsh-ex-banner ${historyFeedback.tone === 'ok' ? 'dsh-ex-banner-ok' : 'dsh-ex-banner-err'}`,
                      },
                      historyFeedback.text,
                    )
                  : null,
                confirmingClearHistory
                  ? h(
                      'div',
                      { className: 'dsh-ex-banner dsh-ex-banner-warn', role: 'alert' },
                      h('span', null, t('historyClearConfirmText')),
                      h(
                        'div',
                        { className: 'dsh-ex-inline' },
                        h(
                          'button',
                          {
                            type: 'button',
                            className: 'dsh-ex-btn dsh-ex-btn-danger',
                            'data-testid': 'dsh-ex-history-clear-confirm',
                            disabled: clearingHistory,
                            onClick: handleClearHistoryConfirmed,
                          },
                          clearingHistory ? t('historyClearingBtn') : t('historyClearConfirmBtn'),
                        ),
                        h(
                          'button',
                          {
                            type: 'button',
                            className: 'dsh-ex-btn',
                            disabled: clearingHistory,
                            onClick: () => setConfirmingClearHistory(false),
                          },
                          t('cancelChange'),
                        ),
                      ),
                    )
                  : null,
                historyError
                  ? h('div', { className: 'dsh-ex-banner dsh-ex-banner-err', role: 'alert' }, historyError)
                  : null,
                historyLoading && historyItems.length === 0
                  ? h('div', { className: 'dsh-ex-empty-box', role: 'status' }, t('historyLoading'))
                  : historyError && historyItems.length === 0
                    ? null
                    : historyItems.length === 0
                      ? h(
                          'div',
                          { className: 'dsh-ex-empty-box' },
                          historyStats.total > 0 && (historyCategory !== 'all' || historyQuery.trim())
                            ? t('historyFilterEmpty')
                            : t('historyEmpty'),
                        )
                      : h(
                          'div',
                          { className: 'dsh-ex-activity-list', role: 'list' },
                        ...historyItems.map((item) => {
                          const fmt = formatActivityEntry(item, t);
                          const isDenied = item.outcome === 'denied';
                          const isError = item.outcome === 'error';
                          const accentClass = isDenied || isError
                            ? 'dsh-ex-activity-cat-denied'
                            : `dsh-ex-activity-cat-${item.category || 'search'}`;
                          const outcomePillClass = isDenied
                            ? 'dsh-ex-pill-deny'
                            : isError
                              ? 'dsh-ex-pill-warn'
                              : 'dsh-ex-pill-allow';
                          const outcomeText = isDenied
                            ? (item.code ? `${t('historyOutcomeDenied')} · ${item.code}` : t('historyOutcomeDenied'))
                            : isError
                              ? (item.code ? `${t('historyOutcomeError')} · ${item.code}` : t('historyOutcomeError'))
                              : t('historyOutcomeOk');
                          return h(
                            'article',
                            {
                              key: item.id || `${item.ts}-${item.action}`,
                              role: 'listitem',
                              className: `dsh-ex-activity-item ${accentClass}`,
                            },
                            h(
                              'div',
                              { className: 'dsh-ex-activity-top' },
                              h(
                                'div',
                                { className: 'dsh-ex-inline' },
                                h('span', { className: 'dsh-ex-pill dsh-ex-pill-info' }, fmt.actionLabel),
                                h('span', { className: `dsh-ex-pill ${outcomePillClass}` }, outcomeText),
                                item.source === 'audit'
                                  ? h('span', { className: 'dsh-ex-pill dsh-ex-pill-neutral' }, t('historySourceAudit'))
                                  : null,
                              ),
                              h(
                                'span',
                                { className: 'dsh-ex-activity-time' },
                                `${formatLocalTimestamp(item.ts)} · ${item.elapsedMs ?? 0}ms`,
                              ),
                            ),
                            h('div', { className: 'dsh-ex-activity-headline' }, fmt.headline),
                            fmt.details.length > 0
                              ? h(
                                  'div',
                                  { className: 'dsh-ex-activity-details' },
                                  ...fmt.details.map((d, idx) =>
                                    h('span', { key: `${idx}-${d}`, className: 'dsh-ex-activity-tag', title: d }, d),
                                  ),
                                )
                              : null,
                          );
                        }),
                      ),
                historyHasMore
                  ? h(
                      'div',
                      { style: { display: 'flex', justifyContent: 'center' } },
                      h(
                        'button',
                        {
                          type: 'button',
                          className: 'dsh-ex-btn',
                          disabled: historyLoading,
                          onClick: () => {
                            cancelHistoryDebounce();
                            return loadHistory({
                              category: historyCategoryRef.current,
                              q: historyQueryRef.current,
                              offset: historyItems.length,
                              append: true,
                              silent: false,
                            });
                          },
                        },
                        t('historyLoadMoreBtn', { remaining: String(Math.max(0, historyTotal - historyItems.length)) }),
                      ),
                    )
                  : null,
                h('div', { className: 'dsh-ex-limits' }, t('historyPrivacyNote')),
              ),
            )
          : h(
              'div',
              {
                role: 'tabpanel',
                id: 'dsh-ex-tabpanel-settings',
                'aria-labelledby': 'dsh-ex-tab-settings',
                style: { display: 'flex', flexDirection: 'column', gap: '16px' },
              },
              // Exchange Connection Card
              h(
                'section',
                { className: 'dsh-ex-card' },
          h('h3', { className: 'dsh-ex-card-title' }, t('sectionAccount')),
          h(
            'div',
            { className: 'dsh-ex-field' },
            h('label', { className: 'dsh-ex-label', htmlFor: 'dsh-ex-server-url' }, t('serverUrl')),
            h('input', {
              id: 'dsh-ex-server-url',
              className: `dsh-ex-input ${urlErrorKey ? 'dsh-ex-input-error' : ''}`,
              type: 'url',
              value: serverUrl,
              placeholder: t('serverUrlPlaceholder'),
              disabled: controlsDisabled,
              onChange: (e) => setServerUrl(e.target.value),
            }),
            urlErrorKey
              ? h('span', { className: 'dsh-ex-error-text', role: 'alert' }, t(urlErrorKey))
              : h('span', { className: 'dsh-ex-hint' }, t('httpsHint')),
          ),
          h(
            'div',
            { className: 'dsh-ex-field' },
            h('label', { className: 'dsh-ex-label', htmlFor: 'dsh-ex-email' }, t('email')),
            h('input', {
              id: 'dsh-ex-email',
              className: 'dsh-ex-input',
              type: 'email',
              value: email,
              placeholder: t('emailPlaceholder'),
              disabled: controlsDisabled,
              onChange: (e) => setEmail(e.target.value),
            }),
          ),
          h(
            'div',
            { className: 'dsh-ex-row-2' },
            h(
              'div',
              { className: 'dsh-ex-field' },
              h('label', { className: 'dsh-ex-label', htmlFor: 'dsh-ex-domain' }, t('domain')),
              h('input', {
                id: 'dsh-ex-domain',
                className: 'dsh-ex-input',
                type: 'text',
                value: domain,
                placeholder: t('domainPlaceholder'),
                disabled: controlsDisabled,
                onChange: (e) => setDomain(e.target.value),
              }),
            ),
            h(
              'div',
              { className: 'dsh-ex-field' },
              h('label', { className: 'dsh-ex-label', htmlFor: 'dsh-ex-username' }, t('username')),
              h('input', {
                id: 'dsh-ex-username',
                className: 'dsh-ex-input',
                type: 'text',
                value: username,
                placeholder: t('usernamePlaceholder'),
                disabled: controlsDisabled,
                onChange: (e) => setUsername(e.target.value),
              }),
            ),
          ),
          h(
            'div',
            { className: 'dsh-ex-field' },
            h('span', { className: 'dsh-ex-label' }, t('password')),
            h(
              'div',
              { className: 'dsh-ex-inline' },
              h(
                'span',
                { className: `dsh-ex-pill ${passwordSet ? 'dsh-ex-pill-allow' : 'dsh-ex-pill-neutral'}` },
                passwordBadgeText,
              ),
              passwordSource !== 'env' && passwordSet
                ? h(
                    'button',
                    {
                      type: 'button',
                      className: 'dsh-ex-btn',
                      disabled: controlsDisabled || saving,
                      onClick: () => {
                        setEditingPassword((v) => !v);
                        setPasswordInput('');
                        setShowPassword(false);
                      },
                    },
                    editingPassword ? t('cancelChange') : t('changePassword'),
                  )
                : null,
              passwordSource === 'credentials'
                ? h(
                    'button',
                    {
                      type: 'button',
                      className: 'dsh-ex-btn',
                      disabled: controlsDisabled || saving,
                      onClick: handleClearStoredPassword,
                    },
                    t('clearPasswordBtn'),
                  )
                : null,
            ),
            passwordSource === 'env'
              ? h('span', { className: 'dsh-ex-hint' }, t('passwordEnvHint'))
              : editingPassword
                ? h(
                    'div',
                    { className: 'dsh-ex-inline' },
                    h('input', {
                      id: 'dsh-ex-password',
                      className: 'dsh-ex-input',
                      style: { flex: 1 },
                      type: showPassword ? 'text' : 'password',
                      autoComplete: 'new-password',
                      value: passwordInput,
                      disabled: controlsDisabled,
                      placeholder: t('passwordPlaceholder'),
                      onChange: (e) => setPasswordInput(e.target.value),
                    }),
                    h(
                      'button',
                      {
                        type: 'button',
                        className: 'dsh-ex-btn',
                        disabled: controlsDisabled,
                        onClick: () => setShowPassword((v) => !v),
                      },
                      showPassword ? t('hidePassword') : t('showPassword'),
                    ),
                  )
                : null,
          ),
          h(
            'div',
            { className: 'dsh-ex-actions' },
            h(
              'div',
              { className: 'dsh-ex-inline' },
              h(
                'button',
                {
                  type: 'button',
                  className: 'dsh-ex-btn dsh-ex-btn-primary',
                  disabled: controlsDisabled || saving || Boolean(urlErrorKey),
                  onClick: () => handleSave('top'),
                },
                saving ? t('savingBtn') : t('saveBtn'),
              ),
              h(
                'button',
                {
                  type: 'button',
                  className: 'dsh-ex-btn',
                  disabled: controlsDisabled || probing || !serverUrl.trim() || Boolean(urlErrorKey),
                  onClick: handleProbe,
                },
                probing ? t('probingBtn') : t('probeBtn'),
              ),
            ),
            isDirty
              ? h('span', { className: 'dsh-ex-pill dsh-ex-pill-warn' }, t('unsavedBadge'))
              : null,
          ),
          feedback && feedback.scope === 'top'
            ? h(
                'div',
                {
                  role: feedback.tone === 'err' ? 'alert' : 'status',
                  className: `dsh-ex-banner ${feedback.tone === 'ok' ? 'dsh-ex-banner-ok' : feedback.tone === 'warn' ? 'dsh-ex-banner-warn' : 'dsh-ex-banner-err'}`,
                },
                feedback.text,
              )
            : null,
        ),
        // Folder Access Policy Card
        h(
          'section',
          { className: 'dsh-ex-card' },
          h(
            'div',
            { className: 'dsh-ex-card-header' },
            h('h3', { className: 'dsh-ex-card-title' }, t('sectionAccess')),
            h(
              'span',
              { className: `dsh-ex-pill ${emergencyLock ? 'dsh-ex-pill-deny' : 'dsh-ex-pill-neutral'}` },
              policySummaryText,
            ),
          ),
          h(
            'div',
            { className: 'dsh-ex-field' },
            h('span', { className: 'dsh-ex-label' }, t('modeLabel')),
            h(
              'div',
              { className: 'dsh-ex-radios' },
              h(
                'label',
                { className: 'dsh-ex-radio-row' },
                h('input', {
                  type: 'radio',
                  name: 'dsh-ex-mode',
                  value: 'whitelist',
                  disabled: controlsDisabled,
                  checked: mode === 'whitelist',
                  onChange: () => setMode('whitelist'),
                }),
                t('modeWhitelist'),
              ),
              h(
                'label',
                { className: 'dsh-ex-radio-row' },
                h('input', {
                  type: 'radio',
                  name: 'dsh-ex-mode',
                  value: 'blacklist',
                  disabled: controlsDisabled,
                  checked: mode === 'blacklist',
                  onChange: () => setMode('blacklist'),
                }),
                t('modeBlacklist'),
              ),
            ),
          ),
          h(
            'div',
            { className: 'dsh-ex-field' },
            h('span', { className: 'dsh-ex-label' }, t('folderTreeLabel')),
            allKnownPaths.length > 0
              ? h(
                  'div',
                  { className: 'dsh-ex-tree-toolbar' },
                  h('input', {
                    className: 'dsh-ex-input',
                    style: { flex: 1, minWidth: '160px' },
                    type: 'search',
                    value: folderFilter,
                    disabled: controlsDisabled,
                    placeholder: t('folderFilterPlaceholder'),
                    onChange: (e) => setFolderFilter(e.target.value),
                  }),
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'dsh-ex-btn',
                      disabled: controlsDisabled || visiblePaths.length === 0,
                      onClick: handleSelectAllVisible,
                    },
                    t('selectAllBtn'),
                  ),
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'dsh-ex-btn',
                      disabled: controlsDisabled || visiblePaths.length === 0,
                      onClick: handleClearAllVisible,
                    },
                    t('clearAllBtn'),
                  ),
                )
              : null,
            allKnownPaths.length === 0
              ? h('div', { className: 'dsh-ex-hint' }, t('folderEmpty'))
              : visiblePaths.length === 0
                ? h('div', { className: 'dsh-ex-hint' }, t('folderFilterEmpty'))
                : h(
                    'div',
                    { className: 'dsh-ex-tree', role: 'list' },
                    ...visiblePaths.map((path) => {
                      const segs = path.split('/');
                      const depth = Math.max(0, segs.length - 1);
                      const leaf = segs[segs.length - 1] || path;
                      const inheritedAncestor = mode === 'blacklist'
                        ? getAncestorBlockedPath(path, selectedSet)
                        : null;
                      const isInherited = Boolean(inheritedAncestor);
                      const checked = isInherited || selectedSet.has(path);
                      const indeterminate = isFolderIndeterminate(path, mode, selectedSet, allKnownPaths);
                      const allowed = computeRowAllowed(path, mode, selectedSet, emergencyLock);
                      const isStale = Boolean(probedPaths && selectedSet.has(path) && !probedPaths.has(path));

                      return h(
                        'div',
                        {
                          key: path,
                          role: 'listitem',
                          className: 'dsh-ex-folder-row',
                          style: { paddingLeft: `${8 + depth * 18}px` },
                        },
                        h(
                          'label',
                          {
                            className: `dsh-ex-folder-left ${isInherited ? 'dsh-ex-folder-left-disabled' : ''}`,
                            title: path,
                          },
                          h('input', {
                            type: 'checkbox',
                            checked,
                            disabled: controlsDisabled || isInherited,
                            ref: (el) => {
                              if (el) el.indeterminate = indeterminate;
                            },
                            onChange: (e) => {
                              const nextChecked = e.target.checked;
                              setSelectedFoldersForMode(mode, (prev) =>
                                toggleFolderSelection(prev, path, nextChecked, allKnownPaths),
                              );
                            },
                          }),
                          h('span', { className: 'dsh-ex-folder-name' }, leaf),
                          isInherited
                            ? h('span', { className: 'dsh-ex-folder-meta' }, `(${t('badgeInherited')})`)
                            : null,
                          isStale
                            ? h('span', { className: 'dsh-ex-pill dsh-ex-pill-warn' }, t('badgeStale'))
                            : null,
                        ),
                        h(
                          'span',
                          { className: `dsh-ex-pill ${allowed ? 'dsh-ex-pill-allow' : 'dsh-ex-pill-deny'}` },
                          allowed ? t('badgeAllowed') : t('badgeDenied'),
                        ),
                      );
                    }),
                  ),
          ),
        ),
        // Left Sidebar Shortcut visibility toggle (instant sync across Settings, Plugins, and Sidebar Main Page)
        h(
          'section',
          { className: 'dsh-ex-card' },
          h(
            'div',
            { className: 'dsh-ex-switch-row' },
            h(
              'div',
              { className: 'dsh-ex-switch-info' },
              h(
                'div',
                { className: 'dsh-ex-inline' },
                h('h3', { className: 'dsh-ex-card-title' }, t('sectionInterface')),
                h(
                  'span',
                  { className: `dsh-ex-pill ${showSidebarEntry ? 'dsh-ex-pill-allow' : 'dsh-ex-pill-neutral'}` },
                  showSidebarEntry ? t('sidebarShortcutVisible') : t('sidebarShortcutHidden'),
                ),
              ),
              h('span', { className: 'dsh-ex-label' }, t('sidebarShortcutLabel')),
              h('span', { className: 'dsh-ex-hint' }, t('sidebarShortcutHint')),
            ),
            h(
              'button',
              {
                type: 'button',
                role: 'switch',
                'aria-checked': showSidebarEntry,
                'aria-label': t('sidebarShortcutLabel'),
                className: 'dsh-ex-switch',
                disabled: controlsDisabled || togglingSidebar,
                onClick: handleToggleSidebarShortcut,
              },
              h('span', { className: 'dsh-ex-switch-thumb', 'aria-hidden': true }),
            ),
          ),
        ),
        limits
          ? h(
              'div',
              { className: 'dsh-ex-limits' },
              `${t('limitsTitle')}: ${t('limitsSummary', {
                search: String(limits.max_search_results),
                att: String(limits.max_attachment_mb),
                body: String(limits.max_body_chars),
                timeout: String(limits.request_timeout_seconds),
                prefix: String(limits.explicit_prefix),
              })}`,
            )
          : null,
        // Bottom action footer (non-overlapping, with inline feedback & 2-step Reset Policy confirmation)
        h(
          'div',
          { className: 'dsh-ex-footer-bar' },
          feedback && feedback.scope !== 'top'
            ? h(
                'div',
                {
                  role: feedback.tone === 'err' ? 'alert' : 'status',
                  className: `dsh-ex-banner ${feedback.tone === 'ok' ? 'dsh-ex-banner-ok' : feedback.tone === 'warn' ? 'dsh-ex-banner-warn' : 'dsh-ex-banner-err'}`,
                },
                feedback.text,
              )
            : null,
          confirmingReset
            ? h(
                'div',
                { className: 'dsh-ex-banner dsh-ex-banner-warn', role: 'alert' },
                h('span', null, t('resetConfirmText')),
                h(
                  'div',
                  { className: 'dsh-ex-inline' },
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'dsh-ex-btn dsh-ex-btn-danger',
                      disabled: saving,
                      onClick: handleResetConfirmed,
                    },
                    saving ? t('savingBtn') : t('resetConfirmBtn'),
                  ),
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'dsh-ex-btn',
                      disabled: saving,
                      onClick: () => setConfirmingReset(false),
                    },
                    t('cancelChange'),
                  ),
                ),
              )
            : null,
          h(
            'div',
            { className: 'dsh-ex-actions' },
            h(
              'div',
              { className: 'dsh-ex-inline' },
              h(
                'button',
                {
                  type: 'button',
                  className: 'dsh-ex-btn dsh-ex-btn-primary',
                  disabled: controlsDisabled || saving || Boolean(urlErrorKey),
                  onClick: () => handleSave('bottom'),
                },
                saving ? t('savingBtn') : t('saveBtn'),
              ),
              h(
                'button',
                {
                  type: 'button',
                  className: 'dsh-ex-btn',
                  disabled: controlsDisabled || saving || confirmingReset,
                  onClick: () => setConfirmingReset(true),
                },
                t('resetBtn'),
              ),
            ),
            isDirty
              ? h('span', { className: 'dsh-ex-pill dsh-ex-pill-warn' }, t('unsavedBadge'))
              : null,
          ),
        ),
            ),
      );
    }

    function BundleConfigWrapper(props) {
      if (props && props.view === 'summary') {
        return null;
      }
      return h(ExchangeSettingsPanel, { ...props, hideHeader: true });
    }

    return {
      inject: ['slots', 'locale'],
      __toggleFolderSelection: toggleFolderSelection,
      __sortFolderPaths: sortFolderPaths,
      __getAncestorBlockedPath: getAncestorBlockedPath,
      __isFolderIndeterminate: isFolderIndeterminate,
      __validateClientServerUrl: validateClientServerUrl,
      __formatApiError: formatApiError,
      __formatActivityEntry: formatActivityEntry,
      __matchesMailTrigger: matchesMailTrigger,
      __getSidebarController() {
        return activeSidebarController;
      },
      apply(ctx) {
        ctx.effect(
          () => ctx.locale.register(NS, DICTIONARIES),
          'dsh-exchange: runtime locale dictionaries',
        );
        const t = ctx.locale.bind(NS);

        function MailAssistantMainPage(props) {
          const translate = (props && props.t) || t;
          return h(
            'div',
            { className: 'dsh-ex-main-page', 'data-testid': 'dsh-exchange-main-page' },
            h('style', null, STYLES),
            h(
              'div',
              { className: 'dsh-ex-main-scroll' },
              h(
                'div',
                { className: 'dsh-ex-main-content' },
                h(
                  'div',
                  { className: 'dsh-ex-main-topbar' },
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'dsh-ex-btn dsh-ex-back-btn',
                      onClick: () => {
                        const layout = getLayoutService(ctx);
                        if (layout && typeof layout.selectPanel === 'function') {
                          layout.selectPanel(null);
                        }
                      },
                    },
                    translate('backToChatBtn'),
                  ),
                ),
                h(ExchangeSettingsPanel, { ...props, t: translate, hideHeader: false }),
              ),
            ),
          );
        }

        const sidebarController = createSidebarVisibilityController(ctx, t, MailAssistantMainPage);
        activeSidebarController = sidebarController;
        ctx.effect(() => {
          if (typeof fetch === 'function') {
            void fetch('dsh-exchange/api/status', { method: 'GET' })
              .then((resp) => (resp && resp.ok ? readJsonSafely(resp) : null))
              .then((data) => {
                if (data && data.ok) {
                  sidebarController.syncFromServer(data, { fromBoot: true });
                }
              })
              .catch(() => {});
          }
          return () => {
            sidebarController.dispose();
            if (activeSidebarController === sidebarController) {
              activeSidebarController = null;
            }
          };
        }, 'dsh-exchange: top-left sidebar shortcut lifecycle');

        ctx.slots.inject('settings.section', () =>
          ctx.slots.register(
            {
              name: 'settings.section',
              id: SECTION_ID,
              order: 30,
              label: () => t('nav'),
              locale: NS,
            },
            ExchangeSettingsPanel,
          ),
        );

        ctx.slots.inject('plugins.bundle.config', () =>
          ctx.slots.register(
            {
              name: 'plugins.bundle.config',
              key: PKG_ID,
              locale: NS,
            },
            BundleConfigWrapper,
          ),
        );

        ctx.inject(['inputTriggers'], (triggerCtx) => {
          let triggerToken = 'mail';
          let syncedPrefix = false;
          const syncPrefixOnce = async () => {
            if (syncedPrefix || typeof fetch !== 'function') return;
            syncedPrefix = true;
            try {
              const resp = await fetch('dsh-exchange/api/status', { method: 'GET' });
              if (!resp.ok) return;
              const data = await readJsonSafely(resp);
              if (data && data.ok && data.limits && data.limits.explicit_prefix) {
                triggerToken = extractTriggerToken(data.limits.explicit_prefix);
              }
            } catch {
              // Keep default 'mail' when offline or unauthenticated.
            }
          };

          const mailSource = {
            trigger: '@',
            name: 'mail',
            order: -10,
            showGroupTitle: false,
            async candidates(_session, req) {
              if (req && req.quoted) return [];
              await syncPrefixOnce();
              const q = String((req && req.query) || '');
              if (!matchesMailTrigger(q, triggerToken)) return [];
              return [
                {
                  name: triggerToken,
                  label: triggerToken,
                  description: t('triggerDescription'),
                  icon: MailSvgIcon,
                  section: t('triggerSection'),
                },
              ];
            },
            lexicon() {
              return [triggerToken];
            },
            onPick() {
              return { text: `@${triggerToken} ` };
            },
          };
          triggerCtx.effect(
            () => triggerCtx.inputTriggers.registerSource(mailSource),
            'dsh-exchange: @mail input trigger',
          );
        });
      },
    };
  },
});
