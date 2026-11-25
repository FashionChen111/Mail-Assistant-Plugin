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

export async function createSessionScope(ctx, { explicitPrefix = '@mail' } = {}) {
  const projections = typeof ctx?.get === 'function'
    ? ctx.get('sessionProjections')
    : ctx?.sessionProjections

  if (projections && typeof projections.register === 'function') {
    const handle = await projections.register({
      key: PROJECTION_KEY,
      stateVersion: 1,
      stateSchema: booleanStateSchema,
      init: () => false,
      apply(activated, event) {
        if (activated) return activated
        return eventActivatesMail(event, explicitPrefix) ? true : activated
      },
    })

    return {
      isSessionActivated(session) {
        if (!session) return false
        try {
          return handle.stateOf(session) === true
        } catch {
          return false
        }
      },
      async dispose() {
        if (typeof handle.dispose === 'function') {
          await handle.dispose()
        }
      },
    }
  }

  // Fallback for minimal test harnesses without sessionProjections.
  const activatedSessions = new WeakSet()
  const off = typeof ctx?.on === 'function'
    ? ctx.on('session/event', (session, event) => {
        if (!session || activatedSessions.has(session)) return
        if (eventActivatesMail(event, explicitPrefix)) {
          activatedSessions.add(session)
        }
      })
    : undefined

  return {
    isSessionActivated(session) {
      if (!session) return false
      return activatedSessions.has(session)
    },
    async dispose() {
      if (typeof off === 'function') off()
    },
  }
}
