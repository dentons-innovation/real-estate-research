import { tokenize, tokenMatches } from '../verify/normalize'

/** Legal forms and corporate filler that do not identify a company. */
const LEGAL_SUFFIXES = new Set([
  'sp', 'z', 'o', 'oo', 'zoo', 'sa', 's', 'a', 'ska', 'sk', 'k', 'spk', 'spolka', 'akcyjna', 'komandytowa',
  'ograniczona', 'odpowiedzialnoscia', 'gmbh', 'ag', 'ltd', 'limited', 'llc', 'llp', 'lp', 'plc', 'inc',
  'corp', 'corporation', 'bv', 'nv', 'sarl', 'se', 'ab', 'as', 'oy', 'kg', 'co', 'company',
  'group', 'grupa', 'holding', 'holdings', 'the', 'and', 'i', 'of', 'w',
  // geographic and generic qualifiers of a local entity: "Van der Vorm Poland" = "Van der Vorm Vastgoed"
  'poland', 'polska', 'polski', 'polish', 'polsce', 'europe', 'european', 'cee', 'international', 'global', 'vastgoed',
])

/** Words that describe an asset type rather than name it. */
const GENERIC_ASSET_WORDS = new Set([
  'biurowiec', 'biurowca', 'biurowy', 'biurowego', 'budynek', 'budynku', 'office', 'offices', 'building', 'buildings',
  'park', 'parku', 'centrum', 'centre', 'center', 'portfolio', 'portfel', 'portfela', 'property', 'properties',
  'nieruchomosc', 'nieruchomosci', 'asset', 'assets', 'complex', 'kompleks', 'kompleksu', 'handlowy', 'handlowe',
  'handlowego', 'retail', 'shopping', 'logistics', 'logistyczny', 'logistyczne', 'logistic', 'warehouse', 'warehouses',
  'magazyn', 'magazynowy', 'magazynow', 'hotel', 'hotelu', 'land', 'plot', 'grunt', 'dzialka', 'dzialki', 'residential',
  'mieszkaniowy', 'prs', 'mixed', 'use', 'development', 'project', 'projekt', 'inwestycja', 'investment', 'tower',
  'storey', 'galeria', 'gallery', 'mall', 'scheme', 'estate', 'real', 'sale', 'acquisition', 'financing',
  'refinancing', 'loan', 'kredyt', 'in', 'at', 'na', 'we', 'przy', 'ul', 'ulicy', 'street',
  'etap', 'etapu', 'etapie', 'phase', 'stage', 'faza', 'fazy', 'fazie', 'czesc', 'czesci', 'part',
  // plurals and Polish inflections of the type words above
  'projects', 'projektow', 'projekty', 'projektu', 'inwestycji', 'inwestycje', 'inwestycyjny', 'inwestycyjne', 'inwestycyjnych',
  'mieszkaniowych', 'mieszkaniowe', 'mieszkaniowa', 'mieszkaniowego', 'mieszkan', 'mieszkania', 'apartments', 'units', 'lokali', 'lokale',
  'parks', 'parki', 'parkow', 'biurowce', 'biurowcow', 'biurowych', 'magazyny', 'magazynowych', 'magazynowe', 'hala', 'hale', 'hali', 'hall', 'halls',
  'obiekt', 'obiektow', 'obiekty', 'obiektu', 'portfelu', 'centra', 'centrow', 'parkach', 'nieruchomosciach',
  // counts ("portfolio of four properties", "trzy parki") describe, they do not name
  'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
  'jeden', 'jedna', 'dwa', 'dwie', 'dwoch', 'trzy', 'trzech', 'cztery', 'czterech', 'piec', 'pieciu', 'szesc', 'szesciu',
  'siedem', 'siedmiu', 'osiem', 'osmiu', 'dziewiec', 'dziesiec', 'kilka', 'kilku', 'several',
  ...LEGAL_SUFFIXES,
])

/** Ordinals written as words → digits, so "drugi etap", "Phase 2" and "second stage" share a token. */
const ORDINALS: Array<[RegExp, string]> = [
  [/^(pierwsz\w*|first|1st)$/, '1'],
  [/^(drug\w*|second|2nd|ii)$/, '2'],
  [/^(trzec\w*|third|3rd|iii)$/, '3'],
  [/^(czwart\w*|fourth|4th|iv)$/, '4'],
]

function canonicalAssetToken(token: string): string {
  for (const [re, digit] of ORDINALS) if (re.test(token)) return digit
  return token
}

/** Cities appear in asset names but never distinguish two assets on their own. */
const CITY_TOKENS = new Set([
  'warszawa', 'warszawie', 'warszawy', 'warsaw', 'krakow', 'krakowie', 'krakowa', 'cracow', 'wroclaw', 'wroclawiu',
  'wroclawia', 'poznan', 'poznaniu', 'poznania', 'gdansk', 'gdansku', 'gdanska', 'gdynia', 'gdyni', 'sopot', 'lodz',
  'lodzi', 'katowice', 'katowicach', 'katowic', 'szczecin', 'szczecinie', 'lublin', 'lublinie', 'bydgoszcz',
  'bialystok', 'rzeszow', 'torun', 'poland', 'polska', 'polsce', 'polski', 'polish',
])

export function partyTokens(name: string): string[] {
  return tokenize(name).filter((t) => !LEGAL_SUFFIXES.has(t) && (t.length >= 2 || /\d/.test(t)))
}

/** Tokens that identify an asset: no generic words, no cities. Numbers count ("P180"). */
export function assetTokens(name: string): string[] {
  return tokenize(name)
    .map(canonicalAssetToken)
    .filter((t) => !GENERIC_ASSET_WORDS.has(t) && !CITY_TOKENS.has(t) && (t.length >= 3 || /\d/.test(t)))
}

/** Number of identifying tokens two asset names have in common. */
export function sharedAssetTokens(a: string, b: string): number {
  return matchedCount(assetTokens(a), assetTokens(b))
}

/** True when the asset name contains something searchable besides type and city. */
export function isDistinctiveAsset(name: string): boolean {
  return assetTokens(name).length > 0
}

/** Strips descriptions the model may have appended: "The Bridge (40-storey office property)" → "The Bridge". */
export function searchableAssetName(name: string): string {
  return name
    .replace(/\([^)]*\)/g, ' ')
    .split(/,| - | – | — /)[0]
    .replace(/\s+/g, ' ')
    .trim()
}

/** Stems of the cities that are written differently in Polish and English, or inflected. */
const CITY_STEMS: Array<[RegExp, string]> = [
  [/^(warsz|warsaw)/, 'warszawa'],
  [/^(krak|cracow)/, 'krakow'],
  [/^wroclaw/, 'wroclaw'],
  [/^poznan/, 'poznan'],
  [/^gdansk/, 'gdansk'],
  [/^gdyni/, 'gdynia'],
  [/^lodz/, 'lodz'],
  [/^katowic/, 'katowice'],
  [/^szczecin/, 'szczecin'],
  [/^lublin/, 'lublin'],
]

/** One spelling per city: "Warsaw", "Warszawie" → "warszawa". Unknown cities are stemmed roughly. */
export function canonicalCity(name: string): string | null {
  const token = tokenize(name).find((t) => t.length >= 3 && !['poland', 'polska', 'polsce', 'polski', 'polish'].includes(t))
  if (!token) return null
  for (const [re, city] of CITY_STEMS) if (re.test(token)) return city
  return token.length > 5 ? token.slice(0, token.length - 1) : token
}

export function cityTokenOf(name: string): string | null {
  const token = tokenize(name).find((t) => CITY_TOKENS.has(t) && !['poland', 'polska', 'polsce', 'polski', 'polish'].includes(t))
  return token ? canonicalCity(token) : null
}

function matchedCount(a: string[], b: string[]): number {
  return a.filter((x) => b.some((y) => tokenMatches(x, y))).length
}

export function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0
  const inter = matchedCount(a, b)
  const union = a.length + b.length - inter
  return union <= 0 ? 0 : inter / union
}

/** Share of the shorter token list found in the longer one. */
export function containment(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0
  const [short, long] = a.length <= b.length ? [a, b] : [b, a]
  return matchedCount(short, long) / short.length
}

export function jaroWinkler(s1: string, s2: string): number {
  if (s1 === s2) return s1.length === 0 ? 0 : 1
  if (!s1.length || !s2.length) return 0
  const window = Math.max(0, Math.floor(Math.max(s1.length, s2.length) / 2) - 1)
  const m1 = new Array<boolean>(s1.length).fill(false)
  const m2 = new Array<boolean>(s2.length).fill(false)
  let matches = 0
  for (let i = 0; i < s1.length; i++) {
    const lo = Math.max(0, i - window)
    const hi = Math.min(s2.length - 1, i + window)
    for (let j = lo; j <= hi; j++) {
      if (!m2[j] && s1[i] === s2[j]) {
        m1[i] = true
        m2[j] = true
        matches++
        break
      }
    }
  }
  if (matches === 0) return 0
  let transpositions = 0
  let k = 0
  for (let i = 0; i < s1.length; i++) {
    if (!m1[i]) continue
    while (!m2[k]) k++
    if (s1[i] !== s2[k]) transpositions++
    k++
  }
  const jaro = (matches / s1.length + matches / s2.length + (matches - transpositions / 2) / matches) / 3
  const prefix = Math.min(4, [...s1].findIndex((c, i) => c !== s2[i]) === -1 ? Math.min(s1.length, s2.length) : [...s1].findIndex((c, i) => c !== s2[i]))
  return jaro + prefix * 0.1 * (1 - jaro)
}

/** 0..1 similarity of two asset names, on identifying tokens only. */
export function assetSimilarity(a: string, b: string): number {
  const ta = assetTokens(a)
  const tb = assetTokens(b)
  if (ta.length === 0 || tb.length === 0) return 0
  const jw = jaroWinkler([...ta].sort().join(' '), [...tb].sort().join(' '))
  // containment of a single shared token is weak evidence ("Park" style names are filtered, but still)
  const cont = Math.min(ta.length, tb.length) >= 2 ? containment(ta, tb) : containment(ta, tb) * 0.85
  return Math.max(jaccard(ta, tb), cont, jw >= 0.9 ? jw : 0)
}

/** 0..1 similarity of two party names. */
export function partySimilarity(a: string, b: string): number {
  const ta = partyTokens(a)
  const tb = partyTokens(b)
  if (ta.length === 0 || tb.length === 0) return 0
  return Math.max(jaccard(ta, tb), containment(ta, tb))
}
