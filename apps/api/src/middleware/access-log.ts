import type { NextFunction, Request, Response } from 'express'
import type { Logger } from '@bookingcare/shared'
import { getRequestContext } from './request-context.js'

/** Log mỗi request ở dạng JSON một dòng, kèm thời gian xử lý. */
export function accessLog(logger: Logger) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const context = getRequestContext(req)

    res.on('finish', () => {
      logger.info('http_request', {
        requestId: context.requestId,
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        durationMs: Date.now() - context.startedAt,
      })
    })

    next()
  }
}
