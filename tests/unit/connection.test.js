import test from 'node:test'
import assert from 'node:assert/strict'

import { ExchangeError, ERROR_CODES } from '../../src/errors.js'
import {
  DEFAULT_RETRY_DELAYS_MS,
  formatNtlmUsername,
  mapEwsError,
  withRetry,
  createEwsTransport,
} from '../../src/ews/connection.js'

test('formatNtlmUsername supports DOMAIN\\user, email login, and already-qualified names', () => {
  assert.equal(formatNtlmUsername({ domain: 'COMPANY', username: 'alice', email: 'alice@company.com' }), 'COMPANY\\alice')
  assert.equal(formatNtlmUsername({ domain: '', username: 'alice@company.com', email: 'alice@company.com' }), 'alice@company.com')
  assert.equal(formatNtlmUsername({ domain: 'OTHER', username: 'CORP\\bob', email: 'bob@company.com' }), 'CORP\\bob')
  assert.equal(formatNtlmUsername({ domain: '', username: '', email: 'carol@company.com' }), 'carol@company.com')
  assert.throws(
    () => formatNtlmUsername({ domain: '', username: '', email: '' }),
    (err) => err instanceof ExchangeError && err.code === ERROR_CODES.AUTH_001,
  )
})

test('createEwsTransport enforces HTTPS, requires password, and configures gzip:true + NTLM', () => {
  assert.throws(
    () => createEwsTransport({
      serverUrl: 'http://exchange.company.com/EWS/Exchange.asmx',
      email: 'alice@company.com',
      password: 'secret',
    }),
    (err) => err instanceof ExchangeError && err.code === ERROR_CODES.NET_001,
  )
  assert.throws(
    () => createEwsTransport({
      serverUrl: 'https://exchange.company.com/EWS/Exchange.asmx',
      email: 'alice@company.com',
      password: '',
    }),
    (err) => err instanceof ExchangeError && err.code === ERROR_CODES.AUTH_001,
  )

  const transport = createEwsTransport({
    serverUrl: 'https://exchange.company.com/EWS/Exchange.asmx',
    email: 'alice@company.com',
    domain: 'COMPANY',
    username: 'alice',
    password: 'secret-password',
    timeoutMs: 15000,
  })
  assert.equal(transport.loginUser, 'COMPANY\\alice')
  assert.equal(transport.xhrApi.requestOptions.gzip, true)
  assert.equal(transport.xhrApi.requestOptions.decompress, true)
  assert.equal(transport.xhrApi.requestOptions.timeout, 15000)
  assert.match(transport.xhrApi.apiName, /ntlm/i)
  assert.equal(transport.service.Url.AbsoluteUri, 'https://exchange.company.com/EWS/Exchange.asmx')
})

test('mapEwsError classifies auth, rate limit, not-found, and network failures distinctly', () => {
  assert.equal(mapEwsError({ status: 401, message: 'Unauthorized' }).code, ERROR_CODES.AUTH_001)
  assert.equal(mapEwsError({ status: 403, message: 'Forbidden' }).code, ERROR_CODES.AUTH_001)
  assert.equal(mapEwsError({ message: 'ErrorAccessDenied' }).code, ERROR_CODES.AUTH_001)

  assert.equal(mapEwsError({ status: 429, message: 'Too Many Requests' }).code, ERROR_CODES.RATE_001)
  assert.equal(mapEwsError({ status: 503, message: 'Service Unavailable' }).code, ERROR_CODES.RATE_001)
  assert.equal(mapEwsError({ message: 'ErrorServerBusy: try later' }).code, ERROR_CODES.RATE_001)

  assert.equal(mapEwsError({ message: 'ErrorItemNotFound' }).code, ERROR_CODES.EMAIL_001)
  assert.equal(mapEwsError({ message: 'ErrorFolderNotFound' }).code, ERROR_CODES.EMAIL_001)
  assert.equal(mapEwsError({ message: 'ErrorInvalidIdMalformed' }).code, ERROR_CODES.EMAIL_001)

  const dnsErr = mapEwsError(Object.assign(new Error('getaddrinfo ENOTFOUND mail.corp'), { code: 'ENOTFOUND' }))
  assert.equal(dnsErr.code, ERROR_CODES.NET_001)
  assert.equal(dnsErr.details.category, 'dns')

  const tlsErr = mapEwsError(Object.assign(new Error('self-signed certificate'), { code: 'DEPTH_ZERO_SELF_SIGNED_CERT' }))
  assert.equal(tlsErr.code, ERROR_CODES.NET_001)
  assert.equal(tlsErr.details.category, 'tls')

  const timeoutErr = mapEwsError(Object.assign(new Error('timeout of 30000ms exceeded'), { code: 'ECONNABORTED' }))
  assert.equal(timeoutErr.code, ERROR_CODES.NET_001)
  assert.equal(timeoutErr.details.category, 'timeout')
})

test('withRetry retries 3 times on RATE_001 with 1s/2s/4s delays, never retries AUTH_001, and propagates AbortError', async () => {
  assert.deepEqual(DEFAULT_RETRY_DELAYS_MS, [1000, 2000, 4000])

  // 1. Retries 3 times then fails with RATE_001
  const recordedDelays = []
  let rateAttempts = 0
  await assert.rejects(
    () => withRetry(
      async () => {
        rateAttempts++
        throw new ExchangeError(ERROR_CODES.RATE_001, 'busy')
      },
      {
        delaysMs: [5, 10, 20],
        onRetry: (_err, attempt, delayMs) => recordedDelays.push({ attempt, delayMs }),
      },
    ),
    (err) => err instanceof ExchangeError && err.code === ERROR_CODES.RATE_001,
  )
  assert.equal(rateAttempts, 4) // 1 initial + 3 retries
  assert.deepEqual(recordedDelays, [
    { attempt: 1, delayMs: 5 },
    { attempt: 2, delayMs: 10 },
    { attempt: 3, delayMs: 20 },
  ])

  // 2. Succeeds on 3rd attempt
  let transientAttempts = 0
  const ok = await withRetry(
    async () => {
      transientAttempts++
      if (transientAttempts < 3) throw { status: 503, message: 'ErrorServerBusy' }
      return 'recovered'
    },
    { delaysMs: [1, 2, 4] },
  )
  assert.equal(ok, 'recovered')
  assert.equal(transientAttempts, 3)

  // 3. NEVER retries AUTH_001
  let authAttempts = 0
  await assert.rejects(
    () => withRetry(
      async () => {
        authAttempts++
        throw { status: 401, message: 'Unauthorized' }
      },
      { delaysMs: [1, 2, 4] },
    ),
    (err) => err instanceof ExchangeError && err.code === ERROR_CODES.AUTH_001,
  )
  assert.equal(authAttempts, 1)

  // 4. Aborting during backoff sleep propagates raw AbortError immediately (Review Focus #5)
  const ac = new AbortController()
  const customAbort = new DOMException('user cancelled', 'AbortError')
  let abortAttempts = 0
  const promise = withRetry(
    async () => {
      abortAttempts++
      throw new ExchangeError(ERROR_CODES.RATE_001, 'busy')
    },
    {
      signal: ac.signal,
      delaysMs: [5000, 10000, 20000],
      onRetry: () => {
        setTimeout(() => ac.abort(customAbort), 10)
      },
    },
  )
  await assert.rejects(
    () => promise,
    (err) => err === customAbort && !(err instanceof ExchangeError),
  )
  assert.equal(abortAttempts, 1)
})
