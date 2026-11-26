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

test('rc.1 session projection activates only that session from its own user messages', () => {
  let registeredDef = null
  let disposed = false
  const states = new WeakMap()
  const ctx = {
    sessionProjections: {
      register(def) {
        registeredDef = def
        return () => { disposed = true }
      },
      stateOf(session, key) {
        assert.equal(key, 'dsh-exchange:activated')
        if (disposed) return undefined
        return states.get(session) ?? registeredDef.init({}, 0)
      },
    },
  }

  const scope = createSessionScope(ctx, { explicitPrefix: '@mail' })
  assert.ok(registeredDef)
  assert.equal(registeredDef.key, 'dsh-exchange:activated')
  const initialState = registeredDef.init({}, 0)
  assert.deepEqual(registeredDef.stateSchema.parse(initialState), initialState)
  assert.throws(() => registeredDef.stateSchema.parse(true))

  const sessionA = { id: 'sess-a' }
  const sessionB = { id: 'sess-b' }
  const sessionC = { id: 'sess-c' }

  // Initially all hidden
  assert.equal(scope.isSessionActivated(sessionA), false)
  assert.equal(scope.isSessionActivated(sessionB), false)

  // Turn 1: agent/inbox/spliced arrives BEFORE tools.resolve()
  const nextA = registeredDef.apply(initialState, {
    type: 'agent/inbox/spliced',
    seq: 0,
    data: {
      inserted: [{ source: { kind: 'user' }, content: [{ type: 'text', text: '@mail check Widevine' }] }],
    },
  })
  states.set(sessionA, nextA)
  assert.equal(scope.isSessionActivated(sessionA), true)
  assert.equal(scope.isSessionActivated(sessionB), false)

  // Assistant message containing @mail does NOT activate sessionB
  const nextB = registeredDef.apply(initialState, {
    type: 'assistant/message',
    seq: 0,
    data: { content: [{ type: 'text', text: 'Try typing @mail' }] },
  })
  states.set(sessionB, nextB)
  assert.equal(scope.isSessionActivated(sessionB), false)

  // Resume/replay via committed user/message activates sessionC
  const nextC = registeredDef.apply(initialState, {
    type: 'user/message',
    seq: 0,
    data: { source: { kind: 'user' }, content: [{ type: 'text', text: '@mail assistant 汇总待办' }] },
  })
  states.set(sessionC, nextC)
  assert.equal(scope.isSessionActivated(sessionC), true)

  const child = { id: 'child' }
  const fork = { id: 'fork' }
  const trigger = { source: { kind: 'user' }, content: [{ type: 'text', text: '@mail' }] }
  const childSeed = registeredDef.init({ origin: 'subagent' }, 0)
  const delegated = registeredDef.apply(childSeed, {
    type: 'agent/inbox/spliced', seq: 0, data: { target: 'next-turn', start: 0, inserted: [trigger] },
  })
  states.set(child, delegated)
  assert.equal(scope.isSessionActivated(child), false, 'model-authored initial delegation must not activate a child')

  states.set(child, registeredDef.apply(delegated, {
    type: 'user/message', seq: 1, data: { ...trigger, source: { kind: 'user', rpcId: 'child-web-prompt' } },
  }))
  assert.equal(scope.isSessionActivated(child), true)

  const forkSeed = registeredDef.init({ isSeeded: true }, 4)
  const inherited = registeredDef.apply(forkSeed, { type: 'user/message', seq: 3, data: trigger })
  states.set(fork, inherited)
  assert.equal(scope.isSessionActivated(fork), false, 'a fork must not inherit mail activation')
  states.set(fork, registeredDef.apply(inherited, { type: 'user/message', seq: 5, data: trigger }))
  assert.equal(scope.isSessionActivated(fork), true)

  scope.dispose()
  assert.equal(scope.isSessionActivated(sessionA), false)
})
