import { randomUUID } from 'node:crypto'
import { Router, type Request, type Response } from 'express'
import { chatTurnRequestSchema } from '@bookingcare/shared'
import type { ChatEvent } from '../agent/types.js'
import type { AppDependencies } from '../dependencies.js'
import { getRequestContext } from '../middleware/request-context.js'

function wantsStream(req: Request, requested: boolean | undefined): boolean {
  if (requested === true) return true
  const accept = req.header('accept') ?? ''
  return accept.includes('text/event-stream')
}

function writeEvent(res: Response, event: ChatEvent): void {
  res.write(`event: ${event.type}\n`)
  res.write(`data: ${JSON.stringify(event)}\n\n`)
}

/**
 * `POST /api/chat`
 *
 * Nhận `{ sessionId?, message, stream? }`.
 * - `stream: true` hoặc `Accept: text/event-stream` → trả SSE (text + cards + booking).
 * - ngược lại → trả JSON `{ sessionId, answer, usage }`.
 */
export function createChatRouter(deps: AppDependencies): ReturnType<typeof Router> {
  const router = Router()

  router.post('/', async (req, res) => {
    const parsed = chatTurnRequestSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'INVALID_REQUEST',
          message: 'Nội dung yêu cầu không hợp lệ',
          details: parsed.error.flatten(),
        },
      })
      return
    }

    if (!deps.agent) {
      res.status(503).json({
        error: {
          code: 'AGENT_UNAVAILABLE',
          message: 'Trợ lý chưa được cấu hình (thiếu GEMINI_API_KEY)',
        },
      })
      return
    }

    const agent = deps.agent
    const sessionId = parsed.data.sessionId ?? randomUUID()
    const requestId = getRequestContext(req).requestId

    if (!wantsStream(req, parsed.data.stream)) {
      const result = await agent.answer({
        sessionId,
        message: parsed.data.message,
        requestId,
      })

      res.json({ sessionId, answer: result.answer, usage: result.usage })
      return
    }

    res.status(200)
    res.setHeader('content-type', 'text/event-stream; charset=utf-8')
    res.setHeader('cache-control', 'no-cache, no-transform')
    res.setHeader('connection', 'keep-alive')
    res.setHeader('x-accel-buffering', 'no')
    res.flushHeaders()

    writeEvent(res, { type: 'meta', sessionId, requestId })

    try {
      for await (const event of agent.stream({
        sessionId,
        message: parsed.data.message,
        requestId,
      })) {
        writeEvent(res, event)
      }
    } catch (error) {
      writeEvent(res, {
        type: 'error',
        message: error instanceof Error ? error.message : String(error),
      })
    } finally {
      res.end()
    }
  })

  return router
}
