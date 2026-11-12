const ENTITIES: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
}

export function decodeEntities(input: string): string {
  return input.replace(/&[a-z#0-9]+;/gi, (entity) => ENTITIES[entity.toLowerCase()] ?? entity)
}

/** Bỏ script/style và toàn bộ tag, rồi gộp khoảng trắng. */
export function stripTags(html: string): string {
  const withoutBlocks = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')

  return decodeEntities(withoutBlocks.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
}

export function extractTitle(html: string): string {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)
  const raw = match?.[1]
  return raw ? stripTags(raw) : ''
}

/** Lấy các link tuyệt đối trong HTML, bỏ qua fragment và link không hợp lệ. */
export function extractLinks(html: string, baseUrl: string): string[] {
  const links: string[] = []
  const pattern = /<a[^>]+href=["']([^"']+)["']/gi

  let match: RegExpExecArray | null = pattern.exec(html)
  while (match !== null) {
    const href = match[1]
    if (href !== undefined && href !== '' && !href.startsWith('#')) {
      try {
        links.push(new URL(href, baseUrl).toString())
      } catch {
        // bỏ qua link không hợp lệ
      }
    }
    match = pattern.exec(html)
  }

  return links
}
