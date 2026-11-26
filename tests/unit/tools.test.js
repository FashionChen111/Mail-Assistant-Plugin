import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { ExchangeError, ERROR_CODES } from '../../src/errors.js'
import { writeState } from '../../src/state.js'
import { TOOL_NAMES, createExchangeTools, registerExchangeTools } from '../../src/tools/index.js'

const EXPECTED_15_TOOLS = [
  'exchange_list_folders',
  'exchange_search_emails',
  'exchange_read_email',
  'exchange_list_recent_emails',
  'exchange_save_draft',
  'exchange_update_draft',
  'exchange_delete_draft',
  'exchange_get_thread',
  'exchange_parse_jira_notifications',
  'exchange_extract_todos',
  'exchange_summarize_project',
  'exchange_download_attachment',
  'exchange_move_email',
  'exchange_mark_email',
  'exchange_delete_email',
]

function makeFakeEwsClient() {
  const folders = {
    rootId: 'root',
    folders: [
      { id: 'f-inbox', parentId: 'root', name: '收件箱', folderClass: 'IPF.Note', isRootChild: true },
      { id: 'f-sent', parentId: 'root', name: '已发送', folderClass: 'IPF.Note', isRootChild: true },
      { id: 'f-hr', parentId: 'root', name: '人事资料', folderClass: 'IPF.Note', isRootChild: true },
    ],
  }
  const email1 = {
    id: 'email-1',
    parentFolderId: 'f-inbox',
    conversationId: 'conv-1',
    messageId: '<m1@corp>',
    references: [],
    from: 'jira@company.com',
    to: ['me@company.com'],
    cc: [],
    subject: '[JIRA] (CERT-101) AirPlay2 delay issue',
    bodyText: 'Status: Open -> Blocked\nPriority: High\nAssignee: me@company.com\nComment: Please submit fix plan by 2026-11-26.\nAudio sync blocked.',
    bodyHtml: null,
    receivedTime: '2026-11-24T10:00:00.000Z',
    sentTime: '2026-11-24T10:00:00.000Z',
    isRead: false,
    isDraft: false,
    isFlagged: false,
    importance: 'high',
    hasAttachments: true,
    attachments: [{ id: 'att-1', name: 'report.txt', size: 11, content_type: 'text/plain', is_inline: false }],
  }
  return {
    async findFolders() { return folders },
    async findItems() { return { items: [email1], total: 1 } },
    async getItem(id) {
      if (id === 'email-1') return email1
      throw new ExchangeError(ERROR_CODES.EMAIL_001, 'not found')
    },
    async findConversationItems() { return [email1] },
    async downloadAttachment() {
      return { id: 'att-1', name: 'report.txt', size: 11, contentType: 'text/plain', buffer: Buffer.from('hello world') }
    },
    async saveDraft() { return { draftId: 'draft-1', savedTime: '2026-11-24T11:00:00.000Z' } },
    async updateDraft(id) { return { draftId: id, savedTime: '2026-11-24T11:05:00.000Z' } },
    async deleteDraft() { return { deleted: true } },
    async moveItem() { return { moved: true } },
    async markItem() { return { updated: true } },
    async deleteItem() { return { deleted: true } },
  }
}

test('createExchangeTools defines all 15 tools with valid DSH defineTool schemas and zero send tool', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-ex-tools-'))
  try {
    const statePath = join(dir, 'state.json')
    const auditPath = join(dir, 'audit.jsonl')
    await writeState(statePath, {
      version: '1.1.0',
      account: {
        serverUrl: 'https://exchange.company.com/EWS/Exchange.asmx',
        email: 'me@company.com',
        domain: 'CORP',
        username: 'me',
      },
      access: { mode: 'whitelist', folders: ['收件箱', '已发送'], emergencyLock: false },
    })

    const fakeClient = makeFakeEwsClient()
    const tools = createExchangeTools({
      ctx: {},
      config: {
        maxSearchResults: 100,
        maxAttachmentMb: 25,
        maxAttachmentBytes: 25 * 1024 * 1024,
        maxBodyChars: 20000,
        requestTimeoutSeconds: 30,
        requestTimeoutMs: 30000,
        explicitPrefix: '@mail',
        dataDir: dir,
      },
      statePath,
      auditPath,
      clientFactory: () => fakeClient,
      getPasswordFn: async () => 'secret-pass',
    })

    assert.deepEqual(TOOL_NAMES, EXPECTED_15_TOOLS)
    assert.deepEqual(tools.map((t) => t.name), EXPECTED_15_TOOLS)
    assert.equal(tools.some((t) => /send/i.test(t.name)), false)

    const byName = new Map(tools.map((t) => [t.name, t]))
    const exec = { signal: new AbortController().signal }

    // Execute every single one of the 15 tools and confirm output.render succeeds
    const calls = [
      ['exchange_list_folders', { readable_only: false }],
      ['exchange_search_emails', { folder: '收件箱', query: 'AirPlay2' }],
      ['exchange_read_email', { email_id: 'email-1' }],
      ['exchange_list_recent_emails', { days: 7 }],
      ['exchange_save_draft', { to: ['support@apple.com'], subject: 'Gentle reminder', body_text: 'Hi there' }],
      ['exchange_update_draft', { draft_id: 'draft-1', subject: 'Updated reminder' }],
      ['exchange_delete_draft', { draft_id: 'draft-1' }],
      ['exchange_get_thread', { email_id: 'email-1' }],
      ['exchange_parse_jira_notifications', { days: 7, filter_by_user: true }],
      ['exchange_extract_todos', { days: 7 }],
      ['exchange_summarize_project', { project: 'AirPlay2', days: 30 }],
      ['exchange_download_attachment', { email_id: 'email-1', attachment_id: 'att-1', save_path: dir }],
      ['exchange_move_email', { email_id: 'email-1', target_folder: '已发送' }],
      ['exchange_mark_email', { email_id: 'email-1', is_read: true }],
      ['exchange_delete_email', { email_id: 'email-1', permanent: false }],
    ]

    for (const [name, args] of calls) {
      const def = byName.get(name)
      assert.ok(def, `missing tool ${name}`)
      const value = await def.execute(args, exec)
      assert.ok(value && typeof value === 'object', `${name} returned non-object`)
      const blocks = def.output.render(args, value)
      assert.ok(Array.isArray(blocks) && blocks.length >= 1 && blocks[0].type === 'text')
    }

    // Verify permanent delete rejected with ExchangeError(PERM_001)
    await assert.rejects(
      () => byName.get('exchange_delete_email').execute({ email_id: 'email-1', permanent: true }, exec),
      (err) => err instanceof ExchangeError && err.code === ERROR_CODES.PERM_001,
    )

    // Verify AbortError propagates raw without wrapping (Review Focus #5)
    const ac = new AbortController()
    const abortErr = new DOMException('cancelled', 'AbortError')
    ac.abort(abortErr)
    await assert.rejects(
      () => byName.get('exchange_list_folders').execute({}, { signal: ac.signal }),
      (err) => err === abortErr && !(err instanceof ExchangeError),
    )

    // Verify audit log recorded calls and contains zero secret or email body text
    const auditRaw = await readFile(auditPath, 'utf8')
    const lines = auditRaw.trim().split('\n').map((l) => JSON.parse(l))
    assert.ok(lines.length >= 16)
    assert.doesNotMatch(auditRaw, /secret-pass|Gentle reminder|Audio sync blocked/)

    // Verify activity.jsonl recorded rich safe summaries for UI history while NEVER leaking passwords, bodies, or base64
    const activityPath = join(dir, 'activity.jsonl')
    const activityRaw = await readFile(activityPath, 'utf8')
    assert.doesNotMatch(activityRaw, /secret-pass|Audio sync blocked|Hi there|aGVsbG8gd29ybGQ=/)
    const actLines = activityRaw.trim().split('\n').map((l) => JSON.parse(l))
    assert.ok(actLines.length >= 16)

    const readRec = actLines.find((r) => r.action === 'read_email' && r.outcome === 'ok')
    assert.ok(readRec)
    assert.equal(readRec.summary.subject, '[JIRA] (CERT-101) AirPlay2 delay issue')
    assert.equal(readRec.summary.from, 'jira@company.com')

    const draftRec = actLines.find((r) => r.action === 'save_draft' && r.outcome === 'ok')
    assert.ok(draftRec)
    assert.equal(draftRec.summary.subject, 'Gentle reminder')
    assert.deepEqual(draftRec.summary.to, ['support@apple.com'])
    assert.equal(draftRec.summary.bodyChars, 'Hi there'.length)

    const updateRec = actLines.find((r) => r.action === 'update_draft' && r.outcome === 'ok')
    assert.ok(updateRec)
    assert.equal(updateRec.summary.subject, 'Updated reminder')
    assert.deepEqual(updateRec.summary.updatedFields, ['subject'])

    const searchRec = actLines.find((r) => r.action === 'search_emails' && r.outcome === 'ok')
    assert.ok(searchRec)
    assert.equal(searchRec.summary.query, 'AirPlay2')

    const jiraRec = actLines.find((r) => r.action === 'parse_jira_notifications' && r.outcome === 'ok')
    assert.ok(jiraRec)
    assert.deepEqual(jiraRec.summary.issueKeys, ['CERT-101'])

    const projRec = actLines.find((r) => r.action === 'summarize_project' && r.outcome === 'ok')
    assert.ok(projRec)
    assert.equal(projRec.summary.project, 'AirPlay2')
    assert.equal(projRec.summary.relatedCount, 1)

    const attRec = actLines.find((r) => r.action === 'download_attachment' && r.outcome === 'ok')
    assert.ok(attRec)
    assert.equal(attRec.summary.fileName, 'report.txt')
    assert.equal(attRec.summary.size, 11)

    const deniedDelRec = actLines.find((r) => r.action === 'delete_email' && r.outcome === 'denied')
    assert.ok(deniedDelRec)
    assert.equal(deniedDelRec.code, 'PERM_001')
    assert.equal(deniedDelRec.summary.permanentAttempt, true)

    // Verify denied read_email (PERM_001) NEVER records forbidden email subject or sender in activity.jsonl
    const hrClient = {
      ...fakeClient,
      async getItem(id) {
        if (id === 'email-hr') {
          return {
            id: 'email-hr',
            parentFolderId: 'f-hr',
            conversationId: 'conv-hr',
            messageId: '<hr@corp>',
            references: [],
            from: 'hr-secret@company.com',
            to: ['me@company.com'],
            cc: [],
            subject: 'CONFIDENTIAL SALARY LETTER',
            bodyText: 'TOP SECRET COMP',
            bodyHtml: null,
            receivedTime: '2026-11-24T10:00:00.000Z',
            sentTime: '2026-11-24T10:00:00.000Z',
            isRead: false,
            isDraft: false,
            isFlagged: false,
            importance: 'normal',
            hasAttachments: false,
            attachments: [],
          }
        }
        return fakeClient.getItem(id)
      },
    }
    const hrTools = createExchangeTools({
      ctx: {},
      config: {
        maxSearchResults: 100,
        maxAttachmentMb: 25,
        maxAttachmentBytes: 25 * 1024 * 1024,
        maxBodyChars: 20000,
        requestTimeoutSeconds: 30,
        requestTimeoutMs: 30000,
        explicitPrefix: '@mail',
        dataDir: dir,
      },
      statePath,
      auditPath,
      activityPath,
      clientFactory: () => hrClient,
      getPasswordFn: async () => 'secret-pass',
    })
    const hrRead = hrTools.find((t) => t.name === 'exchange_read_email')
    await assert.rejects(
      () => hrRead.execute({ email_id: 'email-hr', mark_as_read: true }, exec),
      (err) => err instanceof ExchangeError && err.code === ERROR_CODES.PERM_001,
    )
    const activityAfterHr = await readFile(activityPath, 'utf8')
    assert.doesNotMatch(activityAfterHr, /CONFIDENTIAL SALARY LETTER|hr-secret@company\.com|TOP SECRET COMP/)
    const hrLines = activityAfterHr.trim().split('\n').map((l) => JSON.parse(l))
    const deniedReadRec = hrLines[hrLines.length - 1]
    assert.equal(deniedReadRec.action, 'read_email')
    assert.equal(deniedReadRec.outcome, 'denied')
    assert.equal(deniedReadRec.summary.markAsRead, undefined, 'denied read_email must not claim markAsRead')

    // C1 regression: exchange_extract_todos on an email with EMPTY subject must NEVER leak body_text into activity.jsonl
    const blankSubjEmail = {
      id: 'email-blank-subj',
      parentFolderId: 'f-inbox',
      conversationId: 'conv-blank',
      messageId: '<blank@corp>',
      references: [],
      from: 'pm@company.com',
      to: ['me@company.com'],
      cc: [],
      subject: '',
      bodyText: 'ULTRA_PRIVATE_BODY_SENTENCE please reply by 2026-11-28.',
      bodyHtml: null,
      receivedTime: '2026-11-24T12:00:00.000Z',
      sentTime: '2026-11-24T12:00:00.000Z',
      isRead: false,
      isDraft: false,
      isFlagged: false,
      importance: 'high',
      hasAttachments: false,
      attachments: [],
    }
    const blankClient = {
      ...fakeClient,
      async findItems() { return { items: [blankSubjEmail], total: 1 } },
      async getItem(id) {
        if (id === 'email-blank-subj') return blankSubjEmail
        return fakeClient.getItem(id)
      },
    }
    const blankTools = createExchangeTools({
      ctx: {},
      config: {
        maxSearchResults: 100,
        maxAttachmentMb: 25,
        maxAttachmentBytes: 25 * 1024 * 1024,
        maxBodyChars: 20000,
        requestTimeoutSeconds: 30,
        requestTimeoutMs: 30000,
        explicitPrefix: '@mail',
        dataDir: dir,
      },
      statePath,
      auditPath,
      activityPath,
      clientFactory: () => blankClient,
      getPasswordFn: async () => 'secret-pass',
    })
    const blankTodos = await blankTools.find((t) => t.name === 'exchange_extract_todos').execute({ days: 7 }, exec)
    assert.ok(blankTodos.todos.length >= 1)
    const activityAfterBlank = await readFile(activityPath, 'utf8')
    assert.doesNotMatch(activityAfterBlank, /ULTRA_PRIVATE_BODY_SENTENCE/, 'extract_todos must never leak body_text into activity.jsonl when subject is empty')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('rc.1 restricts inactive agents, activates on a session event, and releases registrations', () => {
  const registeredTools = new Set()
  const listeners = new Map()
  const agents = new Map()
  const guards = new Set()
  const prompts = new Set()
  const mockCtx = {
    agents: {
      list: () => [...agents.values()],
      get: (id) => agents.get(id),
    },
    tools: {
      register(def) {
        registeredTools.add(def.name)
        return () => registeredTools.delete(def.name)
      },
      guard(fn) {
        guards.add(fn)
        return () => guards.delete(fn)
      },
    },
    systemPrompt: {
      section(sec) {
        prompts.add(sec)
        return () => prompts.delete(sec)
      },
    },
    on(event, listener) {
      listeners.set(event, listener)
      return () => listeners.delete(event)
    },
  }
  const makeAgent = (id, activated = false) => {
    const denied = new Set()
    const agent = {
      session: { id, activated },
      ctx: { tools: { restrict({ deny }) {
        for (const name of deny) denied.add(name)
        return () => denied.clear()
      } } },
      visible: () => [...registeredTools].filter((name) => !denied.has(name)),
    }
    agents.set(id, agent)
    return agent
  }
  const live = makeAgent('live')
  const resumed = makeAgent('resumed', true)
  const scope = { isSessionActivated: (session) => session?.activated === true }
  const dispose = registerExchangeTools(mockCtx, {
    tools: EXPECTED_15_TOOLS.map((name) => ({ name })),
    scope,
  })

  const fresh = makeAgent('fresh')
  listeners.get('agent/created')({ agent: fresh })
  assert.deepEqual(live.visible(), [])
  assert.deepEqual(fresh.visible(), [])
  assert.deepEqual(resumed.visible(), EXPECTED_15_TOOLS)

  const [guard] = guards
  const [prompt] = prompts
  const name = 'exchange_save_draft'
  assert.equal(typeof guard({ name }), 'string')
  assert.equal(typeof guard({ name, agent: live }), 'string')
  assert.equal(guard({ name: 'read_file' }), undefined)
  assert.equal(prompt.text({ agent: live }), '')

  live.session.activated = true
  const splice = { type: 'agent/inbox/spliced' }
  listeners.get('session/event')({ ...live.session }, splice)
  assert.deepEqual(live.visible(), [])
  listeners.get('session/event')(live.session, splice)
  assert.deepEqual(live.visible(), EXPECTED_15_TOOLS)
  assert.deepEqual(fresh.visible(), [])
  assert.equal(guard({ name, agent: live }), undefined)
  assert.match(prompt.text({ agent: live }), /exchange_save_draft/)

  listeners.get('agent/disposed')({ agent: fresh })
  dispose()
  assert.deepEqual(live.visible(), [])
  assert.equal(guards.size, 0)
  assert.equal(prompts.size, 0)
  assert.equal(listeners.size, 0)
})

test('exchange_extract_todos honors include_unread/include_important combinations and exchange_summarize_project handles float days & PERM_001 fallback', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-ex-tools-fix-'))
  try {
    const statePath = join(dir, 'state.json')
    const auditPath = join(dir, 'audit.jsonl')
    await writeState(statePath, {
      version: '1.1.0',
      account: {
        serverUrl: 'https://exchange.company.com/EWS/Exchange.asmx',
        email: 'me@company.com',
        domain: 'CORP',
        username: 'me',
      },
      access: { mode: 'whitelist', folders: ['收件箱'], emergencyLock: false },
    })

    const emails = [
      {
        id: 'e-read-normal',
        parentFolderId: 'f-inbox',
        conversationId: 'c1',
        messageId: '<m1@c>',
        references: [],
        from: 'a@corp.com',
        to: ['me@company.com'],
        cc: [],
        subject: 'Widevine routine note',
        bodyText: 'Please submit report by 2026-11-28.',
        bodyHtml: null,
        receivedTime: '2026-11-24T10:00:00.000Z',
        sentTime: '2026-11-24T10:00:00.000Z',
        isRead: true,
        isDraft: false,
        isFlagged: false,
        importance: 'normal',
        hasAttachments: false,
        attachments: [],
      },
      {
        id: 'e-unread-normal',
        parentFolderId: 'f-inbox',
        conversationId: 'c2',
        messageId: '<m2@c>',
        references: [],
        from: 'b@corp.com',
        to: ['me@company.com'],
        cc: [],
        subject: 'Widevine unread action',
        bodyText: 'Please reply by 2026-11-27.',
        bodyHtml: null,
        receivedTime: '2026-11-24T11:00:00.000Z',
        sentTime: '2026-11-24T11:00:00.000Z',
        isRead: false,
        isDraft: false,
        isFlagged: false,
        importance: 'normal',
        hasAttachments: false,
        attachments: [],
      },
      {
        id: 'e-read-high',
        parentFolderId: 'f-inbox',
        conversationId: 'c3',
        messageId: '<m3@c>',
        references: [],
        from: 'c@corp.com',
        to: ['me@company.com'],
        cc: [],
        subject: 'Widevine urgent escalation',
        bodyText: 'Please review urgently by 2026-11-26.',
        bodyHtml: null,
        receivedTime: '2026-11-24T12:00:00.000Z',
        sentTime: '2026-11-24T12:00:00.000Z',
        isRead: true,
        isDraft: false,
        isFlagged: false,
        importance: 'high',
        hasAttachments: false,
        attachments: [],
      },
      {
        id: 'e-moved-hr',
        parentFolderId: 'f-inbox',
        conversationId: 'c4',
        messageId: '<m4@c>',
        references: [],
        from: 'd@corp.com',
        to: ['me@company.com'],
        cc: [],
        subject: 'Widevine moved item',
        bodyText: 'Moved to HR after listing',
        bodyHtml: null,
        receivedTime: '2026-11-24T13:00:00.000Z',
        sentTime: '2026-11-24T13:00:00.000Z',
        isRead: true,
        isDraft: false,
        isFlagged: false,
        importance: 'normal',
        hasAttachments: false,
        attachments: [],
      },
    ]

    let findItemsCalls = 0
    let lastFilterOpts = null
    const fakeClient = {
      async findFolders() {
        return {
          rootId: 'root',
          folders: [
            { id: 'f-inbox', parentId: 'root', name: '收件箱', folderClass: 'IPF.Note', isRootChild: true },
            { id: 'f-hr', parentId: 'root', name: '人事资料', folderClass: 'IPF.Note', isRootChild: true },
          ],
        }
      },
      async findItems(_folderId, filterOpts) {
        findItemsCalls++
        lastFilterOpts = filterOpts
        return { items: emails, total: emails.length }
      },
      async getItem(id) {
        if (id === 'e-moved-hr') {
          return { ...emails[3], parentFolderId: 'f-hr' }
        }
        return emails.find((e) => e.id === id)
      },
      async findConversationItems() { return [] },
    }

    const tools = createExchangeTools({
      ctx: {},
      config: {
        maxSearchResults: 100,
        maxAttachmentMb: 25,
        maxAttachmentBytes: 25 * 1024 * 1024,
        maxBodyChars: 20000,
        requestTimeoutSeconds: 30,
        requestTimeoutMs: 30000,
        explicitPrefix: '@mail',
        dataDir: dir,
      },
      statePath,
      auditPath,
      clientFactory: () => fakeClient,
      getPasswordFn: async () => 'secret-pass',
      nowFn: () => new Date('2026-11-25T00:00:00.000Z'),
    })
    const byName = new Map(tools.map((t) => [t.name, t]))
    const exec = { signal: new AbortController().signal }

    // 1. include_unread: false & include_important: false -> returns empty immediately with zero EWS calls
    const none = await byName.get('exchange_extract_todos').execute(
      { days: 7, include_unread: false, include_important: false },
      exec,
    )
    assert.deepEqual(none, { todos: [] })
    assert.equal(findItemsCalls, 0)

    // 2. include_unread: true & include_important: true -> passes unreadOrImportant and excludes normal read email
    const both = await byName.get('exchange_extract_todos').execute(
      { days: 7, include_unread: true, include_important: true },
      exec,
    )
    assert.equal(lastFilterOpts.unreadOrImportant, true)
    const idsBoth = both.todos.map((t) => t.source_email_id)
    assert.ok(!idsBoth.includes('e-read-normal'), 'normal read email must not be included')
    assert.ok(idsBoth.includes('e-unread-normal'))
    assert.ok(idsBoth.includes('e-read-high'))

    // 3. exchange_summarize_project rejects float days via integer schema and skips moved PERM_001 email when include_threads: false
    await assert.rejects(
      () => byName.get('exchange_summarize_project').execute(
        { project: 'Widevine', days: 3.5, include_threads: false },
        exec,
      ),
      /integer/i,
    )
    const summary = await byName.get('exchange_summarize_project').execute(
      { project: 'Widevine', days: 3, include_threads: false },
      exec,
    )
    assert.equal(summary.time_range.days, 3)
    assert.ok(Number.isInteger(summary.time_range.days))
    assert.ok(summary.related_emails.some((e) => e.id === 'e-unread-normal'))
    assert.ok(!summary.related_emails.some((e) => e.id === 'e-moved-hr'))
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('index.js does not require credentials at top-level so dsh-headless can activate the plugin', async () => {
  const entry = await import('../../index.js')
  assert.ok(Array.isArray(entry.inject))
  assert.ok(!entry.inject.includes('credentials'), 'top-level inject must not require credentials for headless compatibility')
  assert.ok(entry.inject.includes('tools'))
  assert.ok(entry.inject.includes('agents'))
  assert.ok(entry.inject.includes('sessionProjections'))
  assert.ok(entry.inject.includes('systemPrompt'))

  // Apply on a headless-like context without credentials or webServer
  const registered = []
  const headlessCtx = {
    agents: { list: () => [] },
    tools: { register(def) { registered.push(def.name); return () => {} }, guard() { return () => {} } },
    sessionProjections: { register() { return () => {} } },
    systemPrompt: { section() { return () => {} } },
    on() { return () => {} },
    effect(fn) { return fn() },
    inject() {}, // webServer/connection/credentials never become ready in headless
  }
  await entry.apply(headlessCtx, {})
  assert.equal(registered.length, 15)
})
