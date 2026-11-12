import type { NextFunction, Request, Response } from 'express'
import type { ApiErrorBody, Logger } from '@bookingcare/shared'
import { getRequestContext } from './request-context.js'

function extractStatus(error: unknown): number {
  if (typeof error === 'object' && error !== null && 'status' in error) {
    const status = (error as { status?: unknown }).status
    if (typeof status === 'number' && status >= 400 && status <= 599) {
      return status
    }
  }
  return 500
}

export function notFoundHandler(req: Request, res: Response): void {
  const body: ApiErrorBody = {
    error: {
      code: 'NOT_FOUND',
      message: `Không tìm thấy route ${req.method} ${req.path}`,
    },
  }
  res.status(404).json(body)
}

/**
 * Error handler cuối cùng: log có cấu trúc và trả về JSON thống nhất.
 * Lỗi 5xx không lộ chi tiết nội bộ ra ngoài.
 */
export function errorHandler(logger: Logger) {
  return (error: unknown, req: Request, res: Response, _next: NextFunction): void => {
    const status = extractStatus(error)
    const message = error instanceof Error ? error.message : String(error)
    const context = getRequestContext(req)

    logger.error('request_failed', {
      requestId: context.requestId,
      method: req.method,
      path: req.originalUrl,
      status,
      error: message,
    })

    const body: ApiErrorBody = {
      error: {
        code: status >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_ERROR',
        message: status >= 500 ? 'Đã xảy ra lỗi hệ thống' : 'Yêu cầu không hợp lệ',
      },
    }
    if (status < 500) {
      body.error.details = message
    }

    res.status(status).json(body)
  }
}
