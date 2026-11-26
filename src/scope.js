import { isUserMessageTriggeringMail } from './mention.js'

export const PROJECTION_KEY = 'dsh-exchange:activated'

const booleanStateSchema = {
  parse(value) {
    if (typeof value !== 'boolean') {
      throw new TypeError(`Expected boolean for ${PROJECTION_KEY}`)
    }
    return value
  },
}

function eventActivatesMail(event, explicitPrefix) {
  if (!event || typeof event !== 'object') return false
  if (event.type === 'user/message') {
    return isUserMessageTriggeringMail(event.data, explicitPrefix)
  }
  if (event.type === 'agent/inbox/spliced') {
    const inserted = event.data?.inserted
    if (!Array.isArray(inserted)) return false
    return inserted.some((msg) => isUserMessageTriggeringMail(msg, explicitPrefix))
  }
  return false
}

export function createSessionScope(ctx, { explicitPrefix = '@mail' } = {}) {
  const projections = ctx.sessionProjections
  const dispose = projections.register({
    key: PROJECTION_KEY,
    stateVersion: 1,
    stateSchema: booleanStateSchema,
    init: () => false,
    apply: (activated, event) => activated || eventActivatesMail(event, explicitPrefix),
  })

  return {
    isSessionActivated(session) {
      if (!session) return false
      try {
        return projections.stateOf(session, PROJECTION_KEY) === true
      } catch {
        return false
      }
    },
    dispose,
  }
}
