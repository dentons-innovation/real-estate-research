import type { TransactionType } from '@re/shared'
import { canonicalUrl } from '../extraction/articleText'
import type { CandidateDeal, MergedDeal } from '../types'

import { fold } from '../verify/normalize'
import { daysBetween } from './dates'
import { valuesConflict, valuesEqual } from './dealValue'
import { assetSimilarity, assetTokens, canonicalCity, cityTokenOf, partySimilarity, sharedAssetTokens } from './entityNames'

/**
 * Deterministic deduplication. Two reports are the same deal when their
 * similarity score passes the threshold and no hard veto applies. The result
 * does not depend on input order.
 */

export const MERGE_THRESHOLD = 0.72
const SHARED_URL_ASSET_SIM = 0.5
const PARTY_VETO_BELOW = 0.34
/** Parties this similar are the same company. */
const SAME_PARTY = 0.8
const MAX_DATE_GAP_DAYS = 45

const WEIGHTS = { asset: 0.55, party: 0.2, value: 0.15, date: 0.1 }
/** Used when an asset has no identifying name ("office building in Warsaw"). */
const WEIGHTS_UNNAMED = { party: 0.6, value: 0.25, date: 0.15 }

/** The comparable essence of a deal, from a candidate or a merged deal. */
export interface DealKey {
  assetNames: string[]
  city: string | null
  family: 'transfer' | 'financing' | 'jv'
  buyer: string | null
  seller: string | null
  value: string | null
  date: string | null
  /** Names of the other parties (agents, lenders, partners). */
  others: string[]
  urls: string[]
}

export function familyOf(type: TransactionType): DealKey['family'] {
  if (type === 'financing') return 'financing'
  if (type === 'JV') return 'jv'
  return 'transfer'
}

export function keyOfCandidate(c: CandidateDeal): DealKey {
  return {
    assetNames: [c.assetName],
    city: c.city,
    family: familyOf(c.transactionType),
    buyer: c.fields.buyer?.value ?? null,
    seller: c.fields.seller?.value ?? null,
    value: c.fields.deal_value?.value ?? null,
    date: c.announcementDate,
    others: c.otherParties.map((p) => p.name),
    urls: [canonicalUrl(c.source.url)],
  }
}

export function keyOfMerged(d: MergedDeal): DealKey {
  return {
    assetNames: d.assetNames,
    city: d.city,
    family: familyOf(d.transactionType),
    buyer: d.fields.buyer?.[0]?.value ?? null,
    seller: d.fields.seller?.[0]?.value ?? null,
    value: d.fields.deal_value?.[0]?.value ?? null,
    date: d.announcementDate,
    others: d.otherParties.map((p) => p.name),
    urls: d.sources.map((s) => canonicalUrl(s.url)),
  }
}

export interface Comparison {
  score: number
  vetoed: boolean
  vetoReason?: string
}

function bestAssetSimilarity(a: DealKey, b: DealKey): number {
  let best = 0
  for (const x of a.assetNames) for (const y of b.assetNames) best = Math.max(best, assetSimilarity(x, y))
  return best
}

function cityOf(key: DealKey): string | null {
  if (key.city) return canonicalCity(key.city)
  for (const name of key.assetNames) {
    const city = cityTokenOf(name)
    if (city) return city
  }
  return null
}

/** Inflected forms of a city the table does not know still match on their stem. */
const sameCity = (a: string, b: string) => a === b || (Math.min(a.length, b.length) >= 5 && (a.startsWith(b) || b.startsWith(a)))

export function compareDeals(a: DealKey, b: DealKey): Comparison {
  // financing of a building and its sale are different transactions
  if ((a.family === 'financing') !== (b.family === 'financing')) return { score: 0, vetoed: true, vetoReason: 'family' }

  const buyerSim = a.buyer && b.buyer ? partySimilarity(a.buyer, b.buyer) : null
  const sellerSim = a.seller && b.seller ? partySimilarity(a.seller, b.seller) : null
  if (buyerSim !== null && buyerSim < PARTY_VETO_BELOW) return { score: 0, vetoed: true, vetoReason: 'buyer' }
  if (a.value && b.value && valuesConflict(a.value, b.value)) return { score: 0, vetoed: true, vetoReason: 'value' }
  if (a.date && b.date && daysBetween(a.date, b.date) > MAX_DATE_GAP_DAYS) return { score: 0, vetoed: true, vetoReason: 'date' }
  const cityA = cityOf(a)
  const cityB = cityOf(b)
  if (cityA && cityB && !sameCity(cityA, cityB)) return { score: 0, vetoed: true, vetoReason: 'city' }
  // "Phase 1" and "Phase 2", "Varso 1" and "Varso 2": numbered assets with no number in common are different assets
  const numbersA = numberTokens(a)
  const numbersB = numberTokens(b)
  if (numbersA.size > 0 && numbersB.size > 0 && ![...numbersA].some((n) => numbersB.has(n))) return { score: 0, vetoed: true, vetoReason: 'number' }

  const partySims = [buyerSim, sellerSim].filter((s): s is number => s !== null)
  const party = partySims.length > 0 ? partySims.reduce((x, y) => x + y, 0) / partySims.length : null
  const value = a.value && b.value ? (valuesEqual(a.value, b.value) ? 1 : 0) : null
  const date = a.date && b.date ? 1 - Math.min(daysBetween(a.date, b.date), MAX_DATE_GAP_DAYS) / MAX_DATE_GAP_DAYS : null

  const named = a.assetNames.some((n) => assetTokens(n).length > 0) && b.assetNames.some((n) => assetTokens(n).length > 0)
  if (!named) {
    // nothing identifies the asset — parties must carry the match, plus a second signal
    if (party === null || party < 0.8) return { score: 0, vetoed: false }
    if (value === null && date === null) return { score: 0, vetoed: false }
    const w = WEIGHTS_UNNAMED
    const total = w.party + (value !== null ? w.value : 0) + (date !== null ? w.date : 0)
    const sum = w.party * party + (value ?? 0) * (value !== null ? w.value : 0) + (date ?? 0) * (date !== null ? w.date : 0)
    return { score: sum / total, vetoed: false }
  }

  const asset = bestAssetSimilarity(a, b)
  const shareUrl = a.urls.some((u) => b.urls.includes(u))
  // score over the components both sides actually state
  const w = WEIGHTS
  let total = w.asset
  let sum = w.asset * asset
  if (party !== null) {
    total += w.party
    sum += w.party * party
  }
  if (value !== null) {
    total += w.value
    sum += w.value * value
  }
  if (date !== null) {
    total += w.date
    sum += w.date * date
  }
  let score = sum / total
  // supporting facts cannot stand in for the asset itself
  if (asset < 0.5) score = Math.min(score, asset)
  if (shareUrl && asset >= SHARED_URL_ASSET_SIM) score = Math.max(score, MERGE_THRESHOLD)
  // the same buyer AND seller (or one of them plus the same price) within one deal family, with the
  // asset sharing an identifying token: the asset is worded differently ("drugi etap" / "Phase 2"), not different
  const bothParties = buyerSim !== null && buyerSim >= SAME_PARTY && sellerSim !== null && sellerSim >= SAME_PARTY
  const partyAndPrice = ((buyerSim ?? 0) >= SAME_PARTY || (sellerSim ?? 0) >= SAME_PARTY) && value === 1
  if ((bothParties || partyAndPrice) && sharedAssetTokenCount(a, b) > 0) score = Math.max(score, MERGE_THRESHOLD)
  // two reports on the same day naming the same agent or lender for a half-matching asset
  // ("Puławska 436" / "pakiet przy ul. Puławskiej", both brokered by Locus): one deal
  const sameDay = a.date !== null && a.date === b.date
  if (sameDay && asset >= 0.5 && sharedOtherParty(a, b)) score = Math.max(score, MERGE_THRESHOLD)
  return { score, vetoed: false }
}

function sharedOtherParty(a: DealKey, b: DealKey): boolean {
  const partiesOf = (k: DealKey) => [k.buyer, k.seller, ...k.others].filter((p): p is string => !!p)
  const pa = partiesOf(a)
  const pb = partiesOf(b)
  return pa.some((x) => pb.some((y) => partySimilarity(x, y) >= SAME_PARTY))
}

/** Identifying tokens that carry a digit: phase numbers, building numbers, "A2". */
function numberTokens(key: DealKey): Set<string> {
  return new Set(key.assetNames.flatMap(assetTokens).filter((t) => /\d/.test(t)))
}

function sharedAssetTokenCount(a: DealKey, b: DealKey): number {
  let best = 0
  for (const x of a.assetNames) for (const y of b.assetNames) best = Math.max(best, sharedAssetTokens(x, y))
  return best
}

export function isSameDeal(a: DealKey, b: DealKey): boolean {
  const c = compareDeals(a, b)
  return !c.vetoed && c.score >= MERGE_THRESHOLD
}

const stableKey = (c: CandidateDeal) => `${fold(c.assetName)}|${canonicalUrl(c.source.url)}|${c.fields.buyer?.value ?? ''}|${c.transactionType}`

/**
 * Agglomerative clustering: repeatedly merges the two clusters with the best
 * pair score, as long as NO pair across them is vetoed. The veto rule stops
 * chains like A~B, B~C where A and C are provably different deals.
 */
export function clusterCandidates(candidates: CandidateDeal[]): CandidateDeal[][] {
  const items = [...candidates].sort((a, b) => stableKey(a).localeCompare(stableKey(b)))
  return cluster(items, items.map(keyOfCandidate))
}

/** The same clustering over deals that were already merged once — run again after deepening filled their gaps. */
export function clusterMergedDeals(deals: MergedDeal[]): MergedDeal[][] {
  const items = [...deals].sort((a, b) => a.id - b.id)
  return cluster(items, items.map(keyOfMerged))
}

function cluster<T>(items: T[], keys: DealKey[]): T[][] {
  const n = items.length
  const pair: Comparison[][] = Array.from({ length: n }, () => new Array<Comparison>(n))
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const c = compareDeals(keys[i], keys[j])
      pair[i][j] = c
      pair[j][i] = c
    }
  }

  let clusters: number[][] = items.map((_, i) => [i])
  for (;;) {
    let best: { a: number; b: number; score: number } | null = null
    for (let a = 0; a < clusters.length; a++) {
      for (let b = a + 1; b < clusters.length; b++) {
        let top = 0
        let vetoed = false
        for (const i of clusters[a]) {
          for (const j of clusters[b]) {
            const c = pair[i][j]
            if (c.vetoed) vetoed = true
            else top = Math.max(top, c.score)
          }
          if (vetoed) break
        }
        if (vetoed || top < MERGE_THRESHOLD) continue
        if (!best || top > best.score) best = { a, b, score: top }
      }
    }
    if (!best) break
    const merged = [...clusters[best.a], ...clusters[best.b]].sort((x, y) => x - y)
    clusters = clusters.filter((_, idx) => idx !== best.a && idx !== best.b)
    clusters.push(merged)
    clusters.sort((x, y) => x[0] - y[0])
  }
  return clusters.map((cluster) => cluster.map((i) => items[i]))
}
