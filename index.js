import { join } from 'node:path'
import { Config, resolveConfig } from './src/config.js'
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
}
