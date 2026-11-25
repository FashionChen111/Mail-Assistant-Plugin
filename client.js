window.__ModuleLoader__.load({
  id: '@local/dsh-exchange',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useState, useEffect, useCallback, useMemo } = React;

    const NS = 'dsh-exchange';
    const SECTION_ID = 'dsh-exchange';
    const PKG_ID = '@local/dsh-exchange';

    const DICTIONARIES = {
      en: {
        nav: 'Mail Assistant',
        title: 'Mail Assistant',
        subtitle: 'Configure on-premises Exchange (EWS + NTLM) access and folder-level privacy boundaries. Draft-only; never sends email.',
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
        changePassword: 'Change',
        cancelChange: 'Cancel',
        passwordPlaceholder: 'Enter Exchange password (stored securely in host credentials)',
        probeBtn: 'Connect & Load Folders',
        probingBtn: 'Connecting...',
        probeSuccess: 'Connected to Exchange and loaded {count} mail folder(s).',
        sectionAccess: 'Folder Access Policy',
        modeLabel: 'Access mode',
        modeWhitelist: 'Whitelist (allow only checked folders)',
        modeBlacklist: 'Blacklist (block checked folders and their subfolders)',
        folderTreeLabel: 'Folder permissions',
        folderEmpty: 'Click "Connect & Load Folders" to load your Exchange folder tree, or add a folder path manually below.',
        addFolderPlaceholder: 'Add folder path, e.g. 认证项目/Widevine',
        addFolderBtn: 'Add',
        badgeAllowed: 'Allowed',
        badgeDenied: 'Blocked',
        emergencyLockLabel: 'Emergency lock (block Agent from accessing all folders immediately)',
        emergencyLockHint: 'When enabled, every Exchange tool call returns PERM_001 without contacting the server.',
        saveBtn: 'Save',
        savingBtn: 'Saving...',
        resetBtn: 'Reset to default',
        savedSuccess: 'Settings saved. Policy takes effect immediately.',
        resetSuccess: 'Access policy reset to default (blacklist, empty list, lock off).',
        limitsTitle: 'Active Runtime Limits',
        limitsSummary: 'Max search: {search} · Max attachment: {att} MiB · Max body: {body} chars · Timeout: {timeout}s · Trigger: {prefix}',
        loadError: 'Failed to load Mail Assistant status: {msg}',
        triggerSection: 'Mail Assistant',
        triggerDescription: 'Activate Exchange email tools for this session (draft-only)',
      },
      zh: {
        nav: 'Mail Assistant',
        title: 'Mail Assistant 企业邮箱助理',
        subtitle: '配置自建 Microsoft Exchange（EWS + NTLM）连接与文件夹级隐私边界。仅保存草稿、不直接发送、不永久删除。',
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
        changePassword: '修改',
        cancelChange: '取消',
        passwordPlaceholder: '输入 Exchange 密码（仅存宿主凭据服务，不落盘配置文件）',
        probeBtn: '连接并加载文件夹',
        probingBtn: '连接中...',
        probeSuccess: '连接成功，已加载 {count} 个邮件文件夹。',
        sectionAccess: '文件夹权限控制',
        modeLabel: '访问模式',
        modeWhitelist: '白名单（仅允许勾选的文件夹）',
        modeBlacklist: '黑名单（禁止勾选的文件夹及其子目录）',
        folderTreeLabel: '文件夹权限',
        folderEmpty: '点击「连接并加载文件夹」拉取 Exchange 目录树，或在下方手动添加文件夹路径。',
        addFolderPlaceholder: '手动添加路径，例如 认证项目/Widevine',
        addFolderBtn: '添加',
        badgeAllowed: '允许',
        badgeDenied: '禁止',
        emergencyLockLabel: '紧急锁定（禁止 Agent 访问所有文件夹）',
        emergencyLockHint: '启用后，所有邮箱工具调用将在发起请求前立即返回 PERM_001。',
        saveBtn: '保存',
        savingBtn: '保存中...',
        resetBtn: '重置为默认',
        savedSuccess: '配置已保存，新权限策略即时生效，无需重启。',
        resetSuccess: '已重置为默认访问策略（黑名单模式、空列表、关闭紧急锁定）。',
        limitsTitle: '当前运行时上限（来自 profile patch 配置）',
        limitsSummary: '搜索上限：{search} 条 · 附件上限：{att} MB · 正文上限：{body} 字符 · 超时：{timeout}s · 触发词：{prefix}',
        loadError: '加载 Mail Assistant 状态失败：{msg}',
        triggerSection: 'Mail Assistant',
        triggerDescription: '在本会话按需启用 Exchange 邮箱工具（仅草稿，不发送）',
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
        max-width: 720px;
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
      .dsh-ex-card-title {
        margin: 0;
        font-size: 13px;
        font-weight: 600;
        color: var(--dsw-alias-label-primary, #111827);
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
      .dsh-ex-hint {
        font-size: 11px;
        color: var(--dsw-alias-label-tertiary, #6b7280);
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
        transition: background-color 120ms ease;
      }
      .dsh-ex-btn:hover:not(:disabled) {
        background: var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.1));
      }
      .dsh-ex-btn:disabled {
        opacity: 0.55;
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
      .dsh-ex-banner {
        padding: 8px 12px;
        border-radius: 6px;
        font-size: 12px;
        border: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.2));
      }
      .dsh-ex-banner-ok {
        color: var(--dsw-alias-state-success-primary, #16a34a);
        border-color: var(--dsw-alias-state-success-primary, #16a34a);
      }
      .dsh-ex-banner-err {
        color: var(--dsw-alias-state-error-primary, #dc2626);
        border-color: var(--dsw-alias-state-error-primary, #dc2626);
      }
      .dsh-ex-banner-warn {
        color: var(--dsw-alias-state-warn-label, #d97706);
        border-color: var(--dsw-alias-state-warn-primary, #f59e0b);
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
      .dsh-ex-tree {
        display: flex;
        flex-direction: column;
        gap: 4px;
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
      .dsh-ex-folder-name {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .dsh-ex-pill {
        font-size: 11px;
        font-weight: 500;
        padding: 1px 7px;
        border-radius: 999px;
        border: 1px solid transparent;
        flex-shrink: 0;
      }
      .dsh-ex-pill-allow {
        color: var(--dsw-alias-state-success-primary, #16a34a);
        border-color: var(--dsw-alias-state-success-primary, #16a34a);
      }
      .dsh-ex-pill-deny {
        color: var(--dsw-alias-state-error-primary, #dc2626);
        border-color: var(--dsw-alias-state-error-primary, #dc2626);
      }
      .dsh-ex-pill-neutral {
        color: var(--dsw-alias-label-secondary, #6b7280);
        border-color: var(--dsw-alias-border-l3, rgba(128,128,128,0.3));
      }
      .dsh-ex-lock-box {
        display: flex;
        flex-direction: column;
        gap: 4px;
        padding: 10px 12px;
        border-radius: 8px;
        border: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.2));
      }
      .dsh-ex-actions {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .dsh-ex-limits {
        font-size: 11px;
        color: var(--dsw-alias-label-tertiary, #6b7280);
      }
    `;

    function normalizePath(p) {
      return String(p || '')
        .trim()
        .replace(/\\/g, '/')
        .replace(/\/+/g, '/')
        .replace(/^\/+|\/+$/g, '');
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

    function ExchangeSettingsPanel(props) {
      const t = props.t || ((k) => k);
      const [loading, setLoading] = useState(true);
      const [serverUrl, setServerUrl] = useState('');
      const [email, setEmail] = useState('');
      const [domain, setDomain] = useState('');
      const [username, setUsername] = useState('');
      const [passwordSet, setPasswordSet] = useState(false);
      const [passwordSource, setPasswordSource] = useState('none');
      const [editingPassword, setEditingPassword] = useState(false);
      const [passwordInput, setPasswordInput] = useState('');

      const [mode, setMode] = useState('blacklist');
      const [selectedFolders, setSelectedFolders] = useState([]);
      const [knownFolders, setKnownFolders] = useState([]);
      const [manualFolder, setManualFolder] = useState('');
      const [emergencyLock, setEmergencyLock] = useState(false);
      const [limits, setLimits] = useState(null);

      const [probing, setProbing] = useState(false);
      const [saving, setSaving] = useState(false);
      const [feedback, setFeedback] = useState(null); // { tone: 'ok' | 'err' | 'warn', text: string }

      const loadStatus = useCallback(async () => {
        setLoading(true);
        try {
          const resp = await fetch('dsh-exchange/api/status', { method: 'GET' });
          const data = await readJsonSafely(resp);
          if (!resp.ok || !data.ok) {
            throw new Error(data.message || `HTTP ${resp.status}`);
          }
          setServerUrl(data.account?.serverUrl || '');
          setEmail(data.account?.email || '');
          setDomain(data.account?.domain || '');
          setUsername(data.account?.username || '');
          setPasswordSet(Boolean(data.passwordSet));
          setPasswordSource(data.passwordSource || 'none');
          setMode(data.access?.mode === 'whitelist' ? 'whitelist' : 'blacklist');
          const savedFolders = Array.isArray(data.access?.folders) ? data.access.folders : [];
          setSelectedFolders(savedFolders);
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
          setLimits(data.limits || null);
        } catch (err) {
          setFeedback({ tone: 'err', text: t('loadError', { msg: err?.message || String(err) }) });
        } finally {
          setLoading(false);
        }
      }, [t]);

      useEffect(() => {
        void loadStatus();
      }, [loadStatus]);

      const allKnownPaths = useMemo(() => {
        const set = new Set();
        for (const f of knownFolders) set.add(f.path);
        for (const p of selectedFolders) set.add(p);
        return Array.from(set).sort((a, b) => a.localeCompare(b));
      }, [knownFolders, selectedFolders]);

      const selectedSet = useMemo(() => new Set(selectedFolders), [selectedFolders]);

      const handleProbe = async () => {
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
            setFeedback({
              tone: 'err',
              text: `${data.error ? '[' + data.error + '] ' : ''}${data.message || `HTTP ${resp.status}`}`,
            });
            return;
          }
          const loaded = Array.isArray(data.folders) ? data.folders : [];
          setKnownFolders(loaded);
          setFeedback({ tone: 'ok', text: t('probeSuccess', { count: String(loaded.length) }) });
        } catch (err) {
          setFeedback({ tone: 'err', text: err?.message || String(err) });
        } finally {
          setProbing(false);
        }
      };

      const handleSave = async () => {
        setFeedback(null);
        setSaving(true);
        try {
          const payload = {
            account: { serverUrl, email, domain, username },
            access: { mode, folders: selectedFolders, emergencyLock },
          };
          if (editingPassword && passwordInput) {
            payload.password = passwordInput;
          }
          const resp = await fetch('dsh-exchange/api/save', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload),
          });
          const data = await readJsonSafely(resp);
          if (!resp.ok || !data.ok) {
            setFeedback({
              tone: 'err',
              text: `${data.error ? '[' + data.error + '] ' : ''}${data.message || `HTTP ${resp.status}`}`,
            });
            return;
          }
          setPasswordSet(Boolean(data.passwordSet));
          setPasswordSource(data.passwordSource || 'none');
          setEditingPassword(false);
          setPasswordInput('');
          setFeedback({ tone: 'ok', text: t('savedSuccess') });
        } catch (err) {
          setFeedback({ tone: 'err', text: err?.message || String(err) });
        } finally {
          setSaving(false);
        }
      };

      const handleReset = async () => {
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
            setFeedback({ tone: 'err', text: data.message || `HTTP ${resp.status}` });
            return;
          }
          setMode('blacklist');
          setSelectedFolders([]);
          setEmergencyLock(false);
          setFeedback({ tone: 'ok', text: t('resetSuccess') });
        } catch (err) {
          setFeedback({ tone: 'err', text: err?.message || String(err) });
        } finally {
          setSaving(false);
        }
      };

      const handleAddManualFolder = () => {
        const clean = normalizePath(manualFolder);
        if (!clean) return;
        const segs = clean.split('/');
        setKnownFolders((prev) => (prev.some((f) => f.path === clean) ? prev : [...prev, { path: clean, name: segs[segs.length - 1] }]));
        setSelectedFolders((prev) => (prev.includes(clean) ? prev : [...prev, clean]));
        setManualFolder('');
      };

      const passwordBadgeText = passwordSet
        ? (passwordSource === 'env' ? t('passwordSetEnv') : t('passwordSetCred'))
        : t('passwordUnset');

      return h(
        'div',
        { className: 'dsh-ex-root', 'data-testid': 'dsh-exchange-settings' },
        h('style', null, STYLES),
        h(
          'div',
          { className: 'dsh-ex-header' },
          h('h2', { className: 'dsh-ex-title' }, t('title')),
          h('p', { className: 'dsh-ex-subtitle' }, t('subtitle')),
        ),
        feedback
          ? h(
              'div',
              {
                role: 'status',
                className: `dsh-ex-banner ${feedback.tone === 'ok' ? 'dsh-ex-banner-ok' : feedback.tone === 'warn' ? 'dsh-ex-banner-warn' : 'dsh-ex-banner-err'}`,
              },
              feedback.text,
            )
          : null,
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
              className: 'dsh-ex-input',
              type: 'url',
              value: serverUrl,
              placeholder: t('serverUrlPlaceholder'),
              disabled: loading,
              onChange: (e) => setServerUrl(e.target.value),
            }),
            h('span', { className: 'dsh-ex-hint' }, t('httpsHint')),
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
              disabled: loading,
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
                disabled: loading,
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
                disabled: loading,
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
              h(
                'button',
                {
                  type: 'button',
                  className: 'dsh-ex-btn',
                  onClick: () => {
                    setEditingPassword((v) => !v);
                    setPasswordInput('');
                  },
                },
                editingPassword ? t('cancelChange') : t('changePassword'),
              ),
            ),
            editingPassword
              ? h('input', {
                  id: 'dsh-ex-password',
                  className: 'dsh-ex-input',
                  type: 'password',
                  autoComplete: 'new-password',
                  value: passwordInput,
                  placeholder: t('passwordPlaceholder'),
                  onChange: (e) => setPasswordInput(e.target.value),
                })
              : null,
          ),
          h(
            'div',
            { className: 'dsh-ex-inline' },
            h(
              'button',
              {
                type: 'button',
                className: 'dsh-ex-btn',
                disabled: loading || probing || !serverUrl.trim(),
                onClick: handleProbe,
              },
              probing ? t('probingBtn') : t('probeBtn'),
            ),
          ),
        ),
        h(
          'section',
          { className: 'dsh-ex-card' },
          h('h3', { className: 'dsh-ex-card-title' }, t('sectionAccess')),
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
            allKnownPaths.length === 0
              ? h('div', { className: 'dsh-ex-hint' }, t('folderEmpty'))
              : h(
                  'div',
                  { className: 'dsh-ex-tree', role: 'list' },
                  ...allKnownPaths.map((path) => {
                    const segs = path.split('/');
                    const depth = Math.max(0, segs.length - 1);
                    const leaf = segs[segs.length - 1] || path;
                    const checked = selectedSet.has(path);
                    const allowed = computeRowAllowed(path, mode, selectedSet, emergencyLock);
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
                        { className: 'dsh-ex-folder-left', title: path },
                        h('input', {
                          type: 'checkbox',
                          checked,
                          onChange: (e) => {
                            const nextChecked = e.target.checked;
                            setSelectedFolders((prev) => toggleFolderSelection(prev, path, nextChecked, allKnownPaths));
                          },
                        }),
                        h('span', { className: 'dsh-ex-folder-name' }, leaf),
                      ),
                      h(
                        'span',
                        { className: `dsh-ex-pill ${allowed ? 'dsh-ex-pill-allow' : 'dsh-ex-pill-deny'}` },
                        allowed ? t('badgeAllowed') : t('badgeDenied'),
                      ),
                    );
                  }),
                ),
            h(
              'div',
              { className: 'dsh-ex-inline' },
              h('input', {
                className: 'dsh-ex-input',
                style: { flex: 1 },
                type: 'text',
                value: manualFolder,
                placeholder: t('addFolderPlaceholder'),
                onChange: (e) => setManualFolder(e.target.value),
                onKeyDown: (e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddManualFolder();
                  }
                },
              }),
              h(
                'button',
                {
                  type: 'button',
                  className: 'dsh-ex-btn',
                  disabled: !manualFolder.trim(),
                  onClick: handleAddManualFolder,
                },
                t('addFolderBtn'),
              ),
            ),
          ),
          h(
            'div',
            { className: `dsh-ex-lock-box ${emergencyLock ? 'dsh-ex-banner-warn' : ''}` },
            h(
              'label',
              { className: 'dsh-ex-radio-row' },
              h('input', {
                type: 'checkbox',
                checked: emergencyLock,
                onChange: (e) => setEmergencyLock(e.target.checked),
              }),
              t('emergencyLockLabel'),
            ),
            h('span', { className: 'dsh-ex-hint' }, t('emergencyLockHint')),
          ),
        ),
        h(
          'div',
          { className: 'dsh-ex-actions' },
          h(
            'button',
            {
              type: 'button',
              className: 'dsh-ex-btn dsh-ex-btn-primary',
              disabled: loading || saving,
              onClick: handleSave,
            },
            saving ? t('savingBtn') : t('saveBtn'),
          ),
          h(
            'button',
            {
              type: 'button',
              className: 'dsh-ex-btn',
              disabled: loading || saving,
              onClick: handleReset,
            },
            t('resetBtn'),
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
      );
    }

    function BundleConfigWrapper(props) {
      if (props && props.view === 'summary') {
        return null;
      }
      return h(ExchangeSettingsPanel, props);
    }

    return {
      inject: ['slots', 'locale'],
      __toggleFolderSelection: toggleFolderSelection,
      apply(ctx) {
        ctx.effect(
          () => ctx.locale.register(NS, DICTIONARIES),
          'dsh-exchange: runtime locale dictionaries',
        );
        const t = ctx.locale.bind(NS);

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

        ctx.slots.inject('settings.section.icon', () =>
          ctx.slots.register(
            {
              name: 'settings.section.icon',
              id: SECTION_ID,
            },
            MailSvgIcon,
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
          const mailSource = {
            trigger: '@',
            name: 'mail',
            order: -10,
            showGroupTitle: false,
            async candidates(_session, req) {
              if (req && req.quoted) return [];
              const q = String((req && req.query) || '').trim().toLowerCase();
              if (q !== '' && !'mail'.includes(q)) return [];
              return [
                {
                  name: 'mail',
                  label: 'mail',
                  description: t('triggerDescription'),
                  icon: MailSvgIcon,
                  section: t('triggerSection'),
                },
              ];
            },
            lexicon() {
              return ['mail'];
            },
            onPick() {
              return { text: '@mail ' };
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
