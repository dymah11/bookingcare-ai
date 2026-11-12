import { Router } from 'express'
import type { AppDependencies } from '../dependencies.js'

export function createHealthRouter(deps: AppDependencies): ReturnType<typeof Router> {
  const router = Router()

  router.get('/', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'api',
      version: '0.1.0',
      uptimeSeconds: Math.round(process.uptime()),
      indexSize: deps.store.size,
      assistantEnabled: deps.agent !== null,
    })
  })

  return router
}
