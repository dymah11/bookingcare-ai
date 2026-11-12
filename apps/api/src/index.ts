import { createRuntime } from './bootstrap.js'
import { createApp } from './app.js'

async function main(): Promise<void> {
  const runtime = await createRuntime()
  const { env, logger, store, catalog, drafts, sessions, assistant } = runtime

  logger.info('index_loaded', {
    indexSize: store.size,
    catalogSize: catalog.size,
    embeddings: env.OPENAI_API_KEY.trim() !== '',
  })

  if (!assistant) {
    logger.warn('assistant_disabled', { reason: 'Thiếu ANTHROPIC_API_KEY' })
  }

  const app = createApp({ env, logger, store, drafts, sessions, agent: assistant })
  app.listen(env.PORT, () => {
    logger.info('api_started', { port: env.PORT, nodeEnv: env.NODE_ENV })
  })
}

main().catch((error: unknown) => {
  console.error('Không khởi động được API server:', error)
  process.exitCode = 1
})
