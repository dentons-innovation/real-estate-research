import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import BackendLog, { type LogEntry } from './BackendLog'
import MissionTimeline from './MissionTimeline'
import PhaseList from './PhaseList'
import { LAST_PHASE, type MissionState } from '../lib/phases'

/**
 * The robot is a pure frontend illusion, fully decoupled from the backend:
 * it cycles witty lines on a plain setInterval and can be removed later
 * without touching the SSE flow. Real progress lives in <MissionTimeline/>,
 * <PhaseList/> and <BackendLog/>.
 */
const MESSAGE_INTERVAL_MS = 4000

/** The robot cycles a fresh shuffle of this pool, so no two researches sound the same. */
const MESSAGE_POOL = [
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

/** The run always opens with one of these — the agent announces it is starting the research. */
const OPENING_MESSAGES = [
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

/** Fisher–Yates sample of `count` distinct messages. */
function sampleMessages(count: number): string[] {
  const pool = [...MESSAGE_POOL]
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  return pool.slice(0, count)
}

const CANCEL_MESSAGES = [
  'Uff, pora na kawę! Właśnie miałem dzwonić do prezesa, ale okej, anuluję.',
  'Dobra, rzucam te papiery i idę na przerwę.',
  'Przerwane! Zdejmuję kask, odkładam lupę i wracam na gwizdek.',
]

/** Shown in the bubble when the run fails — the robot grabs its head in panic. */
const ERROR_MESSAGES = [
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
]

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
}

export default function SearchingState({ cancelled, failed, mission, entries, showAvatar }: SearchingStateProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [bubbleText, setBubbleText] = useState('')
  const [showLog, setShowLog] = useState(true)
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

  // the frontend-only robot loop: opener first, then a shuffled queue every 4 s.
  // Depends on cancelled/failed so a retry that mounts while the phase is still
  // 'failed' (mid stage-fade) starts the loop as soon as the run really begins.
  useEffect(() => {
    if (cancelled || failed) return
    setBubbleText(OPENING_MESSAGES[Math.floor(Math.random() * OPENING_MESSAGES.length)])
    let queue = sampleMessages(MESSAGE_POOL.length)
    let index = 0
    intervalRef.current = window.setInterval(() => {
      if (index >= queue.length) {
        queue = sampleMessages(MESSAGE_POOL.length)
        index = 0
      }
      setBubbleText(queue[index])
      index += 1
    }, MESSAGE_INTERVAL_MS)
    return () => {
      if (intervalRef.current !== null) window.clearInterval(intervalRef.current)
    }
  }, [cancelled, failed])

  // abort: silence the robot and let it celebrate the coffee break
  useEffect(() => {
    if (!cancelled) return
    setBubbleText(CANCEL_MESSAGES[Math.floor(Math.random() * CANCEL_MESSAGES.length)])
  }, [cancelled])

  // failure: the robot grabs its head and apologises
  useEffect(() => {
    if (!failed) return
    setBubbleText(ERROR_MESSAGES[Math.floor(Math.random() * ERROR_MESSAGES.length)])
  }, [failed])

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
        {failed ? 'Research zakończony błędem' : cancelled ? 'Research przerwany' : 'Research w toku — mapa misji'}
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

      {/* console visibility toggle — some viewers just want the map */}
      <div data-search-item className="flex w-full max-w-5xl items-center justify-end">
        <button
          type="button"
          onClick={() => setShowLog((prev) => !prev)}
          aria-expanded={showLog}
          aria-controls="mission-console"
          className="flex cursor-pointer items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 font-mono text-[10px] tracking-[0.14em] text-white/45 uppercase transition-colors hover:border-den-light/40 hover:text-white/70"
        >
          {showLog ? 'Ukryj szczegóły' : 'Pokaż szczegóły'}
          <svg
            className={`h-3 w-3 shrink-0 transition-transform duration-300 ${showLog ? 'rotate-180' : ''}`}
            viewBox="0 0 12 12"
            fill="none"
            aria-hidden="true"
          >
            <path d="M2.5 4.5 6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {/* the REAL backend log — soaks up all remaining vertical space; kept
          mounted when hidden so entries and scroll position survive the toggle */}
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
