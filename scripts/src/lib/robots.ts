export type RobotsRules = {
  allow: string[]
  disallow: string[]
}

type Group = {
  agents: string[]
  rules: { type: 'allow' | 'disallow'; path: string }[]
}

/**
 * Parse `robots.txt` theo nhóm `User-agent` và lấy nhóm khớp với user agent.
 * Nhóm `*` được dùng làm fallback.
 */
export function parseRobots(content: string, userAgent: string): RobotsRules {
  const groups: Group[] = []
  let current: Group | null = null
  let previousWasAgent = false

  for (const rawLine of content.split('\n')) {
    const withoutComment = rawLine.split('#')[0] ?? ''
    const line = withoutComment.trim()
    if (line === '') continue

    const separator = line.indexOf(':')
    if (separator === -1) continue

    const field = line.slice(0, separator).trim().toLowerCase()
    const value = line.slice(separator + 1).trim()

    if (field === 'user-agent') {
      if (current === null || !previousWasAgent) {
        current = { agents: [], rules: [] }
        groups.push(current)
      }
      current.agents.push(value.toLowerCase())
      previousWasAgent = true
      continue
    }

    previousWasAgent = false
    if (current === null) continue

    if (field === 'allow' || field === 'disallow') {
      if (value !== '') {
        current.rules.push({ type: field, path: value })
      }
    }
  }

  const agent = userAgent.toLowerCase()
  const matching =
    groups.find((group) => group.agents.some((name) => agent.includes(name))) ??
    groups.find((group) => group.agents.includes('*'))

  if (!matching) {
    return { allow: [], disallow: [] }
  }

  return {
    allow: matching.rules.filter((rule) => rule.type === 'allow').map((rule) => rule.path),
    disallow: matching.rules.filter((rule) => rule.type === 'disallow').map((rule) => rule.path),
  }
}

/**
 * `Disallow` chặn đường dẫn. Nếu cả `Allow` và `Disallow` cùng khớp thì rule
 * dài hơn thắng (đúng theo spec robots.txt).
 */
export function isPathAllowed(rules: RobotsRules, pathname: string): boolean {
  const disallowLength = rules.disallow
    .filter((pattern) => pattern !== '' && pathname.startsWith(pattern))
    .reduce((longest, pattern) => Math.max(longest, pattern.length), 0)

  if (disallowLength === 0) {
    return true
  }

  const allowLength = rules.allow
    .filter((pattern) => pattern !== '' && pathname.startsWith(pattern))
    .reduce((longest, pattern) => Math.max(longest, pattern.length), 0)

  return allowLength > disallowLength
}
