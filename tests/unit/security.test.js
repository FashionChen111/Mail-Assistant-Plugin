import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, readFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { ExchangeError, ERROR_CODES } from '../../src/errors.js'
import { normalizeFolderPath, isFolderAllowed, assertFolderAllowed } from '../../src/security/permissions.js'
import { createAuditLogger } from '../../src/security/audit.js'

test('normalizeFolderPath normalizes slashes and whitespace', () => {
  assert.equal(normalizeFolderPath('  /收件箱\\项目A//Widevine/ '), '收件箱/项目A/Widevine')
  assert.equal(normalizeFolderPath(''), '')
  assert.equal(normalizeFolderPath('///'), '')
})

test('whitelist mode checks exact path only with zero implicit inheritance', () => {
  const access = {
    mode: 'whitelist',
    folders: ['收件箱', '认证项目/Widevine'],
    emergencyLock: false,
  }
  assert.deepEqual(isFolderAllowed('收件箱', access), { allowed: true })
  assert.deepEqual(isFolderAllowed('认证项目/Widevine', access), { allowed: true })
  assert.equal(isFolderAllowed('收件箱/子目录', access).allowed, false)
  assert.equal(isFolderAllowed('认证项目', access).allowed, false)
  assert.equal(isFolderAllowed('人事资料', access).allowed, false)
  assert.throws(
    () => assertFolderAllowed('收件箱/子目录', access),
    (err) => err instanceof ExchangeError && err.code === ERROR_CODES.PERM_001 && err.details.folder === '收件箱/子目录',
  )
})

test('blacklist mode denies listed folder and all descendants without affecting prefix siblings', () => {
  const access = {
    mode: 'blacklist',
    folders: ['人事资料', '财务/机密'],
    emergencyLock: false,
  }
  assert.equal(isFolderAllowed('收件箱', access).allowed, true)
  assert.equal(isFolderAllowed('人事资料', access).allowed, false)
  assert.equal(isFolderAllowed('人事资料/薪资', access).allowed, false)
  assert.equal(isFolderAllowed('人事资料/2026/考核', access).allowed, false)
  assert.equal(isFolderAllowed('人事资料备份', access).allowed, true)
  assert.equal(isFolderAllowed('财务', access).allowed, true)
  assert.equal(isFolderAllowed('财务/机密/报销', access).allowed, false)
})

test('emergencyLock denies all folders in both whitelist and blacklist modes', () => {
  assert.equal(
    isFolderAllowed('收件箱', { mode: 'whitelist', folders: ['收件箱'], emergencyLock: true }).allowed,
    false,
  )
  assert.equal(
    isFolderAllowed('收件箱', { mode: 'blacklist', folders: [], emergencyLock: true }).allowed,
    false,
  )
  assert.throws(
    () => assertFolderAllowed('收件箱', { mode: 'blacklist', folders: [], emergencyLock: true }),
    (err) => err instanceof ExchangeError && err.code === ERROR_CODES.PERM_001,
  )
})

test('AuditLogger writes 0600 JSONL with strict metadata allowlist and zero secret/body/subject fields', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-ex-audit-'))
  try {
    const auditPath = join(dir, 'audit.jsonl')
    const audit = createAuditLogger(auditPath)
    await audit.log({
      action: 'read_email',
      folder: '人事资料',
      emailId: 'AAMk01',
      outcome: 'denied',
      code: 'PERM_001',
      elapsedMs: 2.7,
      subject: 'TOP SECRET SUBJECT',
      body_text: 'CONFIDENTIAL BODY',
      password: 'SECRET_PASSWORD',
      snippet: 'DO NOT LOG',
    })
    await audit.log({
      action: 'search_emails',
      folder: '收件箱',
      outcome: 'ok',
      count: 12,
      elapsedMs: 340,
    })

    const fileStat = await stat(auditPath)
    assert.equal(fileStat.mode & 0o777, 0o600)

    const raw = await readFile(auditPath, 'utf8')
    assert.doesNotMatch(raw, /TOP SECRET SUBJECT|CONFIDENTIAL BODY|SECRET_PASSWORD|DO NOT LOG/)

    const lines = raw.trim().split('\n').map((l) => JSON.parse(l))
    assert.equal(lines.length, 2)
    assert.equal(lines[0].action, 'read_email')
    assert.equal(lines[0].folder, '人事资料')
    assert.equal(lines[0].emailId, 'AAMk01')
    assert.equal(lines[0].outcome, 'denied')
    assert.equal(lines[0].code, 'PERM_001')
    assert.equal(lines[0].elapsedMs, 3)
    assert.ok(typeof lines[0].ts === 'string' && lines[0].ts.includes('T'))
    assert.equal('subject' in lines[0], false)
    assert.equal('body_text' in lines[0], false)
    assert.equal('password' in lines[0], false)
    assert.equal(lines[1].count, 12)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
