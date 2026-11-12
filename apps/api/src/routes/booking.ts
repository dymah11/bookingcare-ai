import { Router } from 'express'
import { bookingDraftInputSchema } from '@bookingcare/shared'
import type { AppDependencies } from '../dependencies.js'

export function createBookingRouter(deps: AppDependencies): ReturnType<typeof Router> {
  const router = Router()

  router.post('/draft', async (req, res) => {
    const parsed = bookingDraftInputSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'INVALID_DRAFT',
          message: 'Thông tin đặt lịch không hợp lệ',
          details: parsed.error.flatten(),
        },
      })
      return
    }

    const draft = await deps.drafts.create(parsed.data)
    res.status(201).json({
      draftId: draft.id,
      createdAt: draft.createdAt,
      bookingcareUrl: draft.bookingcareUrl,
    })
  })

  router.get('/drafts', async (_req, res) => {
    const drafts = await deps.drafts.list()
    res.json({ drafts })
  })

  return router
}
