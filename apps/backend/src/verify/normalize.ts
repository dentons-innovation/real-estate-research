/**
 * Text normalisation shared by evidence checks and deduplication.
 * Everything here is pure and deterministic.
 */

/** Lowercase, NFKC, unified quotes/dashes, no soft hyphens, single spaces. */
export function normalizeText(input: string): string {
  return input
    .normalize('NFKC')
    .replace(/­/g, '')
    .replace(/[‘’‚‛′`´]/g, "'")
    .replace(/[“”„‟«»″]/g, '"')
    .replace(/[‐-―−]/g, '-')
    .replace(/ | | /g, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** Removes diacritics, including the Polish ł which NFD does not decompose. */
export function stripDiacritics(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ł/g, 'l')
    .replace(/Ł/g, 'L')
}

/** Normalised, diacritic-free form used for matching. */
export function fold(input: string): string {
  return stripDiacritics(normalizeText(input))
}

/** Letter/digit tokens of the folded text. Decimal numbers stay whole ("36.4"). */
export function tokenize(input: string): string[] {
  return fold(input).match(/\d+(?:[.,]\d+)*|[a-z0-9]+/g) ?? []
}

export function commonPrefixLength(a: string, b: string): number {
  const max = Math.min(a.length, b.length)
  let i = 0
  while (i < max && a[i] === b[i]) i++
  return i
}

/**
 * Inflection-tolerant token match: "Warszawie" ~ "Warszawa", "Ghelamco" ~ "Ghelamco".
 * Short tokens (≤ 4 chars) must match exactly — "CMS" must not match "CMSX".
 */
export function tokenMatches(needle: string, candidate: string): boolean {
  if (needle === candidate) return true
  if (needle.length <= 4 || candidate.length <= 4) return false
  const required = Math.max(4, Math.min(needle.length, candidate.length) - 2)
  if (Math.abs(needle.length - candidate.length) > 4) return false
  return commonPrefixLength(needle, candidate) >= required
}
