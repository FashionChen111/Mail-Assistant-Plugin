import { isUserMessageTriggeringMail } from './mention.js'

export const PROJECTION_KEY = 'dsh-exchange:activated'

const activationStateSchema = {
  parse(value) {
    if (typeof value?.activated !== 'boolean' || typeof value.requireBrowserPrompt !== 'boolean'
      || !Number.isSafeInteger(value.firstOwnSeq) || value.firstOwnSeq < 0) {
      throw new TypeError(`Invalid session activation state for ${PROJECTION_KEY}`)
    }
    return value
  },
}

function eventActivatesMail(event, explicitPrefix, requireBrowserPrompt) {
  const triggersMail = (message) => {
    // rc.1 also labels model-authored initial delegation as 'user'.
    if (requireBrowserPrompt && !(typeof message?.source?.rpcId === 'string' && message.source.rpcId.length > 0)) {
      return false
    }
    return isUserMessageTriggeringMail(message, explicitPrefix)
  }
  if (event.type === 'user/message') {
    return triggersMail(event.data)
  }
  if (event.type === 'agent/inbox/spliced') {
    const inserted = event.data?.inserted
    if (!Array.isArray(inserted)) return false
    return inserted.some(triggersMail)
  }
  return false
}

export function createSessionScope(ctx, { explicitPrefix = '@mail' } = {}) {
  const projections = ctx.sessionProjections
  const dispose = projections.register({
    key: PROJECTION_KEY,
    stateVersion: 2,
    stateSchema: activationStateSchema,
    init({ origin }, inheritedEventCount) {
      return { activated: false, firstOwnSeq: inheritedEventCount, requireBrowserPrompt: origin === 'subagent' }
    },
    apply(state, event) {
      if (state.activated || !Number.isSafeInteger(event?.seq) || event.seq < state.firstOwnSeq) return state
      return eventActivatesMail(event, explicitPrefix, state.requireBrowserPrompt)
        ? { ...state, activated: true }
        : state
    },
  })

  return {
    isSessionActivated(session) {
      if (!session) return false
      try {
        return projections.stateOf(session, PROJECTION_KEY)?.activated === true
      } catch {
        return false
      }
    },
    dispose,
  }
}
