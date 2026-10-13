import type { TransactionRecord } from '@re/shared'
import { z } from 'zod'
import { familyOf } from '../deals/dedup'
import { numbersOf } from '../deals/dealValue'
import { distinctValues } from '../deals/merge'
import { auditOf, displayValue, toRecord, transactionRecordSchema } from '../deals/toRecord'
import { DESCRIPTION_SYSTEM_PROMPT, descriptionUserPrompt } from '../extraction/prompts'
import { descriptionSchema } from '../extraction/schema'
import { EVIDENCE_FIELDS, type JobAudit, type MergedDeal } from '../types'
import { isAbort, throwIfAborted } from '../util/concurrency'
import { tokenize, tokenMatches } from '../verify/normalize'
import type { PipelineContext } from './context'

/**
 * Compile. The model writes only the one-sentence description, from verified
 * facts. Names, amounts, advisors and sources are assembled by code and are
 * never regenerated. A description that mentions anything outside the
 * verified facts is discarded in favour of a template sentence.
 */

const BATCH_SIZE = 8

/** Capitalised words that are ordinary English / Polish, not names to verify. */
const COMMON_CAPITALISED = new Set(
  `the a an in on at of for by from with and to its it this that as was is has have had been will would under over after before
  poland polish warsaw krakow cracow wroclaw poznan gdansk gdynia lodz katowice szczecin lublin europe european cee
  eur pln usd gbp euro january february march april may june july august september october november december
  office retail logistics industrial residential hotel land prs jv joint venture portfolio building park centre center
  sale acquisition financing refinancing loan bank banks fund company group investor buyer seller lender lenders q1 q2 q3 q4`
    .split(/\s+/)
    .filter(Boolean),
)

function corpusOf(deal: MergedDeal): string {
  const parts: string[] = [...deal.assetNames, deal.city ?? '', deal.transactionType, deal.status, deal.sector, deal.announcementDate ?? '']
  for (const field of EVIDENCE_FIELDS) for (const e of deal.fields[field] ?? []) parts.push(e.value, e.quote)
  for (const p of [...deal.otherParties, ...deal.otherAdvisors]) parts.push(p.name, p.role, p.quote)
  return parts.join('\n')
}

/** True when every number and every name in the sentence occurs in the deal's verified facts. */
export function descriptionSupported(description: string, deal: MergedDeal): boolean {
  const text = description.trim()
  if (text.length < 15 || text.length > 600) return false
  const corpus = corpusOf(deal)
  const corpusTokens = tokenize(corpus)
  const corpusNumbers = new Set(numbersOf(corpus))
  if (!numbersOf(text).every((n) => corpusNumbers.has(n))) return false

  const words = text.match(/[\p{L}\p{N}][\p{L}\p{N}&'’.-]*/gu) ?? []
  for (const word of words) {
    if (!/^\p{Lu}/u.test(word)) continue
    for (const token of tokenize(word)) {
      if (token.length < 3 || /^\d/.test(token) || COMMON_CAPITALISED.has(token)) continue
      if (!corpusTokens.some((c) => tokenMatches(token, c))) return false
    }
  }
  return true
}

/** Deterministic sentence from verified values — the fallback that cannot hallucinate. */
export function templateDescription(deal: MergedDeal): string {
  const buyer = distinctValues(deal, 'buyer')[0]?.value
  const seller = distinctValues(deal, 'seller')[0]?.value
  const raw = deal.fields.deal_value?.[0]?.value
  const value = raw ? displayValue(raw) : null
  const asset = deal.assetName
  const family = familyOf(deal.transactionType)

  if (family === 'financing') {
    const lenders = deal.otherParties.filter((p) => /lend|bank|kredyt|financ/i.test(p.role)).map((p) => p.name)
    let s = buyer ? `${buyer} secured financing for ${asset}` : `Financing was secured for ${asset}`
    if (value) s += ` of ${value}`
    if (lenders.length > 0) s += ` from ${lenders.join(', ')}`
    return `${s}.`
  }
  if (family === 'jv') {
    const partners = [buyer, ...deal.otherParties.map((p) => p.name)].filter((x): x is string => !!x)
    let s = partners.length > 1 ? `${partners.slice(0, 3).join(', ')} formed a joint venture concerning ${asset}` : `A joint venture was formed concerning ${asset}`
    if (value) s += ` with a value of ${value}`
    return `${s}.`
  }
  let s: string
  if (buyer && seller) s = `${buyer} acquired ${asset} from ${seller}`
  else if (buyer) s = `${buyer} acquired ${asset}`
  else if (seller) s = `${seller} sold ${asset}`
  else s = `${asset} changed hands`
  if (value) s += ` for ${value}`
  return `${s}.`
}

function factsOf(deal: MergedDeal): Record<string, unknown> {
  const evidence = (field: (typeof EVIDENCE_FIELDS)[number]) => distinctValues(deal, field).map((e) => ({ value: e.value, quote: e.quote }))
  return {
    deal_id: deal.id,
    asset: deal.assetName,
    city: deal.city,
    transaction_type: deal.transactionType,
    status: deal.status,
    sector: deal.sector,
    buyer: evidence('buyer'),
    seller: evidence('seller'),
    deal_value: evidence('deal_value'),
    other_parties: deal.otherParties.map((p) => ({ name: p.name, role: p.role, quote: p.quote })),
  }
}

async function writeDescriptions(deals: MergedDeal[], ctx: PipelineContext): Promise<Map<number, string>> {
  const out = new Map<number, string>()
  const batches: MergedDeal[][] = []
  for (let i = 0; i < deals.length; i += BATCH_SIZE) batches.push(deals.slice(i, i + BATCH_SIZE))
  await Promise.all(
    batches.map(async (batch) => {
      try {
        const result = await ctx.llm.structured({
          name: 'deal_descriptions',
          schema: descriptionSchema,
          system: DESCRIPTION_SYSTEM_PROMPT,
          user: descriptionUserPrompt(batch.map(factsOf)),
          signal: ctx.signal,
        })
        for (const item of result.deals) out.set(item.deal_id, item.description_en.replace(/\s+/g, ' ').trim())
      } catch (err) {
        if (isAbort(err) || ctx.signal.aborted) throw err
        // descriptions are a convenience — the table is still built from templates
      }
    }),
  )
  return out
}

export interface CompileResult {
  transactions: TransactionRecord[]
  audit: JobAudit['deals']
}

export async function runCompile(deals: MergedDeal[], ctx: PipelineContext): Promise<CompileResult> {
  const written = await writeDescriptions(deals, ctx)
  throwIfAborted(ctx.signal)

  const sorted = [...deals].sort((a, b) => (b.announcementDate ?? '').localeCompare(a.announcementDate ?? '') || a.id - b.id)
  const transactions: TransactionRecord[] = []
  for (const deal of sorted) {
    const candidates = [written.get(deal.id), ...deal.descriptions.map((d) => d.text)].filter((d): d is string => !!d)
    let description = candidates.find((d) => descriptionSupported(d, deal))
    if (!description) {
      if (candidates.length > 0) {
        ctx.audit.push({ kind: 'field_rejected', reason: 'description_unsupported', deal: deal.assetName, field: 'description', value: candidates[0] })
      }
      description = templateDescription(deal)
    }
    transactions.push(toRecord(deal, description))
  }
  // the contract with the table: exactly the 14 keys, all strings
  z.array(transactionRecordSchema).parse(transactions)
  return { transactions, audit: sorted.map(auditOf) }
}
