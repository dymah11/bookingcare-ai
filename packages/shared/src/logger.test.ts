import { describe, expect, it } from 'vitest'
import { createLogger, type LogLevel } from './logger.js'

function captureSink() {
  const lines: string[] = []
  const sink = (line: string, _level: LogLevel): void => {
    lines.push(line)
  }
  return { lines, sink }
}

describe('createLogger', () => {
  it('ghi log JSON một dòng kèm context', () => {
    const capture = captureSink()
    const logger = createLogger({
      level: 'info',
      base: { service: 'api' },
      sink: capture.sink,
    })

    logger.info('xin chào', { requestId: 'r1' })

    expect(capture.lines).toHaveLength(1)
    const parsed = JSON.parse(capture.lines[0] as string) as Record<string, unknown>
    expect(parsed.level).toBe('info')
    expect(parsed.message).toBe('xin chào')
    expect(parsed.service).toBe('api')
    expect(parsed.requestId).toBe('r1')
    expect(typeof parsed.ts).toBe('string')
  })

  it('bỏ qua log dưới ngưỡng', () => {
    const capture = captureSink()
    const logger = createLogger({ level: 'warn', sink: capture.sink })

    logger.info('bỏ qua')
    logger.warn('giữ lại')

    expect(capture.lines).toHaveLength(1)
  })

  it('child kế thừa và bổ sung context', () => {
    const capture = captureSink()
    const logger = createLogger({
      level: 'info',
      base: { service: 'api' },
      sink: capture.sink,
    }).child({ requestId: 'r2' })

    logger.info('ok')

    const parsed = JSON.parse(capture.lines[0] as string) as Record<string, unknown>
    expect(parsed.requestId).toBe('r2')
    expect(parsed.service).toBe('api')
  })

  it('không vỡ khi payload có vòng lặp tham chiếu', () => {
    const capture = captureSink()
    const logger = createLogger({ level: 'info', sink: capture.sink })

    const circular: Record<string, unknown> = { name: 'loop' }
    circular.self = circular

    expect(() => logger.info('circular', { circular })).not.toThrow()
    expect(capture.lines).toHaveLength(1)
  })
})
