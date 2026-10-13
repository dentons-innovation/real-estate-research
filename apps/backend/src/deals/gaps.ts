import type { EvidenceField, MergedDeal } from '../types'
import { familyOf } from './dedup'
import { isDistinctiveAsset, searchableAssetName } from './entityNames'

/**
 * Gap analysis: which fields the client cares about are still empty, and
 * which deals are worth a deepening pass.
 */

/** A verified field, or the date without which a deal cannot stay in the table. */
export type Gap = EvidenceField | 'announcement_date'

/** Higher = more valuable to the marketing team. A missing date loses the whole deal, so it comes first. */
export const GAP_WEIGHTS: Record<Gap, number> = {
  announcement_date: 4,
  buyer_legal_advisor: 3,
  seller_legal_advisor: 3,
  deal_value: 2,
  buyer: 2,
  seller: 2,
}

/** A financing or a JV has no seller, so a missing seller is not a gap there. */
export function applicableFields(deal: MergedDeal): EvidenceField[] {
  const family = familyOf(deal.transactionType)
  if (family === 'transfer') return ['buyer_legal_advisor', 'seller_legal_advisor', 'deal_value', 'buyer', 'seller']
  return ['buyer_legal_advisor', 'deal_value', 'buyer']
}

export function gapsOf(deal: MergedDeal): Gap[] {
  const fields: Gap[] = applicableFields(deal).filter((field) => (deal.fields[field] ?? []).length === 0)
  return deal.announcementDate ? fields : ['announcement_date', ...fields]
}

export function gapScore(gaps: Gap[]): number {
  return gaps.reduce((sum, g) => sum + GAP_WEIGHTS[g], 0)
}

/** True when there is something to search for: a distinctive asset name or a known party. */
export function isSearchable(deal: MergedDeal): boolean {
  if (isDistinctiveAsset(searchableAssetName(deal.assetName))) return true
  return !!(deal.fields.buyer?.[0]?.value || deal.fields.seller?.[0]?.value)
}

export interface DeepeningPlan {
  deal: MergedDeal
  gaps: Gap[]
}

/**
 * Deals to deepen, most valuable gaps first, capped by `limit`. Deals nothing
 * can be searched for are left out before the cap, so they never take a slot.
 */
export function planDeepening(deals: MergedDeal[], limit: number): DeepeningPlan[] {
  return deals
    .filter(isSearchable)
    .map((deal) => ({ deal, gaps: gapsOf(deal) }))
    .filter((p) => p.gaps.length > 0)
    .sort((a, b) => gapScore(b.gaps) - gapScore(a.gaps) || a.deal.id - b.deal.id)
    .slice(0, Math.max(0, limit))
    .sort((a, b) => a.deal.id - b.deal.id)
}
