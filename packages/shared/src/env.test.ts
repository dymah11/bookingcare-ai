import { describe, expect, it } from 'vitest'
import { loadEnv } from './env.js'

describe('loadEnv', () => {
  it('áp dụng giá trị mặc định khi biến trống', () => {
    const env = loadEnv({ PORT: '', ANTHROPIC_API_KEY: '' })
    expect(env.PORT).toBe(3001)
    expect(env.ANTHROPIC_API_KEY).toBe('')
    expect(env.ASSISTANT_MODEL).toBe('claude-haiku-5-5')
    expect(env.JUDGE_MODEL).toBe('gpt-5.4')
  })

  it('parse được số và enum', () => {
    const env = loadEnv({ PORT: '4000', NODE_ENV: 'test', LOG_LEVEL: 'debug' })
    expect(env.PORT).toBe(4000)
    expect(env.NODE_ENV).toBe('test')
    expect(env.LOG_LEVEL).toBe('debug')
  })

  it('ném lỗi khi cấu hình sai', () => {
    expect(() => loadEnv({ PORT: 'abc' })).toThrow(/Cấu hình môi trường/)
  })
})
