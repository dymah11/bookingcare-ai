import { createLogger, type Env, type Logger } from '@bookingcare/shared'

export function createApiLogger(env: Env): Logger {
  return createLogger({
    level: env.LOG_LEVEL,
    base: { service: 'api' },
  })
}
