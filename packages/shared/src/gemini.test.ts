import { describe, expect, it } from 'vitest'
import { loadEnv } from './env.js'
import { buildThinkingConfig, isChatModelId, supportsThinking } from './gemini.js'

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

  it('không gửi thinkingConfig cho model không hỗ trợ suy luận', () => {
    const env = loadEnv({})

    // Model TTS có generateContent nhưng không có thinking → gửi vào sẽ 400.
    expect(buildThinkingConfig('gemini-2.5-flash-preview-tts', env)).toBeUndefined()
  })
})

describe('isChatModelId', () => {
  it('loại các model không phải chat', () => {
    expect(isChatModelId('gemini-2.5-flash-preview-tts')).toBe(false)
    expect(isChatModelId('gemini-embedding-001')).toBe(false)
    expect(isChatModelId('imagen-3.0')).toBe(false)
  })

  it('giữ lại model chat', () => {
    expect(isChatModelId('gemini-3.8-flash')).toBe(true)
    expect(isChatModelId('gemini-2.5-flash')).toBe(true)
  })
})

describe('supportsThinking', () => {
  it('true cho dòng 2.5 flash/pro và dòng 3', () => {
    expect(supportsThinking('gemini-2.5-flash')).toBe(true)
    expect(supportsThinking('gemini-2.5-pro')).toBe(true)
    expect(supportsThinking('gemini-3.8-flash')).toBe(true)
  })

  it('false cho model TTS và model không chat', () => {
    expect(supportsThinking('gemini-2.5-flash-preview-tts')).toBe(false)
    expect(supportsThinking('gemini-embedding-001')).toBe(false)
  })
})
