import { z } from 'zod'
import { isUserMessageTriggeringMail } from './mention.js'

export const PROJECTION_KEY = 'dsh-exchange:activated'

const activationStateSchema = z.object({
  activated: z.boolean(),
  firstOwnSeq: z.int().nonnegative(),
  requiresUserRpc: z.boolean(),
})

function activatesMail(event, explicitPrefix, requiresUserRpc) {
  const triggersMail = (message) => {
    // Older child sessions could record model delegation with source.kind = 'user'.
    if (requiresUserRpc && !(typeof message?.source?.rpcId === 'string' && message.source.rpcId.length > 0)) {
      return false
    }
    return isUserMessageTriggeringMail(message, explicitPrefix)
  }

  if (event.type === 'user/message') return triggersMail(event.data)
  if (event.type === 'agent/inbox/spliced') {
    const inserted = event.data?.inserted
    return Array.isArray(inserted) && inserted.some(triggersMail)
  }
  return false
}

export async function createSessionScope(ctx, { explicitPrefix = '@mail' } = {}) {
  const handle = await ctx.sessionProjections.register({
    key: PROJECTION_KEY,
    stateVersion: 3,
    stateSchema: activationStateSchema,
    init(header, inheritedEventCount) {
      return { activated: false, firstOwnSeq: inheritedEventCount, requiresUserRpc: header.origin === 'subagent' }
    },
    apply(state, event) {
      if (state.activated || !Number.isSafeInteger(event?.seq) || event.seq < state.firstOwnSeq) return state
      return activatesMail(event, explicitPrefix, state.requiresUserRpc)
        ? { ...state, activated: true }
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
