import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import AgentAvatar from './AgentAvatar'

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

interface ErrorStateProps {
  onRetry: () => void
  /** The real backend error payload; shown verbatim in the technical details panel. */
  errorDetail?: string
  /** Sidebar toggle: hides the panicking robot + bubble, details panel takes the space. */
  showAvatar: boolean
}

export default function ErrorState({ onRetry, errorDetail, showAvatar }: ErrorStateProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [message] = useState(() => ERROR_MESSAGES[Math.floor(Math.random() * ERROR_MESSAGES.length)])
  const [showDetails, setShowDetails] = useState(false)
  const [detail] = useState(
    () =>
      errorDetail ??
      [
        `HTTP 503 Service Unavailable · ${new Date().toISOString()}`,
        'POST /api/v1/research/transactions?range=30d',
        `{"error":"UPSTREAM_TIMEOUT","requestId":"req_${Math.random().toString(16).slice(2, 10)}","retryAfter":30}`,
      ].join('\n'),
  )

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.from('[data-error-item]', {
        opacity: 0,
        y: 18,
        duration: 0.55,
        ease: 'power3.out',
        stagger: 0.08,
      })
      const mm = gsap.matchMedia()
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        // the details panel rattles once, like something actually broke
        gsap.fromTo(
          '[data-error-card]',
          { x: 0 },
          { x: 7, duration: 0.055, repeat: 9, yoyo: true, delay: 0.5, ease: 'none', clearProps: 'x' },
        )
        gsap.to('[data-error-glow]', {
          opacity: 0.55,
          duration: 1.4,
          ease: 'sine.inOut',
          yoyo: true,
          repeat: -1,
        })
      })
      return () => mm.revert()
    }, rootRef)
    return () => ctx.revert()
  }, [])

  return (
    <div ref={rootRef} className="flex flex-1 flex-col items-center justify-center gap-7 px-6 py-10 lg:px-12">
      {/* eyebrow — same slot as "Research w toku" */}
      <p
        data-error-item
        className="flex items-center gap-2.5 font-mono text-[11px] tracking-[0.34em] text-den-red uppercase"
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <path d="M7 1.5 13 12H1L7 1.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
          <path d="M7 5.5v3M7 10.4v.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
        Błąd researchu
      </p>

      {/* speech bubble — identical slot and geometry to the searching-state bubble */}
      <div data-error-item className={`${showAvatar ? 'flex' : 'hidden'} h-[88px] items-end`}>
        <div className="relative max-w-md">
          <div
            role="status"
            aria-live="assertive"
            className="min-h-[72px] rounded-2xl border border-den-red/40 bg-[#2a1638]/85 px-6 py-4 shadow-[0_12px_40px_rgba(0,0,0,0.35)] backdrop-blur-md"
          >
            <p className="text-center text-[15px] leading-snug text-white/90">{message}</p>
          </div>
          <div className="absolute -bottom-[7px] left-1/2 h-3.5 w-3.5 -translate-x-1/2 rotate-45 border-r border-b border-den-red/40 bg-[#2a1638]/85" />
        </div>
      </div>

      {/* agent — same slot and size as in the searching state */}
      <div data-error-item className={showAvatar ? undefined : 'hidden'}>
        <AgentAvatar mood="panic" className="h-auto w-[186px] max-w-[46vw]" />
      </div>

      {/* technical error details — height follows content now that the panel collapses;
          data-error-item keeps its stagger-in animation regardless */}
      <div data-error-item data-error-card className="relative w-full max-w-xl">
        <div
          data-error-glow
          className="absolute -inset-3 rounded-3xl bg-den-red/20 opacity-30 blur-2xl"
          aria-hidden="true"
        />
        <div
          role="alertdialog"
          aria-labelledby="error-title"
          aria-describedby="error-detail"
          className="relative flex flex-col overflow-hidden rounded-2xl border border-den-red/35 bg-[#2b1219]/90 shadow-[0_18px_60px_rgba(0,0,0,0.45)] backdrop-blur-md"
        >
          <div className="h-1 w-full shrink-0 bg-gradient-to-r from-den-red via-den-red-dark to-den-red" />
          <div className="flex flex-col px-6 py-5">
            <div className="flex items-center justify-between gap-3">
              <h2 id="error-title" className="flex items-center gap-2.5 text-[15px] font-semibold text-white">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-den-red/20 text-den-red">
                  <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M8 4.8v3.7M8 11v.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </span>
                Research nie powiódł się
              </h2>
              <span className="rounded border border-den-red/30 bg-den-red/10 px-2 py-1 font-mono text-[9px] tracking-[0.2em] text-den-red/90 uppercase">
                ERR_RE_503
              </span>
            </div>

            <button
              type="button"
              onClick={() => setShowDetails((prev) => !prev)}
              aria-expanded={showDetails}
              aria-controls="error-detail"
              className="mt-3.5 flex w-full items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/25 px-4 py-2.5 text-left font-mono text-[11px] tracking-[0.08em] text-white/50 uppercase transition-colors hover:border-den-red/40 hover:bg-black/35 hover:text-white/70"
            >
              {showDetails ? 'Ukryj szczegóły techniczne' : 'Pokaż szczegóły techniczne'}
              <svg
                className={`h-3.5 w-3.5 shrink-0 transition-transform ${showDetails ? 'rotate-180' : ''}`}
                viewBox="0 0 12 12"
                fill="none"
                aria-hidden="true"
              >
                <path d="M2.5 4.5 6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            {showDetails && (
              <pre
                id="error-detail"
                className="mt-2.5 max-h-[220px] overflow-auto rounded-lg border border-white/10 bg-black/40 px-4 py-2.5 font-mono text-[11.5px] leading-relaxed whitespace-pre-wrap text-white/65"
              >
                {detail}
              </pre>
            )}

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="font-mono text-[10px] tracking-[0.14em] text-white/35">
                Postęp został utracony · agent otrzyma wsparcie
              </p>
              <button
                onClick={onRetry}
                className="group flex items-center gap-2.5 rounded-xl bg-gradient-to-b from-den-red to-den-red-dark px-5 py-3 text-[14px] font-semibold text-white shadow-[0_8px_28px_rgba(218,41,28,0.35)] transition-all hover:brightness-110 active:scale-[0.97]"
              >
                <svg
                  className="h-4 w-4 transition-transform duration-500 group-hover:rotate-[360deg]"
                  viewBox="0 0 16 16"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 1.8v2.7h-2.7"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                Spróbuj ponownie
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
