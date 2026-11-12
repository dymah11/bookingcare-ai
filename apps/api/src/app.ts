import express, { type Express, type NextFunction, type Request, type Response } from 'express'
import type { AppDependencies } from './dependencies.js'
import { accessLog } from './middleware/access-log.js'
import { errorHandler, notFoundHandler } from './middleware/error-handler.js'
import { requestContext } from './middleware/request-context.js'
import { createBookingRouter } from './routes/booking.js'
import { createChatRouter } from './routes/chat.js'
import { createHealthRouter } from './routes/health.js'
import { createSearchRouter } from './routes/search.js'

/**
 * CORS tối giản: chỉ cho phép origin được cấu hình.
 * Viết tay để không thêm dependency cho một middleware vài dòng.
 */
function corsMiddleware(allowedOrigins: string[]) {
  const allowed = new Set(allowedOrigins)

  return (req: Request, res: Response, next: NextFunction): void => {
    const origin = req.header('origin')
    if (origin !== undefined && allowed.has(origin)) {
      res.setHeader('access-control-allow-origin', origin)
      res.setHeader('vary', 'origin')
      res.setHeader('access-control-allow-headers', 'content-type')
      res.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS')
    }

    if (req.method === 'OPTIONS') {
      res.status(204).end()
      return
    }

    next()
  }
}

export function createApp(deps: AppDependencies): Express {
  const app = express()

  app.disable('x-powered-by')
  app.use(express.json({ limit: '256kb' }))
  app.use(requestContext())
  app.use(corsMiddleware([deps.env.WEB_ORIGIN]))
  app.use(accessLog(deps.logger))

  app.use('/api/health', createHealthRouter(deps))
  app.use('/api/search', createSearchRouter(deps))
  app.use('/api/chat', createChatRouter(deps))
  app.use('/api/booking', createBookingRouter(deps))

  app.use(notFoundHandler)
  app.use(errorHandler(deps.logger))

  return app
}
