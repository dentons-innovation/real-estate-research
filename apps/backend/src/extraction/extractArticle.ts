import type { LlmClient } from '../clients/llm'
import { tierOf, type DomainLists } from '../config/domains'
import { parseIsoDate } from '../deals/dates'
import { assetTokens } from '../deals/entityNames'
import type { Article, AuditEntry, CandidateDeal, Evidence, EvidenceField, MergedDeal, PartyEvidence } from '../types'
import { checkEvidence, dateInQuote, dateQuoteInText, prepareText, quoteInText, type PreparedText } from '../verify/evidence'
import { tokenMatches } from '../verify/normalize'
import { advisorSideSupported, type Side } from '../verify/roles'
import { DEEPENING_SYSTEM_PROMPT, deepeningUserPrompt, EXTRACTION_SYSTEM_PROMPT, extractionUserPrompt } from './prompts'
import { articleExtractionSchema, deepeningExtractionSchema, type ExtractedDeal } from './schema'

export interface VerifyContext {
  lists: DomainLists
  audit: AuditEntry[]
}

const clean = (value: string | null | undefined): string => (value ?? '').replace(/\s+/g, ' ').trim()

/** Junk the model may emit instead of null. */
const isBlank = (value: string): boolean => ['', '-', 'n/a', 'na', 'none', 'null', 'unknown', 'not disclosed', 'undisclosed', 'not stated', 'brak', 'brak danych'].includes(value.toLowerCase())

/**
 * Turns one model-extracted deal into a verified candidate. Every field is
 * checked against the article text; whatever fails is dropped and logged.
 * Returns null when the deal itself cannot be trusted or is out of scope.
 */
export function verifyExtractedDeal(deal: ExtractedDeal, article: Article, text: PreparedText, ctx: VerifyContext): CandidateDeal | null {
  const assetName = clean(deal.asset_name)
  const label = assetName || '(bez nazwy)'
  const tier = tierOf(article.url, ctx.lists)
  const drop = (reason: AuditEntry['reason'], detail?: string): null => {
    ctx.audit.push({ kind: 'deal_dropped', reason, deal: label, url: article.url, detail })
    return null
  }

  if (!assetName) return drop('asset_quote_failed', 'brak nazwy aktywa')
  if (deal.is_lease_only) return drop('lease_only')
  if (deal.is_market_report) return drop('market_report')
  if (!deal.in_poland) return drop('not_in_poland')
  if (!quoteInText(deal.asset_quote, text)) return drop('asset_quote_failed', 'cytat opisujący transakcję nie występuje w artykule')
  const nameTokens = assetTokens(assetName)
  if (nameTokens.length > 0 && !nameTokens.some((t) => text.tokens.some((x) => tokenMatches(t, x)))) {
    return drop('asset_quote_failed', 'nazwa aktywa nie występuje w artykule')
  }

  const reject = (field: string, value: string, quote: string, reason: AuditEntry['reason']) => {
    ctx.audit.push({ kind: 'field_rejected', reason, deal: label, field, value, quote, url: article.url })
  }

  const fields: Partial<Record<EvidenceField, Evidence>> = {}
  const accept = (field: EvidenceField, fact: { value: string; quote: string } | null, kind: 'name' | 'amount'): Evidence | null => {
    if (!fact) return null
    const value = clean(fact.value)
    if (isBlank(value)) return null
    const failure = checkEvidence(value, fact.quote, text, kind)
    if (failure) {
      reject(field, value, fact.quote, failure)
      return null
    }
    return { value, quote: clean(fact.quote), url: article.url, tier }
  }

  const buyer = accept('buyer', deal.buyer, 'name')
  const seller = accept('seller', deal.seller, 'name')
  const value = accept('deal_value', deal.deal_value, 'amount')
  if (buyer) fields.buyer = buyer
  if (seller) fields.seller = seller
  if (value) fields.deal_value = value

  const party = (list: ExtractedDeal['other_parties'], field: string): PartyEvidence[] => {
    const out: PartyEvidence[] = []
    for (const item of list) {
      const name = clean(item.name)
      if (isBlank(name)) continue
      const failure = checkEvidence(name, item.quote, text, 'name')
      if (failure) {
        reject(field, name, item.quote, failure)
        continue
      }
      out.push({ name, role: clean(item.role), quote: clean(item.quote), url: article.url, tier })
    }
    return out
  }

  const otherParties = party(deal.other_parties, 'other_parties')
  const otherAdvisors = party(deal.other_legal_advisors, 'other_legal_advisors')

  const roleContext = { buyer: buyer?.value ?? null, seller: seller?.value ?? null }
  const advisor = (side: Side, fact: { value: string; quote: string } | null) => {
    const field: EvidenceField = side === 'buyer' ? 'buyer_legal_advisor' : 'seller_legal_advisor'
    const evidence = accept(field, fact, 'name')
    if (!evidence) return
    if (advisorSideSupported(side, evidence.value, evidence.quote, roleContext)) {
      fields[field] = evidence
      return
    }
    // the firm is real and quoted, but the quote does not say whom it advised
    ctx.audit.push({ kind: 'field_demoted', reason: 'role_not_stated', deal: label, field, value: evidence.value, quote: evidence.quote, url: article.url })
    otherAdvisors.push({ name: evidence.value, role: '', quote: evidence.quote, url: article.url, tier })
  }
  advisor('buyer', deal.buyer_legal_advisor)
  advisor('seller', deal.seller_legal_advisor)

  let announcementDate: string | null = null
  let dateBasis: CandidateDeal['dateBasis'] = null
  const stated = parseIsoDate(deal.announcement_date)
  if (stated && deal.announcement_date_quote && dateQuoteInText(deal.announcement_date_quote, text) && dateInQuote(stated, deal.announcement_date_quote)) {
    announcementDate = stated
    dateBasis = 'quote'
  } else {
    if (stated) reject('announcement_date', stated, deal.announcement_date_quote ?? '', 'quote_not_found')
    if (article.publishedAt) {
      announcementDate = article.publishedAt
      dateBasis = 'published'
    }
  }

  return {
    assetName,
    city: clean(deal.city) || null,
    transactionType: deal.transaction_type,
    status: deal.status,
    sector: deal.sector,
    description: clean(deal.description_en),
    announcementDate,
    dateBasis,
    fields,
    otherParties,
    otherAdvisors,
    source: { url: article.url, tier, publishedAt: article.publishedAt },
  }
}

export interface ExtractionOutcome {
  candidates: CandidateDeal[]
  /** Deals the model reported, before verification. */
  reported: number
}

/** Discovery: extract and verify every deal stated in one article. */
export async function extractArticle(article: Article, llm: LlmClient, ctx: VerifyContext, signal?: AbortSignal): Promise<ExtractionOutcome> {
  const result = await llm.structured({
    name: 'article_extraction',
    schema: articleExtractionSchema,
    system: EXTRACTION_SYSTEM_PROMPT,
    user: extractionUserPrompt(article),
    signal,
  })
  if (!result.is_relevant) return { candidates: [], reported: 0 }
  const text = prepareText(`${article.title}\n${article.text}`)
  const candidates = result.deals.map((deal) => verifyExtractedDeal(deal, article, text, ctx)).filter((c): c is CandidateDeal => c !== null)
  return { candidates, reported: result.deals.length }
}

/** Deepening: extract from a follow-up article only what concerns the known deal. */
export async function extractForDeal(
  article: Article,
  deal: MergedDeal,
  missing: string[],
  llm: LlmClient,
  ctx: VerifyContext,
  signal?: AbortSignal,
): Promise<CandidateDeal[]> {
  const result = await llm.structured({
    name: 'deepening_extraction',
    schema: deepeningExtractionSchema,
    system: DEEPENING_SYSTEM_PROMPT,
    user: deepeningUserPrompt(deal, missing, article),
    signal,
  })
  if (!result.is_relevant) return []
  const text = prepareText(`${article.title}\n${article.text}`)
  const out: CandidateDeal[] = []
  for (const extracted of result.deals) {
    if (!extracted.same_transaction) continue
    const candidate = verifyExtractedDeal(extracted, article, text, ctx)
    if (candidate) out.push(candidate)
  }
  return out
}
