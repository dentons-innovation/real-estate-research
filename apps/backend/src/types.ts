import type { DealStatus, Sector, TransactionType } from '@re/shared'
import type { SourceTier } from './config/domains'

/** The three research lanes shown on the mission timeline. */
export type LaneId = 'sales' | 'financing' | 'lawfirms'

export const LANE_ORDER: LaneId[] = ['sales', 'financing', 'lawfirms']

/** Polish lane names as they appear in `done_labels` (translated by the frontend). */
export const LANE_LABELS: Record<LaneId, string> = {
  sales: 'sprzedaże i przejęcia',
  financing: 'finansowania i JV',
  lawfirms: 'kancelarie prawne',
}

/** One article / press release with its full text, from any provider. */
export interface Article {
  url: string
  title: string
  /** Cleaned plain text. */
  text: string
  /** YYYY-MM-DD when the provider states it. */
  publishedAt: string | null
  origin: 'opoint' | 'tavily'
  lane: LaneId
}

/** The fields that carry a verbatim supporting quote. */
export const EVIDENCE_FIELDS = ['buyer', 'seller', 'deal_value', 'buyer_legal_advisor', 'seller_legal_advisor'] as const
export type EvidenceField = (typeof EVIDENCE_FIELDS)[number]

/** A verified value: the quote was found in the text behind `url`. */
export interface Evidence {
  value: string
  quote: string
  url: string
  tier: SourceTier
}

export interface PartyEvidence {
  name: string
  role: string
  quote: string
  url: string
  tier: SourceTier
}

export interface SourceRef {
  url: string
  tier: SourceTier
  publishedAt: string | null
}

/** A deal as stated by ONE article, after evidence verification. */
export interface CandidateDeal {
  assetName: string
  city: string | null
  transactionType: TransactionType
  status: DealStatus
  sector: Sector
  description: string
  /** YYYY-MM-DD. */
  announcementDate: string | null
  /** 'quote' = stated in the text, 'published' = article publication date. */
  dateBasis: 'quote' | 'published' | null
  fields: Partial<Record<EvidenceField, Evidence>>
  otherParties: PartyEvidence[]
  otherAdvisors: PartyEvidence[]
  source: SourceRef
}

/** A deal merged from one or more candidates. */
export interface MergedDeal {
  id: number
  assetName: string
  assetNames: string[]
  city: string | null
  transactionType: TransactionType
  status: DealStatus
  sector: Sector
  descriptions: Array<{ text: string; tier: SourceTier }>
  announcementDate: string | null
  /** How the date was established; a quoted date beats a publication date from a later report. */
  dateBasis: 'quote' | 'published' | null
  /**
   * The oldest trace of the deal in any report: a stated date or a source's
   * publication date. A deal first reported months ago is not news now.
   */
  earliestDate: string | null
  /** All verified candidates per field, best first. */
  fields: Partial<Record<EvidenceField, Evidence[]>>
  otherParties: PartyEvidence[]
  otherAdvisors: PartyEvidence[]
  sources: SourceRef[]
}

export type AuditReason =
  | 'quote_not_found'
  | 'value_not_in_quote'
  | 'not_a_name'
  | 'role_not_stated'
  | 'asset_quote_failed'
  | 'lease_only'
  | 'market_report'
  | 'not_in_poland'
  | 'outside_window'
  | 'too_old'
  | 'duplicate_merged'
  | 'no_date'
  | 'no_source'
  | 'conflict_lost'
  | 'description_unsupported'
  | 'different_transaction'

export interface AuditEntry {
  kind: 'field_rejected' | 'field_demoted' | 'deal_dropped' | 'conflict' | 'note'
  reason: AuditReason
  deal: string
  field?: string
  value?: string
  quote?: string
  url?: string
  detail?: string
}

export interface JobAudit {
  entries: AuditEntry[]
  /** Final table with the evidence behind every filled field. */
  deals: Array<{
    asset: string
    fields: Record<string, { value: string; quote: string; url: string } | null>
    sources: string[]
  }>
}
