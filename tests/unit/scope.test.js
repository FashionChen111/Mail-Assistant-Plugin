import test from 'node:test'
import assert from 'node:assert/strict'

import { containsMailTrigger, isUserMessageTriggeringMail } from '../../src/mention.js'
import { createSessionScope } from '../../src/scope.js'

test('containsMailTrigger matches standalone @mail and rejects embedded or suffixed tokens', () => {
  // Positive matches
  assert.equal(containsMailTrigger('@mail'), true)
  assert.equal(containsMailTrigger('@mail 看下最近 Widevine 的邮件'), true)
  assert.equal(containsMailTrigger('@mail assistant 帮我查邮件'), true)
  assert.equal(containsMailTrigger('请 @mail 查一下昨天的邮件'), true)
  assert.equal(containsMailTrigger('@mail，看看今天的待办'), true)
  assert.equal(containsMailTrigger('(@mail)'), true)
  assert.equal(containsMailTrigger('@MAIL check inbox'), true)

  // Negative matches (Review Focus #1)
  assert.equal(containsMailTrigger('@mail2 看下邮件'), false)
  assert.equal(containsMailTrigger('@mailbox status'), false)
  assert.equal(containsMailTrigger('@mail-bot ping'), false)
  assert.equal(containsMailTrigger('@mail_test ping'), false)
  assert.equal(containsMailTrigger('Contact alice@mail.company.com today'), false)
  assert.equal(containsMailTrigger('foo@mail'), false)
  assert.equal(containsMailTrigger('帮我看看邮件和邮箱'), false)
  assert.equal(containsMailTrigger(''), false)
})

test('isUserMessageTriggeringMail only accepts user-authored messages', () => {
  assert.equal(
    isUserMessageTriggeringMail({
      source: { kind: 'user' },
      content: [{ type: 'text', text: '@mail check Jira' }],
    }),
    true,
  )
  assert.equal(
    isUserMessageTriggeringMail({
      source: { kind: 'assistant' },
      content: [{ type: 'text', text: '@mail check Jira' }],
    }),
    false,
  )
  assert.equal(
    isUserMessageTriggeringMail({
      source: { kind: 'tool' },
      content: [{ type: 'text', text: '@mail check Jira' }],
    }),
    false,
  )
  assert.equal(
    isUserMessageTriggeringMail({
      source: { kind: 'user' },
      content: [{ type: 'text', text: '帮我写段代码' }],
    }),
    false,
  )
})

test('createSessionScope uses sessionProjections for Turn-1 inbox splice and resume user/message', async () => {
  let registeredDef = null
  const states = new WeakMap()
  const ctx = {
    sessionProjections: {
      async register(def) {
        registeredDef = def
        return {
          stateOf(session) {
            return states.get(session) ?? def.init()
          },
          async dispose() {},
        }
      },
    },
  }

  const scope = await createSessionScope(ctx, { explicitPrefix: '@mail' })
  assert.ok(registeredDef)
  assert.equal(registeredDef.key, 'dsh-exchange:activated')
  assert.equal(registeredDef.stateSchema.parse(true), true)
  assert.throws(() => registeredDef.stateSchema.parse('bad'))

  const sessionA = { id: 'sess-a' }
  const sessionB = { id: 'sess-b' }
  const sessionC = { id: 'sess-c' }

  // Initially all hidden
  assert.equal(scope.isSessionActivated(sessionA), false)
  assert.equal(scope.isSessionActivated(sessionB), false)

  // Turn 1: agent/inbox/spliced arrives BEFORE tools.resolve()
  const nextA = registeredDef.apply(false, {
    type: 'agent/inbox/spliced',
    data: {
      inserted: [{ source: { kind: 'user' }, content: [{ type: 'text', text: '@mail check Widevine' }] }],
    },
  })
  states.set(sessionA, nextA)
  assert.equal(scope.isSessionActivated(sessionA), true)
  assert.equal(scope.isSessionActivated(sessionB), false)

  // Assistant message containing @mail does NOT activate sessionB
  const nextB = registeredDef.apply(false, {
    type: 'assistant/message',
    data: { content: [{ type: 'text', text: 'Try typing @mail' }] },
  })
  states.set(sessionB, nextB)
  assert.equal(scope.isSessionActivated(sessionB), false)

  // Resume/replay via committed user/message activates sessionC
  const nextC = registeredDef.apply(false, {
    type: 'user/message',
    data: { source: { kind: 'user' }, content: [{ type: 'text', text: '@mail assistant 汇总待办' }] },
  })
  states.set(sessionC, nextC)
  assert.equal(scope.isSessionActivated(sessionC), true)

  await scope.dispose()
})

test('createSessionScope falls back to session/event when sessionProjections is absent', async () => {
  const listeners = []
  const ctx = {
    on(eventName, fn) {
      listeners.push({ eventName, fn })
      return () => {}
    },
  }

  const scope = await createSessionScope(ctx, { explicitPrefix: '@mail' })
  const s1 = { id: 's1' }
  const s2 = { id: 's2' }

  assert.equal(scope.isSessionActivated(s1), false)
  for (const l of listeners) {
    if (l.eventName === 'session/event') {
      l.fn(s1, {
        type: 'agent/inbox/spliced',
        data: { inserted: [{ source: { kind: 'user' }, content: [{ type: 'text', text: '@mail hi' }] }] },
      })
    }
  }
  assert.equal(scope.isSessionActivated(s1), true)
  assert.equal(scope.isSessionActivated(s2), false)
  await scope.dispose()
})
