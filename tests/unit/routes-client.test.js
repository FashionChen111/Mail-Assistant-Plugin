import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { mkdtemp, rm, readFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import vm from 'node:vm'

import { ROUTE_PATHS, registerExchangeRoutes } from '../../src/routes.js'
import { readState } from '../../src/state.js'

function createMockReqRes({ method = 'GET', headers = {}, body = '' } = {}) {
  const req = new EventEmitter()
  req.method = method
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

test('HTTP routes enforce trust fence, method/content-type/size guards, HTTPS, credential isolation, probe, and save/reset', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-ex-routes-'))
  try {
    const statePath = join(dir, 'state.json')
    const routes = new Map()
    const credStore = new Map()
    let rejectCode = undefined
    let probeCalls = 0

    const ctx = {
      webServer: {
        register(route) {
          routes.set(route.path, route)
          return () => routes.delete(route.path)
        },
      },
      connection: {
        requestRejection() { return rejectCode },
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

    // Review Focus #4: Trust fence rejection (401/403)
    rejectCode = 403
    {
      const { req, res } = createMockReqRes({ method: 'GET' })
      await routes.get(ROUTE_PATHS.status).handler(req, res)
      assert.equal(res._read().statusCode, 403)
    }
    rejectCode = undefined

    // Method not allowed (405)
    {
      const { req, res } = createMockReqRes({ method: 'POST' })
      await routes.get(ROUTE_PATHS.status).handler(req, res)
      assert.equal(res._read().statusCode, 405)
    }

    // Non-JSON content-type -> 415
    {
      const { req, res } = createMockReqRes({ method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}' })
      await routes.get(ROUTE_PATHS.save).handler(req, res)
      assert.equal(res._read().statusCode, 415)
    }

    // Oversized body (> 64 KiB) -> 413
    {
      const { req, res } = createMockReqRes({
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pad: 'x'.repeat(70000) }),
      })
      await routes.get(ROUTE_PATHS.save).handler(req, res)
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
      await routes.get(ROUTE_PATHS.save).handler(req, res)
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
      await routes.get(ROUTE_PATHS.save).handler(req, res)
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
      await routes.get(ROUTE_PATHS.status).handler(req, res)
      const out = res._read()
      assert.equal(out.statusCode, 200)
      assert.equal(out.headers['cache-control'], 'no-store')
      assert.equal(out.json.passwordSet, true)
      assert.equal(out.json.passwordSource, 'credentials')
      assert.equal(out.json.access.mode, 'whitelist')
      assert.doesNotMatch(out.text, /super-secret-password/)
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
      await routes.get(ROUTE_PATHS.probe).handler(req, res)
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
      await routes.get(ROUTE_PATHS.probe).handler(req, res)
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
      await routes.get(ROUTE_PATHS.save).handler(req, res)
      assert.equal(res._read().statusCode, 200)
      const reread = await readState(statePath)
      assert.equal(reread.access.mode, 'blacklist')
      assert.deepEqual(reread.access.folders, [])
      assert.equal(reread.access.emergencyLock, false)
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
      connection: {
        requestRejection() { return undefined },
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
      get connection() { throw new Error('property connection is not declared in inject') },
      get credentials() { throw new Error('property credentials is not declared in inject') },
      effect(fn) { return fn() },
    }

    registerExchangeRoutes(strictCtx, {
      statePath,
      config: { maxSearchResults: 100, maxAttachmentMb: 25, maxBodyChars: 20000, requestTimeoutSeconds: 30, requestTimeoutMs: 30000, explicitPrefix: '@mail' },
      env: {},
    })

    const { req, res } = createMockReqRes({ method: 'GET' })
    await routes.get(ROUTE_PATHS.status).handler(req, res)
    const out = res._read()
    assert.equal(out.statusCode, 200)
    assert.equal(out.json.ok, true)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('checkTrustFence fails closed with 403 when connection service is unavailable', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-ex-trust-closed-'))
  try {
    const statePath = join(dir, 'state.json')
    const routes = new Map()
    const ctxNoConn = {
      webServer: {
        register(route) { routes.set(route.path, route); return () => {} },
      },
      effect(fn) { return fn() },
    }
    registerExchangeRoutes(ctxNoConn, {
      statePath,
      config: { maxSearchResults: 100, maxAttachmentMb: 25, maxBodyChars: 20000, requestTimeoutSeconds: 30, requestTimeoutMs: 30000, explicitPrefix: '@mail' },
      env: {},
    })
    for (const [path, method] of [[ROUTE_PATHS.status, 'GET'], [ROUTE_PATHS.probe, 'POST'], [ROUTE_PATHS.save, 'POST']]) {
      const { req, res } = createMockReqRes({ method, headers: { 'content-type': 'application/json' }, body: '{}' })
      await routes.get(path).handler(req, res)
      assert.equal(res._read().statusCode, 403, `${path} must fail closed when connection service is absent`)
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

  // Verify settings.section, settings.section.icon, and plugins.bundle.config
  assert.ok(slotRegistrations.some((r) => r.opts.name === 'settings.section' && r.opts.id === 'dsh-exchange'))
  assert.ok(slotRegistrations.some((r) => r.opts.name === 'settings.section.icon' && r.opts.id === 'dsh-exchange'))
  assert.ok(slotRegistrations.some((r) => r.opts.name === 'plugins.bundle.config' && r.opts.key === '@local/dsh-exchange'))

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
