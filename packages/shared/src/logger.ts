export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export type LogFields = Record<string, unknown>

export type Logger = {
  debug(message: string, fields?: LogFields): void
  info(message: string, fields?: LogFields): void
  warn(message: string, fields?: LogFields): void
  error(message: string, fields?: LogFields): void
  child(fields: LogFields): Logger
}

export type LoggerOptions = {
  level: LogLevel
  base?: LogFields
  sink?: (line: string, level: LogLevel) => void
}

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
}

/**
 * Sink mặc định ghi ra console dưới dạng JSON một dòng.
 * Dùng `globalThis.console` để package không phụ thuộc `process` (web-safe).
 */
function defaultSink(line: string, level: LogLevel): void {
  if (level === 'error') {
    globalThis.console.error(line)
    return
  }
  if (level === 'warn') {
    globalThis.console.warn(line)
    return
  }
  globalThis.console.log(line)
}

function safeStringify(payload: unknown): string {
  const seen = new WeakSet<object>()
  try {
    const json = JSON.stringify(payload, (_key: string, value: unknown): unknown => {
      if (typeof value === 'bigint') return value.toString()
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) return '[Circular]'
        seen.add(value)
      }
      return value
    })
    return json ?? '{}'
  } catch {
    return JSON.stringify({ level: 'error', message: 'Không serialize được log payload' })
  }
}

export function createLogger(options: LoggerOptions): Logger {
  const level = options.level
  const base = options.base ?? {}
  const sink = options.sink ?? defaultSink
  const threshold = LEVEL_ORDER[level]

  const write = (logLevel: LogLevel, message: string, fields?: LogFields): void => {
    if (LEVEL_ORDER[logLevel] < threshold) return
    const payload = {
      ts: new Date().toISOString(),
      level: logLevel,
      message,
      ...base,
      ...(fields ?? {}),
    }
    sink(safeStringify(payload), logLevel)
  }

  return {
    debug: (message, fields) => write('debug', message, fields),
    info: (message, fields) => write('info', message, fields),
    warn: (message, fields) => write('warn', message, fields),
    error: (message, fields) => write('error', message, fields),
    child: (fields) => createLogger({ level, base: { ...base, ...fields }, sink }),
  }
}
