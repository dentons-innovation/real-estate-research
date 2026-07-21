import type { Phase } from '../App'
import logo from '../dentons_logo.png'

export const TIME_RANGES = [
  { value: '7d', label: 'Ostatnie 7 dni' },
  { value: '30d', label: 'Ostatnie 30 dni' },
  { value: '1m', label: 'Ostatni miesiąc' },
  { value: '1q', label: 'Ostatni kwartał' },
  { value: '1y', label: 'Ostatni rok' },
]

interface SidebarProps {
  phase: Phase
  timeRange: string
  onTimeRangeChange: (value: string) => void
  onStart: () => void
  onStop: () => void
  onMockError: () => void
  showAvatar: boolean
  onToggleAvatar: () => void
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-1.5 flex items-center justify-between">
      <span className="text-[13px] font-medium text-white/75">{children}</span>
    </div>
  )
}

const selectChevron = (
  <svg
    className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-white/40"
    viewBox="0 0 16 16"
    fill="none"
    aria-hidden="true"
  >
    <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

export default function Sidebar({
  phase,
  timeRange,
  onTimeRangeChange,
  onStart,
  onStop,
  onMockError,
  showAvatar,
  onToggleAvatar,
}: SidebarProps) {
  const searching = phase === 'searching'
  const cancelled = phase === 'cancelled'
  const failed = phase === 'failed'

  return (
    <aside className="glass relative z-20 flex w-full flex-col gap-6 border-r border-white/10 px-6 py-7 lg:h-screen lg:w-[320px] lg:shrink-0 lg:overflow-y-auto">
      {/* Brand */}
      <div>
        <img src={logo} alt="Dentons" className="h-9 w-auto select-none" draggable={false} />
        <p className="mt-2 font-mono text-[10px] tracking-[0.32em] text-den-grey/70 uppercase">
          Real Estate · Polska
        </p>
        <div className="mt-5 h-px w-full bg-gradient-to-r from-den-light/50 via-white/10 to-transparent" />
      </div>

      {/* Parameters */}
      <div className="flex flex-col gap-5">
        <p className="font-mono text-[10px] tracking-[0.28em] text-white/40 uppercase">Parametry wyszukiwania</p>

        <div>
          <FieldLabel>Zakres czasu</FieldLabel>
          <div className="relative">
            <select
              value={timeRange}
              onChange={(e) => onTimeRangeChange(e.target.value)}
              disabled={searching || cancelled}
              className="w-full cursor-pointer appearance-none rounded-lg border border-white/15 bg-white/5 px-3.5 py-2.5 text-sm text-white/90 transition-colors hover:border-den-light/50 focus:border-den-light focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 [&>option]:bg-den-ink [&>option]:text-white"
            >
              {TIME_RANGES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
            {selectChevron}
          </div>
        </div>
      </div>

      {/* Interface */}
      <div>
        <p className="font-mono text-[10px] tracking-[0.28em] text-white/40 uppercase">Interfejs</p>
        <button
          type="button"
          role="switch"
          aria-checked={showAvatar}
          onClick={onToggleAvatar}
          className="mt-3 flex w-full cursor-pointer items-center justify-between gap-3 rounded-lg border border-white/15 bg-white/5 px-3.5 py-2.5 transition-colors hover:border-den-light/50 focus-visible:border-den-light focus-visible:outline-none"
        >
          <span className="flex items-center gap-2.5 text-[13px] font-medium text-white/75">
            <svg
              className={`h-4 w-4 transition-colors ${showAvatar ? 'text-den-gold/80' : 'text-white/30'}`}
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden="true"
            >
              <rect x="3" y="5.5" width="10" height="7" rx="2" stroke="currentColor" strokeWidth="1.3" />
              <path d="M8 5.5V3.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              <circle cx="8" cy="2.6" r="1" stroke="currentColor" strokeWidth="1.2" />
              <circle cx="6" cy="9" r="0.9" fill="currentColor" />
              <circle cx="10" cy="9" r="0.9" fill="currentColor" />
            </svg>
            Awatar asystenta
          </span>
          <span
            className={`relative h-5 w-9 shrink-0 rounded-full transition-colors duration-300 ${
              showAvatar ? 'bg-den-light' : 'bg-white/15'
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow-[0_1px_4px_rgba(0,0,0,0.4)] transition-transform duration-300 ${
                showAvatar ? 'translate-x-4' : ''
              }`}
            />
          </span>
        </button>
        <p className="mt-1.5 text-[11px] leading-snug text-white/35">
          Robot i jego komentarze podczas researchu.
        </p>
      </div>

      {/* Action */}
      <div className="mt-auto flex flex-col gap-3 pt-4">
        {searching ? (
          <>
            <button
              onClick={onStop}
              className="group flex w-full items-center justify-center gap-2.5 rounded-xl border-2 border-red-400/60 bg-red-500/10 px-4 py-3.5 text-[15px] font-semibold text-red-300 transition-all hover:border-red-400 hover:bg-red-500/20 active:scale-[0.98]"
            >
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-400" />
              </span>
              Zatrzymaj research
            </button>
            <button
              onClick={onMockError}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-white/15 px-3 py-2 font-mono text-[11px] tracking-[0.08em] text-white/40 transition-colors hover:border-den-red/50 hover:bg-den-red/10 hover:text-den-red"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M8.5 1 3 8h3l-.5 5L11 6H8l.5-5Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
              </svg>
              Symuluj błąd (Mock Error)
            </button>
          </>
        ) : (
          <button
            onClick={onStart}
            disabled={cancelled}
            className="group relative w-full overflow-hidden rounded-xl bg-gradient-to-r from-den-purple via-den-light to-den-purple bg-[length:200%_100%] bg-left px-4 py-3.5 text-[15px] font-semibold text-white shadow-glow-purple transition-all duration-500 hover:bg-right active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
          >
            <span className="flex items-center justify-center gap-2.5">
              <svg className="h-4.5 w-4.5" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <circle cx="9" cy="9" r="5.5" stroke="currentColor" strokeWidth="1.8" />
                <path d="M13.2 13.2 L17 17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                <path d="M9 6.5 A2.5 2.5 0 0 0 6.5 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.7" />
              </svg>
              {cancelled ? 'Przerywanie…' : failed ? 'Spróbuj ponownie' : 'Rozpocznij research'}
            </span>
          </button>
        )}
        <p className="text-center font-mono text-[10px] tracking-[0.14em] text-white/25">
          Wersja demonstracyjna · dane przykładowe
        </p>
      </div>
    </aside>
  )
}
