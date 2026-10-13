import { currencyOf, numbersOf } from '../deals/dealValue'
import { dateStatedIn } from '../deals/dates'
import { partyTokens } from '../deals/entityNames'
import { fold, normalizeText, tokenize, tokenMatches } from './normalize'

/**
 * Evidence checks — the core anti-hallucination rule: a value is accepted only
 * if (1) its quote really occurs in the source text and (2) the value really
 * occurs in the quote. Both are decided by code, never by the model.
 */

const MIN_QUOTE_CHARS = 20
const MIN_FRAGMENT_CHARS = 12
const FUZZY_THRESHOLD = 0.92
const MIN_FUZZY_TOKENS = 6

/** Splits a quote the model shortened with an ellipsis into its real fragments. */
function quoteFragments(quote: string): string[] {
  return quote
    .split(/\s*(?:\[\s*(?:\.\.\.|…)\s*\]|\(\s*(?:\.\.\.|…)\s*\)|\.\.\.|…)\s*/)
    .map((f) => f.trim())
    .filter(Boolean)
}

/** Ordered fuzzy match: the quote's tokens appear, in order, in a window of the text. */
function fuzzyTokenMatch(quoteTokens: string[], textTokens: string[]): boolean {
  const n = quoteTokens.length
  if (n < MIN_FUZZY_TOKENS) return false
  const needed = Math.ceil(n * FUZZY_THRESHOLD)
  const slack = Math.max(2, Math.floor(n * 0.15))
  const anchors = new Set(quoteTokens.slice(0, 3))
  for (let start = 0; start < textTokens.length; start++) {
    if (!anchors.has(textTokens[start])) continue
    const end = Math.min(textTokens.length, start + n + slack)
    let qi = 0
    let matched = 0
    for (let ti = start; ti < end && qi < n; ti++) {
      // allow the quote to skip up to 2 of its own tokens to resynchronise
      for (let skip = 0; skip <= 2 && qi + skip < n; skip++) {
        if (quoteTokens[qi + skip] === textTokens[ti]) {
          matched += 1
          qi += skip + 1
          break
        }
      }
      if (matched + (n - qi) < needed) break
    }
    if (matched >= needed) return true
  }
  return false
}

export interface PreparedText {
  folded: string
  tokens: string[]
}

export function prepareText(text: string): PreparedText {
  return { folded: fold(text), tokens: tokenize(text) }
}

/** True when the quote occurs in the text (exactly after normalisation, or near-exactly). */
export function quoteInText(quote: string, text: PreparedText): boolean {
  const whole = normalizeText(quote)
  if (whole.length < MIN_QUOTE_CHARS) return false
  const fragments = quoteFragments(quote)
  if (fragments.length === 0) return false
  return fragments.every((fragment) => {
    const folded = fold(fragment).replace(/^["']+|["']+$/g, '').trim()
    if (folded.length < Math.min(MIN_FRAGMENT_CHARS, MIN_QUOTE_CHARS)) return fragments.length > 1 && folded.length >= 4 && text.folded.includes(folded)
    if (text.folded.includes(folded)) return true
    return fuzzyTokenMatch(tokenize(fragment), text.tokens)
  })
}

/** A role word standing alone in place of a name. */
const ROLE_ONLY = /^(inwestor|nabywca|kupujacy|sprzedajacy|podmiot|investor|buyer|seller|purchaser|vendor|the buyer|the seller|the purchaser|the vendor|a buyer|a seller)\.?$/
/** Phrases that describe a party instead of naming it, wherever they occur. */
const DESCRIPTIVE_PHRASE =
  /\b(osob[aąy] (prawn|fizyczn)|polsk\w* spolk|spolk\w* celow|nieujawnion|nie ujawnion|undisclosed|not disclosed|unnamed|private investor|institutional investor|joint venture between|consortium of|group of investors|fund managed by|developers? operating|company focused)/
/** An article followed by a lower-case word: "a Polish company", "the buyer's SPV" — but not "The Student Hotel". */
const LEADING_ARTICLE = /^(a|an|the|one|two|three|several|local) [a-ząćęłńóśźż]/
const MAX_NAME_WORDS = 6

/**
 * True when the value is a description of a party, not its name: "osoba prawna",
 * "a US real estate investment company", "Nabywca pozostaje nieujawniony".
 * The model is told to return null in such cases; this is the code-level guard.
 */
export function isDescriptiveParty(value: string): boolean {
  const folded = fold(value)
  if (ROLE_ONLY.test(folded) || DESCRIPTIVE_PHRASE.test(folded)) return true
  if (LEADING_ARTICLE.test(value.trim())) return true
  return tokenize(value).length > MAX_NAME_WORDS
}

/** True when every identifying token of the name occurs in the quote. */
export function nameInQuote(name: string, quote: string): boolean {
  const nameTokens = partyTokens(name)
  const quoteTokens = tokenize(quote)
  if (nameTokens.length === 0) {
    const folded = fold(name)
    return folded.length >= 2 && fold(quote).includes(folded)
  }
  return nameTokens.every((t) => quoteTokens.some((q) => tokenMatches(t, q)))
}

/** True when the amount and its currency are both written in the quote. */
export function valueInQuote(value: string, quote: string): boolean {
  const valueNumbers = numbersOf(value)
  if (valueNumbers.length === 0) return false
  const quoteNumbers = new Set(numbersOf(quote))
  if (!valueNumbers.every((n) => quoteNumbers.has(n))) return false
  const currency = currencyOf(value)
  if (!currency) return false
  return currencyOf(quote) === currency || quoteHasCurrency(quote, currency)
}

/** A quote may mention two currencies ("EUR 100m (PLN 430m)") — accept any occurrence. */
function quoteHasCurrency(quote: string, currency: string): boolean {
  const folded = fold(quote)
  const patterns: Record<string, RegExp> = {
    EUR: /€|\beur\b|\beuro\b|\beuros\b/,
    PLN: /\bpln\b|\bzl\b|\bzlot(?:y|ych|e)\b/,
    USD: /\$|\busd\b|\bdolar(?:ow|y)?\b|\bdollars?\b/,
    GBP: /£|\bgbp\b|\bfunt(?:ow|y)?\b|\bpounds?\b/,
  }
  return patterns[currency]?.test(folded) ?? false
}

export function dateInQuote(iso: string, quote: string): boolean {
  return dateStatedIn(iso, quote)
}

const MIN_DATE_QUOTE_CHARS = 6

/**
 * A date quote is often nothing more than the printed date itself ("05 Oct 2026",
 * "Dodano: 30 wrz 2026") — too short for the general quote rule, but a verbatim
 * occurrence in the text is still demanded.
 */
export function dateQuoteInText(quote: string, text: PreparedText): boolean {
  const folded = fold(quote).replace(/^["']+|["']+$/g, '').trim()
  if (folded.length < MIN_DATE_QUOTE_CHARS) return false
  return text.folded.includes(folded) || quoteInText(quote, text)
}

export type EvidenceFailure = 'quote_not_found' | 'value_not_in_quote' | 'not_a_name'

export type ValueKind = 'name' | 'amount'

/** Full check of one {value, quote} pair against the source text. */
export function checkEvidence(value: string, quote: string, text: PreparedText, kind: ValueKind): EvidenceFailure | null {
  if (!value.trim() || !quote.trim()) return 'quote_not_found'
  if (kind === 'name' && isDescriptiveParty(value)) return 'not_a_name'
  if (!quoteInText(quote, text)) return 'quote_not_found'
  const ok = kind === 'amount' ? valueInQuote(value, quote) : nameInQuote(value, quote)
  return ok ? null : 'value_not_in_quote'
}
