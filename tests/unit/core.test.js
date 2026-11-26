import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, stat, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { HarnessError } from '@deepseek-ai/dsh-error'
import { credentialKey } from '@deepseek-ai/dsh-credentials'

import { ExchangeError, ERROR_CODES, isAbortError, throwIfAborted } from '../../src/errors.js'
import { Config, resolveConfig } from '../../src/config.js'
import {
  STATE_VERSION,
  defaultState,
  normalizeState,
  validateServerUrl,
  readState,
  writeState,
  getPassword,
  describePassword,
  setPassword,
  clearPassword,
} from '../../src/state.js'

test('ExchangeError extends HarnessError and preserves code and details', () => {
  const err = new ExchangeError(ERROR_CODES.AUTH_001, 'Authentication failed', { user: 'alice' })
  assert.ok(err instanceof Error)
  assert.ok(err instanceof HarnessError)
  assert.equal(err.name, 'ExchangeError')
  assert.equal(err.code, 'AUTH_001')
  assert.equal(err.message, 'Authentication failed')
  assert.deepEqual(err.details, { user: 'alice' })
  assert.deepEqual(Object.keys(ERROR_CODES).sort(), [
    'ATT_001',
    'AUTH_001',
    'EMAIL_001',
    'NET_001',
    'PERM_001',
    'RATE_001',
  ])
})

test('isAbortError and throwIfAborted preserve raw AbortError', () => {
  const abortErr = new DOMException('cancelled', 'AbortError')
  assert.equal(isAbortError(abortErr), true)
  assert.equal(isAbortError(new Error('normal')), false)

  const ac = new AbortController()
  assert.doesNotThrow(() => throwIfAborted(ac.signal))
  ac.abort(abortErr)
  assert.throws(
    () => throwIfAborted(ac.signal),
    (err) => err === abortErr && !(err instanceof ExchangeError),
  )
})

test('Config schema applies defaults and resolveConfig clamps boundaries', () => {
  const parsed = Config({})
  assert.equal(parsed.limits.max_search_results, 100)
  assert.equal(parsed.limits.max_attachment_mb, 25)
  assert.equal(parsed.limits.max_body_chars, 20000)
  assert.equal(parsed.limits.request_timeout_seconds, 30)
  assert.equal(parsed.trigger.explicit_prefix, '@mail')

  const resolved = resolveConfig({
    limits: {
      max_search_results: 9999,
      max_attachment_mb: 100,
      max_body_chars: 5000,
      request_timeout_seconds: 999,
    },
    trigger: { explicit_prefix: '  @mail  ' },
    data_dir: '/tmp/custom-dsh-exchange',
  })
  assert.equal(resolved.maxSearchResults, 500)
  assert.equal(resolved.maxAttachmentMb, 25)
  assert.equal(resolved.maxAttachmentBytes, 25 * 1024 * 1024)
  assert.equal(resolved.maxBodyChars, 5000)
  assert.equal(resolved.requestTimeoutSeconds, 300)
  assert.equal(resolved.requestTimeoutMs, 300000)
  assert.equal(resolved.explicitPrefix, '@mail')
  assert.equal(resolved.dataDir, '/tmp/custom-dsh-exchange')
})

test('validateServerUrl strictly enforces https and rejects http', () => {
  assert.equal(
    validateServerUrl('https://exchange.company.com/EWS/Exchange.asmx'),
    'https://exchange.company.com/EWS/Exchange.asmx',
  )
  assert.throws(
    () => validateServerUrl('http://exchange.company.com/EWS/Exchange.asmx'),
    (err) => err instanceof ExchangeError && err.code === ERROR_CODES.NET_001,
  )
  assert.throws(
    () => validateServerUrl('not-a-url'),
    (err) => err instanceof ExchangeError && err.code === ERROR_CODES.NET_001,
  )
})

test('readState returns default on ENOENT; writeState writes atomically with 0600 mode and strips secrets', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-ex-state-'))
  try {
    const statePath = join(dir, 'nested', 'state.json')
    const initial = await readState(statePath)
    assert.deepEqual(initial, defaultState())
    assert.equal(initial.version, STATE_VERSION)
    assert.equal(initial.access.mode, 'blacklist')
    assert.deepEqual(initial.access.folders, [])
    assert.equal(initial.access.emergencyLock, false)
    assert.deepEqual(initial.ui, { showSidebarEntry: true })
    assert.deepEqual(normalizeState({}).ui, { showSidebarEntry: true })
    assert.deepEqual(normalizeState({ ui: { showSidebarEntry: false } }).ui, { showSidebarEntry: false })

    await writeState(statePath, {
      version: '1.1.0',
      account: {
        serverUrl: 'https://exchange.company.com/EWS/Exchange.asmx',
        email: 'user@company.com',
        domain: 'COMPANY',
        username: 'user123',
        password: 'LEAKED-SECRET-SHOULD-BE-STRIPPED',
      },
      access: {
        mode: 'whitelist',
        folders: ['收件箱', '认证项目/Widevine', '收件箱'],
        emergencyLock: false,
      },
      ui: {
        showSidebarEntry: false,
      },
    })

    const rawText = await readFile(statePath, 'utf8')
    assert.doesNotMatch(rawText, /LEAKED-SECRET/)
    const fileStat = await stat(statePath)
    assert.equal(fileStat.mode & 0o777, 0o600)

    const reread = await readState(statePath)
    assert.equal(reread.account.serverUrl, 'https://exchange.company.com/EWS/Exchange.asmx')
    assert.deepEqual(reread.access.folders, ['收件箱', '认证项目/Widevine'])
    assert.equal('password' in reread.account, false)
    assert.deepEqual(reread.ui, { showSidebarEntry: false })

    await assert.rejects(
      () => writeState(statePath, {
        ...reread,
        account: { ...reread.account, serverUrl: 'http://exchange.company.com/EWS/Exchange.asmx' },
      }),
      (err) => err instanceof ExchangeError && err.code === ERROR_CODES.NET_001,
    )
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('password helpers use ctx.credentials and prioritize DSH_EXCHANGE_PASSWORD env override', async () => {
  const store = new Map()
  const key = credentialKey('dsh-exchange', 'account')
  const ctx = {
    credentials: {
      async readRecord(k) { return store.get(k) },
      async describeRecord(k) {
        const rec = store.get(k)
        return { configured: Boolean(rec), kind: rec?.kind, writable: true }
      },
      async modifyRecord(k, mutate) {
        const next = await mutate(store.get(k))
        if (next !== undefined) store.set(k, next)
        return next
      },
      async deleteRecord(k) { store.delete(k) },
    },
  }

  assert.equal(await getPassword(ctx, {}), undefined)
  assert.deepEqual(await describePassword(ctx, {}), { configured: false, source: 'none' })

  await setPassword(ctx, 'cred-pass-123')
  assert.equal(store.has(key), true)
  assert.equal(await getPassword(ctx, {}), 'cred-pass-123')
  assert.deepEqual(await describePassword(ctx, {}), { configured: true, source: 'credentials' })

  assert.equal(await getPassword(ctx, { DSH_EXCHANGE_PASSWORD: 'env-pass-456' }), 'env-pass-456')
  assert.deepEqual(
    await describePassword(ctx, { DSH_EXCHANGE_PASSWORD: 'env-pass-456' }),
    { configured: true, source: 'env' },
  )

  await clearPassword(ctx)
  assert.equal(await getPassword(ctx, {}), undefined)
  assert.deepEqual(await describePassword(ctx, {}), { configured: false, source: 'none' })
})
