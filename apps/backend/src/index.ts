import { createLlmClient } from './clients/llm'
import { createMockClients } from './clients/mock/mockClients'
import { createOpointClient } from './clients/opoint'
import { createTavilyClient } from './clients/tavily'
import { ConfigError, loadConfig, opointConfigured, opointStatus, type AppConfig } from './config/env'
import { buildApp, type Clients } from './server'

function createClients(config: AppConfig): Clients {
  if (config.MOCK_MODE) return createMockClients(config.MOCK_SPEED)
  return {
    opoint: opointConfigured(config) ? createOpointClient(config) : null,
    tavily: createTavilyClient(config),
    llm: createLlmClient(config),
  }
}

async function main(): Promise<void> {
  let config: AppConfig
  try {
    config = loadConfig()
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(err.message)
      process.exit(1)
    }
    throw err
  }

  const { server } = await buildApp(config, createClients(config))

  const shutdown = (signal: string) => {
    server.log.info({ signal }, 'shutting down')
    server.close().then(
      () => process.exit(0),
      () => process.exit(1),
    )
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))

  await server.listen({ port: config.PORT, host: config.HOST })
  if (config.MOCK_MODE) server.log.warn('MOCK_MODE: dane testowe, bez wywołań Opoint / Tavily / Azure')
  if (!config.ACCESS_PASSWORD) server.log.warn('Brak hasła dostępu (ALLOW_NO_AUTH) — tylko do pracy lokalnej')
  const opoint = opointStatus(config)
  if (opoint === 'disabled') server.log.warn('OPOINT_ENABLED=false — Opoint wyłączony, research działa wyłącznie na Tavily')
  else if (opoint === 'not_configured') server.log.warn('Opoint nie jest skonfigurowany (brak OPOINT_TOKEN) — research działa wyłącznie na Tavily')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
