import { partyTokens } from '../deals/entityNames'
import { fold, tokenMatches } from './normalize'

/**
 * Decides whether a quote really states WHICH SIDE a law firm advised.
 * "CMS advised the seller, while Dentons advised the buyer" supports
 * CMS→seller and Dentons→buyer, and nothing else. When the side is not
 * stated the firm is demoted to "other legal advisors" rather than guessed.
 */

export type Side = 'buyer' | 'seller'

const ROLE_STEMS: Record<Side, string[]> = {
  buyer: ['kupujac', 'nabywc', 'nabywaj', 'buyer', 'purchaser', 'acquirer', 'investor', 'inwestor', 'borrower', 'kredytobiorc'],
  seller: ['sprzedajac', 'sprzedawc', 'zbywc', 'zbywaj', 'seller', 'vendor'],
}

/** Clause boundaries: punctuation and contrastive conjunctions. */
const CLAUSE_SPLIT = /[.;,:]|\b(?:while|whereas|whilst|natomiast|zas|podczas gdy|z kolei|and separately)\b/

interface Clause {
  tokens: string[]
}

function clausesOf(quote: string): Clause[] {
  return fold(quote)
    .split(CLAUSE_SPLIT)
    .map((part) => ({ tokens: part.match(/[a-z0-9]+/g) ?? [] }))
    .filter((c) => c.tokens.length > 0)
}

function positionsOfName(tokens: string[], nameTokens: string[]): number[] {
  if (nameTokens.length === 0) return []
  const first = nameTokens[0]
  const positions: number[] = []
  tokens.forEach((t, i) => {
    if (!tokenMatches(first, t)) return
    const rest = nameTokens.slice(1)
    const window = tokens.slice(i + 1, i + 1 + rest.length + 3)
    if (rest.every((r) => window.some((w) => tokenMatches(r, w)))) positions.push(i)
  })
  return positions
}

function sideMarkers(tokens: string[], side: Side, clientTokens: string[]): number[] {
  const positions: number[] = []
  tokens.forEach((t, i) => {
    if (ROLE_STEMS[side].some((stem) => t.startsWith(stem))) positions.push(i)
  })
  positions.push(...positionsOfName(tokens, clientTokens))
  return positions
}

function nearest(from: number[], to: number[]): number {
  let best = Number.POSITIVE_INFINITY
  for (const a of from) for (const b of to) best = Math.min(best, Math.abs(a - b))
  return best
}

export interface RoleContext {
  buyer: string | null
  seller: string | null
}

export function advisorSideSupported(side: Side, firm: string, quote: string, context: RoleContext): boolean {
  const firmTokens = partyTokens(firm)
  if (firmTokens.length === 0) return false
  const other: Side = side === 'buyer' ? 'seller' : 'buyer'
  const clientOf = (s: Side) => partyTokens((s === 'buyer' ? context.buyer : context.seller) ?? '')
  const clauses = clausesOf(quote)

  let sawFirm = false
  for (const clause of clauses) {
    const firmAt = positionsOfName(clause.tokens, firmTokens)
    if (firmAt.length === 0) continue
    sawFirm = true
    const mine = sideMarkers(clause.tokens, side, clientOf(side))
    const theirs = sideMarkers(clause.tokens, other, clientOf(other))
    if (mine.length > 0 && theirs.length === 0) return true
    if (mine.length > 0 && theirs.length > 0 && nearest(firmAt, mine) < nearest(firmAt, theirs)) return true
    if (theirs.length > 0) return false
  }
  if (!sawFirm) return false

  // the firm's own clause names no side — accept only if the whole quote names exactly one
  const all = clauses.flatMap((c) => c.tokens)
  const mine = sideMarkers(all, side, clientOf(side))
  const theirs = sideMarkers(all, other, clientOf(other))
  return mine.length > 0 && theirs.length === 0
}
