import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { mkdtemp, rm, readFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import vm from 'node:vm'

import { ROUTE_PATHS, registerExchangeRoutes } from '../../src/routes.js'
import { readState } from '../../src/state.js'

const ownerPeer = { principal: { kind: 'owner' }, signal: new AbortController().signal }

function createMockReqRes({ method = 'GET', url = '', headers = {}, body = '' } = {}) {
  const req = new EventEmitter()
  req.method = method
  req.url = url
  req.headers = headers
  req.resume = () => {}
  req[Symbol.asyncIterator] = async function* () {
    if (body) {
      yield Buffer.isBuffer(body) ? body : Buffer.from(body, 'utf8')
    }
  }

  let statusCode = 200
  const resHeaders = {}
  let responseBody = ''
  const res = {
    get statusCode() { return statusCode },
    set statusCode(v) { statusCode = v },
    setHeader(k, v) { resHeaders[k.toLowerCase()] = v },
    getHeader(k) { return resHeaders[k.toLowerCase()] },
    end(chunk = '') {
      if (chunk) responseBody += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk)
    },
    _read() {
      return {
        statusCode,
        headers: resHeaders,
        text: responseBody,
        json: responseBody ? JSON.parse(responseBody) : null,
      }
    },
  }
  return { req, res }
}

test('HTTP routes enforce method/content-type/size guards, HTTPS, credential isolation, probe, and save/reset', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-ex-routes-'))
  try {
    const statePath = join(dir, 'state.json')
    const routes = new Map()
    const credStore = new Map()
    let probeCalls = 0

    const ctx = {
      webServer: {
        register(route) {
          routes.set(route.path, route)
          return () => routes.delete(route.path)
        },
      },
      credentials: {
        async readRecord(k) { return credStore.get(k) },
        async describeRecord(k) { return { configured: credStore.has(k), kind: credStore.get(k)?.kind, writable: true } },
        async modifyRecord(k, mutate) {
          const next = await mutate(credStore.get(k))
          if (next !== undefined) credStore.set(k, next)
          return next
        },
        async deleteRecord(k) { credStore.delete(k) },
      },
      effect(fn) {
        const d = fn()
        return () => { if (typeof d === 'function') d() }
      },
    }

    registerExchangeRoutes(ctx, {
      statePath,
      config: {
        maxSearchResults: 100,
        maxAttachmentMb: 25,
        maxBodyChars: 20000,
        requestTimeoutSeconds: 30,
        requestTimeoutMs: 30000,
        explicitPrefix: '@mail',
      },
      env: {},
      clientFactory: ({ password }) => ({
        async findFolders() {
          probeCalls++
          if (password === 'bad-pass') {
            throw { status: 401, message: 'Unauthorized' }
          }
          return {
            rootId: 'r',
            folders: [
              { id: '1', parentId: 'r', name: '收件箱', folderClass: 'IPF.Note', isRootChild: true },
              { id: '2', parentId: 'r', name: '认证项目', folderClass: 'IPF.Note', isRootChild: true },
              { id: '3', parentId: '2', name: 'Widevine', folderClass: 'IPF.Note', isRootChild: false },
            ],
          }
        },
      }),
    })

    assert.equal(routes.has(ROUTE_PATHS.status), true)
    assert.equal(routes.has(ROUTE_PATHS.probe), true)
    assert.equal(routes.has(ROUTE_PATHS.save), true)

    // Method not allowed (405)
    {
      const { req, res } = createMockReqRes({ method: 'POST' })
      await routes.get(ROUTE_PATHS.status).handler(req, res, ownerPeer)
      assert.equal(res._read().statusCode, 405)
    }

    // Non-JSON content-type -> 415
    {
      const { req, res } = createMockReqRes({ method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}' })
      await routes.get(ROUTE_PATHS.save).handler(req, res, ownerPeer)
      assert.equal(res._read().statusCode, 415)
    }

    // Oversized body (> 64 KiB) -> 413
    {
      const { req, res } = createMockReqRes({
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pad: 'x'.repeat(70000) }),
      })
      await routes.get(ROUTE_PATHS.save).handler(req, res, ownerPeer)
      assert.equal(res._read().statusCode, 413)
    }

    // Save rejects http:// with 400 + NET_001
    {
      const { req, res } = createMockReqRes({
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          account: { serverUrl: 'http://exchange.corp/EWS/Exchange.asmx', email: 'a@b.com' },
        }),
      })
      await routes.get(ROUTE_PATHS.save).handler(req, res, ownerPeer)
      const out = res._read()
      assert.equal(out.statusCode, 400)
      assert.equal(out.json.error, 'NET_001')
    }

    // Save valid account + password + whitelist -> password goes to ctx.credentials, NOT state.json
    {
      const { req, res } = createMockReqRes({
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          account: {
            serverUrl: 'https://exchange.corp/EWS/Exchange.asmx',
            email: 'alice@corp.com',
            domain: 'CORP',
            username: 'alice',
          },
          password: 'super-secret-password',
          access: {
            mode: 'whitelist',
            folders: ['收件箱', '认证项目', '认证项目/Widevine'],
            emergencyLock: false,
          },
        }),
      })
      await routes.get(ROUTE_PATHS.save).handler(req, res, ownerPeer)
      const out = res._read()
      assert.equal(out.statusCode, 200)
      assert.equal(out.json.ok, true)
      assert.equal(out.json.passwordSet, true)
      assert.doesNotMatch(out.text, /super-secret-password/)
    }

    const rawStateFile = await readFile(statePath, 'utf8')
    assert.doesNotMatch(rawStateFile, /super-secret-password/)
    assert.equal((await stat(statePath)).mode & 0o777, 0o600)

    // GET /status never leaks password
    {
      const { req, res } = createMockReqRes({ method: 'GET' })
      await routes.get(ROUTE_PATHS.status).handler(req, res, ownerPeer)
      const out = res._read()
      assert.equal(out.statusCode, 200)
      assert.equal(out.headers['cache-control'], 'no-store')
      assert.equal(out.json.passwordSet, true)
      assert.equal(out.json.passwordSource, 'credentials')
      assert.equal(out.json.access.mode, 'whitelist')
      assert.deepEqual(out.json.ui, { showSidebarEntry: true })
      assert.doesNotMatch(out.text, /super-secret-password/)
    }

    // Partial POST /save with { ui: { showSidebarEntry: false } } preserves account & access
    {
      const { req, res } = createMockReqRes({
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ui: { showSidebarEntry: false } }),
      })
      await routes.get(ROUTE_PATHS.save).handler(req, res, ownerPeer)
      const out = res._read()
      assert.equal(out.statusCode, 200)
      assert.deepEqual(out.json.state.ui, { showSidebarEntry: false })
      assert.equal(out.json.state.account.email, 'alice@corp.com')
      assert.equal(out.json.state.access.mode, 'whitelist')
      assert.deepEqual(out.json.state.access.folders, ['收件箱', '认证项目', '认证项目/Widevine'])
    }

    // POST /probe without re-sending password falls back to stored credential and returns folder list
    {
      const { req, res } = createMockReqRes({
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          serverUrl: 'https://exchange.corp/EWS/Exchange.asmx',
          email: 'alice@corp.com',
          domain: 'CORP',
          username: 'alice',
        }),
      })
      await routes.get(ROUTE_PATHS.probe).handler(req, res, ownerPeer)
      const out = res._read()
      assert.equal(out.statusCode, 200)
      assert.equal(out.json.ok, true)
      assert.equal(probeCalls, 1)
      assert.deepEqual(out.json.folders.map((f) => f.path), ['收件箱', '认证项目', '认证项目/Widevine'])
    }

    // POST /probe with bad password -> 401 AUTH_001
    {
      const { req, res } = createMockReqRes({
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          serverUrl: 'https://exchange.corp/EWS/Exchange.asmx',
          email: 'alice@corp.com',
          password: 'bad-pass',
        }),
      })
      await routes.get(ROUTE_PATHS.probe).handler(req, res, ownerPeer)
      const out = res._read()
      assert.equal(out.statusCode, 401)
      assert.equal(out.json.error, 'AUTH_001')
    }

    // POST /save with reset: true resets access to default blacklist
    {
      const { req, res } = createMockReqRes({
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reset: true }),
      })
      await routes.get(ROUTE_PATHS.save).handler(req, res, ownerPeer)
      assert.equal(res._read().statusCode, 200)
      const reread = await readState(statePath)
      assert.equal(reread.access.mode, 'blacklist')
      assert.deepEqual(reread.access.folders, [])
      assert.equal(reread.access.emergencyLock, false)
      assert.deepEqual(reread.ui, { showSidebarEntry: false })
    }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('HTTP routes use ctx.get() before property access so Cordis 4 undeclared-service getters never throw', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-ex-cordis-'))
  try {
    const statePath = join(dir, 'state.json')
    const routes = new Map()
    const services = {
      webServer: {
        register(route) { routes.set(route.path, route); return () => {} },
      },
      credentials: {
        async readRecord() { return undefined },
        async describeRecord() { return { configured: false, writable: true } },
      },
    }
    // Simulate Cordis 4 strict property getter throwing when accessed directly without ctx.get()
    const strictCtx = {
      get(name) { return services[name] },
      get webServer() { return services.webServer },
      get credentials() { throw new Error('property credentials is not declared in inject') },
      effect(fn) { return fn() },
    }

    registerExchangeRoutes(strictCtx, {
      statePath,
      config: { maxSearchResults: 100, maxAttachmentMb: 25, maxBodyChars: 20000, requestTimeoutSeconds: 30, requestTimeoutMs: 30000, explicitPrefix: '@mail' },
      env: {},
    })

    const { req, res } = createMockReqRes({ method: 'GET' })
    await routes.get(ROUTE_PATHS.status).handler(req, res, ownerPeer)
    const out = res._read()
    assert.equal(out.statusCode, 200)
    assert.equal(out.json.ok, true)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('all HTTP routes require host authentication and deny peers other than the owner', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-ex-trust-closed-'))
  try {
    const statePath = join(dir, 'state.json')
    const routes = new Map()
    const ctx = {
      webServer: {
        register(route) { routes.set(route.path, route); return () => {} },
      },
      effect(fn) { return fn() },
    }
    registerExchangeRoutes(ctx, {
      statePath,
      config: { maxSearchResults: 100, maxAttachmentMb: 25, maxBodyChars: 20000, requestTimeoutSeconds: 30, requestTimeoutMs: 30000, explicitPrefix: '@mail' },
      env: {},
    })
    for (const [path, method] of [
      [ROUTE_PATHS.status, 'GET'],
      [ROUTE_PATHS.probe, 'POST'],
      [ROUTE_PATHS.save, 'POST'],
      [ROUTE_PATHS.history, 'GET'],
      [ROUTE_PATHS.historyClear, 'POST'],
    ]) {
      const route = routes.get(path)
      assert.equal(route.auth, 'required', path)
      for (const peer of [undefined, { ...ownerPeer, principal: { kind: 'api' } }]) {
        const { req, res } = createMockReqRes({ method, headers: { 'content-type': 'application/json' }, body: '{}' })
        await route.handler(req, res, peer)
        assert.equal(res._read().statusCode, 403, path)
      }
    }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('HTTP history routes serve merged activity/audit records with filtering and clear without touching audit.jsonl', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-ex-history-routes-'))
  try {
    const statePath = join(dir, 'state.json')
    const auditPath = join(dir, 'audit.jsonl')
    const activityPath = join(dir, 'activity.jsonl')
    const { createAuditLogger } = await import('../../src/security/audit.js')
    const { createActivityLogger } = await import('../../src/activity.js')

    const audit = createAuditLogger(auditPath)
    const activity = createActivityLogger(activityPath)
    await audit.log({
      ts: '2026-11-26T08:00:00.000Z',
      action: 'list_folders',
      outcome: 'ok',
      count: 43,
      elapsedMs: 55,
    })
    await activity.log({
      ts: '2026-11-26T09:00:00.000Z',
      action: 'read_email',
      folder: '收件箱',
      emailId: 'm1',
      outcome: 'ok',
      elapsedMs: 90,
      summary: { subject: 'Widevine Cert Update', from: 'partner@google.com' },
    })
    await activity.log({
      ts: '2026-11-26T09:10:00.000Z',
      action: 'save_draft',
      folder: '草稿箱',
      emailId: 'd1',
      outcome: 'ok',
      elapsedMs: 120,
      summary: { subject: 'Re: Widevine Cert Update', to: ['partner@google.com'], toCount: 1, bodyChars: 210 },
    })

    const routes = new Map()
    const ctx = {
      webServer: {
        register(route) { routes.set(route.path, route); return () => routes.delete(route.path) },
      },
      credentials: {
        async readRecord() { return undefined },
        async describeRecord() { return { configured: false, writable: true } },
      },
      effect(fn) { return fn() },
    }
    registerExchangeRoutes(ctx, {
      statePath,
      auditPath,
      activityPath,
      config: { maxSearchResults: 100, maxAttachmentMb: 25, maxBodyChars: 20000, requestTimeoutSeconds: 30, requestTimeoutMs: 30000, explicitPrefix: '@mail' },
      env: {},
    })

    assert.equal(routes.has(ROUTE_PATHS.history), true)
    assert.equal(routes.has(ROUTE_PATHS.historyClear), true)

    // Method not allowed checks
    {
      const { req, res } = createMockReqRes({ method: 'POST', url: '/dsh-exchange/api/history' })
      await routes.get(ROUTE_PATHS.history).handler(req, res, ownerPeer)
      assert.equal(res._read().statusCode, 405)
    }
    {
      const { req, res } = createMockReqRes({ method: 'GET', url: '/dsh-exchange/api/history/clear' })
      await routes.get(ROUTE_PATHS.historyClear).handler(req, res, ownerPeer)
      assert.equal(res._read().statusCode, 405)
    }

    // GET /history unfiltered
    {
      const { req, res } = createMockReqRes({ method: 'GET', url: '/dsh-exchange/api/history?limit=10' })
      await routes.get(ROUTE_PATHS.history).handler(req, res, ownerPeer)
      const out = res._read()
      assert.equal(out.statusCode, 200)
      assert.equal(out.headers['cache-control'], 'no-store')
      assert.equal(out.json.ok, true)
      assert.equal(out.json.total, 3)
      assert.equal(out.json.stats.draft, 1)
      assert.equal(out.json.stats.read, 1)
      assert.equal(out.json.items[0].action, 'save_draft')
      assert.equal(out.json.items[0].summary.subject, 'Re: Widevine Cert Update')
    }

    // GET /history filtered by category=draft&q=widevine
    {
      const { req, res } = createMockReqRes({ method: 'GET', url: '/dsh-exchange/api/history?category=draft&q=widevine' })
      await routes.get(ROUTE_PATHS.history).handler(req, res, ownerPeer)
      const out = res._read()
      assert.equal(out.statusCode, 200)
      assert.equal(out.json.total, 1)
      assert.equal(out.json.unfilteredTotal, 3)
      assert.equal(out.json.items[0].action, 'save_draft')
    }

    // POST /history/clear requires application/json
    {
      const { req, res } = createMockReqRes({ method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}' })
      await routes.get(ROUTE_PATHS.historyClear).handler(req, res, ownerPeer)
      assert.equal(res._read().statusCode, 415)
    }

    // POST /history/clear clears activity history without deleting audit.jsonl
    const auditBefore = await readFile(auditPath, 'utf8')
    {
      const { req, res } = createMockReqRes({ method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
      await routes.get(ROUTE_PATHS.historyClear).handler(req, res, ownerPeer)
      const out = res._read()
      assert.equal(out.statusCode, 200)
      assert.equal(out.json.ok, true)
      assert.ok(typeof out.json.clearedAt === 'string')
    }
    assert.equal(await readFile(auditPath, 'utf8'), auditBefore)

    // Subsequent GET /history returns 0 items
    {
      const { req, res } = createMockReqRes({ method: 'GET', url: '/dsh-exchange/api/history' })
      await routes.get(ROUTE_PATHS.history).handler(req, res, ownerPeer)
      const out = res._read()
      assert.equal(out.statusCode, 200)
      assert.equal(out.json.total, 0)
      assert.deepEqual(out.json.items, [])
    }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('client.js registers via __ModuleLoader__, uses only react, wires settings.section, icon, bundle config, and @mail trigger', async () => {
  const clientCode = await readFile(resolve(import.meta.dirname, '../../client.js'), 'utf8')
  let loaded = null
  const sandbox = {
    window: {
      __ModuleLoader__: {
        load(entry) { loaded = entry },
      },
    },
    console,
    setTimeout,
    clearTimeout,
    URL,
  }
  vm.runInNewContext(clientCode, sandbox, { filename: 'client.js' })
  assert.ok(loaded, 'client.js must call window.__ModuleLoader__.load')
  assert.equal(loaded.id, '@local/dsh-exchange')

  const requiredModules = []
  const fakeReact = {
    createElement(type, props, ...children) { return { type, props, children } },
    useState(init) { return [typeof init === 'function' ? init() : init, () => {}] },
    useEffect() {},
    useCallback(fn) { return fn },
    useMemo(fn) { return fn() },
    useRef(init) { return { current: init } },
  }
  const plugin = loaded.factory((spec) => {
    requiredModules.push(spec)
    if (spec === 'react') return fakeReact
    throw new Error(`Unexpected require: ${spec}`)
  })

  // Must ONLY require 'react' (never @deepseek-ai/dsh-client-ui-primitives)
  assert.deepEqual(requiredModules, ['react'])
  assert.ok(Array.isArray(plugin.inject))
  assert.ok(plugin.inject.includes('slots'))
  assert.ok(plugin.inject.includes('locale'))

  const slotRegistrations = []
  let registeredTrigger = null
  const registeredLocales = {}

  const mockCtx = {
    locale: {
      register(ns, dicts) { registeredLocales[ns] = dicts; return () => {} },
      bind(ns) { return (key) => registeredLocales[ns]?.en?.[key] ?? key },
    },
    slots: {
      inject(_name, cb) { cb(); return () => {} },
      register(opts, component) { slotRegistrations.push({ opts, component }); return () => {} },
    },
    inputTriggers: {
      registerSource(src) { registeredTrigger = src; return () => {} },
    },
    inject(deps, cb) {
      if (deps.includes('inputTriggers')) cb(mockCtx)
      return () => {}
    },
    effect(fn) { fn(); return () => {} },
  }

  plugin.apply(mockCtx)

  // Verify locales
  assert.ok(registeredLocales['dsh-exchange']?.en)
  assert.ok(registeredLocales['dsh-exchange']?.zh)
  // Manual folder path input was removed: keys and copy must not reference manual addition
  assert.equal('addFolderPlaceholder' in registeredLocales['dsh-exchange'].en, false)
  assert.equal('addFolderBtn' in registeredLocales['dsh-exchange'].en, false)
  assert.equal('addFolderPlaceholder' in registeredLocales['dsh-exchange'].zh, false)
  assert.equal('addFolderBtn' in registeredLocales['dsh-exchange'].zh, false)
  assert.doesNotMatch(registeredLocales['dsh-exchange'].en.folderEmpty, /manual/i)
  assert.doesNotMatch(registeredLocales['dsh-exchange'].zh.folderEmpty, /手动/)

  // Verify settings.section, settings.section.icon, and plugins.bundle.config
  const settingsReg = slotRegistrations.find((r) => r.opts.name === 'settings.section' && r.opts.id === 'dsh-exchange')
  assert.ok(settingsReg)
  assert.ok(slotRegistrations.some((r) => r.opts.name === 'settings.section.icon' && r.opts.id === 'dsh-exchange'))
  assert.ok(slotRegistrations.some((r) => r.opts.name === 'plugins.bundle.config' && r.opts.key === '@local/dsh-exchange'))

  // Render ExchangeSettingsPanel tree and verify zero manual folder input or Add button exists
  const renderedSettings = settingsReg.component({ t: (k) => registeredLocales['dsh-exchange'].zh[k] ?? k })
  const walkTree = (node, visit) => {
    if (!node || typeof node !== 'object') return
    visit(node)
    if (Array.isArray(node.children)) {
      for (const child of node.children) walkTree(child, visit)
    }
  }
  const foundManualControls = []
  walkTree(renderedSettings, (node) => {
    if (node.type === 'input' && /manual|手动添加|认证项目\/Widevine/i.test(String(node.props?.placeholder ?? ''))) {
      foundManualControls.push({ type: 'input', placeholder: node.props.placeholder })
    }
    if (node.type === 'button' && Array.isArray(node.children) && node.children.some((c) => c === '添加' || c === 'Add' || c === 'addFolderBtn')) {
      foundManualControls.push({ type: 'button', text: node.children.join('') })
    }
  })
  assert.deepEqual(foundManualControls, [])

  // Verify @mail inputTrigger
  assert.ok(registeredTrigger)
  assert.equal(registeredTrigger.trigger, '@')
  assert.equal(registeredTrigger.name, 'mail')
  assert.equal(registeredTrigger.showGroupTitle, false)
  assert.deepEqual([...registeredTrigger.lexicon()], ['mail'])
  assert.deepEqual({ ...registeredTrigger.onPick() }, { text: '@mail ' })

  const hitsAll = await registeredTrigger.candidates({ sessionId: 's1' }, { query: '', quoted: false })
  assert.equal(hitsAll.length, 1)
  assert.equal(hitsAll[0].name, 'mail')
  const hitsSub = await registeredTrigger.candidates({ sessionId: 's1' }, { query: 'ma', quoted: false })
  assert.equal(hitsSub.length, 1)
  // Prefix matching ONLY: single letters inside "mail" like "a", "i", "l" must NOT hijack file mentions (UX I7)
  for (const nonPrefix of ['a', 'i', 'l', 'ail', 'zzz']) {
    const hitsNon = await registeredTrigger.candidates({ sessionId: 's1' }, { query: nonPrefix, quoted: false })
    assert.equal(hitsNon.length, 0, `query "${nonPrefix}" should not trigger @mail`)
  }
  const hitsQuoted = await registeredTrigger.candidates({ sessionId: 's1' }, { query: 'mail', quoted: true })
  assert.equal(hitsQuoted.length, 0)

  // Verify BundleConfigWrapper passes hideHeader: true (UX I1)
  const bundleReg = slotRegistrations.find((r) => r.opts.name === 'plugins.bundle.config')
  const renderedBundle = bundleReg.component({ view: 'detail', t: (k) => k })
  assert.equal(renderedBundle.props.hideHeader, true)

  // Verify parent->child folder cascade & UX review helpers exported for testability
  assert.equal(typeof plugin.__toggleFolderSelection, 'function')
  const allFolders = ['收件箱', '认证项目', '认证项目/Widevine', '认证项目/AirPlay2', '人事资料']
  const checked = [...plugin.__toggleFolderSelection([], '认证项目', true, allFolders)]
  assert.deepEqual(checked, ['认证项目', '认证项目/Widevine', '认证项目/AirPlay2'])
  const unchecked = [...plugin.__toggleFolderSelection(checked, '认证项目', false, allFolders)]
  assert.deepEqual(unchecked, [])

  // UX I5: Segment-by-segment tree sort keeps parent + children contiguous before hyphenated siblings
  assert.equal(typeof plugin.__sortFolderPaths, 'function')
  const sorted = [...plugin.__sortFolderPaths(['认证项目-归档', '认证项目/Widevine', '认证项目', '认证项目/AirPlay2'])]
  assert.deepEqual(sorted, ['认证项目', '认证项目/AirPlay2', '认证项目/Widevine', '认证项目-归档'])

  // UX C5: Inherited blacklist ancestor detection & whitelist indeterminate parent state
  assert.equal(typeof plugin.__getAncestorBlockedPath, 'function')
  assert.equal(plugin.__getAncestorBlockedPath('认证项目/Widevine', new Set(['认证项目'])), '认证项目')
  assert.equal(plugin.__getAncestorBlockedPath('认证项目', new Set(['认证项目'])), null)
  assert.equal(typeof plugin.__isFolderIndeterminate, 'function')
  assert.equal(
    plugin.__isFolderIndeterminate('认证项目', 'whitelist', new Set(['认证项目/Widevine']), allFolders),
    true,
  )
  assert.equal(
    plugin.__isFolderIndeterminate('认证项目', 'whitelist', new Set(['认证项目', '认证项目/Widevine']), allFolders),
    false,
  )

  // UX I2: Client-side HTTPS validation and localized error mapping
  assert.equal(typeof plugin.__validateClientServerUrl, 'function')
  assert.equal(plugin.__validateClientServerUrl('http://mail.corp/EWS/Exchange.asmx'), 'errHttpsOnly')
  assert.equal(plugin.__validateClientServerUrl('not-a-url'), 'errInvalidUrl')
  assert.equal(plugin.__validateClientServerUrl('https://mail.corp/EWS/Exchange.asmx'), null)

  assert.equal(typeof plugin.__formatApiError, 'function')
  const enT = (key) => registeredLocales['dsh-exchange'].en[key] ?? key
  assert.match(plugin.__formatApiError({ error: 'AUTH_001', message: '中文报错' }, 401, enT), /Authentication failed/i)
  assert.match(plugin.__formatApiError({ error: 'NET_001', details: { protocol: 'http:' }, message: '中文' }, 400, enT), /HTTPS/i)
  assert.match(plugin.__formatApiError({ error: 'NET_001', details: { category: 'tls' }, message: '中文' }, 502, enT), /certificate|TLS/i)
})

test('client.js registers dynamic sidebar.panellist + main page, leaves panel only when active, syncs localStorage & server ui, and renders toggle + Back to Chat', async () => {
  const clientCode = await readFile(resolve(import.meta.dirname, '../../client.js'), 'utf8')

  function loadClientInVm({ storedValue = null, fetchStatusPayload = null } = {}) {
    let loaded = null
    const storageMap = new Map()
    if (storedValue !== null) storageMap.set('dsh-exchange:showSidebarEntry', storedValue)
    const sandbox = {
      window: {
        __ModuleLoader__: {
          load(entry) { loaded = entry },
        },
        localStorage: {
          getItem(k) { return storageMap.has(k) ? storageMap.get(k) : null },
          setItem(k, v) { storageMap.set(k, String(v)) },
          removeItem(k) { storageMap.delete(k) },
        },
      },
      localStorage: {
        getItem(k) { return storageMap.has(k) ? storageMap.get(k) : null },
        setItem(k, v) { storageMap.set(k, String(v)) },
        removeItem(k) { storageMap.delete(k) },
      },
      fetch: async (url) => {
        if (url === 'dsh-exchange/api/status' && fetchStatusPayload) {
          return { ok: true, status: 200, async text() { return JSON.stringify(fetchStatusPayload) } }
        }
        return { ok: false, status: 404, async text() { return '{}' } }
      },
      console,
      setTimeout,
      clearTimeout,
      URL,
    }
    vm.runInNewContext(clientCode, sandbox, { filename: 'client.js' })
    const fakeReact = {
      createElement(type, props, ...children) { return { type, props, children } },
      useState(init) { return [typeof init === 'function' ? init() : init, () => {}] },
      useEffect() {},
      useCallback(fn) { return fn },
      useMemo(fn) { return fn() },
      useRef(init) { return { current: init } },
    }
    const plugin = loaded.factory((spec) => {
      if (spec === 'react') return fakeReact
      throw new Error(`Unexpected require: ${spec}`)
    })
    return { plugin, storageMap }
  }

  function makeMockCtx(initialPanelId = null) {
    const activeSlots = []
    const effectCleanups = []
    let currentPanelId = initialPanelId
    const selectPanelCalls = []
    const registeredLocales = {}
    const layout = {
      panelInfo: { getSnapshot() { return { activePanelId: currentPanelId } } },
      selectPanel(id) {
        selectPanelCalls.push(id)
        currentPanelId = id
      },
    }
    const mockCtx = {
      get(name) {
        if (name === 'layout') return layout
        return undefined
      },
      layout,
      locale: {
        register(ns, dicts) { registeredLocales[ns] = dicts; return () => {} },
        bind(ns) { return (key) => registeredLocales[ns]?.en?.[key] ?? key },
      },
      slots: {
        inject(_name, cb) {
          const innerDispose = cb()
          return () => { if (typeof innerDispose === 'function') innerDispose() }
        },
        register(opts, component) {
          const rec = { opts, component }
          activeSlots.push(rec)
          return () => {
            const idx = activeSlots.indexOf(rec)
            if (idx >= 0) activeSlots.splice(idx, 1)
          }
        },
      },
      inject() { return () => {} },
      effect(fn) {
        const cleanup = fn()
        if (typeof cleanup === 'function') effectCleanups.push(cleanup)
        return () => {}
      },
    }
    return {
      mockCtx,
      activeSlots,
      registeredLocales,
      selectPanelCalls,
      setActivePanelId(id) { currentPanelId = id },
      disposeAll() { for (const fn of effectCleanups) fn() },
    }
  }

  // 1. Default visibility (true): registers sidebar.panellist (order 20) + main (key dsh-exchange)
  {
    const { plugin, storageMap } = loadClientInVm()
    const env = makeMockCtx('dsh-exchange')
    plugin.apply(env.mockCtx)

    const panelEntry = env.activeSlots.find((r) => r.opts.name === 'sidebar.panellist' && r.opts.id === 'dsh-exchange')
    const mainEntry = env.activeSlots.find((r) => r.opts.name === 'main' && r.opts.key === 'dsh-exchange')
    assert.ok(panelEntry, 'sidebar.panellist entry must be registered by default')
    assert.equal(panelEntry.opts.order, 20)
    assert.equal(panelEntry.opts.label(), 'Mail Assistant')
    assert.ok(mainEntry, 'main keyed panel must be registered by default')

    // Verify rendered ExchangeSettingsPanel has role="switch" sidebar shortcut toggle
    const settingsEntry = env.activeSlots.find((r) => r.opts.name === 'settings.section')
    const walk = (node, visit) => {
      if (!node || typeof node !== 'object') return
      visit(node)
      if (Array.isArray(node.children)) {
        for (const c of node.children) walk(c, visit)
      }
    }
    const settingsTree = settingsEntry.component({ t: (k) => env.registeredLocales['dsh-exchange'].en[k] ?? k })
    let foundSwitch = false
    walk(settingsTree, (n) => {
      if (n.props && n.props.role === 'switch') foundSwitch = true
    })
    assert.equal(foundSwitch, true, 'ExchangeSettingsPanel must render a role="switch" sidebar visibility toggle')

    // Verify MailAssistantMainPage renders Back to Chat button calling layout.selectPanel(null)
    const mainTree = mainEntry.component({ t: (k) => env.registeredLocales['dsh-exchange'].en[k] ?? k })
    let backBtn = null
    walk(mainTree, (n) => {
      if (n.type === 'button' && n.props?.className?.includes('dsh-ex-back-btn')) backBtn = n
    })
    assert.ok(backBtn, 'MailAssistantMainPage must render a Back to Chat button')
    backBtn.props.onClick()
    assert.deepEqual(env.selectPanelCalls, [null])

    // 2. Hiding while activePanelId === 'dsh-exchange' calls layout.selectPanel(null) and disposes BOTH slots
    assert.equal(typeof plugin.__getSidebarController, 'function')
    const ctrl = plugin.__getSidebarController()
    env.setActivePanelId('dsh-exchange')
    env.selectPanelCalls.length = 0
    ctrl.setVisible(false)
    assert.deepEqual(env.selectPanelCalls, [null])
    assert.equal(storageMap.get('dsh-exchange:showSidebarEntry'), 'false')
    assert.equal(env.activeSlots.some((r) => r.opts.name === 'sidebar.panellist'), false)
    assert.equal(env.activeSlots.some((r) => r.opts.name === 'main'), false)

    // 3. Showing again re-registers BOTH slots cleanly and is idempotent
    ctrl.setVisible(true)
    ctrl.setVisible(true)
    assert.equal(env.activeSlots.filter((r) => r.opts.name === 'sidebar.panellist').length, 1)
    assert.equal(env.activeSlots.filter((r) => r.opts.name === 'main').length, 1)

    // 4. Hiding while another panel ('plugins') is active MUST NOT call layout.selectPanel(null)
    env.setActivePanelId('plugins')
    env.selectPanelCalls.length = 0
    ctrl.setVisible(false)
    assert.deepEqual(env.selectPanelCalls, [])
    assert.equal(env.activeSlots.some((r) => r.opts.name === 'sidebar.panellist'), false)
    assert.equal(env.activeSlots.some((r) => r.opts.name === 'main'), false)

    // Re-show then test plugin disposal leaves panel only if active
    ctrl.setVisible(true)
    env.setActivePanelId('dsh-exchange')
    env.selectPanelCalls.length = 0
    env.disposeAll()
    assert.deepEqual(env.selectPanelCalls, [null])
    assert.equal(env.activeSlots.some((r) => r.opts.name === 'sidebar.panellist'), false)
    assert.equal(env.activeSlots.some((r) => r.opts.name === 'main'), false)
  }

  // 5. localStorage 'false' suppresses initial registration; server without `ui` preserves localStorage; server with `ui.showSidebarEntry: true` reconciles
  {
    const { plugin } = loadClientInVm({
      storedValue: 'false',
      fetchStatusPayload: { ok: true, account: {}, access: { mode: 'blacklist', folders: [], emergencyLock: false } },
    })
    const env = makeMockCtx(null)
    plugin.apply(env.mockCtx)
    assert.equal(env.activeSlots.some((r) => r.opts.name === 'sidebar.panellist'), false)
    assert.equal(env.activeSlots.some((r) => r.opts.name === 'main'), false)
    assert.equal(env.activeSlots.some((r) => r.opts.name === 'settings.section'), true)
    assert.equal(env.activeSlots.some((r) => r.opts.name === 'plugins.bundle.config'), true)

    const ctrl = plugin.__getSidebarController()
    // Older backend omitting `ui` must NOT clobber localStorage 'false'
    ctrl.syncFromServer({ ok: true, account: {}, access: {} })
    assert.equal(ctrl.getSnapshot(), false)
    assert.equal(env.activeSlots.some((r) => r.opts.name === 'sidebar.panellist'), false)

    // Backend explicitly returning `ui: { showSidebarEntry: true }` reconciles and mounts slots
    ctrl.syncFromServer({ ok: true, ui: { showSidebarEntry: true } })
    assert.equal(ctrl.getSnapshot(), true)
    assert.equal(env.activeSlots.some((r) => r.opts.name === 'sidebar.panellist'), true)
    assert.equal(env.activeSlots.some((r) => r.opts.name === 'main'), true)
  }

  // 6. Runtime switch handler inside MailAssistantMainPage: must await POST /save BEFORE unmounting so failures keep panel mounted and show error feedback
  {
    let saveOutcome = { ok: false, status: 500, body: { ok: false, error: 'NET_001', message: 'disk full' } }
    let loaded = null
    const storageMap = new Map()
    const sandbox = {
      window: {
        __ModuleLoader__: { load(entry) { loaded = entry } },
        localStorage: {
          getItem(k) { return storageMap.has(k) ? storageMap.get(k) : null },
          setItem(k, v) { storageMap.set(k, String(v)) },
        },
      },
      localStorage: {
        getItem(k) { return storageMap.has(k) ? storageMap.get(k) : null },
        setItem(k, v) { storageMap.set(k, String(v)) },
      },
      fetch: async (url, opts) => {
        if (url === 'dsh-exchange/api/status') {
          return {
            ok: true,
            status: 200,
            async text() { return JSON.stringify({ ok: true, account: {}, access: { mode: 'blacklist', folders: [], emergencyLock: false }, ui: { showSidebarEntry: true } }) },
          }
        }
        if (url === 'dsh-exchange/api/save' && opts?.method === 'POST') {
          return {
            ok: saveOutcome.ok,
            status: saveOutcome.status,
            async text() { return JSON.stringify(saveOutcome.body) },
          }
        }
        return { ok: false, status: 404, async text() { return '{}' } }
      },
      console,
      setTimeout,
      clearTimeout,
      URL,
    }
    vm.runInNewContext(clientCode, sandbox, { filename: 'client.js' })

    // Stateful minimal React hook runner for ExchangeSettingsPanel
    const states = []
    const refs = []
    let stateIdx = 0
    let refIdx = 0
    const fakeReact = {
      createElement(type, props, ...children) { return { type, props, children } },
      useState(init) {
        const i = stateIdx++
        if (states.length <= i) states.push(typeof init === 'function' ? init() : init)
        return [states[i], (v) => { states[i] = typeof v === 'function' ? v(states[i]) : v }]
      },
      useEffect() {},
      useCallback(fn) { return fn },
      useMemo(fn) { return fn() },
      useRef(init) {
        const i = refIdx++
        if (refs.length <= i) refs.push({ current: init })
        return refs[i]
      },
    }
    const plugin = loaded.factory((spec) => {
      if (spec === 'react') return fakeReact
      throw new Error(`Unexpected require: ${spec}`)
    })
    const env = makeMockCtx('dsh-exchange')
    plugin.apply(env.mockCtx)
    // Flush async boot fetch('dsh-exchange/api/status')
    await new Promise((r) => setTimeout(r, 15))

    const settingsEntry = env.activeSlots.find((r) => r.opts.name === 'settings.section')
    const renderPanel = () => {
      stateIdx = 0
      refIdx = 0
      return settingsEntry.component({ t: (k) => env.registeredLocales['dsh-exchange'].en[k] ?? k })
    }
    const findNode = (tree, pred) => {
      if (!tree || typeof tree !== 'object') return null
      if (pred(tree)) return tree
      if (Array.isArray(tree.children)) {
        for (const c of tree.children) {
          const hit = findNode(c, pred)
          if (hit) return hit
        }
      }
      return null
    }

    // Mark loading=false (state index 0) as after mount status load
    renderPanel()
    states[0] = false
    const tree1 = renderPanel()

    // Verify switch CSS prevents squircle deformation via corner-shape: round
    const styleNode = findNode(tree1, (n) => n.type === 'style')
    assert.match(String(styleNode.children.join('')), /corner-shape:\s*round/)

    const switchBtn1 = findNode(tree1, (n) => n.props?.role === 'switch')
    assert.ok(switchBtn1)

    // Case A: POST /save FAILS (500) -> must NOT leave main panel or dispose slots, and must set error feedback
    await switchBtn1.props.onClick()
    assert.deepEqual(env.selectPanelCalls, [], 'failed POST /save must NOT call layout.selectPanel(null)')
    assert.equal(env.activeSlots.some((r) => r.opts.name === 'main'), true, 'failed POST /save must keep main slot mounted')
    assert.equal(plugin.__getSidebarController().getSnapshot(), true)
    const treeAfterErr = renderPanel()
    const alertBanner = findNode(treeAfterErr, (n) => n.props?.role === 'alert')
    assert.ok(alertBanner, 'failed POST /save must display error feedback banner')

    // Case B: POST /save SUCCEEDS (200) -> leaves active main panel and disposes BOTH slots
    saveOutcome = { ok: true, status: 200, body: { ok: true, state: { ui: { showSidebarEntry: false } } } }
    const switchBtn2 = findNode(treeAfterErr, (n) => n.props?.role === 'switch')
    await switchBtn2.props.onClick()
    assert.deepEqual(env.selectPanelCalls, [null], 'successful hide while active must return to conversation')
    assert.equal(env.activeSlots.some((r) => r.opts.name === 'sidebar.panellist'), false)
    assert.equal(env.activeSlots.some((r) => r.opts.name === 'main'), false)
    assert.equal(storageMap.get('dsh-exchange:showSidebarEntry'), 'false')

    // Case C: Late boot syncFromServer after user explicitly toggled must NOT overwrite user's choice, and disposed controller ignores calls
    const ctrl = plugin.__getSidebarController()
    ctrl.syncFromServer({ ok: true, ui: { showSidebarEntry: true } }, { fromBoot: true })
    assert.equal(ctrl.getSnapshot(), false, 'late boot sync must not clobber explicit user toggle')
    env.disposeAll()
    ctrl.setVisible(true)
    assert.equal(env.activeSlots.some((r) => r.opts.name === 'sidebar.panellist'), false, 'disposed controller must not re-mount slots')
  }
})

test('client.js renders Configuration/Activity History tabs, formats all activity types cleanly, supports filtering & 2-step clear, and handles 404 fallback', async () => {
  const clientCode = await readFile(resolve(import.meta.dirname, '../../client.js'), 'utf8')

  let historyResponse = {
    ok: true,
    status: 200,
    body: {
      ok: true,
      items: [
        {
          id: 'a1',
          ts: '2026-11-26T02:00:00.000Z',
          action: 'save_draft',
          category: 'draft',
          outcome: 'ok',
          code: null,
          folder: '草稿箱',
          emailId: 'draft-1',
          elapsedMs: 185,
          source: 'activity',
          summary: {
            subject: 'Re: Widevine L1 Follow-up',
            to: ['support@google.com'],
            toCount: 1,
            ccCount: 1,
            isReply: true,
            bodyChars: 340,
          },
        },
        {
          id: 'a2',
          ts: '2026-11-26T01:55:00.000Z',
          action: 'read_email',
          category: 'read',
          outcome: 'ok',
          code: null,
          folder: '认证项目/Widevine',
          emailId: 'mail-1',
          elapsedMs: 92,
          source: 'activity',
          summary: {
            subject: 'Widevine L1 Certification Status',
            from: 'support@google.com',
            markAsRead: true,
          },
        },
      ],
      total: 2,
      unfilteredTotal: 2,
      hasMore: false,
      stats: { total: 2, read: 1, draft: 1, search: 0, analyze: 0, modify: 0, denied: 0, error: 0 },
    },
  }
  const fetchCalls = []
  let loaded = null
  const sandbox = {
    window: {
      __ModuleLoader__: { load(entry) { loaded = entry } },
      localStorage: { getItem() { return null }, setItem() {} },
    },
    localStorage: { getItem() { return null }, setItem() {} },
    fetch: async (url, opts) => {
      fetchCalls.push({ url, method: opts?.method || 'GET' })
      if (url === 'dsh-exchange/api/status') {
        return {
          ok: true,
          status: 200,
          async text() { return JSON.stringify({ ok: true, account: {}, access: { mode: 'blacklist', folders: [], emergencyLock: false }, ui: { showSidebarEntry: true } }) },
        }
      }
      if (String(url).startsWith('dsh-exchange/api/history/clear')) {
        historyResponse = {
          ok: true,
          status: 200,
          body: { ok: true, items: [], total: 0, unfilteredTotal: 0, hasMore: false, stats: { total: 0, read: 0, draft: 0, search: 0, analyze: 0, modify: 0, denied: 0, error: 0 } },
        }
        return { ok: true, status: 200, async text() { return JSON.stringify({ ok: true, clearedAt: '2026-11-26T02:10:00.000Z' }) } }
      }
      if (String(url).startsWith('dsh-exchange/api/history')) {
        return {
          ok: historyResponse.ok,
          status: historyResponse.status,
          async text() { return JSON.stringify(historyResponse.body) },
        }
      }
      return { ok: false, status: 404, async text() { return '{}' } }
    },
    console,
    setTimeout,
    clearTimeout,
    URL,
    URLSearchParams,
  }
  vm.runInNewContext(clientCode, sandbox, { filename: 'client.js' })

  const states = []
  const refs = []
  let stateIdx = 0
  let refIdx = 0
  const fakeReact = {
    createElement(type, props, ...children) { return { type, props, children } },
    useState(init) {
      const i = stateIdx++
      if (states.length <= i) states.push(typeof init === 'function' ? init() : init)
      return [states[i], (v) => { states[i] = typeof v === 'function' ? v(states[i]) : v }]
    },
    useEffect() {},
    useCallback(fn) { return fn },
    useMemo(fn) { return fn() },
    useRef(init) {
      const i = refIdx++
      if (refs.length <= i) refs.push({ current: init })
      return refs[i]
    },
  }
  const plugin = loaded.factory((spec) => {
    if (spec === 'react') return fakeReact
    throw new Error(`Unexpected require: ${spec}`)
  })

  const registeredLocales = {}
  const slots = []
  const mockCtx = {
    get() { return undefined },
    locale: {
      register(ns, dicts) { registeredLocales[ns] = dicts; return () => {} },
      bind(ns) { return (key, vars) => {
        let s = registeredLocales[ns]?.zh?.[key] ?? key
        if (vars) {
          for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v))
        }
        return s
      } },
    },
    slots: {
      inject(_n, cb) { cb(); return () => {} },
      register(opts, comp) { slots.push({ opts, comp }); return () => {} },
    },
    inject() { return () => {} },
    effect(fn) { fn(); return () => {} },
  }
  plugin.apply(mockCtx)

  // 1. Verify __formatActivityEntry helper for key activity types in both ZH and EN
  assert.equal(typeof plugin.__formatActivityEntry, 'function')
  const makeT = (lang) => (key, vars) => {
    let s = registeredLocales['dsh-exchange'][lang][key] ?? key
    if (vars) {
      for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v))
    }
    return s
  }
  const zhT = makeT('zh')
  const enT = makeT('en')

  const fmtReadZh = plugin.__formatActivityEntry(historyResponse.body.items[1], zhT)
  assert.match(fmtReadZh.headline, /Widevine L1 Certification Status/)
  assert.match(fmtReadZh.details.join(' '), /support@google\.com/)

  const fmtDraftZh = plugin.__formatActivityEntry(historyResponse.body.items[0], zhT)
  assert.match(fmtDraftZh.headline, /Re: Widevine L1 Follow-up/)
  assert.match(fmtDraftZh.details.join(' '), /support@google\.com/)
  assert.match(fmtDraftZh.details.join(' '), /340/)

  const fmtDeniedDelEn = plugin.__formatActivityEntry({
    action: 'delete_email',
    outcome: 'denied',
    code: 'PERM_001',
    folder: '人事资料',
    source: 'activity',
    summary: { permanentAttempt: true },
  }, enT)
  assert.match(fmtDeniedDelEn.headline, /permanent delete/i)

  const fmtAuditLegacyZh = plugin.__formatActivityEntry({
    action: 'search_emails',
    outcome: 'ok',
    folder: '收件箱',
    count: 6,
    source: 'audit',
    summary: {},
  }, zhT)
  assert.match(fmtAuditLegacyZh.actionLabel, /搜索邮件/)
  assert.match(fmtAuditLegacyZh.details.join(' '), /6/)

  // Legacy list_folders audit row must say folder count ("共 43 个目录"), NOT emails ("返回 43 封")
  const fmtAuditFoldersZh = plugin.__formatActivityEntry({
    action: 'list_folders',
    outcome: 'ok',
    count: 43,
    source: 'audit',
    summary: {},
  }, zhT)
  assert.match(fmtAuditFoldersZh.details.join(' '), /共 43 个目录/)
  assert.doesNotMatch(fmtAuditFoldersZh.details.join(' '), /封/)

  // I6: Blocked/failed tool calls must NOT display completed-action wording or fabricated 0 hit counts
  const fmtBlockedReadZh = plugin.__formatActivityEntry({
    action: 'read_email',
    outcome: 'denied',
    code: 'PERM_001',
    folder: '人事资料',
    source: 'activity',
    summary: { markAsRead: true },
  }, zhT)
  assert.doesNotMatch(fmtBlockedReadZh.details.join(' '), /已读/)

  const fmtBlockedDelEn = plugin.__formatActivityEntry({
    action: 'delete_email',
    outcome: 'denied',
    code: 'PERM_001',
    source: 'activity',
    summary: { permanentAttempt: false },
  }, enT)
  assert.match(fmtBlockedDelEn.headline, /blocked/i)
  assert.doesNotMatch(fmtBlockedDelEn.headline, /Moved email to Deleted Items/i)

  const fmtBlockedThreadEn = plugin.__formatActivityEntry({
    action: 'get_thread',
    outcome: 'denied',
    code: 'PERM_001',
    source: 'activity',
    summary: {},
  }, enT)
  assert.match(fmtBlockedThreadEn.headline, /blocked/i)

  const fmtFailedJiraEn = plugin.__formatActivityEntry({
    action: 'parse_jira_notifications',
    outcome: 'error',
    code: 'NET_001',
    source: 'activity',
    summary: { days: 7 },
  }, enT)
  assert.doesNotMatch(fmtFailedJiraEn.headline, /0 update/)

  // 2. Render ExchangeSettingsPanel and verify tablist + switch to History tab + 2-step clear
  const settingsEntry = slots.find((r) => r.opts.name === 'settings.section')
  const renderPanel = () => {
    stateIdx = 0
    refIdx = 0
    return settingsEntry.comp({ t: zhT })
  }
  const collectNodes = (tree, pred, out = []) => {
    if (!tree || typeof tree !== 'object') return out
    if (pred(tree)) out.push(tree)
    if (Array.isArray(tree.children)) {
      for (const c of tree.children) collectNodes(c, pred, out)
    }
    return out
  }
  const collectText = (tree, parts = []) => {
    if (typeof tree === 'string' || typeof tree === 'number') {
      parts.push(String(tree))
    } else if (tree && typeof tree === 'object' && Array.isArray(tree.children)) {
      for (const c of tree.children) collectText(c, parts)
    }
    return parts.join(' ')
  }

  const initialTree = renderPanel()
  const tabs = collectNodes(initialTree, (n) => n.props?.role === 'tab')
  assert.equal(tabs.length, 2, 'must render Configuration and Activity History tabs')
  assert.equal(tabs[0].props['aria-selected'], true)
  assert.equal(tabs[1].props['aria-selected'], false)

  // Switch to History tab (triggers loadHistory)
  await tabs[1].props.onClick()
  const historyTree = renderPanel()
  const historyTabs = collectNodes(historyTree, (n) => n.props?.role === 'tab')
  assert.equal(historyTabs[1].props['aria-selected'], true)
  const historyText = collectText(historyTree)
  assert.match(historyText, /Widevine L1 Certification Status/)
  assert.match(historyText, /Re: Widevine L1 Follow-up/)
  assert.ok(fetchCalls.some((c) => c.url.startsWith('dsh-exchange/api/history') && c.method === 'GET'))

  // 2-step Clear History confirmation
  const clearBtn = collectNodes(historyTree, (n) => n.type === 'button' && n.props?.['data-testid'] === 'dsh-ex-history-clear-btn')[0]
  assert.ok(clearBtn, 'History tab must render Clear History button')
  clearBtn.props.onClick()
  const confirmTree = renderPanel()
  const confirmClearBtn = collectNodes(confirmTree, (n) => n.type === 'button' && n.props?.['data-testid'] === 'dsh-ex-history-clear-confirm')[0]
  assert.ok(confirmClearBtn, 'Clicking Clear History must show 2-step confirm button')
  await confirmClearBtn.props.onClick()
  assert.ok(fetchCalls.some((c) => c.url === 'dsh-exchange/api/history/clear' && c.method === 'POST'))

  // 3. Graceful 404 handling when running against an older backend without /api/history + no empty role="list"
  historyResponse = { ok: false, status: 404, body: {} }
  const afterClearTree = renderPanel()
  const refreshBtn = collectNodes(afterClearTree, (n) => n.type === 'button' && n.props?.['data-testid'] === 'dsh-ex-history-refresh-btn')[0]
  assert.ok(refreshBtn)
  await refreshBtn.props.onClick()
  const tree404 = renderPanel()
  assert.ok(collectNodes(tree404, (n) => n.props?.role === 'alert').length >= 1, '404 history endpoint must render graceful alert banner')
  assert.equal(collectNodes(tree404, (n) => n.props?.role === 'list').length, 0, '404 history error must not render an empty role="list"')

  // 4. I4: Emergency Lock toggle while viewing Activity History tab must display lock feedback banner above tabs
  states[0] = false // loading=false so Lock button is enabled
  const treeWithLockEnabled = renderPanel()
  const lockBtn = collectNodes(treeWithLockEnabled, (n) => n.type === 'button' && n.props?.className?.includes('dsh-ex-btn-danger') && collectText(n).includes('立即紧急锁定'))[0]
  assert.ok(lockBtn, 'Emergency Lock button must stay visible on Activity History tab')
  await lockBtn.props.onClick()
  const treeAfterLockErr = renderPanel()
  const lockFeedbackAlerts = collectNodes(treeAfterLockErr, (n) => n.props?.role === 'alert' && collectText(n).includes('404'))
  assert.ok(lockFeedbackAlerts.length >= 1, 'Emergency Lock feedback/error must render visibly even when on Activity History tab')
})
