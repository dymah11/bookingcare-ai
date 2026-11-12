import { describe, expect, it } from 'vitest'
import { loadEnv } from './env.js'

describe('loadEnv', () => {
  it('áp dụng giá trị mặc định khi biến trống', () => {
    const env = loadEnv({ PORT: '', GEMINI_API_KEY: '' })
    expect(env.PORT).toBe(3001)
    expect(env.GEMINI_API_KEY).toBe('')
    expect(env.GEMINI_MODEL).toBe('gemini-3.8-flash')
    expect(env.GEMINI_JUDGE_MODEL).toBe('gemini-3.8-flash')
    expect(env.GEMINI_EMBEDDING_MODEL).toBe('gemini-embedding-001')
    expect(env.GEMINI_THINKING_LEVEL).toBe('medium')
    expect(env.GEMINI_THINKING_BUDGET).toBe(256)
  })

  it('parse được số và enum', () => {
    const env = loadEnv({ PORT: '4000', NODE_ENV: 'test', LOG_LEVEL: 'debug' })
    expect(env.PORT).toBe(4000)
    expect(env.NODE_ENV).toBe('test')
    expect(env.LOG_LEVEL).toBe('debug')
  })

  it('đọc được model id và ngân sách suy luận từ env', () => {
    const env = loadEnv({
      GEMINI_MODEL: 'gemini-3-pro-preview',
      GEMINI_THINKING_LEVEL: 'high',
      GEMINI_THINKING_BUDGET: '2048',
    })

    expect(env.GEMINI_MODEL).toBe('gemini-3-pro-preview')
    expect(env.GEMINI_THINKING_LEVEL).toBe('high')
    expect(env.GEMINI_THINKING_BUDGET).toBe(2048)
  })

  it('GEMINI_THINKING_LEVEL mặc định là medium', () => {
    expect(loadEnv({}).GEMINI_THINKING_LEVEL).toBe('medium')
  })

  it('đọc được cờ bật embedding và quota mỗi phút', () => {
    const env = loadEnv({ INDEX_EMBEDDINGS: 'false', EMBEDDING_RATE_PER_MINUTE: '60' })

    expect(env.INDEX_EMBEDDINGS).toBe('false')
    expect(env.EMBEDDING_RATE_PER_MINUTE).toBe(60)
  })

  it('mặc định bật embedding với quota 100/phút', () => {
    const env = loadEnv({})

    expect(env.INDEX_EMBEDDINGS).toBe('true')
    expect(env.EMBEDDING_RATE_PER_MINUTE).toBe(100)
  })

  it('ném lỗi khi cấu hình sai', () => {
    expect(() => loadEnv({ PORT: 'abc' })).toThrow(/Cấu hình môi trường/)
  })
})
