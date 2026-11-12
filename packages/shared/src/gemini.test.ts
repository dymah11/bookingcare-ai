import { describe, expect, it } from 'vitest'
import { loadEnv } from './env.js'
import { buildThinkingConfig } from './gemini.js'

describe('buildThinkingConfig', () => {
  it('dùng thinkingLevel cho dòng Gemini 3 (giá trị viết HOA)', () => {
    const env = loadEnv({ GEMINI_THINKING_LEVEL: 'medium' })

    expect(buildThinkingConfig('gemini-3.8-flash', env)).toEqual({ thinkingLevel: 'MEDIUM' })
  })

  it('dùng thinkingBudget cho dòng Gemini 2.5', () => {
    const env = loadEnv({ GEMINI_THINKING_BUDGET: '256' })

    expect(buildThinkingConfig('gemini-2.5-flash', env)).toEqual({ thinkingBudget: 256 })
  })

  it('clamp budget nhỏ hơn maxOutputTokens', () => {
    const env = loadEnv({ GEMINI_THINKING_BUDGET: '1024' })

    expect(buildThinkingConfig('gemini-2.5-flash', env, 500)).toEqual({ thinkingBudget: 499 })
  })

  it('tắt suy luận khi budget bằng 0', () => {
    const env = loadEnv({ GEMINI_THINKING_BUDGET: '0' })

    expect(buildThinkingConfig('gemini-2.5-flash', env)).toBeUndefined()
  })
})
