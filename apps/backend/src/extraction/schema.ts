import { DEAL_STATUSES, SECTORS, TRANSACTION_TYPES } from '@re/shared'
import { z } from 'zod'

/**
 * Structured-output schemas. Written for strict JSON-schema mode: every
 * property is required, absence is expressed with null, no length/pattern
 * constraints (unsupported in strict mode).
 */

const fact = z.object({
  value: z.string().describe('The value exactly as written in the article.'),
  quote: z.string().describe('One or two sentences copied character-for-character from the article that state this value.'),
})

const partyFact = z.object({
  name: z.string().describe('Name of the party or law firm as written in the article.'),
  role: z.string().describe('Role as stated in the article, e.g. "lender", "JV partner", "agent", "advised the lender".'),
  quote: z.string().describe('Sentence copied character-for-character from the article stating this party and role.'),
})

export const extractedDealSchema = z.object({
  asset_name: z.string().describe('Name of the asset or portfolio, e.g. "P180 office building, Warsaw".'),
  asset_quote: z.string().describe('Sentence copied character-for-character from the article that names the asset and the transaction.'),
  city: z.string().nullable().describe('City of the asset, null if not stated.'),
  in_poland: z.boolean().describe('True only if the asset is located in Poland.'),
  is_lease_only: z.boolean().describe('True if this is only a lease / tenancy deal, not a sale, acquisition, financing or JV.'),
  is_market_report: z.boolean().describe('True if the text is a market report or summary rather than news of a specific transaction.'),
  transaction_type: z.enum(TRANSACTION_TYPES),
  description_en: z.string().describe('One factual sentence in English describing the transaction, using only facts from the article.'),
  announcement_date: z.string().nullable().describe('Date the transaction was announced or signed, YYYY-MM-DD, only if written in the article. Otherwise null.'),
  announcement_date_quote: z.string().nullable().describe('Sentence copied from the article containing that date. Null if announcement_date is null.'),
  buyer: fact.nullable().describe('Buyer / investor / borrower. Null if not stated.'),
  seller: fact.nullable().describe('Seller / vendor. Null if not stated.'),
  other_parties: z.array(partyFact).describe('Lenders, JV partners, agents and other non-legal parties. Empty if none stated.'),
  deal_value: fact.nullable().describe('Value of THIS transaction with currency, copied as written. Null if not disclosed.'),
  buyer_legal_advisor: fact.nullable().describe('Law firm that advised the buyer, only if the article states whom it advised. Otherwise null.'),
  seller_legal_advisor: fact.nullable().describe('Law firm that advised the seller, only if the article states whom it advised. Otherwise null.'),
  other_legal_advisors: z.array(partyFact).describe('Law firms whose client side is not stated, or that advised lenders or other parties.'),
  status: z.enum(DEAL_STATUSES),
  sector: z.enum(SECTORS),
})

export const articleExtractionSchema = z.object({
  is_relevant: z.boolean().describe('True if the article reports at least one specific real estate transaction in Poland.'),
  deals: z.array(extractedDealSchema),
})

export const deepeningExtractionSchema = z.object({
  is_relevant: z.boolean(),
  deals: z.array(
    extractedDealSchema.extend({
      same_transaction: z.boolean().describe('True only if this is the SAME transaction as the KNOWN DEAL (same asset and, where known, same parties).'),
    }),
  ),
})

export const descriptionSchema = z.object({
  deals: z.array(
    z.object({
      deal_id: z.number().describe('The deal_id given in the input.'),
      description_en: z.string().describe('One factual sentence in English built only from the given facts.'),
    }),
  ),
})

export type ExtractedDeal = z.infer<typeof extractedDealSchema>
export type ArticleExtraction = z.infer<typeof articleExtractionSchema>
export type DeepeningExtraction = z.infer<typeof deepeningExtractionSchema>
export type DescriptionBatch = z.infer<typeof descriptionSchema>
