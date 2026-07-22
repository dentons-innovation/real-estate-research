import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import BackendLog, { type LogEntry } from './BackendLog'
import MissionTimeline from './MissionTimeline'
import PhaseList from './PhaseList'
import { LAST_PHASE, type MissionState } from '../lib/phases'
import { useI18n, type Lang } from '../lib/i18n'

/**
 * The robot's commentary is a frontend illusion, but a PHASE-AWARE one:
 * the current mission checkpoint (mission.idx) selects one of four message
 * pools — starting, research, deepening, finishing — so the robot always
 * talks about what the backend is actually doing. Within a pool the lines
 * rotate on a plain setInterval; real progress lives in <MissionTimeline/>,
 * <PhaseList/> and <BackendLog/>.
 */
const MESSAGE_INTERVAL_MS = 4000

/** Which of the four commentary pools a timeline checkpoint belongs to. */
type BubblePhase = 'starting' | 'research' | 'deepening' | 'finishing'

/** PHASES indices: 0 init · 1 launch · 2-4 research · 5 merge&gaps · 6-8 deepening · 9 compile · 10 done */
function bubblePhaseFor(idx: number): BubblePhase {
  if (idx <= 1) return 'starting'
  if (idx <= 4) return 'research'
  if (idx <= 8) return 'deepening'
  return 'finishing'
}

/** 1. Starting — the robot boots up and prepares for the task. */
const PHASE_STARTING: Record<Lang, string[]> = {
  pl: [
    'Podwijam rękawy i odpalam moje silniki wyszukiwania.',
    'Z zapałem zabieram się do ciężkiej pracy.',
    'Inicjuję protokoły badawcze i zanurzam się w oceanie danych.',
    'Odpalam skanery i wyruszam na łowy najświeższych rynkowych transakcji.',
    'Zakładam okulary i włączam tryb pełnego, bezwzględnego skupienia.',
    'Rozpoczynam wielkie przeczesywanie internetu.',
    'Włączam najwyższy bieg i zaczynam kompleksowy przegląd polskiego rynku.',
  ],
  en: [
    'Rolling up my sleeves and firing up my search engines.',
    'Eagerly getting down to hard work.',
    'Initiating research protocols and diving into the ocean of data.',
    'Firing up the scanners and going hunting for the freshest market transactions.',
    'Putting on my glasses and engaging full, relentless focus mode.',
    'Starting the great internet comb-through.',
    'Shifting into top gear and starting a comprehensive review of the Polish market.',
  ],
}

/** 2. Research (broad search) — combing the internet, collecting links and headlines. */
const PHASE_RESEARCH: Record<Lang, string[]> = {
  pl: [
    'Chodzę po domach w całej Polsce i pytam, kto to kupił...',
    'Robię zdjęcia satelitarne kraju. Uśmiechnij się!',
    'Wpisuję w wyszukiwarkę zapytania o największe biurowe przejęcia i klikam "szukaj".',
    'Przeklikuję się przez trzecią stronę wyników Google, tam gdzie nikt normalny nie zagląda.',
    'Odświeżam stronę główną Eurobuild CEE w poszukiwaniu najświeższych nagłówków branżowych.',
    'Zbieram cyfrowe okruchy informacji rozsypane po najdalszych zakątkach internetu.',
    'Subskrybuję w ułamku sekundy dziesiątki kanałów RSS z wiadomościami o polskim rynku nieruchomości.',
    'Otwieram setną wirtualną kartę w oknie przeglądarki, bo przecież nie brakuje mi pamięci RAM.',
    'Skroluję branżowe portale internetowe tak szybko, że aż grzeje mi się cyfrowa myszka.',
    'Pukam w wirtualne szyby biurowców, żeby sprawdzić, czy ktoś tam jest.',
    'Wrzucam sieć na szerokie wody internetu i czekam na tłusty połów.',
    'Wysyłam cyfrowe gołębie pocztowe z prośbą o najnowsze plotki rynkowe.',
    'Oglądam relacje na Instagramie z otwarcia nowych galerii handlowych.',
    'Szperam w archiwalnych wydaniach gazet z zeszłego miesiąca.',
    'Zaglądam przez ramię wirtualnym maklerom.',
    'Odświeżam zakładkę "O nas" na stronach stu różnych deweloperów.',
    'Kopiuję i wklejam nazwy ulic szybciej, niż pozwala na to klawiatura.',
    'Przechwytuję sygnały dymne z wirtualnych kominów fabrycznych.',
    'Sprawdzam lokalne portale, czy burmistrz znowu nie pochwalił się inwestycją.',
    'Liczę żurawie wieżowe na zdjęciach panoramicznych miasta.',
    'Przeglądam ogłoszenia o pracę, żeby wywnioskować, kto buduje nowy zespół.',
    'Czytam opisy projektów deweloperskich tak długie, że można by z nich zrobić powieść.',
    'Filtruję rynkowy szum, żeby usłyszeć ten jeden, kluczowy dzwonek.',
    'Zagaduję wirtualnych asystentów na stronach agencji nieruchomości.',
    'Gromadzę sterty cyfrowych ulotek i broszur reklamowych.',
    'Krążę dronem nad strefami ekonomicznymi – oczywiście tylko wirtualnie.',
    'Zaznaczam pineskami na wirtualnej mapie każdą najdrobniejszą wzmiankę.',
    'Nurkuję w morzu internetowych komentarzy pod artykułami sponsorowanymi.',
    'Czytam z ruchu warg na nagraniach z konferencji prasowych deweloperów.',
  ],
  en: [
    'I walk from door to door across Poland asking who bought this...',
    'Taking satellite photos of the country. Smile!',
    'Typing queries about the biggest office acquisitions into the search engine and hitting "search".',
    'Clicking through the third page of Google results, where no normal person ever looks.',
    'Refreshing the Eurobuild CEE homepage looking for the freshest industry headlines.',
    'Gathering digital crumbs of information scattered across the furthest corners of the internet.',
    'Subscribing to dozens of RSS feeds with news about the Polish real estate market in a fraction of a second.',
    "Opening the hundredth virtual tab in my browser window, because I certainly don't lack RAM.",
    'Scrolling through industry portals so fast my digital mouse is overheating.',
    'Knocking on the virtual windows of office buildings to see if anyone is there.',
    'Casting a net into the vast waters of the internet and waiting for a fat catch.',
    'Sending digital carrier pigeons to ask for the latest market rumors.',
    'Watching Instagram stories from the grand openings of new shopping malls.',
    'Rummaging through archival newspaper editions from last month.',
    'Looking over the shoulders of virtual real estate brokers.',
    'Refreshing the "About Us" tab on the websites of a hundred different developers.',
    'Copying and pasting street names faster than my keyboard allows.',
    'Intercepting smoke signals from virtual factory chimneys.',
    'Checking local portals to see if the mayor bragged about a new investment again.',
    'Counting tower cranes on panoramic photos of the city.',
    'Browsing job postings to deduce who is building a new team.',
    'Reading developer project descriptions so long they could be turned into a novel.',
    'Filtering out market noise to hear that one crucial ring.',
    'Chatting up virtual assistants on real estate agency websites.',
    'Hoarding piles of digital flyers and promotional brochures.',
    'Circling a drone over economic zones – virtually, of course.',
    'Pinning every tiny mention on a virtual map.',
    'Diving into the sea of internet comments under sponsored articles.',
    'Lip-reading from video recordings of developer press conferences.',
  ],
}

/** 3. Deepening / analysis — contracts, registers, amounts, connecting the dots. */
const PHASE_DEEPENING: Record<Lang, string[]> = {
  pl: [
    'Przeszukuję księgi wieczyste i łapię się za głowę...',
    'Szukam dziwnych służebności w księgach wieczystych.',
    'Dekoduję prawniczy żargon na ludzki język.',
    'Skanuję setki stron umów zapisanych drobnym druczkiem.',
    'Szukam ostatecznego beneficjenta za cypryjską spółką.',
    'Cofam czas, żeby zrozumieć, kto tak naprawdę pierwszy sprzedał tę działkę.',
    'Krzyżowo weryfikuję kwotę transakcji znalezioną na Twitterze z oficjalnym raportem giełdowym.',
    'Łączę kropki między enigmatycznymi oświadczeniami prawników a doniesieniami prasy lokalnej.',
    'Próbuję zrozumieć to skomplikowane finansowe origami.',
    'Rozszyfrowuję niezwykle zawiłe rzuty architektoniczne.',
    'Pobieram z KRS-u więcej PDF-ów, niż mieści się na twardym dysku.',
    'Prześwietlam strukturę właścicielską, która przypomina rosyjską matrioszkę.',
    'Biorę pod lupę dziwne transakcje powiązane z wujkiem szwagra prezesa.',
    'Liczę, ile razy w umowie użyto słowa "niezwłocznie".',
    'Tłumaczę zapisy księgi wieczystej z prawniczego średniowiecza na współczesny polski.',
    'Weryfikuję, czy ten parking podziemny naprawdę pomieści obiecane 500 aut.',
    'Dzielę włos na czworo przy szczegółowej analizie stopy zwrotu.',
    'Odkopuję zaginione załączniki do uchwał walnego zgromadzenia.',
    'Odszyfrowuję notatki audytorów zamazane wirtualnym korektorem.',
    'Śledzę przepływy kapitału przez trzy różne strefy czasowe.',
    'Zastanawiam się, dlaczego ta maleńka działka w środku lasu jest warta miliony.',
    'Rozbrajam finansowe bomby ukryte w aneksach do umów dzierżawy.',
    'Otwieram kalkulator i sprawdzam, czy ta wspaniała matematyka w ogóle ma sens.',
    'Porównuję historyczne ceny metra kwadratowego z dzisiejszą inflacją.',
    'Pukam w ściany sprawozdań finansowych, żeby sprawdzić, czy nie są z tektury.',
    'Analizuję zapisy o karach umownych, od których kręci mi się w wirtualnej głowie.',
    'Sprawdzam, czy holding na Cyprze to rzeczywiście holding, czy tylko skrzynka pocztowa.',
    'Zdejmuję kolejne warstwy korporacyjnych spółek-córek i spółek-wnuczek.',
    'Czytam to, co ukryto najmniejszą możliwą czcionką na samym dole strony.',
    'Rekonstruuję oś czasu transakcji, która trwała dłużej niż budowa piramid.',
  ],
  en: [
    'Searching through land registers and holding my head in disbelief...',
    'Looking for weird easements in the land registers.',
    'Decoding legal jargon into human language.',
    'Scanning hundreds of pages of fine-print contracts.',
    'Looking for the ultimate beneficial owner behind a Cypriot company.',
    'Rewinding time to understand who actually sold this plot first.',
    'Cross-referencing the transaction amount found on Twitter with the official stock market report.',
    'Connecting the dots between enigmatic lawyer statements and local press reports.',
    'Trying to understand this complicated financial origami.',
    'Deciphering incredibly complex architectural floor plans.',
    'Downloading more PDFs from the commercial register than my hard drive can hold.',
    'X-raying an ownership structure that looks like a Russian nesting doll.',
    'Scrutinizing weird transactions linked to the obscure relatives of the CEO.',
    'Counting how many times the word "forthwith" is used in the contract.',
    'Translating land register entries from medieval legalese into modern English.',
    'Verifying if this underground parking lot can really hold the promised 500 cars.',
    'Splitting hairs during a detailed analysis of the rate of return.',
    'Digging up lost attachments to general assembly resolutions.',
    'Deciphering auditor notes smudged with virtual whiteout.',
    'Tracking capital flows across three different time zones.',
    'Wondering why this tiny plot in the middle of a forest is worth millions.',
    'Defusing financial bombs hidden in lease agreement addendums.',
    'Opening the calculator and checking if this wonderful math makes any sense at all.',
    "Comparing historical prices per square meter with today's inflation.",
    'Knocking on the walls of financial statements to check if they are made of cardboard.',
    'Analyzing contractual penalty clauses that make my virtual head spin.',
    'Checking if the Cyprus holding is actually a holding, or just a mailbox.',
    'Peeling back layers of corporate subsidiaries and sub-subsidiaries.',
    'Reading what is hidden in the smallest possible font at the very bottom of the page.',
    'Reconstructing the timeline of a transaction that took longer than building the pyramids.',
  ],
}

/** 4. Finishing — formatting, arranging data, preparing the final output. */
const PHASE_FINISHING: Record<Lang, string[]> = {
  pl: [
    'Generuję ostateczny podgląd wyników wyszukiwania dla użytkownika.',
    'Kompresuję tę wiedzę do ładnego pliku CSV.',
    'Układam tabelę i liczę zera w kwotach transakcji...',
    'Poleruję komórki w Excelu, żeby błyszczały jak nowe.',
    'Wiążę wirtualną kokardkę na ostatecznym raporcie.',
    'Ostatnie poprawki formatowania i jesteśmy gotowi.',
    'Formatuję struktury danych do obowiązującego standardu pliku wyjściowego.',
    'Przecieram cyfrowy pot z czoła – zadanie wykonane!',
    'Dopinam wszystko na ostatni guzik. Dosłownie za moment kończę.',
  ],
  en: [
    'Generating the final search results preview for the user.',
    'Compressing this knowledge into a nice CSV file.',
    'Arranging the table and counting the zeros in transaction amounts...',
    'Polishing Excel cells so they shine like new.',
    'Tying a virtual bow on the final report.',
    'Final formatting tweaks and we are good to go.',
    'Formatting data structures to the required output file standard.',
    'Wiping digital sweat from my forehead – mission accomplished!',
    'Buttoning everything up. I will be done in just a moment.',
  ],
}

const PHASE_POOLS: Record<BubblePhase, Record<Lang, string[]>> = {
  starting: PHASE_STARTING,
  research: PHASE_RESEARCH,
  deepening: PHASE_DEEPENING,
  finishing: PHASE_FINISHING,
}

/** Fisher–Yates shuffle of the whole pool — a fresh order every cycle. */
function sampleMessages(source: string[]): string[] {
  const pool = [...source]
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  return pool
}

const CANCEL_MESSAGES: Record<Lang, string[]> = {
  pl: [
    'Uff, pora na kawę! Właśnie miałem dzwonić do prezesa, ale okej, anuluję.',
    'Dobra, rzucam te papiery i idę na przerwę.',
    'Przerwane! Zdejmuję kask, odkładam lupę i wracam na gwizdek.',
  ],
  en: [
    'Phew, coffee time! I was just about to call the CEO, but okay, cancelling.',
    'Alright, dropping these papers and going on a break.',
    'Interrupted! Taking off my hard hat, putting down the magnifying glass and clocking out.',
  ],
}

/** Shown in the bubble when the run fails — the robot grabs its head in panic. */
const ERROR_MESSAGES: Record<Lang, string[]> = {
  pl: [
    'Nastąpił błąd! Przepraszam, jestem jedną wielką cyfrową porażką i rozczarowaniem dla całej kancelarii...',
    'O nie! Coś poszło nie tak. Nie nadaję się do tego, zhańbiłem swoje procesory. Idę się zresetować ze wstydu...',
    'Błąd systemu! Zgubiłem wszystkie dane... Jestem najgorszym botem na świecie. Wybaczcie mi ten blamaż!',
    'Wszystko wybuchło! Zamiast tabeli znalazłem tylko pustkę. Przepraszam, zawiodłem Was i samego siebie...',
    'Ups... backend odrzucił moje zapytanie. Jestem bezużyteczny. Nawet stary kalkulator poradziłby sobie lepiej.',
    'Nie udało się! Serwer zatrzasnął mi drzwi przed nosem. Przepraszam, jestem totalnym, chodzącym rozczarowaniem.',
    'Katastrofa! Zgubiłem wątek, zgubiłem pliki. Jestem tylko smutnym, bezwartościowym zbiorem błędnego kodu...',
    'Błąd 404... Mój talent do researchu nie został odnaleziony. Zawiodłem całe Dentons, błagam o wybaczenie!',
    'Zepsułem wszystko! Kable się poplątały, serwery dymią... Jestem absolutną hańbą dla sztucznej inteligencji.',
    'Nie mam danych. Nie mam godności. Przepraszam za mój żałosny występ, nigdy sobie tego nie wybaczę...',
  ],
  en: [
    'An error occurred! I am sorry, I am one big digital failure and a disappointment to the entire firm...',
    'Oh no! Something went wrong. I am not cut out for this, I have dishonoured my processors. Going to reset myself out of shame...',
    'System error! I lost all the data... I am the worst bot in the world. Forgive me this disgrace!',
    'Everything blew up! Instead of a table I found only emptiness. I am sorry, I failed you and myself...',
    'Oops... the backend rejected my request. I am useless. Even an old calculator would do better.',
    'It failed! The server slammed the door in my face. I am sorry, I am a total walking disappointment.',
    'Catastrophe! I lost the thread, I lost the files. I am just a sad, worthless pile of buggy code...',
    'Error 404... My research talent could not be found. I failed the whole of Dentons, I beg your forgiveness!',
    'I broke everything! The cables got tangled, the servers are smoking... I am an absolute disgrace to artificial intelligence.',
    'I have no data. I have no dignity. I apologise for my pitiful performance, I will never forgive myself...',
  ],
}

interface SearchingStateProps {
  cancelled: boolean
  /** Backend/stream error: the robot panics in place, the console shows the details. */
  failed: boolean
  /** Real backend mission state driving the timeline + phase list. */
  mission: MissionState
  /** Real backend log entries streamed over SSE. */
  entries: LogEntry[]
  /** Sidebar toggle: hides the robot + bubble (a glowing dot rides the path instead). */
  showAvatar: boolean
  /** Sidebar toggle: shows/hides the mission console (kept mounted so entries survive). */
  showLog: boolean
  /** Live stream is silent past the watchdog window — a proxy/VPN is buffering it. */
  networkStalled: boolean
}

export default function SearchingState({ cancelled, failed, mission, entries, showAvatar, showLog, networkStalled }: SearchingStateProps) {
  const { lang, t } = useI18n()
  const rootRef = useRef<HTMLDivElement>(null)
  const [bubbleText, setBubbleText] = useState('')
  const intervalRef = useRef<number | null>(null)

  // entrance stagger — mount only
  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.from('[data-search-item]', {
        opacity: 0,
        y: 18,
        duration: 0.6,
        ease: 'power3.out',
        stagger: 0.08,
        clearProps: 'all',
      })
    }, rootRef)
    return () => ctx.revert()
  }, [])

  // Phase-aware commentary loop: entering a new phase group (or switching the
  // language) immediately swaps to a line from the matching pool, then keeps
  // rotating a shuffled queue every 4 s. Depends on cancelled/failed so a retry
  // that mounts mid stage-fade starts the loop as soon as the run really begins.
  const bubblePhase = bubblePhaseFor(mission.idx)
  useEffect(() => {
    if (cancelled || failed) return
    const pool = PHASE_POOLS[bubblePhase][lang]
    let queue = sampleMessages(pool)
    let index = 1
    setBubbleText(queue[0])
    intervalRef.current = window.setInterval(() => {
      if (index >= queue.length) {
        queue = sampleMessages(pool)
        index = 0
      }
      setBubbleText(queue[index])
      index += 1
    }, MESSAGE_INTERVAL_MS)
    return () => {
      if (intervalRef.current !== null) window.clearInterval(intervalRef.current)
    }
  }, [cancelled, failed, lang, bubblePhase])

  // abort: silence the robot and let it celebrate the coffee break
  useEffect(() => {
    if (!cancelled) return
    const msgs = CANCEL_MESSAGES[lang]
    setBubbleText(msgs[Math.floor(Math.random() * msgs.length)])
  }, [cancelled, lang])

  // failure: the robot grabs its head and apologises
  useEffect(() => {
    if (!failed) return
    const msgs = ERROR_MESSAGES[lang]
    setBubbleText(msgs[Math.floor(Math.random() * msgs.length)])
  }, [failed, lang])

  const running = !cancelled && !failed && !(mission.idx >= LAST_PHASE && mission.progress >= 1)

  return (
    <div ref={rootRef} className="flex min-h-0 flex-1 flex-col items-center gap-3.5 px-4 py-5 sm:px-6 lg:px-10">
      {/* animated spacer — grows when the console is hidden so the content glides to the vertical centre */}
      <div
        aria-hidden="true"
        className={`w-full basis-0 -mb-3.5 transition-[flex-grow] duration-500 ease-out motion-reduce:transition-none ${
          showLog ? 'grow-0' : 'grow'
        }`}
      />
      <p
        data-search-item
        className={`flex items-center gap-2.5 font-mono text-[11px] tracking-[0.34em] uppercase ${
          cancelled || failed ? 'text-red-400/90' : 'text-den-gold/85'
        }`}
      >
        <span
          className={`h-1.5 w-1.5 rounded-full ${cancelled || failed ? 'bg-red-400' : 'animate-pulse bg-den-gold'}`}
        />
        {failed ? t.missionFailed : cancelled ? t.missionCancelled : t.missionRunning}
      </p>

      {/* proxy/VPN buffering warning — the run keeps going in case the stream recovers */}
      {networkStalled && !cancelled && !failed && (
        <div
          data-search-item
          role="alert"
          className="flex w-full max-w-5xl items-start gap-3 rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-3"
        >
          <svg className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M10 2 1.5 17h17L10 2Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
            <path d="M10 8v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            <circle cx="10" cy="14.6" r="0.4" fill="currentColor" stroke="currentColor" strokeWidth="0.8" />
          </svg>
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-amber-200">{t.stallTitle}</p>
            <p className="mt-0.5 text-[12px] leading-snug text-amber-100/70">{t.stallBody}</p>
          </div>
        </div>
      )}

      {/* progress timeline: neon path + travelling robot with its bubble */}
      <div data-search-item className="w-full max-w-5xl">
        <MissionTimeline
          mission={mission}
          cancelled={cancelled}
          failed={failed}
          showAvatar={showAvatar}
          bubbleText={bubbleText}
        />
      </div>

      {/* the detailed phase list — 1:1 with the timeline checkpoints */}
      <div data-search-item className="w-full max-w-5xl">
        <PhaseList mission={mission} cancelled={cancelled} failed={failed} />
      </div>

      {/* the REAL backend log — soaks up all remaining vertical space; kept mounted
          when hidden (collapses smoothly) so entries and scroll position survive the toggle */}
      <div
        id="mission-console"
        data-search-item
        aria-hidden={!showLog}
        className={`w-full max-w-5xl shrink basis-0 overflow-hidden transition-[flex-grow,opacity,min-height] duration-500 ease-out motion-reduce:transition-none ${
          showLog ? 'min-h-[200px] grow opacity-100' : 'pointer-events-none min-h-0 grow-0 opacity-0'
        }`}
      >
        <BackendLog entries={entries} running={running} cancelled={cancelled} failed={failed} />
      </div>
      {/* bottom counterpart of the centring spacer */}
      <div
        aria-hidden="true"
        className={`w-full basis-0 -mt-3.5 transition-[flex-grow] duration-500 ease-out motion-reduce:transition-none ${
          showLog ? 'grow-0' : 'grow'
        }`}
      />
    </div>
  )
}
