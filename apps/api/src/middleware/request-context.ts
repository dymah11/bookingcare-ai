import { randomUUID } from 'node:crypto'
import type { NextFunction, Request, Response } from 'express'

export type RequestContext = {
  requestId: string
  startedAt: number
}

/**
 * Context theo request.
 *
 * Dùng WeakMap thay vì augment `res.locals` để không phụ thuộc vào cách
 * `@types/express` khai báo generic `Locals` (khác nhau giữa các phiên bản).
 */
const contexts = new WeakMap<Request, RequestContext>()

export function getRequestContext(req: Request): RequestContext {
  return contexts.get(req) ?? { requestId: 'unknown', startedAt: Date.now() }
}

/**
 * Gán `requestId` cho mỗi request để log có thể truy vết xuyên suốt.
 * Client có thể gửi `x-request-id` để tự gắn trace id của họ.
 */
export function requestContext() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const incoming = req.header('x-request-id')
    const requestId = incoming !== undefined && incoming.length <= 128 ? incoming : randomUUID()

    contexts.set(req, { requestId, startedAt: Date.now() })
    res.setHeader('x-request-id', requestId)

    next()
  }
}
