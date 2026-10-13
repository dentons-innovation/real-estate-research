/**
 * Source domain lists. The first block of each list comes from the previous
 * prototype and is known to work; the rest are candidates — `npm run probe:tavily`
 * reports which of them actually return results. Extendable via
 * EXTRA_TRADE_DOMAINS / EXTRA_LAW_DOMAINS.
 */

export const TRADE_PRESS_DOMAINS = [
  'eurobuildcee.com',
  'property-forum.eu',
  'propertynews.pl',
  // candidates
  'terenyinwestycyjne.info',
  'europaproperty.com',
  'propertyinsider.pl',
  'retailnet.pl',
  'ceerealestatematters.com',
  'cremediaeurope.com',
  'wbj.pl',
]

export const LAW_FIRM_DOMAINS = [
  'dentons.com',
  'cms.law',
  'gtlaw.com',
  'wolftheiss.com',
  'bakermckenzie.com',
  'cliffordchance.com',
  'rzmlaw.com',
  'dzp.pl',
  'whitecase.com',
  'dlapiper.com',
  'gide.com',
  'pinsentmasons.com',
  // candidates
  'linklaters.com',
  'aoshearman.com',
  'hoganlovells.com',
  'skslegal.pl',
  'wardynski.com.pl',
  'wkb.pl',
  'eversheds-sutherland.com',
  'taylorwessing.com',
  'noerr.com',
  'osborneclarke.com',
  'schoenherr.eu',
  'kinstellar.com',
  'penteris.com',
  'addleshawgoddard.com',
]

export const LEGAL_PRESS_DOMAINS = ['ceelegalmatters.com', 'rynekprawniczy.pl', 'rp.pl', 'prawo.pl']

/** Never used as evidence: social media and listing portals. */
export const EXCLUDED_DOMAINS = [
  'facebook.com',
  'linkedin.com',
  'x.com',
  'twitter.com',
  'instagram.com',
  'youtube.com',
  'otodom.pl',
  'morizon.pl',
  'gratka.pl',
  'olx.pl',
]

export interface DomainLists {
  tradePress: string[]
  lawFirms: string[]
  legalPress: string[]
  excluded: string[]
}

export function buildDomainLists(extraTrade: string[] = [], extraLaw: string[] = []): DomainLists {
  const uniq = (xs: string[]) => [...new Set(xs.map((x) => x.toLowerCase().replace(/^www\./, '')))]
  return {
    tradePress: uniq([...TRADE_PRESS_DOMAINS, ...extraTrade]),
    lawFirms: uniq([...LAW_FIRM_DOMAINS, ...extraLaw]),
    legalPress: uniq(LEGAL_PRESS_DOMAINS),
    excluded: uniq(EXCLUDED_DOMAINS),
  }
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return ''
  }
}

export function inDomainList(url: string, domains: string[]): boolean {
  const host = hostOf(url)
  if (!host) return false
  return domains.some((d) => host === d || host.endsWith(`.${d}`))
}

/**
 * Source reliability tier, used to resolve conflicting values:
 * 1 = law firm site (first-hand on advisors), 2 = trade / legal press, 3 = anything else.
 */
export type SourceTier = 1 | 2 | 3

export function tierOf(url: string, lists: DomainLists): SourceTier {
  if (inDomainList(url, lists.lawFirms)) return 1
  if (inDomainList(url, lists.tradePress) || inDomainList(url, lists.legalPress)) return 2
  return 3
}
