import type { ArticleExtraction, ExtractedDeal } from '../../extraction/schema'
import type { LaneId } from '../../types'

/**
 * Mock-mode fixtures: FICTIONAL deals, companies and law firms on reserved
 * `.example` domains. They exercise every branch of the pipeline — duplicate
 * reports, a lease, a deal outside the window, a fabricated advisor that the
 * evidence check must reject, and follow-up articles for deepening.
 */

export interface Fixture {
  url: string
  title: string
  text: string
  /** Null for pages the search provider does not date (most law firm sites). */
  publishedAt: string | null
  /** Where the page is "found". */
  via: 'opoint' | LaneId | 'deepening'
  /** Deepening pages are returned for queries mentioning one of these words. */
  keywords?: string[]
  extraction: ArticleExtraction
}

const DAY_MS = 24 * 60 * 60 * 1000
const daysBefore = (iso: string, days: number) => new Date(Date.parse(iso) - days * DAY_MS).toISOString().slice(0, 10)
const plDate = (iso: string) => `${Number(iso.slice(8, 10))}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`

const deal = (partial: Partial<ExtractedDeal> & Pick<ExtractedDeal, 'asset_name' | 'asset_quote' | 'transaction_type' | 'description_en' | 'sector'>): ExtractedDeal => ({
  city: null,
  in_poland: true,
  is_lease_only: false,
  is_market_report: false,
  announcement_date: null,
  announcement_date_quote: null,
  buyer: null,
  seller: null,
  other_parties: [],
  deal_value: null,
  buyer_legal_advisor: null,
  seller_legal_advisor: null,
  other_legal_advisors: [],
  status: 'announced',
  ...partial,
})

export function buildFixtures(windowEnd: string): Fixture[] {
  const d3 = daysBefore(windowEnd, 3)
  const d6 = daysBefore(windowEnd, 6)
  const d9 = daysBefore(windowEnd, 9)
  const d12 = daysBefore(windowEnd, 12)
  const d100 = daysBefore(windowEnd, 100)

  return [
    {
      via: 'sales',
      url: 'https://tradepress.example/news/nordhaven-acquires-wisla-tower',
      title: 'Nordhaven Capital acquires Wisła Tower in Warsaw',
      publishedAt: d3,
      text: `Published ${plDate(d3)}. Nordhaven Capital has signed an agreement to acquire Wisła Tower, a 32-storey office building in Warsaw, from Baltic Estates. The purchase price amounts to EUR 120 million. The transaction is one of the largest office deals on the Polish investment market this quarter. Wisła Tower offers 41,000 sqm of office space and is almost fully let. The acquisition is expected to close by the end of the quarter, subject to customary conditions. Baltic Estates developed the building and has owned it since completion.`,
      extraction: {
        is_relevant: true,
        deals: [
          deal({
            asset_name: 'Wisła Tower, Warsaw',
            asset_quote: 'Nordhaven Capital has signed an agreement to acquire Wisła Tower, a 32-storey office building in Warsaw, from Baltic Estates.',
            city: 'Warsaw',
            transaction_type: 'acquisition',
            description_en: 'Nordhaven Capital signed an agreement to acquire the Wisła Tower office building in Warsaw from Baltic Estates for EUR 120 million.',
            buyer: { value: 'Nordhaven Capital', quote: 'Nordhaven Capital has signed an agreement to acquire Wisła Tower, a 32-storey office building in Warsaw, from Baltic Estates.' },
            seller: { value: 'Baltic Estates', quote: 'Nordhaven Capital has signed an agreement to acquire Wisła Tower, a 32-storey office building in Warsaw, from Baltic Estates.' },
            deal_value: { value: 'EUR 120 million', quote: 'The purchase price amounts to EUR 120 million.' },
            status: 'signed',
            sector: 'office',
          }),
        ],
      },
    },
    {
      // the same deal reported in Polish by media monitoring → must merge with the one above
      via: 'opoint',
      url: 'https://monitoring.example/artykul/wisla-tower-sprzedana',
      title: 'Wisła Tower zmienia właściciela. Transakcja za 120 mln euro',
      publishedAt: d3,
      text: `Warszawski biurowiec Wisła Tower został sprzedany. Nabywcą jest fundusz Nordhaven Capital, a sprzedającym spółka Baltic Estates. Wartość transakcji wyniosła 120 mln euro. To jedna z największych transakcji na rynku nieruchomości biurowych w Polsce w tym roku. Umowa została podpisana ${plDate(d3)}. Budynek oferuje 41 tys. mkw. powierzchni biurowej w centrum Warszawy.`,
      extraction: {
        is_relevant: true,
        deals: [
          deal({
            asset_name: 'Wisła Tower',
            asset_quote: 'Warszawski biurowiec Wisła Tower został sprzedany.',
            city: 'Warszawa',
            transaction_type: 'sale',
            description_en: 'The Wisła Tower office building in Warsaw was sold by Baltic Estates to Nordhaven Capital for EUR 120 million.',
            announcement_date: d3,
            announcement_date_quote: `Umowa została podpisana ${plDate(d3)}.`,
            buyer: { value: 'Nordhaven Capital', quote: 'Nabywcą jest fundusz Nordhaven Capital, a sprzedającym spółka Baltic Estates.' },
            seller: { value: 'Baltic Estates', quote: 'Nabywcą jest fundusz Nordhaven Capital, a sprzedającym spółka Baltic Estates.' },
            deal_value: { value: '120 mln euro', quote: 'Wartość transakcji wyniosła 120 mln euro.' },
            status: 'signed',
            sector: 'office',
          }),
        ],
      },
    },
    {
      via: 'opoint',
      url: 'https://monitoring.example/artykul/arcturus-kupil-logistic-hub-strykow',
      title: 'Arcturus Real Estate kupił Logistic Hub Stryków',
      publishedAt: d6,
      text: `Fundusz Arcturus Real Estate kupił park logistyczny Logistic Hub Stryków od firmy Panorama Development. Wartość transakcji wyniosła 85 mln euro. Transakcja została sfinalizowana ${plDate(d6)}. Park logistyczny pod Łodzią składa się z czterech magazynów o łącznej powierzchni 110 tys. mkw. To kolejna duża transakcja na rynku nieruchomości magazynowych w Polsce. Najemcami obiektu są firmy z branży e-commerce i logistyki kontraktowej.`,
      extraction: {
        is_relevant: true,
        deals: [
          deal({
            asset_name: 'Logistic Hub Stryków',
            asset_quote: 'Fundusz Arcturus Real Estate kupił park logistyczny Logistic Hub Stryków od firmy Panorama Development.',
            city: 'Stryków',
            transaction_type: 'acquisition',
            description_en: 'Arcturus Real Estate acquired the Logistic Hub Stryków logistics park from Panorama Development for EUR 85 million.',
            announcement_date: d6,
            announcement_date_quote: `Transakcja została sfinalizowana ${plDate(d6)}.`,
            buyer: { value: 'Arcturus Real Estate', quote: 'Fundusz Arcturus Real Estate kupił park logistyczny Logistic Hub Stryków od firmy Panorama Development.' },
            seller: { value: 'Panorama Development', quote: 'Fundusz Arcturus Real Estate kupił park logistyczny Logistic Hub Stryków od firmy Panorama Development.' },
            deal_value: { value: '85 mln euro', quote: 'Wartość transakcji wyniosła 85 mln euro.' },
            status: 'completed',
            sector: 'logistics-industrial',
          }),
        ],
      },
    },
    {
      via: 'lawfirms',
      url: 'https://lexvarsovia.example/aktualnosci/logistic-hub-strykow',
      title: 'Lex Varsovia doradzała przy sprzedaży Logistic Hub Stryków',
      publishedAt: d6,
      text: `Kancelaria Lex Varsovia doradzała sprzedającemu, spółce Panorama Development, przy sprzedaży parku logistycznego Logistic Hub Stryków. Nabywcą nieruchomości jest fundusz Arcturus Real Estate. Transakcja objęła cztery magazyny w centralnej Polsce. Zespołem kancelarii kierował partner odpowiedzialny za praktykę nieruchomości. Doradztwo obejmowało przygotowanie i negocjowanie umowy sprzedaży oraz wsparcie przy zamknięciu transakcji. Komunikat opublikowano ${plDate(d6)}.`,
      extraction: {
        is_relevant: true,
        deals: [
          deal({
            asset_name: 'Logistic Hub Stryków',
            asset_quote: 'Kancelaria Lex Varsovia doradzała sprzedającemu, spółce Panorama Development, przy sprzedaży parku logistycznego Logistic Hub Stryków.',
            transaction_type: 'sale',
            description_en: 'Panorama Development sold the Logistic Hub Stryków logistics park to Arcturus Real Estate.',
            announcement_date: d6,
            announcement_date_quote: `Komunikat opublikowano ${plDate(d6)}.`,
            buyer: { value: 'Arcturus Real Estate', quote: 'Nabywcą nieruchomości jest fundusz Arcturus Real Estate.' },
            seller: { value: 'Panorama Development', quote: 'Kancelaria Lex Varsovia doradzała sprzedającemu, spółce Panorama Development, przy sprzedaży parku logistycznego Logistic Hub Stryków.' },
            seller_legal_advisor: { value: 'Lex Varsovia', quote: 'Kancelaria Lex Varsovia doradzała sprzedającemu, spółce Panorama Development, przy sprzedaży parku logistycznego Logistic Hub Stryków.' },
            status: 'completed',
            sector: 'logistics-industrial',
          }),
        ],
      },
    },
    {
      via: 'financing',
      url: 'https://tradepress.example/news/galeria-bursztynowa-refinansowanie',
      title: 'Amber Retail refinansuje Galerię Bursztynową',
      publishedAt: d9,
      text: `Bank Hanzeatycki udzielił spółce Amber Retail kredytu w wysokości 60 mln euro na refinansowanie Galerii Bursztynowej w Gdańsku. Umowę kredytową podpisano ${plDate(d9)}. Galeria Bursztynowa to centrum handlowe o powierzchni 38 tys. mkw. Finansowanie zostało udzielone na pięć lat. To jedno z większych refinansowań nieruchomości handlowych w Polsce w ostatnich miesiącach. Spółka Amber Retail jest właścicielem obiektu od 2019 roku.`,
      extraction: {
        is_relevant: true,
        deals: [
          deal({
            asset_name: 'Galeria Bursztynowa, Gdańsk',
            asset_quote: 'Bank Hanzeatycki udzielił spółce Amber Retail kredytu w wysokości 60 mln euro na refinansowanie Galerii Bursztynowej w Gdańsku.',
            city: 'Gdańsk',
            transaction_type: 'financing',
            description_en: 'Bank Hanzeatycki granted Amber Retail a EUR 60 million loan to refinance the Galeria Bursztynowa shopping centre in Gdańsk.',
            announcement_date: d9,
            announcement_date_quote: `Umowę kredytową podpisano ${plDate(d9)}.`,
            buyer: { value: 'Amber Retail', quote: 'Bank Hanzeatycki udzielił spółce Amber Retail kredytu w wysokości 60 mln euro na refinansowanie Galerii Bursztynowej w Gdańsku.' },
            other_parties: [{ name: 'Bank Hanzeatycki', role: 'lender', quote: 'Bank Hanzeatycki udzielił spółce Amber Retail kredytu w wysokości 60 mln euro na refinansowanie Galerii Bursztynowej w Gdańsku.' }],
            deal_value: { value: '60 mln euro', quote: 'Bank Hanzeatycki udzielił spółce Amber Retail kredytu w wysokości 60 mln euro na refinansowanie Galerii Bursztynowej w Gdańsku.' },
            // FABRICATED on purpose: the article names no law firm. The evidence check must reject it.
            buyer_legal_advisor: { value: 'Meridian Legal', quote: 'Meridian Legal advised Amber Retail on the refinancing of Galeria Bursztynowa.' },
            status: 'signed',
            sector: 'retail',
          }),
        ],
      },
    },
    {
      // lease news: uses the same vocabulary, must be dropped
      via: 'sales',
      url: 'https://tradepress.example/news/najem-vistula-office-park',
      title: 'Nowy najemca w Vistula Office Park po sprzedaży udziałów',
      publishedAt: d12,
      text: `Firma technologiczna Codewave wynajęła 4 tys. mkw. powierzchni biurowej w kompleksie Vistula Office Park w Krakowie. Umowa najmu została zawarta na siedem lat. Właściciel nieruchomości podkreśla, że to największa transakcja najmu w tym biurowcu od czasu jego nabycia. Rynek nieruchomości biurowych w Polsce notuje rosnący popyt w miastach regionalnych. Wynajmującego reprezentowała agencja doradcza, a transakcja najmu została sfinalizowana w tym miesiącu.`,
      extraction: {
        is_relevant: true,
        deals: [
          deal({
            asset_name: 'Vistula Office Park, Kraków',
            asset_quote: 'Firma technologiczna Codewave wynajęła 4 tys. mkw. powierzchni biurowej w kompleksie Vistula Office Park w Krakowie.',
            city: 'Kraków',
            is_lease_only: true,
            transaction_type: 'acquisition',
            description_en: 'Codewave leased office space in Vistula Office Park in Kraków.',
            sector: 'office',
          }),
        ],
      },
    },
    {
      // an old deal mentioned in a fresh article: outside the window, must be dropped
      via: 'sales',
      url: 'https://tradepress.example/news/hotel-sudecki-podsumowanie',
      title: 'Hotel Sudecki sprzedany. Inwestor kupił obiekt we Wrocławiu',
      publishedAt: d12,
      text: `Hotel Sudecki we Wrocławiu został sprzedany inwestorowi Helios Hospitality. Transakcja sprzedaży została sfinalizowana ${plDate(d100)}, o czym strony poinformowały dopiero teraz. Nabywca planuje modernizację obiektu i zmianę marki. Rynek nieruchomości hotelowych w Polsce pozostaje aktywny, a inwestorzy kupują obiekty w dużych miastach. Hotel dysponuje 180 pokojami oraz zapleczem konferencyjnym w centrum miasta.`,
      extraction: {
        is_relevant: true,
        deals: [
          deal({
            asset_name: 'Hotel Sudecki, Wrocław',
            asset_quote: 'Hotel Sudecki we Wrocławiu został sprzedany inwestorowi Helios Hospitality.',
            city: 'Wrocław',
            transaction_type: 'sale',
            description_en: 'Hotel Sudecki in Wrocław was sold to Helios Hospitality.',
            announcement_date: d100,
            announcement_date_quote: `Transakcja sprzedaży została sfinalizowana ${plDate(d100)}, o czym strony poinformowały dopiero teraz.`,
            buyer: { value: 'Helios Hospitality', quote: 'Hotel Sudecki we Wrocławiu został sprzedany inwestorowi Helios Hospitality.' },
            status: 'completed',
            sector: 'hotel',
          }),
        ],
      },
    },
    {
      via: 'deepening',
      keywords: ['wisła tower', 'wisla tower', 'nordhaven'],
      url: 'https://kowalskipartners.example/news/wisla-tower-acquisition',
      title: 'Kowalski & Partners advises Nordhaven Capital on the acquisition of Wisła Tower',
      publishedAt: d3,
      text: `Kowalski & Partners advised Nordhaven Capital, the buyer, on the acquisition of Wisła Tower in Warsaw. The seller, Baltic Estates, was advised by Lex Varsovia. The firm's real estate team supported the client throughout the transaction, including due diligence and the negotiation of the sale and purchase agreement. The acquisition of the office building is one of the largest real estate transactions in Poland this year. Financing for the purchase was provided by Bank Hanzeatycki.`,
      extraction: {
        is_relevant: true,
        deals: [
          deal({
            asset_name: 'Wisła Tower',
            asset_quote: 'Kowalski & Partners advised Nordhaven Capital, the buyer, on the acquisition of Wisła Tower in Warsaw.',
            city: 'Warsaw',
            transaction_type: 'acquisition',
            description_en: 'Nordhaven Capital acquired Wisła Tower in Warsaw from Baltic Estates.',
            buyer: { value: 'Nordhaven Capital', quote: 'Kowalski & Partners advised Nordhaven Capital, the buyer, on the acquisition of Wisła Tower in Warsaw.' },
            seller: { value: 'Baltic Estates', quote: 'The seller, Baltic Estates, was advised by Lex Varsovia.' },
            other_parties: [{ name: 'Bank Hanzeatycki', role: 'lender', quote: 'Financing for the purchase was provided by Bank Hanzeatycki.' }],
            buyer_legal_advisor: { value: 'Kowalski & Partners', quote: 'Kowalski & Partners advised Nordhaven Capital, the buyer, on the acquisition of Wisła Tower in Warsaw.' },
            seller_legal_advisor: { value: 'Lex Varsovia', quote: 'The seller, Baltic Estates, was advised by Lex Varsovia.' },
            status: 'signed',
            sector: 'office',
          }),
        ],
      },
    },
    {
      via: 'deepening',
      keywords: ['logistic hub', 'stryków', 'strykow', 'arcturus'],
      url: 'https://legalpress.example/deals/arcturus-logistic-hub-strykow',
      title: 'Arcturus Real Estate buys Logistic Hub Stryków',
      publishedAt: d6,
      text: `Arcturus Real Estate has completed the acquisition of Logistic Hub Stryków, a logistics park in central Poland, from Panorama Development. Several law firms worked on the transaction, including Kowalski & Partners. The value of the deal was EUR 85 million. The logistics park comprises four warehouse buildings. The investor intends to hold the asset long term as part of its Polish real estate portfolio, which has grown through acquisitions in recent years.`,
      extraction: {
        is_relevant: true,
        deals: [
          deal({
            asset_name: 'Logistic Hub Stryków',
            asset_quote: 'Arcturus Real Estate has completed the acquisition of Logistic Hub Stryków, a logistics park in central Poland, from Panorama Development.',
            transaction_type: 'acquisition',
            description_en: 'Arcturus Real Estate completed the acquisition of Logistic Hub Stryków from Panorama Development.',
            buyer: { value: 'Arcturus Real Estate', quote: 'Arcturus Real Estate has completed the acquisition of Logistic Hub Stryków, a logistics park in central Poland, from Panorama Development.' },
            // the article does not say whom the firm advised — the role check must move it to "other"
            buyer_legal_advisor: { value: 'Kowalski & Partners', quote: 'Several law firms worked on the transaction, including Kowalski & Partners.' },
            status: 'completed',
            sector: 'logistics-industrial',
          }),
        ],
      },
    },
    {
      // a law firm page without any date: the deal must survive to deepening and take its date from the follow-up below
      via: 'lawfirms',
      url: 'https://lexvarsovia.example/news/lex-varsovia-advises-on-sale-of-bursztyn-park',
      title: 'Lex Varsovia advises Amber Estates on the sale of Bursztyn Park',
      publishedAt: null,
      text: `Lex Varsovia advised Amber Estates, the seller, on the sale of Bursztyn Park, a logistics park near Gdańsk, to Nordsee Invest. The firm's real estate team handled the sale and purchase agreement and the closing of the transaction. The buyer intends to expand the park. Bursztyn Park comprises two warehouse buildings with a total area of 45,000 sqm, fully let to logistics operators serving the Tricity port.`,
      extraction: {
        is_relevant: true,
        deals: [
          deal({
            asset_name: 'Bursztyn Park, Gdańsk',
            asset_quote: 'Lex Varsovia advised Amber Estates, the seller, on the sale of Bursztyn Park, a logistics park near Gdańsk, to Nordsee Invest.',
            city: 'Gdańsk',
            transaction_type: 'sale',
            description_en: 'Amber Estates sold Bursztyn Park near Gdańsk to Nordsee Invest.',
            buyer: { value: 'Nordsee Invest', quote: 'Lex Varsovia advised Amber Estates, the seller, on the sale of Bursztyn Park, a logistics park near Gdańsk, to Nordsee Invest.' },
            seller: { value: 'Amber Estates', quote: 'Lex Varsovia advised Amber Estates, the seller, on the sale of Bursztyn Park, a logistics park near Gdańsk, to Nordsee Invest.' },
            seller_legal_advisor: { value: 'Lex Varsovia', quote: 'Lex Varsovia advised Amber Estates, the seller, on the sale of Bursztyn Park, a logistics park near Gdańsk, to Nordsee Invest.' },
            status: 'completed',
            sector: 'logistics-industrial',
          }),
        ],
      },
    },
    {
      via: 'deepening',
      keywords: ['bursztyn park', 'nordsee', 'amber estates'],
      url: 'https://tradepress.example/news/nordsee-invest-kupuje-bursztyn-park',
      title: 'Nordsee Invest kupuje Bursztyn Park pod Gdańskiem',
      publishedAt: d9,
      text: `Nordsee Invest kupił park logistyczny Bursztyn Park pod Gdańskiem od spółki Amber Estates. Umowę sprzedaży podpisano ${plDate(d9)}. Wartość transakcji wyniosła 38 mln euro. Park składa się z dwóch hal magazynowych o łącznej powierzchni 45 tys. mkw., w pełni wynajętych operatorom logistycznym obsługującym port w Trójmieście. Nabywca zapowiada rozbudowę parku o trzecią halę.`,
      extraction: {
        is_relevant: true,
        deals: [
          deal({
            asset_name: 'Bursztyn Park',
            asset_quote: 'Nordsee Invest kupił park logistyczny Bursztyn Park pod Gdańskiem od spółki Amber Estates.',
            city: 'Gdańsk',
            transaction_type: 'acquisition',
            description_en: 'Nordsee Invest acquired Bursztyn Park near Gdańsk from Amber Estates for EUR 38 million.',
            announcement_date: d9,
            announcement_date_quote: `Umowę sprzedaży podpisano ${plDate(d9)}.`,
            buyer: { value: 'Nordsee Invest', quote: 'Nordsee Invest kupił park logistyczny Bursztyn Park pod Gdańskiem od spółki Amber Estates.' },
            seller: { value: 'Amber Estates', quote: 'Nordsee Invest kupił park logistyczny Bursztyn Park pod Gdańskiem od spółki Amber Estates.' },
            deal_value: { value: '38 mln euro', quote: 'Wartość transakcji wyniosła 38 mln euro.' },
            status: 'completed',
            sector: 'logistics-industrial',
          }),
        ],
      },
    },
    {
      // an undated page with no follow-up anywhere: deepened, still undated, dropped at the end
      via: 'lawfirms',
      url: 'https://lexvarsovia.example/news/magnolia-office-lodz',
      title: 'Lex Varsovia advises on the sale of Magnolia Office in Łódź',
      publishedAt: null,
      text: `Lex Varsovia advised Lodz Properties on the sale of Magnolia Office, an office building in Łódź, to a private investor. The transaction closed after a short due diligence process. Magnolia Office offers 9,000 sqm of office space in the city centre and is let to several tenants. The firm's team was led by a partner from the real estate practice in Warsaw.`,
      extraction: {
        is_relevant: true,
        deals: [
          deal({
            asset_name: 'Magnolia Office, Łódź',
            asset_quote: 'Lex Varsovia advised Lodz Properties on the sale of Magnolia Office, an office building in Łódź, to a private investor.',
            city: 'Łódź',
            transaction_type: 'sale',
            description_en: 'Lodz Properties sold Magnolia Office in Łódź to a private investor.',
            seller: { value: 'Lodz Properties', quote: 'Lex Varsovia advised Lodz Properties on the sale of Magnolia Office, an office building in Łódź, to a private investor.' },
            seller_legal_advisor: { value: 'Lex Varsovia', quote: 'Lex Varsovia advised Lodz Properties on the sale of Magnolia Office, an office building in Łódź, to a private investor.' },
            status: 'completed',
            sector: 'office',
          }),
        ],
      },
    },
  ]
}
