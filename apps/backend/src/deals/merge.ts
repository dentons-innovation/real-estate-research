import { DEAL_STATUSES, SECTORS, TRANSACTION_TYPES, type DealStatus, type Sector, type TransactionType } from '@re/shared'
import { hostOf, type SourceTier } from '../config/domains'
import { canonicalUrl } from '../extraction/articleText'
import { EVIDENCE_FIELDS, type AuditEntry, type CandidateDeal, type Evidence, type EvidenceField, type MergedDeal, type PartyEvidence, type SourceRef } from '../types'
import { fold } from '../verify/normalize'
import { monthEndFromUrl } from './dates'
import { valuesEqual } from './dealValue'
import { isDistinctiveAsset, partySimilarity } from './entityNames'

/**
 * Merging the reports of one deal. Values are never blended or rewritten:
 * every field keeps the verified evidence it came from, and conflicts are
 * resolved by source reliability (law firm site > trade press > other).
 */

const TIER_WEIGHT: Record<SourceTier, number> = { 1: 3, 2: 2, 3: 1 }

const ADVISOR_FIELDS: EvidenceField[] = ['buyer_legal_advisor', 'seller_legal_advisor']

export function sameValue(field: EvidenceField, a: string, b: string): boolean {
  if (field === 'deal_value') return valuesEqual(a, b) || fold(a) === fold(b)
  return partySimilarity(a, b) >= 0.8
}

export const sameFirm = (a: string, b: string): boolean => partySimilarity(a, b) >= 0.8

/** Best first: reliability, then number of independent sites agreeing, then stable order. */
function rankEvidence(field: EvidenceField, list: Evidence[]): Evidence[] {
  const support = (e: Evidence) => new Set(list.filter((x) => sameValue(field, x.value, e.value)).map((x) => hostOf(x.url))).size
  return [...list].sort((a, b) => a.tier - b.tier || support(b) - support(a) || a.url.localeCompare(b.url) || a.value.localeCompare(b.value))
}

function vote<T extends string>(values: Array<{ value: T; tier: SourceTier }>, order: readonly T[], ignore?: T): T {
  const scores = new Map<T, number>()
  for (const { value, tier } of values) {
    if (value === ignore) continue
    scores.set(value, (scores.get(value) ?? 0) + TIER_WEIGHT[tier])
  }
  if (scores.size === 0) return ignore ?? order[0]
  return [...scores.entries()].sort((a, b) => b[1] - a[1] || order.indexOf(a[0]) - order.indexOf(b[0]))[0][0]
}

function dedupParties(list: PartyEvidence[]): PartyEvidence[] {
  const out: PartyEvidence[] = []
  for (const item of [...list].sort((a, b) => a.tier - b.tier || a.url.localeCompare(b.url))) {
    const existing = out.find((x) => sameFirm(x.name, item.name))
    if (!existing) out.push(item)
    else if (!existing.role && item.role) existing.role = item.role
  }
  return out
}

/** When a page carries no date, the month in its URL still bounds how old it can be. */
const traceOf = (source: SourceRef): string | null => source.publishedAt ?? monthEndFromUrl(source.url)

function mergeSources(sources: SourceRef[]): SourceRef[] {
  const byUrl = new Map<string, SourceRef>()
  for (const s of sources) {
    const key = canonicalUrl(s.url)
    const existing = byUrl.get(key)
    if (!existing) byUrl.set(key, s)
    else if (!existing.publishedAt && s.publishedAt) byUrl.set(key, { ...existing, publishedAt: s.publishedAt })
  }
  return [...byUrl.values()].sort((a, b) => a.tier - b.tier || a.url.localeCompare(b.url))
}

function pickAssetName(candidates: CandidateDeal[]): { name: string; names: string[] } {
  const counts = new Map<string, { name: string; count: number; tier: SourceTier }>()
  for (const c of candidates) {
    const key = fold(c.assetName)
    const entry = counts.get(key)
    if (entry) {
      entry.count += 1
      entry.tier = Math.min(entry.tier, c.source.tier) as SourceTier
    } else counts.set(key, { name: c.assetName, count: 1, tier: c.source.tier })
  }
  const ranked = [...counts.values()].sort(
    (a, b) =>
      Number(isDistinctiveAsset(b.name)) - Number(isDistinctiveAsset(a.name)) ||
      b.count - a.count ||
      a.tier - b.tier ||
      a.name.length - b.name.length ||
      a.name.localeCompare(b.name),
  )
  return { name: ranked[0].name, names: ranked.map((r) => r.name) }
}

/**
 * A firm claimed for BOTH sides is a contradiction between sources. The most
 * reliable source decides; without a law-firm source the firm is moved to
 * "other" — never assigned to a side on a guess.
 */
function resolveSideConflicts(deal: MergedDeal, audit: AuditEntry[]): void {
  const buyers = deal.fields.buyer_legal_advisor ?? []
  const sellers = deal.fields.seller_legal_advisor ?? []
  for (const b of [...buyers]) {
    const clash = sellers.filter((s) => sameFirm(s.value, b.value))
    if (clash.length === 0) continue
    const buyerSide = buyers.filter((x) => sameFirm(x.value, b.value))
    const bestBuyer = Math.min(...buyerSide.map((x) => x.tier))
    const bestSeller = Math.min(...clash.map((x) => x.tier))
    const remove = (field: EvidenceField, firm: string) => {
      deal.fields[field] = (deal.fields[field] ?? []).filter((x) => !sameFirm(x.value, firm))
    }
    audit.push({ kind: 'conflict', reason: 'conflict_lost', deal: deal.assetName, field: 'legal_advisor_side', value: b.value, detail: `źródła przypisują kancelarię obu stronom (kupujący: tier ${bestBuyer}, sprzedający: tier ${bestSeller})` })
    if (bestBuyer === 1 && bestSeller > 1) remove('seller_legal_advisor', b.value)
    else if (bestSeller === 1 && bestBuyer > 1) remove('buyer_legal_advisor', b.value)
    else {
      remove('buyer_legal_advisor', b.value)
      remove('seller_legal_advisor', b.value)
      deal.otherAdvisors.push({ name: b.value, role: '', quote: b.quote, url: b.url, tier: b.tier })
    }
  }
}

export function mergeCandidates(id: number, candidates: CandidateDeal[], audit: AuditEntry[]): MergedDeal {
  const { name, names } = pickAssetName(candidates)
  const fields: MergedDeal['fields'] = {}
  for (const field of EVIDENCE_FIELDS) {
    const list = candidates.map((c) => c.fields[field]).filter((e): e is Evidence => !!e)
    if (list.length > 0) fields[field] = rankEvidence(field, list)
  }

  const quoted = candidates.filter((c) => c.dateBasis === 'quote' && c.announcementDate).map((c) => c.announcementDate as string)
  const published = candidates.filter((c) => c.announcementDate).map((c) => c.announcementDate as string)
  const dates = quoted.length > 0 ? quoted : published
  // every date any report carries, stated or published — the oldest one dates the deal's first appearance
  const traces = [...published, ...candidates.map((c) => traceOf(c.source)).filter((d): d is string => !!d)].sort()

  const deal: MergedDeal = {
    id,
    assetName: name,
    assetNames: names,
    city: candidates.map((c) => c.city).find((c): c is string => !!c) ?? null,
    transactionType: vote<TransactionType>(candidates.map((c) => ({ value: c.transactionType, tier: c.source.tier })), TRANSACTION_TYPES),
    status: vote<DealStatus>(candidates.map((c) => ({ value: c.status, tier: c.source.tier })), DEAL_STATUSES),
    sector: vote<Sector>(candidates.map((c) => ({ value: c.sector, tier: c.source.tier })), SECTORS, 'not identified'),
    descriptions: candidates
      .filter((c) => c.description)
      .map((c) => ({ text: c.description, tier: c.source.tier }))
      .sort((a, b) => a.tier - b.tier || b.text.length - a.text.length),
    announcementDate: dates.length > 0 ? [...dates].sort()[0] : null,
    dateBasis: quoted.length > 0 ? 'quote' : published.length > 0 ? 'published' : null,
    earliestDate: traces[0] ?? null,
    fields,
    otherParties: dedupParties(candidates.flatMap((c) => c.otherParties)),
    otherAdvisors: dedupParties(candidates.flatMap((c) => c.otherAdvisors)),
    sources: mergeSources(candidates.map((c) => c.source)),
  }

  resolveSideConflicts(deal, audit)
  logValueConflicts(deal, audit)
  pruneOtherAdvisors(deal)
  return deal
}

const bestTier = (deal: MergedDeal): SourceTier => Math.min(3, ...deal.sources.map((s) => s.tier)) as SourceTier

/**
 * Deals that turned out to be one report of the same transaction once deepening
 * had filled their gaps. Evidence lists are concatenated and re-ranked exactly
 * as in mergeCandidates; nothing is rewritten.
 */
export function mergeMergedDeals(id: number, deals: MergedDeal[], audit: AuditEntry[]): MergedDeal {
  if (deals.length === 1) return { ...deals[0], id }
  // the best-sourced, best-documented deal lends its name
  const ranked = [...deals].sort((a, b) => bestTier(a) - bestTier(b) || b.sources.length - a.sources.length || a.id - b.id)
  const primary = ranked[0]
  const names = new Map<string, string>()
  for (const d of ranked) for (const n of d.assetNames) if (!names.has(fold(n))) names.set(fold(n), n)

  const fields: MergedDeal['fields'] = {}
  for (const field of EVIDENCE_FIELDS) {
    const list = deals.flatMap((d) => d.fields[field] ?? [])
    if (list.length > 0) fields[field] = rankEvidence(field, list)
  }
  const votes = <T extends string>(pick: (d: MergedDeal) => T) => deals.map((d) => ({ value: pick(d), tier: bestTier(d) }))
  const dates = deals.map((d) => d.announcementDate).filter((d): d is string => !!d).sort()
  const traces = deals.map((d) => d.earliestDate).filter((d): d is string => !!d).sort()

  const deal: MergedDeal = {
    id,
    assetName: primary.assetName,
    assetNames: [...names.values()],
    city: ranked.map((d) => d.city).find((c): c is string => !!c) ?? null,
    transactionType: vote<TransactionType>(votes((d) => d.transactionType), TRANSACTION_TYPES),
    status: vote<DealStatus>(votes((d) => d.status), DEAL_STATUSES),
    sector: vote<Sector>(votes((d) => d.sector), SECTORS, 'not identified'),
    descriptions: deals.flatMap((d) => d.descriptions).sort((a, b) => a.tier - b.tier || b.text.length - a.text.length),
    announcementDate: dates[0] ?? null,
    dateBasis: deals.some((d) => d.dateBasis === 'quote') ? 'quote' : dates.length > 0 ? 'published' : null,
    earliestDate: traces[0] ?? null,
    fields,
    otherParties: dedupParties(deals.flatMap((d) => d.otherParties)),
    otherAdvisors: dedupParties(deals.flatMap((d) => d.otherAdvisors)),
    sources: mergeSources(deals.flatMap((d) => d.sources)),
  }
  audit.push({
    kind: 'note',
    reason: 'duplicate_merged',
    deal: deal.assetName,
    detail: `scalono powtarzające się wpisy: ${ranked.slice(1).map((d) => d.assetName).join(' | ')}`,
  })
  resolveSideConflicts(deal, audit)
  logValueConflicts(deal, audit)
  pruneOtherAdvisors(deal)
  return deal
}

function logValueConflicts(deal: MergedDeal, audit: AuditEntry[]): void {
  for (const field of ['buyer', 'seller', 'deal_value'] as EvidenceField[]) {
    const list = deal.fields[field] ?? []
    if (list.length < 2) continue
    const winner = list[0]
    for (const loser of list.slice(1)) {
      if (sameValue(field, winner.value, loser.value)) continue
      audit.push({ kind: 'conflict', reason: 'conflict_lost', deal: deal.assetName, field, value: loser.value, quote: loser.quote, url: loser.url, detail: `przyjęto: ${winner.value} (${winner.url})` })
    }
  }
}

/** A firm already credited to a side does not repeat under "other". */
function pruneOtherAdvisors(deal: MergedDeal): void {
  const sided = ADVISOR_FIELDS.flatMap((f) => deal.fields[f] ?? [])
  deal.otherAdvisors = deal.otherAdvisors.filter((o) => !sided.some((s) => sameFirm(s.value, o.name)))
}

/**
 * Deepening result → known deal. Fills ONLY fields that are still empty and
 * never overwrites; returns the names of the fields it filled.
 */
export function applyEnrichment(deal: MergedDeal, candidate: CandidateDeal, audit: AuditEntry[]): string[] {
  const filled: string[] = []
  for (const field of EVIDENCE_FIELDS) {
    const evidence = candidate.fields[field]
    if (!evidence) continue
    const current = deal.fields[field] ?? []
    if (current.length === 0) {
      // a firm already known on the opposite side is a contradiction, not a new fact
      if (ADVISOR_FIELDS.includes(field)) {
        const opposite: EvidenceField = field === 'buyer_legal_advisor' ? 'seller_legal_advisor' : 'buyer_legal_advisor'
        if ((deal.fields[opposite] ?? []).some((x) => sameFirm(x.value, evidence.value))) {
          audit.push({ kind: 'conflict', reason: 'conflict_lost', deal: deal.assetName, field, value: evidence.value, quote: evidence.quote, url: evidence.url, detail: 'kancelaria jest już przypisana drugiej stronie' })
          continue
        }
      }
      deal.fields[field] = [evidence]
      filled.push(field)
    } else if (sameValue(field, current[0].value, evidence.value)) {
      // corroboration: keep as additional evidence, the value itself is unchanged
      current.push(evidence)
    } else if (!ADVISOR_FIELDS.includes(field)) {
      audit.push({ kind: 'conflict', reason: 'conflict_lost', deal: deal.assetName, field, value: evidence.value, quote: evidence.quote, url: evidence.url, detail: `pozostawiono: ${current[0].value}` })
    } else if (evidence.tier <= current[0].tier) {
      // a second firm on the same side, from a source at least as reliable: co-counsel
      current.push(evidence)
      filled.push(field)
    }
  }

  const before = deal.otherParties.length + deal.otherAdvisors.length
  deal.otherParties = dedupParties([...deal.otherParties, ...candidate.otherParties])
  deal.otherAdvisors = dedupParties([...deal.otherAdvisors, ...candidate.otherAdvisors])
  pruneOtherAdvisors(deal)
  if (deal.otherParties.length + deal.otherAdvisors.length > before) filled.push('other')

  // a deal found on an undated page gets its date from the follow-up; a quoted date beats a publication date
  if (candidate.announcementDate && (!deal.announcementDate || (deal.dateBasis === 'published' && candidate.dateBasis === 'quote'))) {
    deal.announcementDate = candidate.announcementDate
    deal.dateBasis = candidate.dateBasis
    filled.push('announcement_date')
  }

  if (filled.length > 0) deal.sources = mergeSources([...deal.sources, candidate.source])
  // a follow-up report is still a report of this deal: its dates may push the first appearance back
  const traces = [deal.earliestDate, candidate.announcementDate, traceOf(candidate.source)].filter((d): d is string => !!d).sort()
  deal.earliestDate = traces[0] ?? null
  if (!deal.city && candidate.city) deal.city = candidate.city
  if (deal.sector === 'not identified' && candidate.sector !== 'not identified') deal.sector = candidate.sector
  return filled
}

/** Distinct values of a field, best first (several firms may act on one side). */
export function distinctValues(deal: MergedDeal, field: EvidenceField): Evidence[] {
  const out: Evidence[] = []
  for (const e of deal.fields[field] ?? []) {
    if (!out.some((x) => sameValue(field, x.value, e.value))) out.push(e)
  }
  return out
}
