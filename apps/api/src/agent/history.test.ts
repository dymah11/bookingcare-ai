import { describe, expect, it } from 'vitest'
import { appendTurn, buildModelMessages, summarizeTurns } from './history.js'
import type { ConversationTurn } from './history.js'

function turn(role: 'user' | 'assistant', content: string, entities: string[] = []): ConversationTurn {
  return { role, content, entities }
}

describe('summarizeTurns', () => {
  it('rút gọn mỗi lượt thành một dòng', () => {
    const lines = summarizeTurns([
      turn('user', 'Bệnh viện tim mạch ở Hà Nội', ['Bệnh viện Mẫu Hà Nội']),
      turn('assistant', 'Đã tìm thấy 1 bệnh viện'),
    ])

    expect(lines).toHaveLength(2)
    expect(lines[0]).toContain('Hỏi')
    expect(lines[0]).toContain('Bệnh viện Mẫu Hà Nội')
    expect(lines[1]).toContain('Trả lời')
  })
})

describe('appendTurn', () => {
  it('giữ nguyên lịch sử khi chưa vượt giới hạn', () => {
    const history = { turns: [] as ConversationTurn[], summary: '' }
    const next = appendTurn(history, turn('user', 'xin chào'), 6)

    expect(next.turns).toHaveLength(1)
    expect(next.summary).toBe('')
  })

  it('rút gọn lượt cũ vào bản tóm tắt khi vượt giới hạn', () => {
    let history = { turns: [] as ConversationTurn[], summary: '' }
    for (let index = 0; index < 9; index += 1) {
      history = appendTurn(history, turn('user', `câu hỏi ${index}`), 6)
    }

    expect(history.turns).toHaveLength(6)
    expect(history.summary).toContain('câu hỏi 0')
    expect(history.summary).toContain('câu hỏi 2')
    expect(history.summary).not.toContain('câu hỏi 3')
  })

  it('giới hạn số dòng của bản tóm tắt', () => {
    let history = { turns: [] as ConversationTurn[], summary: '' }
    for (let index = 0; index < 60; index += 1) {
      history = appendTurn(history, turn('user', `câu hỏi ${index}`), 2)
    }

    expect(history.summary.split('\n').length).toBeLessThanOrEqual(30)
  })
})

describe('buildModelMessages', () => {
  it('luôn có system prompt đầu tiên', () => {
    const messages = buildModelMessages('SYSTEM', '', [])
    expect(messages).toHaveLength(1)
    expect(messages[0]?.content).toBe('SYSTEM')
  })

  it('chèn bản tóm tắt trước các lượt gần nhất', () => {
    const messages = buildModelMessages('SYSTEM', 'tóm tắt cũ', [
      turn('user', 'câu 1'),
      turn('assistant', 'trả lời 1'),
    ])

    expect(messages).toHaveLength(4)
    expect(String(messages[1]?.content)).toContain('tóm tắt cũ')
  })

  it('bỏ qua bản tóm tắt rỗng', () => {
    const messages = buildModelMessages('SYSTEM', '   ', [turn('user', 'câu 1')])
    expect(messages).toHaveLength(2)
  })
})
