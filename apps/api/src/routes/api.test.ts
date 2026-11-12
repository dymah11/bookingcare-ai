import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createLogger } from '@bookingcare/shared'
import { createApp } from '../app.js'
import { SessionStore } from '../agent/session.js'
import { BookingDraftStore } from '../booking/drafts.js'
import { readEnv } from '../config/env.js'
import type { AppDependencies } from '../dependencies.js'
import { RetrievalStore } from '../retrieval/store.js'

async function buildDeps(): Promise<AppDependencies> {
  const env = readEnv({ NODE_ENV: 'test' })
  const dir = await mkdtemp(join(tmpdir(), 'bookingcare-api-test-'))

  return {
    env,
    logger: createLogger({ level: 'error', sink: () => undefined }),
    store: RetrievalStore.empty(),
    sessions: new SessionStore(),
    drafts: new BookingDraftStore({
      filePath: join(dir, 'booking-drafts.json'),
      baseUrl: env.BOOKINGCARE_BASE_URL,
    }),
    agent: null,
  }
}

describe('HTTP API', () => {
  it('GET /api/health trả về ok', async () => {
    const deps = await buildDeps()
    const response = await request(createApp(deps)).get('/api/health')

    expect(response.status).toBe(200)
    expect(response.body.status).toBe('ok')
    expect(response.body.assistantEnabled).toBe(false)
  })

  it('GET /api/search trả 400 khi thiếu q', async () => {
    const deps = await buildDeps()
    const response = await request(createApp(deps)).get('/api/search')

    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('INVALID_QUERY')
  })

  it('GET /api/search trả 200 khi có q', async () => {
    const deps = await buildDeps()
    const response = await request(createApp(deps)).get('/api/search').query({ q: 'tim mach' })

    expect(response.status).toBe(200)
    expect(response.body.total).toBe(0)
  })

  it('POST /api/chat trả 503 khi chưa cấu hình trợ lý', async () => {
    const deps = await buildDeps()
    const response = await request(createApp(deps)).post('/api/chat').send({ message: 'xin chào' })

    expect(response.status).toBe(503)
    expect(response.body.error.code).toBe('AGENT_UNAVAILABLE')
  })

  it('POST /api/chat trả 400 khi message rỗng', async () => {
    const deps = await buildDeps()
    const response = await request(createApp(deps)).post('/api/chat').send({ message: '' })

    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('INVALID_REQUEST')
  })

  it('POST /api/booking/draft tạo booking draft và trả link', async () => {
    const deps = await buildDeps()
    const response = await request(createApp(deps))
      .post('/api/booking/draft')
      .send({
        specialtyId: 'tim-mach',
        hospitalId: 'bv-1',
        date: '2026-01-01',
        time: '09:30',
        patientName: 'Nguyễn An',
        patientPhone: '0900000000',
      })

    expect(response.status).toBe(201)
    expect(response.body.bookingcareUrl).toContain('bookingcare.vn')
  })

  it('POST /api/booking/draft trả 400 khi thiếu thông tin', async () => {
    const deps = await buildDeps()
    const response = await request(createApp(deps)).post('/api/booking/draft').send({ hospitalId: 'bv-1' })

    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('INVALID_DRAFT')
  })

  it('route lạ trả 404 dạng JSON', async () => {
    const deps = await buildDeps()
    const response = await request(createApp(deps)).get('/khong-ton-tai')

    expect(response.status).toBe(404)
    expect(response.body.error.code).toBe('NOT_FOUND')
  })

  it('gán x-request-id cho mọi request', async () => {
    const deps = await buildDeps()
    const response = await request(createApp(deps)).get('/api/health')

    expect(response.headers['x-request-id']).toBeTruthy()
  })
})
