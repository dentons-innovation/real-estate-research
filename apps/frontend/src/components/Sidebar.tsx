import type { Phase } from '../App'
import logo from '../dentons_logo.png'
import { useI18n } from '../lib/i18n'

interface SidebarProps {
  phase: Phase
  onStart: () => void
  onStop: () => void
  onMockError: () => void
  showAvatar: boolean
  onToggleAvatar: () => void
  showLog: boolean
  onToggleLog: () => void
  /** Opoint plugged into the next run. */
  useOpoint: boolean
  /** False when the backend reports Opoint as switched off or not configured — the switch then only shows a notice. */
  opointAvailable: boolean
  onToggleOpoint: () => void
  /** Toast text under the Opoint switch; null when hidden. */
  opointNotice: string | null
}

export default function Sidebar({
  phase,
  onStart,
  onStop,
  onMockError,
  showAvatar,
  onToggleAvatar,
  showLog,
  onToggleLog,
  useOpoint,
  opointAvailable,
  onToggleOpoint,
  opointNotice,
}: SidebarProps) {
  const { lang, setLang, t } = useI18n()
  const searching = phase === 'searching'
  const cancelled = phase === 'cancelled'
  const failed = phase === 'failed'

  return (
    <aside className="glass relative z-20 flex w-full flex-col gap-6 border-r border-white/10 px-6 py-7 lg:h-screen lg:w-[320px] lg:shrink-0 lg:overflow-y-auto">
      {/* Brand */}
      <div>
        <img src={logo} alt="Dentons" className="h-9 w-auto select-none" draggable={false} />
        <p className="mt-2 font-mono text-[10px] tracking-[0.32em] text-den-grey/70 uppercase">
          {t.brandTagline}
        </p>
        <div className="mt-5 h-px w-full bg-gradient-to-r from-den-light/50 via-white/10 to-transparent" />
      </div>

      {/* Interface */}
      <div>
        <p className="font-mono text-[10px] tracking-[0.28em] text-white/40 uppercase">{t.interfaceSection}</p>
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
            {t.avatarToggle}
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
          {t.avatarHint}
        </p>

        {/* mission console visibility — same switch style as the avatar toggle */}
        <button
          type="button"
          role="switch"
          aria-checked={showLog}
          aria-controls="mission-console"
          onClick={onToggleLog}
          className="mt-3 flex w-full cursor-pointer items-center justify-between gap-3 rounded-lg border border-white/15 bg-white/5 px-3.5 py-2.5 transition-colors hover:border-den-light/50 focus-visible:border-den-light focus-visible:outline-none"
        >
          <span className="flex items-center gap-2.5 text-[13px] font-medium text-white/75">
            <svg
              className={`h-4 w-4 transition-colors ${showLog ? 'text-den-gold/80' : 'text-white/30'}`}
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden="true"
            >
              <rect x="2" y="3" width="12" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
              <path d="m4.5 6.5 2 1.75-2 1.75" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M8.5 10.5h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
            {t.logToggle}
          </span>
          <span
            className={`relative h-5 w-9 shrink-0 rounded-full transition-colors duration-300 ${
              showLog ? 'bg-den-light' : 'bg-white/15'
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow-[0_1px_4px_rgba(0,0,0,0.4)] transition-transform duration-300 ${
                showLog ? 'translate-x-4' : ''
              }`}
            />
          </span>
        </button>
        <p className="mt-1.5 text-[11px] leading-snug text-white/35">
          {t.logHint}
        </p>

        {/* language switcher — PL / EN */}
        <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-white/15 bg-white/5 px-3.5 py-2.5">
          <span className="flex items-center gap-2.5 text-[13px] font-medium text-white/75">
            <svg className="h-4 w-4 text-white/30" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.3" />
              <path d="M2 8h12M8 2c1.8 1.7 2.7 3.8 2.7 6S9.8 12.3 8 14M8 2C6.2 3.7 5.3 5.8 5.3 8S6.2 12.3 8 14" stroke="currentColor" strokeWidth="1.1" />
            </svg>
            {t.langLabel}
          </span>
          <div
            role="group"
            aria-label={t.langLabel}
            className="flex shrink-0 overflow-hidden rounded-md border border-white/15"
          >
            {(['pl', 'en'] as const).map((code) => (
              <button
                key={code}
                type="button"
                aria-pressed={lang === code}
                onClick={() => setLang(code)}
                className={`cursor-pointer px-2.5 py-1 font-mono text-[10px] tracking-[0.1em] uppercase transition-colors ${
                  lang === code
                    ? 'bg-den-light text-white'
                    : 'bg-transparent text-white/40 hover:bg-white/10 hover:text-white/70'
                }`}
              >
                {code}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Sources — Opoint plug-in switch. A run never changes mid-flight, so the switch is locked while searching. */}
      <div>
        <p className="font-mono text-[10px] tracking-[0.28em] text-white/40 uppercase">{t.sourcesSection}</p>
        <button
          type="button"
          role="switch"
          aria-checked={useOpoint}
          aria-describedby={opointNotice ? 'opoint-notice' : undefined}
          disabled={searching}
          onClick={onToggleOpoint}
          data-testid="opoint-toggle"
          className={`mt-3 flex w-full cursor-pointer items-center justify-between gap-3 rounded-lg border bg-white/5 px-3.5 py-2.5 transition-colors focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 ${
            opointAvailable
              ? 'border-white/15 hover:border-den-light/50 focus-visible:border-den-light'
              : 'border-dashed border-white/15 hover:border-den-gold/50 focus-visible:border-den-gold'
          }`}
        >
          <span className="flex items-center gap-2.5 text-[13px] font-medium text-white/75">
            <svg
              className={`h-4 w-4 transition-colors ${useOpoint ? 'text-den-gold/80' : 'text-white/30'}`}
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden="true"
            >
              <path d="M3 3.5h8.5v8a1.5 1.5 0 0 0 1.5 1.5H4.5A1.5 1.5 0 0 1 3 11.5v-8Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
              <path d="M11.5 6H13v5.5a1.5 1.5 0 0 1-1.5 1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              <path d="M5 6h4.5M5 8.5h4.5M5 11h2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
            {t.opointToggle}
          </span>
          <span
            className={`relative h-5 w-9 shrink-0 rounded-full transition-colors duration-300 ${
              useOpoint ? 'bg-den-light' : 'bg-white/15'
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow-[0_1px_4px_rgba(0,0,0,0.4)] transition-transform duration-300 ${
                useOpoint ? 'translate-x-4' : ''
              }`}
            />
          </span>
        </button>
        <p className="mt-1.5 text-[11px] leading-snug text-white/35">{useOpoint ? t.opointHintOn : t.opointHint}</p>

        {/* toast: appears under the switch when Opoint cannot be plugged in */}
        <div
          id="opoint-notice"
          role="status"
          aria-live="polite"
          className={`grid transition-all duration-300 ease-out ${opointNotice ? 'mt-2 grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}
        >
          <div className="overflow-hidden">
            <div className="flex items-start gap-2 rounded-lg border border-den-gold/40 bg-den-gold/10 px-3 py-2 text-[11px] leading-snug text-den-gold/90 shadow-[0_6px_20px_rgba(0,0,0,0.25)]">
              <svg className="mt-px h-3.5 w-3.5 shrink-0" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.2" />
                <path d="M7 4.2v3.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                <circle cx="7" cy="9.8" r="0.8" fill="currentColor" />
              </svg>
              <span>{opointNotice}</span>
            </div>
          </div>
        </div>
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
              {t.stopResearch}
            </button>
            <button
              onClick={onMockError}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-white/15 px-3 py-2 font-mono text-[11px] tracking-[0.08em] text-white/40 transition-colors hover:border-den-red/50 hover:bg-den-red/10 hover:text-den-red"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M8.5 1 3 8h3l-.5 5L11 6H8l.5-5Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
              </svg>
              {t.mockError}
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
              {cancelled ? t.stopping : failed ? t.tryAgain : t.startResearch}
            </span>
          </button>
        )}
      </div>
    </aside>
  )
}
