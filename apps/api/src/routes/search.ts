import { Router } from 'express'
import { searchQuerySchema } from '@bookingcare/shared'
import type { AppDependencies } from '../dependencies.js'

function readQuery(raw: unknown): Record<string, unknown> {
  if (typeof raw === 'object' && raw !== null) {
    return raw as Record<string, unknown>
  }
  return {}
}

function queryString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value
  }
  if (Array.isArray(value)) {
    const first = value[0]
    return typeof first === 'string' ? first : undefined
  }
  return undefined
}

export function createSearchRouter(deps: AppDependencies): ReturnType<typeof Router> {
  const router = Router()

  router.get('/', async (req, res) => {
    const query = readQuery(req.query)
    const parsed = searchQuerySchema.safeParse({
      q: queryString(query.q),
      topK: queryString(query.topK),
      type: queryString(query.type),
      specialty: queryString(query.specialty),
      area: queryString(query.area),
    })

    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'INVALID_QUERY',
          message: 'Câu truy vấn không hợp lệ',
          details: parsed.error.flatten(),
        },
      })
      return
    }

    const hits = await deps.store.search(parsed.data.q, {
      k: parsed.data.topK,
      type: parsed.data.type,
      specialty: parsed.data.specialty,
      area: parsed.data.area,
    })

    res.json({
      query: parsed.data.q,
      total: hits.length,
      hits,
    })
  })

  return router
}
