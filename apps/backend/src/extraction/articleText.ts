/**
 * Article text preparation. The cleaned text is BOTH what the model reads and
 * what quotes are verified against, so the two can never drift apart.
 */

const MAX_CHARS = 14000
const HEAD_CHARS = 10000
const TAIL_CHARS = 4000

export const MIN_ARTICLE_CHARS = 200

/** Strips markdown images, link-only lines and markup; keeps link text. */
export function cleanArticleText(raw: string): string {
  const lines = String(raw ?? '')
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => {
      if (!line) return false
      if (line.startsWith('![')) return false
      // navigation: a line that is nothing but one markdown link
      if (/^[-*•]?\s*\[[^\]]*\]\([^)]*\)$/.test(line)) return false
      return true
    })
    .map((line) =>
      line
        .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replace(/<[^>]+>/g, ' ')
        .replace(/^#{1,6}\s+/, '')
        .replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, '$1'),
    )
  return lines.join('\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
}

/**
 * Caps very long pages. Keeps the head and the tail: advisor credits usually
 * sit in the last paragraph of a press release.
 */
export function capArticleText(text: string): string {
  if (text.length <= MAX_CHARS) return text
  return `${text.slice(0, HEAD_CHARS).trimEnd()}\n\n${text.slice(-TAIL_CHARS).trimStart()}`
}

export function prepareArticleText(raw: string): string {
  return capArticleText(cleanArticleText(raw))
}

/** Canonical URL for deduplication: no fragment, tracking params or trailing slash. */
export function canonicalUrl(url: string): string {
  try {
    const u = new URL(url.trim())
    u.hash = ''
    for (const key of [...u.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|mc_|ref$|source$)/i.test(key)) u.searchParams.delete(key)
    }
    const path = u.pathname.replace(/\/+$/, '')
    const query = u.searchParams.toString()
    return `${u.protocol}//${u.hostname.toLowerCase().replace(/^www\./, '')}${path}${query ? `?${query}` : ''}`
  } catch {
    return url.trim().toLowerCase()
  }
}

export function isPdfUrl(url: string): boolean {
  return /\.pdf(?:$|[?#])/i.test(url)
}

/**
 * Pages that are never a deal report: lawyer profiles, practice and capability
 * pages, job ads, magazine issues, tag and category listings. They mention
 * dozens of past transactions and used to flood the extraction with history.
 */
const EXCLUDED_PATH = /\/(people|professionals|lawyer|lawyers|team|find-your-dentons-team|practices|capabilities|eurojobs|magazine|tag|tags|category|partner|partners|author|authors)(?:\/|$)/i

export function isExcludedPath(url: string): boolean {
  try {
    return EXCLUDED_PATH.test(new URL(url).pathname)
  } catch {
    return false
  }
}
