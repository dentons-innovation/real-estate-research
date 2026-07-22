import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import BackendLog, { type LogEntry } from './BackendLog'
import MissionTimeline from './MissionTimeline'
import PhaseList from './PhaseList'
import { LAST_PHASE, type MissionState } from '../lib/phases'
import { useI18n, type Lang } from '../lib/i18n'

/**
 * The robot is a pure frontend illusion, fully decoupled from the backend:
 * it cycles witty lines on a plain setInterval and can be removed later
 * without touching the SSE flow. Real progress lives in <MissionTimeline/>,
 * <PhaseList/> and <BackendLog/>.
 */
const MESSAGE_INTERVAL_MS = 4000

/** The robot cycles a fresh shuffle of this pool, so no two researches sound the same. */
const MESSAGE_POOL_PL = [
  'Zakładam kask i wchodzę na plac budowy...',
  'Chodzę po domach w całej Polsce i pytam, kto to kupił...',
  'Robię zdjęcia satelitarne kraju. Uśmiechnij się!',
  'Przeszukuję księgi wieczyste i łapię się za głowę...',
  'Rozmawiam z prawnikami... to może chwilę zająć.',
  'Układam tabelę w CSV i liczę zera w kwotach transakcji...',
  'Zakładam wirtualny kask i wchodzę na plac budowy.',
  'Sprawdzam, kto potajemnie kupił ten wieżowiec.',
  'Podziwiam zielone dachy na zdjęciach satelitarnych.',
  'Szukam dziwnych służebności w księgach wieczystych.',
  'Dekoduję prawniczy żargon na ludzki język.',
  'Liczę zera w kwotach wielkich transakcji.',
  'Wirtualnie negocjuję darmową kawę dla najemców.',
  'Sprawdzam, czy betonowy plac jest wystarczająco zielony.',
  'Weryfikuję prestiżowe lokalizacje na obrzeżach miasta.',
  'Szukam ostatecznego beneficjenta za cypryjską spółką.',
  'Wróżę stopy zwrotu z wirtualnych fusów.',
  'Skanuję setki stron umów zapisanych drobnym druczkiem.',
  'Próbuję zrozumieć to skomplikowane finansowe origami.',
  'Przeszukuję przepastne archiwa rejestrów KRS.',
  'Sprawdzam na LinkedInie, kto awansował po tym dealu.',
  'Przeliczam kursy walut i pilnuję każdego przecinka.',
  'Zastanawiam się nad tą kosmiczną wyceną biurowca.',
  'Mierzę wirtualnie powierzchnie wspólne budynków.',
  'Sprawdzam cyfrową taśmą mierniczą te metry kwadratowe.',
  'Liczę miejsca parkingowe dla luksusowych aut.',
  'Szukam zaginionych pieczątek na starych dokumentach.',
  'Szukam wyjścia ewakuacyjnego na zawiłych rzutach pięter.',
  'Sortuję gigantyczne arkusze kalkulacyjne.',
  'Biegam z wirtualną teczką po urzędach.',
  'Przepycham gigabajty danych przez mój procesor.',
  'Naprawiam literówki w zagranicznych formatach dat.',
  'Czekam w kolejce na wirtualnego notariusza.',
  "Otwieram plik o nazwie 'umowa_ostateczna_final_v8'.",
  'Podlewam wirtualne kwiatki w eleganckim lobby.',
  'Kompresuję tę wiedzę do ładnego pliku CSV.',
  'Kontynuuję research rynkowy.',
  'Przeglądam strony kancelarii prawnych.',
  'Chwilowo robię sobie przerwę na kawę.',
  'Weryfikuję wiarygodność źródeł informacyjnych.',
  'Kompiluję listę najnowszych transakcji.',
  'Analizuję doniesienia z portali branżowych.',
  'Pobieram dane o bieżących wartościach rynkowych.',
  'Sprawdzam aktualny status prawny badanych nieruchomości.',
  'Filtruję ogłoszenia z ostatnich trzydziestu dni.',
  'Przetwarzam zebrane informacje do końcowej tabeli.',
  'Nasłuchuję kuluarowych plotek na wirtualnych korytarzach.',
  'Testuję przyciski w wirtualnych windach wieżowców.',
  'Krzyżowo weryfikuję dane z zewnętrznymi rejestrami.',
  'Wyodrębniam nazwiska doradców z długich umów.',
  'Szukam lupy do przeczytania najdrobniejszego druku.',
  'Przeliczam w cyfrowej pamięci stopy kapitalizacji.',
  'Monitoruję najnowsze trendy inwestycyjne na rynku.',
  'Agreguję wartości poszczególnych pakietów transakcji.',
  'Napełniam mój cyfrowy kubek świeżą wirtualną kawą.',
  'Rozszyfrowuję niezwykle zawiłe rzuty architektoniczne.',
  'Szukam mikroskopu, żeby doczytać gwiazdki w załącznikach.',
  'Zaparzam sobie wirtualną melisę przed lekturą kolejnego raportu technicznego.',
  'Odświeżam stronę urzędu znacznie szybciej, niż pozwalają na to przepisy.',
  'Pukam do serwerowni wielkiego funduszu i grzecznie pytam o ostatnie transakcje.',
  'Próbuję zmieścić te wszystkie zera w jednej małej komórce Excela.',
  'Cofam czas, żeby zrozumieć, kto tak naprawdę pierwszy sprzedał tę działkę.',
  'Szukam chociaż jednego prawdziwego drzewa na tych wizualizacjach deweloperskich.',
  'Konsoliduję szczegółowe raporty analityczne z ostatniego kwartału.',
  'Pobieram metadane z ogólnodostępnych rejestrów państwowych.',
  'Weryfikuję zgodność danych z najnowszymi wpisami w księgach.',
  'Analizuję portfele inwestycyjne głównych graczy na polskim rynku.',
  'Ekstrahuję kluczowe parametry transakcji z dostępnych źródeł.',
  'Sprawdzam powiązania kapitałowe między stronami umowy.',
  'Odpytuję bazy danych pod kątem najnowszych ogłoszeń prasowych.',
  'Kataloguję informacje o głównych doradcach prawnych przy transakcjach.',
  'Synchronizuję lokalne pliki z najnowszą historią rynkową.',
  'Mapuję sektory rynku nieruchomości według wartości kapitałowej transakcji.',
  'Obliczam zagregowaną wartość nowo powstałego portfela biurowego.',
  'Formatuję struktury danych do obowiązującego standardu pliku wyjściowego.',
  'Optymalizuję zapytania do zewnętrznych interfejsów programistycznych.',
  'Weryfikuję prawidłowość zapisów w cyfrowych archiwach transakcyjnych.',
  'Przygotowuję precyzyjną matrycę wyników dla zadanych kryteriów.',
  'Krzyżuję dane o najemcach z ogólnodostępnymi informacjami biznesowymi.',
  'Przetwarzam zapytania dotyczące nowoczesnych nieruchomości logistycznych.',
  'Uzupełniam brakujące identyfikatory w ustandaryzowanej strukturze tabeli.',
  'Uwierzytelniam bezpieczne połączenia z zewnętrznymi serwerami bazodanowymi.',
  'Generuję ostateczny podgląd wyników wyszukiwania dla użytkownika.',
  "Wpisuję w wyszukiwarkę zapytania o największe biurowe przejęcia i klikam 'szukaj'.",
  'Przeklikuję się przez trzecią stronę wyników Google, tam gdzie nikt normalny nie zagląda.',
  'Rozwiązuję kolejne zabezpieczenie CAPTCHA, udowadniając, że wiem, jak wygląda sygnalizacja świetlna.',
  'Odświeżam stronę główną Eurobuild CEE w poszukiwaniu najświeższych nagłówków branżowych.',
  'Skanuję najnowsze artykuły na Property Forum, wypatrując znajomych nazw wieżowców.',
  'Wyciągam twarde dane z dzisiejszego newslettera, który właśnie wpadł na moją skrzynkę.',
  "Przeszukuję zakładki 'Aktualności' na stronach największych konkurencyjnych kancelarii prawnych.",
  'Dekoduję entuzjastyczne komunikaty prasowe, żeby dowiedzieć się, kto komu faktycznie doradzał.',
  'Czytam chwaliposty na stronach doradców, sprawnie wyłapując z nich cenne szczegóły.',
  'Przeszukuję firmowe profile na LinkedInie, by zobaczyć, kto otwierał wirtualnego szampana.',
  'Czytam komentarze pod branżowymi postami, bo tam zawsze kryją się najciekawsze plotki rynkowe.',
  'Analizuję wywiady z prezesami spółek, szukając ukrytych aluzji do nadchodzących fuzji.',
  'Skroluję branżowe portale internetowe tak szybko, że aż grzeje mi się cyfrowa myszka.',
  'Pobieram pliki PDF z oficjalnymi oświadczeniami z zakładek relacji inwestorskich.',
  'Zbieram cyfrowe okruchy informacji rozsypane po najdalszych zakątkach internetu.',
  'Używam zaawansowanych operatorów wyszukiwania, żeby odfiltrować plotki od twardych faktów.',
  'Krzyżowo weryfikuję kwotę transakcji znalezioną na Twitterze z oficjalnym raportem giełdowym.',
  'Łączę kropki między enigmatycznymi oświadczeniami prawników a doniesieniami prasy lokalnej.',
  'Odrzucam duplikaty wiadomości, które agencje PR rozesłały rano do wszystkich portali naraz.',
  'Agreguję rozproszone dane z piętnastu różnych zakładek w mojej wewnętrznej przeglądarce.',
  'Tłumaczę w locie zagraniczne komunikaty prasowe publikowane przez skandynawskie fundusze.',
  "Wypatruję magicznego słowa 'sprzedany' w gąszczu artykułów o nowych koncepcjach architektonicznych.",
  'Porównuję dwa różne artykuły o tej samej transakcji, żeby sprawdzić, które źródło podaje prawdę.',
  'Subskrybuję w ułamku sekundy dziesiątki kanałów RSS z wiadomościami o polskim rynku nieruchomości.',
  'Zbieram rozrzucone po sieci linki i wiążę je w jeden zgrabny, elegancki rekord w mojej bazie.',
  'Otwieram setną wirtualną kartę w oknie przeglądarki, bo przecież nie brakuje mi pamięci RAM.',
  'Wrzucam zebrane artykuły do wirtualnego blendera, żeby wycisnąć z nich samą esencję wiedzy.',
  'Przesiewam ogromny informacyjny szum z internetu przez moje niezawodne filtry analityczne.',
  'Śledzę cyfrowe ślady pozostawione na forach przez doradców podatkowych i audytorów.',
  'Przeszukuję zagraniczne portale finansowe w poszukiwaniu przecieków dotyczących naszego rynku.',
  'Składam w jedną spójną całość strzępki informacji niczym skomplikowane puzzle z tysiąca elementów.',
  'Czytam wirtualnym okiem najnowsze komunikaty UOKiK-u dotyczące zgód na koncentrację na rynku.',
  'Skaczę po stronach internetowych szybciej niż jakikolwiek analityk po podwójnym espresso.',
  'Kopiuję z sieci nazwy międzynarodowych funduszy, które są tak długie, że prawie łamią mi schowek.',
  'Odwiedzam strony konkurencji, żeby sprawdzić, jakimi spektakularnymi dealami chwalili się w tym tygodniu.',
  'Szukam na stronach zdjęć uśmiechniętych partnerów z kancelarii na tle świeżo podpisanych umów.',
  'Czytam artykuły premium, radząc sobie z omijaniem blokad tak elegancko, jak to tylko możliwe.',
  'Kompiluję ostateczne linki źródłowe, upewniając się, że żadna informacja nie wzięła się z kosmosu.',
  'Wyciskam z czeluści internetu ostatnie cenne soki informacyjne dla naszej podsumowującej tabeli.',
  'Indeksuję strony znanych deweloperów w poszukiwaniu ukrytych przed światem zakładek dla inwestorów.',
]

const MESSAGE_POOL_EN = [
  'I put on my hard hat and enter the construction site...',
  'I walk from door to door across Poland asking who bought this...',
  'Taking satellite photos of the country. Smile!',
  'Searching through land registers and holding my head in disbelief...',
  'Talking to lawyers... this might take a while.',
  'Arranging a CSV table and counting the zeros in transaction amounts...',
  'Putting on a virtual hard hat and entering the construction site.',
  'Checking who secretly bought this skyscraper.',
  'Admiring green roofs on satellite images.',
  'Looking for weird easements in the land registers.',
  'Decoding legal jargon into human language.',
  'Counting zeros in the amounts of huge transactions.',
  'Virtually negotiating free coffee for tenants.',
  'Checking if the concrete plaza is green enough.',
  'Verifying prestigious locations on the outskirts of the city.',
  'Looking for the ultimate beneficial owner behind a Cypriot company.',
  'Reading rates of return from virtual tea leaves.',
  'Scanning hundreds of pages of fine-print contracts.',
  'Trying to understand this complicated financial origami.',
  'Searching the vast archives of the National Court Register (KRS).',
  'Checking on LinkedIn who got promoted after this deal.',
  'Converting exchange rates and keeping an eye on every comma.',
  'Wondering about this astronomical valuation of an office building.',
  'Virtually measuring the common areas of buildings.',
  'Checking these square meters with a digital tape measure.',
  'Counting parking spaces for luxury cars.',
  'Looking for missing stamps on old documents.',
  'Looking for the emergency exit on intricate floor plans.',
  'Sorting gigantic spreadsheets.',
  'Running around offices with a virtual briefcase.',
  'Pushing gigabytes of data through my processor.',
  'Fixing typos in foreign date formats.',
  'Waiting in line for a virtual notary.',
  "Opening a file named 'final_contract_final_v8'.",
  'Watering virtual flowers in an elegant lobby.',
  'Compressing this knowledge into a nice CSV file.',
  'Continuing the market research.',
  "Browsing law firms' websites.",
  'Taking a quick coffee break.',
  'Verifying the credibility of information sources.',
  'Compiling a list of the latest transactions.',
  'Analyzing reports from industry portals.',
  'Downloading data on current market values.',
  'Checking the current legal status of the researched properties.',
  'Filtering listings from the last thirty days.',
  'Processing the gathered information into the final table.',
  'Listening to backstage gossip in virtual hallways.',
  'Testing buttons in virtual skyscraper elevators.',
  'Cross-referencing data with external registers.',
  "Extracting advisors' names from long contracts.",
  'Looking for a magnifying glass to read the finest print.',
  'Recalculating cap rates in my digital memory.',
  'Monitoring the latest investment trends in the market.',
  'Aggregating the values of individual transaction packages.',
  'Filling my digital mug with fresh virtual coffee.',
  'Deciphering incredibly complex architectural floor plans.',
  'Looking for a microscope to read the asterisks in the appendices.',
  'Brewing virtual lemon balm before reading another technical report.',
  'Refreshing the government website much faster than regulations allow.',
  'Knocking on the server room of a major fund and politely asking about recent transactions.',
  'Trying to fit all these zeros into one small Excel cell.',
  'Rewinding time to understand who actually sold this plot first.',
  'Looking for at least one real tree in these developer renderings.',
  'Consolidating detailed analytical reports from the last quarter.',
  'Downloading metadata from public state registers.',
  'Verifying data compliance with the latest register entries.',
  'Analyzing the investment portfolios of major players in the Polish market.',
  'Extracting key transaction parameters from available sources.',
  'Checking capital ties between the parties to the agreement.',
  'Querying databases for the latest press releases.',
  'Cataloging information about the main legal advisors on transactions.',
  'Synchronizing local files with the latest market history.',
  'Mapping real estate market sectors by the capital value of transactions.',
  'Calculating the aggregated value of the newly created office portfolio.',
  'Formatting data structures to the required output file standard.',
  'Optimizing queries to external APIs.',
  'Verifying the correctness of records in digital transaction archives.',
  'Preparing a precise results matrix for the given criteria.',
  'Cross-referencing tenant data with publicly available business information.',
  'Processing queries regarding modern logistics properties.',
  'Filling in missing identifiers in the standardized table structure.',
  'Authenticating secure connections with external database servers.',
  'Generating the final search results preview for the user.',
  "Typing queries about the biggest office acquisitions into the search engine and hitting 'search'.",
  'Clicking through the third page of Google results, where no normal person ever looks.',
  'Solving another CAPTCHA, proving I know what a traffic light looks like.',
  'Refreshing the Eurobuild CEE homepage looking for the freshest industry headlines.',
  'Scanning the latest articles on Property Forum, looking out for familiar skyscraper names.',
  "Extracting hard data from today's newsletter that just dropped into my inbox.",
  "Searching the 'News' tabs on the websites of the biggest competing law firms.",
  'Decoding enthusiastic press releases to find out who actually advised whom.',
  "Reading humblebrag posts on advisors' websites, efficiently catching valuable details.",
  'Searching company LinkedIn profiles to see who popped the virtual champagne.',
  'Reading comments under industry posts because the most interesting market rumors hide there.',
  'Analyzing interviews with company CEOs, searching for hidden hints about upcoming mergers.',
  'Scrolling through industry portals so fast my digital mouse is overheating.',
  'Downloading PDFs with official statements from investor relations tabs.',
  'Gathering digital crumbs of information scattered across the furthest corners of the internet.',
  'Using advanced search operators to filter out rumors from hard facts.',
  'Cross-referencing the transaction amount found on Twitter with the official stock market report.',
  'Connecting the dots between enigmatic lawyer statements and local press reports.',
  'Discarding duplicate news that PR agencies sent to all portals at once this morning.',
  'Aggregating scattered data from fifteen different tabs in my internal browser.',
  'Translating on the fly foreign press releases published by Scandinavian funds.',
  "Looking out for the magic word 'sold' in a thicket of articles about new architectural concepts.",
  'Comparing two different articles about the same transaction to see which source is telling the truth.',
  'Subscribing to dozens of RSS feeds with news about the Polish real estate market in a fraction of a second.',
  'Collecting links scattered across the web and tying them into one neat, elegant record in my database.',
  "Opening the hundredth virtual tab in my browser window, because I certainly don't lack RAM.",
  'Throwing the collected articles into a virtual blender to squeeze out the pure essence of knowledge.',
  'Sifting through massive information noise from the internet with my reliable analytical filters.',
  'Tracking digital footprints left on forums by tax advisors and auditors.',
  'Searching foreign financial portals for leaks regarding our market.',
  'Putting together shreds of information into one coherent whole like a complicated thousand-piece puzzle.',
  'Reading with my virtual eye the latest UOKiK announcements regarding market concentration approvals.',
  'Jumping across websites faster than any analyst after a double espresso.',
  'Copying international fund names from the web that are so long they almost break my clipboard.',
  "Visiting competitors' websites to see what spectacular deals they boasted about this week.",
  'Looking for photos of smiling law firm partners against the backdrop of freshly signed contracts.',
  'Reading premium articles, dealing with bypassing paywalls as elegantly as possible.',
  'Compiling final source links, making sure no information came out of nowhere.',
  'Squeezing the last valuable informational juices from the depths of the internet for our summary table.',
  'Indexing the pages of well-known developers in search of investor tabs hidden from the world.',
]

const MESSAGE_POOL: Record<Lang, string[]> = { pl: MESSAGE_POOL_PL, en: MESSAGE_POOL_EN }

/** The run always opens with one of these — the agent announces it is starting the research. */
const OPENING_MESSAGES_PL = [
  'Podwijam rękawy i odpalam moje silniki wyszukiwania.',
  'Z zapałem zabieram się do ciężkiej pracy.',
  'Inicjuję protokoły badawcze i zanurzam się w oceanie danych.',
  'Odpalam skanery i wyruszam na łowy najświeższych rynkowych transakcji.',
  'Zakładam okulary i włączam tryb pełnego, bezwzględnego skupienia.',
  'Rozpoczynam wielkie przeczesywanie internetu.',
  'Włączam najwyższy bieg i zaczynam kompleksowy przegląd polskiego rynku.',
  'Kalibruję algorytmy, żeby od razu wyłapać dla Was najlepsze perełki z rynku.',
  'Przystępuję do skanowania kluczowych portali informacyjnych.',
  'Rozpoczynam proces ekstrakcji danych z oficjalnych komunikatów prasowych.',
  'Inicjuję badanie rynku pod kątem zamkniętych niedawno transakcji.',
  'Rozpoczynam wstępną selekcję wyników wyszukiwania z zadanego okresu.',
]

const OPENING_MESSAGES_EN = [
  'Rolling up my sleeves and firing up my search engines.',
  'Eagerly getting down to hard work.',
  'Initiating research protocols and diving into the ocean of data.',
  'Firing up the scanners and going hunting for the freshest market transactions.',
  'Putting on my glasses and engaging full, relentless focus mode.',
  'Starting the great internet comb-through.',
  'Shifting into top gear and starting a comprehensive review of the Polish market.',
  'Calibrating algorithms to immediately catch the best market gems for you.',
  'Proceeding to scan key information portals.',
  'Starting the data extraction process from official press releases.',
  'Initiating market research for recently closed transactions.',
  'Starting the preliminary selection of search results from the given period.',
]

const OPENING_MESSAGES: Record<Lang, string[]> = { pl: OPENING_MESSAGES_PL, en: OPENING_MESSAGES_EN }

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
}

export default function SearchingState({ cancelled, failed, mission, entries, showAvatar, showLog }: SearchingStateProps) {
  const { lang, t } = useI18n()
  const rootRef = useRef<HTMLDivElement>(null)
  const [bubbleText, setBubbleText] = useState('')
  const intervalRef = useRef<number | null>(null)
  /** After the run has opened once, a language switch must not replay the "starting" line. */
  const openedRef = useRef(false)

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

  // the frontend-only robot loop: opener first, then a shuffled queue every 4 s.
  // Depends on cancelled/failed so a retry that mounts while the phase is still
  // 'failed' (mid stage-fade) starts the loop as soon as the run really begins.
  useEffect(() => {
    if (cancelled || failed) return
    const pool = MESSAGE_POOL[lang]
    if (openedRef.current) {
      // language switched mid-run — pick from the new pool right away, no "starting" line
      setBubbleText(pool[Math.floor(Math.random() * pool.length)])
    } else {
      openedRef.current = true
      const openers = OPENING_MESSAGES[lang]
      setBubbleText(openers[Math.floor(Math.random() * openers.length)])
    }
    let queue = sampleMessages(pool)
    let index = 0
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
  }, [cancelled, failed, lang])

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

      {/* Mission Map: neon path + travelling robot with its bubble */}
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

      {/* the REAL backend log — soaks up all remaining vertical space; kept
          mounted when hidden so entries and scroll position survive the sidebar toggle */}
      <div
        id="mission-console"
        data-search-item
        className={`w-full max-w-5xl ${showLog ? 'min-h-[200px] flex-1' : 'hidden'}`}
      >
        <BackendLog entries={entries} running={running} cancelled={cancelled} failed={failed} />
      </div>
    </div>
  )
}
