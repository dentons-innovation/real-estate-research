/**
 * Domain vocabulary (folded: lowercase, no diacritics) shared by the article
 * prefilter and the query generators.
 */

/** Stems signalling a transaction took place. */
export const TRANSACTION_STEMS = [
  'sprzeda', 'kupi', 'naby', 'przeje', 'akwizycj', 'transakcj', 'umowa przedwstepna', 'umowe przedwstepna',
  'finalizacj', 'sfinalizowa', 'acquir', 'acquisition', 'purchase', 'sold', 'sale of', 'sells', 'divest',
  'disposal', 'forward funding', 'sale and leaseback',
]

export const FINANCING_STEMS = [
  'finansowan', 'refinansowan', 'kredyt', 'pozyczk', 'konsorcjum bank', 'financing', 'refinanc', 'loan',
  'facility', 'lender', 'joint venture', 'jv ', 'platforma inwestycyjna', 'wspolne przedsiewziecie',
]

/** Stems signalling a law firm credit. */
export const ADVISORY_STEMS = [
  'doradza', 'doradzil', 'doradc', 'kancelari', 'advised', 'advising', 'advises', 'counsel', 'law firm',
  'legal advis',
]

export const ASSET_STEMS = [
  'biurow', 'magazyn', 'logistyczn', 'park handlow', 'centrum handlow', 'galeri', 'hotel', 'grunt',
  'dzialk', 'mieszka', 'prs', 'akademik', 'nieruchomosc', 'office', 'warehouse', 'logistics', 'retail park',
  'shopping cent', 'residential', 'student housing', 'land plot', 'real estate', 'property', 'portfolio',
  'portfel',
]

export const POLAND_MARKERS = [
  'polsk', 'polsc', 'poland', 'polish', 'warszaw', 'warsaw', 'krakow', 'cracow', 'wroclaw', 'poznan',
  'gdansk', 'gdyni', 'trojmiast', 'lodz', 'katowic', 'szczecin', 'lublin', 'bydgoszcz', 'rzeszow',
  'bialystok', 'slask',
]

/** Signals that an article is not about a transaction. */
export const NOISE_STEMS = [
  'najem', 'wynaj', 'najemc', 'lease', 'tenant', 'leasing', 'raport', 'report', 'prognoz', 'forecast',
  'outlook', 'podsumowanie rynku', 'market overview',
]
