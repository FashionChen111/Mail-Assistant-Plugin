import { join } from 'node:path'
import { Config, resolveConfig } from './src/config.js'
import { registerExchangeRoutes } from './src/routes.js'
import { createSessionScope } from './src/scope.js'
import { createExchangeTools, registerExchangeTools } from './src/tools/index.js'

export const name = 'dsh-exchange'
export const inject = ['tools', 'sessionProjections', 'credentials', 'systemPrompt']
export { Config }

export async function apply(ctx, rawConfig = {}) {
  const config = resolveConfig(rawConfig)
  const statePath = join(config.dataDir, 'state.json')
  const auditPath = join(config.dataDir, 'audit.jsonl')

  const scope = await createSessionScope(ctx, { explicitPrefix: config.explicitPrefix })
  const tools = createExchangeTools({
    ctx,
    config,
    statePath,
    auditPath,
  })

  const disposeTools = registerExchangeTools(ctx, { tools, scope })
  if (typeof ctx.effect === 'function') {
    ctx.effect(() => () => {
      disposeTools()
      void scope.dispose()
    }, 'dsh-exchange: tools and scope')
  }

  // Optional web carrier routes (skipped cleanly in headless/ACP profiles without webServer).
  if (typeof ctx.inject === 'function') {
    ctx.inject(['webServer'], (webCtx) => {
      registerExchangeRoutes(webCtx, { statePath, config })
    })
  } else if (ctx.webServer) {
    registerExchangeRoutes(ctx, { statePath, config })
  }
}
