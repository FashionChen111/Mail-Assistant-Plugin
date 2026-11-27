import { z } from 'zod'
import { isUserMessageTriggeringMail } from './mention.js'

export const PROJECTION_KEY = 'dsh-exchange:activated'

const activationStateSchema = z.object({
  activated: z.boolean(),
  firstOwnSeq: z.int().nonnegative(),
  requiresUserRpc: z.boolean(),
  inheritedTriggerIds: z.array(z.string()),
})

function isOwnedMailPrompt(message, explicitPrefix, requiresUserRpc) {
  const { principal, rpcId } = message?.source ?? {}
  if (principal !== undefined && principal?.kind !== 'owner') return false
  // Older child sessions could record model delegation with source.kind = 'user'.
  if (requiresUserRpc && !(typeof rpcId === 'string' && rpcId.length > 0)) return false
  return isUserMessageTriggeringMail(message, explicitPrefix)
}

function eventMessages(event) {
  if (event.type === 'user/message') return [event.data]
  if (event.type === 'agent/inbox/spliced' && Array.isArray(event.data?.inserted)) return event.data.inserted
  return []
}

export async function createSessionScope(ctx, { explicitPrefix = '@mail' } = {}) {
  const handle = await ctx.sessionProjections.register({
    key: PROJECTION_KEY,
    stateVersion: 3,
    stateSchema: activationStateSchema,
    init(header, inheritedEventCount) {
      return {
        activated: false,
        firstOwnSeq: inheritedEventCount,
        requiresUserRpc: header.origin === 'subagent',
        inheritedTriggerIds: [],
      }
    },
    apply(state, event) {
      if (state.activated || !Number.isSafeInteger(event?.seq)) return state
      const messages = eventMessages(event)
      if (event.seq < state.firstOwnSeq) {
        // A fork can claim or requeue inherited inbox messages at new sequence numbers.
        const ids = messages
          .filter((message) => typeof message?.id === 'string'
            && !state.inheritedTriggerIds.includes(message.id)
            && isUserMessageTriggeringMail(message, explicitPrefix))
          .map((message) => message.id)
        return ids.length > 0 ? { ...state, inheritedTriggerIds: [...state.inheritedTriggerIds, ...ids] } : state
      }
      return messages.some((message) => !state.inheritedTriggerIds.includes(message?.id)
        && isOwnedMailPrompt(message, explicitPrefix, state.requiresUserRpc))
        ? { ...state, activated: true, inheritedTriggerIds: [] }
        : state
    },
  })

  return {
    isSessionActivated(session) {
      if (!session) return false
      try {
        return handle.stateOf(session)?.activated === true
      } catch {
        return false
      }
    },
    dispose: () => handle.dispose(),
  }
}
