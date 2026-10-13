import { TRANSACTION_KEYS, type TransactionRecord } from '@re/shared'
import { z } from 'zod'
import { EVIDENCE_FIELDS, type EvidenceField, type JobAudit, type MergedDeal, type PartyEvidence } from '../types'
import { toPlDate } from './dates'
import { formatDealValue, parseDealValue } from './dealValue'
import { distinctValues } from './merge'

const MAX_SOURCES = 6

export const transactionRecordSchema = z.object(
  Object.fromEntries(TRANSACTION_KEYS.map((key) => [key, z.string()])) as Record<(typeof TRANSACTION_KEYS)[number], z.ZodString>,
)

const joinNames = (deal: MergedDeal, field: EvidenceField): string =>
  distinctValues(deal, field)
    .map((e) => e.value)
    .join('; ')

const joinParties = (list: PartyEvidence[]): string => list.map((p) => (p.role ? `${p.name} (${p.role})` : p.name)).join('; ')

/** "EUR 300 million" when the amount parses unambiguously, otherwise exactly as written. */
export function displayValue(raw: string): string {
  const parsed = parseDealValue(raw)
  return parsed ? formatDealValue(parsed) : raw
}

/**
 * Sources shown in the table: only pages that contributed a verified fact,
 * most reliable first.
 */
export function contributingSources(deal: MergedDeal): string[] {
  const evidenceUrls = new Set<string>()
  for (const field of EVIDENCE_FIELDS) for (const e of deal.fields[field] ?? []) evidenceUrls.add(e.url)
  for (const p of [...deal.otherParties, ...deal.otherAdvisors]) evidenceUrls.add(p.url)
  const contributing = deal.sources.filter((s) => evidenceUrls.has(s.url))
  // a deal verified only by its asset quote still has the articles it was found in
  const list = contributing.length > 0 ? contributing : deal.sources
  return list.slice(0, MAX_SOURCES).map((s) => s.url)
}

export function toRecord(deal: MergedDeal, description: string): TransactionRecord {
  const value = deal.fields.deal_value?.[0]?.value ?? ''
  return {
    'Data ogłoszenia': toPlDate(deal.announcementDate),
    'Deal/asset': deal.assetName,
    'Rodzaj transakcji': deal.transactionType,
    'Opis transakcji': description,
    // parties: one winner, never a blend of conflicting reports (advisors below may be several)
    'Buyer / inwestor': deal.fields.buyer?.[0]?.value ?? '',
    'Seller / vendor': deal.fields.seller?.[0]?.value ?? '',
    'Other parties involved': joinParties(deal.otherParties),
    'Deal value': value ? displayValue(value) : '',
    'Buyer legal advisor': joinNames(deal, 'buyer_legal_advisor'),
    'Seller legal advisor': joinNames(deal, 'seller_legal_advisor'),
    'Other legal advisors involved': joinParties(deal.otherAdvisors),
    'Status transakcji': deal.status,
    Sektor: deal.sector,
    'Źródła informacji': contributingSources(deal).join('; '),
  }
}

/** Evidence behind every filled field of the final table. */
export function auditOf(deal: MergedDeal): JobAudit['deals'][number] {
  const fields: JobAudit['deals'][number]['fields'] = {}
  for (const field of EVIDENCE_FIELDS) {
    const e = deal.fields[field]?.[0]
    fields[field] = e ? { value: e.value, quote: e.quote, url: e.url } : null
  }
  deal.otherParties.forEach((p, i) => (fields[`other_parties[${i}]`] = { value: p.name, quote: p.quote, url: p.url }))
  deal.otherAdvisors.forEach((p, i) => (fields[`other_legal_advisors[${i}]`] = { value: p.name, quote: p.quote, url: p.url }))
  return { asset: deal.assetName, fields, sources: deal.sources.map((s) => s.url) }
}
