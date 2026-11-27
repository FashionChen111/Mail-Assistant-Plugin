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

test('createSessionScope activates only for user prompts owned by the exact session', async () => {
  let projection
  let disposed = false
  const states = new WeakMap()
  const scope = await createSessionScope({
    sessionProjections: {
      async register(def) {
        projection = def
        return {
          stateOf(session) { return states.get(session) },
          async dispose() { disposed = true },
        }
      },
    },
  })

  function session(header = {}, inheritedEventCount = 0) {
    const session = {}
    states.set(session, projection.init(header, inheritedEventCount))
    return session
  }

  function apply(session, seq, type, data) {
    states.set(session, projection.apply(states.get(session), { seq, type, data }))
  }

  const userPrompt = { source: { kind: 'user' }, content: [{ type: 'text', text: '@mail check Jira' }] }
  const parent = session()
  const fork = session({ isSeeded: true }, 4)
  const child = session({ origin: 'subagent' })
  assert.equal(projection.key, 'dsh-exchange:activated')
  assert.equal(projection.stateVersion, 3)
  assert.deepEqual(projection.stateSchema.parse(states.get(fork)), states.get(fork))
  assert.throws(() => projection.stateSchema.parse(true))
  assert.equal(scope.isSessionActivated(parent), false)

  apply(parent, 0, 'agent/inbox/spliced', { inserted: [userPrompt] })
  assert.equal(scope.isSessionActivated(parent), true)
  apply(fork, 3, 'user/message', userPrompt)
  assert.equal(scope.isSessionActivated(fork), false)
  apply(fork, 4, 'user/message', { ...userPrompt, source: { kind: 'agent-message' } })
  assert.equal(scope.isSessionActivated(fork), false)
  apply(fork, 5, 'user/message', userPrompt)
  assert.equal(scope.isSessionActivated(fork), true)

  apply(child, 0, 'agent/inbox/spliced', { inserted: [userPrompt] })
  assert.equal(scope.isSessionActivated(child), false)
  apply(child, 1, 'agent/inbox/spliced', { inserted: [{
    ...userPrompt,
    source: { kind: 'user', rpcId: 'child-prompt' },
  }] })
  assert.equal(scope.isSessionActivated(child), true)
  assert.equal(scope.isSessionActivated(session()), false)

  await scope.dispose()
  assert.equal(disposed, true)
})
