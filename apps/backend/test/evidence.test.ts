import { describe, expect, it } from 'vitest'
import { checkEvidence, dateInQuote, dateQuoteInText, isDescriptiveParty, nameInQuote, prepareText, quoteInText, valueInQuote } from '../src/verify/evidence'
import { advisorSideSupported } from '../src/verify/roles'

const ARTICLE = `Fundusz Arcturus Real Estate kupił park logistyczny Logistic Hub Stryków od firmy Panorama Development.
Wartość transakcji wyniosła 85 mln euro. Transakcja została sfinalizowana 7 lipca 2026 r.
Kancelaria Lex Varsovia doradzała sprzedającemu, spółce Panorama Development, przy sprzedaży parku.
CMS advised the seller, while Dentons advised the buyer on the “Project Amber” acquisition.`

const text = prepareText(ARTICLE)

describe('quoteInText', () => {
  it('accepts a verbatim quote', () => {
    expect(quoteInText('Wartość transakcji wyniosła 85 mln euro.', text)).toBe(true)
  })

  it('ignores differences in case, whitespace, quotes and diacritics', () => {
    expect(quoteInText('dentons advised the buyer on the "Project Amber"   acquisition', text)).toBe(true)
    expect(quoteInText('Wartosc transakcji wyniosla 85 mln euro', text)).toBe(true)
  })

  it('rejects a fabricated quote', () => {
    expect(quoteInText('Meridian Legal advised Arcturus Real Estate on the acquisition.', text)).toBe(false)
  })

  it('rejects a quote with a changed fact', () => {
    expect(quoteInText('Wartość transakcji wyniosła 95 mln euro.', text)).toBe(false)
  })

  it('rejects quotes too short to prove anything', () => {
    expect(quoteInText('85 mln euro', text)).toBe(false)
  })

  it('accepts a quote shortened with an ellipsis when both parts are real', () => {
    expect(quoteInText('Fundusz Arcturus Real Estate kupił park logistyczny [...] od firmy Panorama Development.', text)).toBe(true)
    expect(quoteInText('Fundusz Arcturus Real Estate kupił park logistyczny ... od firmy Meridian Holdings.', text)).toBe(false)
  })

  it('tolerates a near-verbatim quote but not a paraphrase', () => {
    expect(quoteInText('Kancelaria Lex Varsovia doradzała sprzedającemu spółce Panorama Development przy sprzedaży parku', text)).toBe(true)
    expect(quoteInText('Sprzedającemu przy sprzedaży parku doradzała kancelaria prawna Lex Varsovia z Warszawy', text)).toBe(false)
  })
})

describe('nameInQuote', () => {
  it('matches names regardless of legal form', () => {
    expect(nameInQuote('Panorama Development sp. z o.o.', 'od firmy Panorama Development.')).toBe(true)
  })

  it('tolerates Polish inflection', () => {
    expect(nameInQuote('Galeria Bursztynowa', 'na refinansowanie Galerii Bursztynowej w Gdańsku')).toBe(true)
  })

  it('requires every identifying token', () => {
    expect(nameInQuote('Panorama Capital', 'od firmy Panorama Development.')).toBe(false)
  })

  it('does not match short names by prefix', () => {
    expect(nameInQuote('CMS', 'CMSX advised the seller')).toBe(false)
    expect(nameInQuote('CMS', 'CMS advised the seller')).toBe(true)
  })
})

describe('valueInQuote', () => {
  it('matches amounts across notations', () => {
    expect(valueInQuote('EUR 85 million', 'Wartość transakcji wyniosła 85 mln euro.')).toBe(true)
    expect(valueInQuote('€36.4 million', 'a facility of EUR 36,4 million')).toBe(true)
    expect(valueInQuote('1,2 mld zł', 'za 1,2 mld zł')).toBe(true)
  })

  it('rejects a different amount or currency', () => {
    expect(valueInQuote('EUR 95 million', 'Wartość transakcji wyniosła 85 mln euro.')).toBe(false)
    expect(valueInQuote('PLN 85 million', 'Wartość transakcji wyniosła 85 mln euro.')).toBe(false)
  })

  it('rejects a value without a currency', () => {
    expect(valueInQuote('85 million', '85 mln euro')).toBe(false)
  })
})

describe('dateInQuote', () => {
  it('reads Polish and English dates', () => {
    expect(dateInQuote('2026-07-07', 'Transakcja została sfinalizowana 7 lipca 2026 r.')).toBe(true)
    expect(dateInQuote('2026-07-07', 'signed on July 7, 2026')).toBe(true)
    expect(dateInQuote('2026-07-07', 'Umowę podpisano 7.07.2026.')).toBe(true)
    expect(dateInQuote('2026-09-24', 'Published 24-9-2026')).toBe(true)
  })

  it('rejects another date', () => {
    expect(dateInQuote('2026-07-08', 'Transakcja została sfinalizowana 7 lipca 2026 r.')).toBe(false)
  })

  it('reads the abbreviated months the trade press prints', () => {
    expect(dateInQuote('2026-09-30', 'Dodano: 30 wrz 2026 14:50')).toBe(true)
    expect(dateInQuote('2026-10-05', '05 Oct 2026')).toBe(true)
    expect(dateInQuote('2026-10-05', '5 paź 2026')).toBe(true)
    expect(dateInQuote('2026-11-03', '3 lis 2026')).toBe(true)
    // whole-word only: "lista" is not November
    expect(dateInQuote('2026-11-03', '3 lista 2026')).toBe(false)
  })
})

describe('dateQuoteInText', () => {
  const page = prepareText('Biura\nDodano:\n30 wrz 2026 14:50\nBanki dorzuciły 218 mln zł do warszawskiego giganta.')

  it('accepts a quote that is just the printed date line', () => {
    expect(dateQuoteInText('Dodano:\n30 wrz 2026 14:50', page)).toBe(true)
    expect(dateQuoteInText('30 wrz 2026', page)).toBe(true)
  })

  it('still demands a verbatim occurrence', () => {
    expect(dateQuoteInText('Dodano: 1 paź 2026', page)).toBe(false)
    expect(dateQuoteInText('2026', page)).toBe(false)
  })
})

describe('checkEvidence', () => {
  it('reports why a value was rejected', () => {
    expect(checkEvidence('Arcturus Real Estate', 'Fundusz Arcturus Real Estate kupił park logistyczny Logistic Hub Stryków', text, 'name')).toBeNull()
    expect(checkEvidence('Meridian Legal', 'Meridian Legal advised the buyer on the acquisition.', text, 'name')).toBe('quote_not_found')
    expect(checkEvidence('Meridian Legal', 'Wartość transakcji wyniosła 85 mln euro.', text, 'name')).toBe('value_not_in_quote')
  })

  it('rejects a description of a party in place of its name', () => {
    for (const value of [
      'osoba prawna',
      'polska spółka',
      'Nabywca pozostaje nieujawniony.',
      'spółki celowej należącej do renomowanego międzynarodowego inwestora',
      'a US real estate investment company focused on commercial properties',
      'a joint venture between Madison International Realty and Cavatina',
      'German developers operating in Poland',
    ]) {
      expect(checkEvidence(value, 'Fundusz Arcturus Real Estate kupił park logistyczny Logistic Hub Stryków', text, 'name'), value).toBe('not_a_name')
    }
    for (const value of ['Vestas Investment Management Europe', 'Powszechna Spółdzielnia Spożywców "Pionier"', 'Panorama Development', 'Investor AG', 'The Student Hotel', 'Polish Properties sp. z o.o.']) {
      expect(isDescriptiveParty(value), value).toBe(false)
    }
  })
})

describe('advisorSideSupported', () => {
  const quote = 'CMS advised the seller, while Dentons advised the buyer on the acquisition.'
  const none = { buyer: null, seller: null }

  it('assigns each firm to the side its own clause names', () => {
    expect(advisorSideSupported('seller', 'CMS', quote, none)).toBe(true)
    expect(advisorSideSupported('buyer', 'Dentons', quote, none)).toBe(true)
  })

  it('refuses the opposite side', () => {
    expect(advisorSideSupported('buyer', 'CMS', quote, none)).toBe(false)
    expect(advisorSideSupported('seller', 'Dentons', quote, none)).toBe(false)
  })

  it('accepts the client name in place of a role word', () => {
    const q = 'Kowalski & Partners advised Nordhaven Capital on the acquisition of the building.'
    expect(advisorSideSupported('buyer', 'Kowalski & Partners', q, { buyer: 'Nordhaven Capital', seller: 'Baltic Estates' })).toBe(true)
    expect(advisorSideSupported('seller', 'Kowalski & Partners', q, { buyer: 'Nordhaven Capital', seller: 'Baltic Estates' })).toBe(false)
  })

  it('handles the passive voice and Polish', () => {
    expect(advisorSideSupported('seller', 'Lex Varsovia', 'The seller, Baltic Estates, was advised by Lex Varsovia.', none)).toBe(true)
    expect(advisorSideSupported('seller', 'Lex Varsovia', 'Kancelaria Lex Varsovia doradzała sprzedającemu, spółce Panorama Development.', none)).toBe(true)
    expect(advisorSideSupported('buyer', 'Lex Varsovia', 'Kancelaria Lex Varsovia doradzała sprzedającemu, spółce Panorama Development.', none)).toBe(false)
  })

  it('refuses when the side is not stated', () => {
    expect(advisorSideSupported('buyer', 'Kowalski & Partners', 'Several law firms worked on the transaction, including Kowalski & Partners.', none)).toBe(false)
  })
})
