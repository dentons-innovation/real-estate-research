import { useCallback, useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import Sidebar from './components/Sidebar'
import BackgroundScene from './components/BackgroundScene'
import IdleState from './components/IdleState'
import SearchingState from './components/SearchingState'
import ResultsTable from './components/ResultsTable'
import { mapApiTransactions, type Transaction } from './data/transactions'
import { startResearchStream, type ResearchStreamHandle, type ResearchEventMeta } from './lib/researchStream'
import { fetchOpointAvailability, type OpointAvailability } from './lib/health'
import { PHASES, LAST_PHASE, resolvePhase, type MissionState } from './lib/phases'
import { API_LABEL } from './config'
import { useI18n } from './lib/i18n'
import type { LogEntry } from './components/BackendLog'

interface AppProps {
  /** The backend rejected the stored password — hand control back to the access gate. */
  onAuthError: () => void
}

/** 'failed' stays on the mission screen: the error lands in the console, the robot panics. */
export type Phase = 'idle' | 'searching' | 'cancelled' | 'failed' | 'results'

const SHOW_AVATAR_KEY = 'dentons-re-show-avatar'
const SHOW_LOG_KEY = 'dentons-re-show-log'
/** How long the "Opoint unavailable" toast stays next to the switch. */
const OPOINT_NOTICE_MS = 4500

export default function App({ onAuthError }: AppProps) {
  const { lang, toggle, t } = useI18n()
  const [phase, setPhase] = useState<Phase>('idle')
  const [showAvatar, setShowAvatar] = useState(() => localStorage.getItem(SHOW_AVATAR_KEY) !== '0')
  const [showLog, setShowLog] = useState(() => localStorage.getItem(SHOW_LOG_KEY) !== '0')
  /** Opoint is opt-in per run and never remembered: every session starts on Tavily + AI. */
  const [useOpoint, setUseOpoint] = useState(false)
  const [opointAvailability, setOpointAvailability] = useState<OpointAvailability>('unknown')
  /** Toast text next to the Opoint switch; null when hidden. */
  const [opointNotice, setOpointNotice] = useState<string | null>(null)
  const opointNoticeTimerRef = useRef<number | null>(null)
  const [results, setResults] = useState<Transaction[]>([])
  const [logEntries, setLogEntries] = useState<LogEntry[]>([])
  const [mission, setMission] = useState<MissionState>({ idx: 0, progress: 0 })
  /** True when the live stream stays silent past the watchdog window — a proxy/VPN
   *  is buffering the response. Shows a warning banner without failing the run. */
  const [networkStalled, setNetworkStalled] = useState(false)
  /** Run key — remounts SearchingState on every start (fresh bubble/log state). */
  const [runId, setRunId] = useState(0)
  const phaseRef = useRef<Phase>(phase)
  const stageRef = useRef<HTMLDivElement>(null)
  const resetTimerRef = useRef<number | null>(null)
  const transitionPendingRef = useRef(false)
  const streamRef = useRef<ResearchStreamHandle | null>(null)
  /** True from "Rozpocznij research" until completion/cancel/error — independent of the
   *  React phase, which lags ~220 ms behind during the GSAP stage fade. */
  const runActiveRef = useRef(false)

  phaseRef.current = phase

  useEffect(() => {
    return () => {
      if (resetTimerRef.current !== null) window.clearTimeout(resetTimerRef.current)
      if (opointNoticeTimerRef.current !== null) window.clearTimeout(opointNoticeTimerRef.current)
      streamRef.current?.abort()
    }
  }, [])

  // ask the backend once whether Opoint can be plugged in (the switch re-checks on every click)
  useEffect(() => {
    let cancelled = false
    void fetchOpointAvailability().then((status) => {
      if (!cancelled) setOpointAvailability(status)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const appendLog = useCallback(
    (phaseName: string, message: string, phaseId?: string, meta?: ResearchEventMeta, kind?: 'error') => {
      const time = new Date().toLocaleTimeString('pl-PL', { hour12: false })
      setLogEntries((prev) => [...prev, { time, phase: phaseName, message, phaseId, meta, kind }])
    },
    [],
  )

  /** Fades the stage out, swaps the phase, fades back in. */
  const transitionTo = useCallback((next: Phase) => {
    const stage = stageRef.current
    if (!stage) {
      setPhase(next)
      return
    }
    transitionPendingRef.current = true
    gsap.to(stage, {
      opacity: 0,
      y: 12,
      duration: 0.22,
      ease: 'power2.in',
      onComplete: () => {
        setPhase(next)
        transitionPendingRef.current = false
        gsap.fromTo(
          stage,
          { opacity: 0, y: 16 },
          { opacity: 1, y: 0, duration: 0.5, ease: 'power3.out', clearProps: 'transform' },
        )
      },
    })
  }, [])

  /** Transitions once the stage is free; waits out any fade that is mid-flight. */
  const settleTo = useCallback(
    (next: Phase) => {
      const attempt = () => {
        if (transitionPendingRef.current) {
          window.setTimeout(attempt, 260)
          return
        }
        if (phaseRef.current !== 'searching') return
        transitionTo(next)
      }
      attempt()
    },
    [transitionTo],
  )

  const handleStart = useCallback(() => {
    if (phaseRef.current === 'searching' || phaseRef.current === 'cancelled' || transitionPendingRef.current) return
    setLogEntries([])
    setMission({ idx: 0, progress: 0 })
    setNetworkStalled(false)
    setRunId((r) => r + 1)
    runActiveRef.current = true
    transitionTo('searching')

    const time = new Date().toLocaleTimeString('pl-PL', { hour12: false })
    setLogEntries([{ time, phase: '', message: `Łączenie z backendem (${API_LABEL})...` }])
    streamRef.current?.abort()
    streamRef.current = startResearchStream({
      // one month for now; the backend also accepts other ranges and explicit from/to dates
      range: '30d',
      useOpoint,
      onAuthError: () => {
        runActiveRef.current = false
        streamRef.current = null
        setNetworkStalled(false)
        setPhase('idle')
        onAuthError()
      },
      onEvent: (event) => {
        if (!runActiveRef.current) return
        // map the backend phase_id onto a frontend checkpoint (merge dedup+gaps, split deepening)
        const resolved = event.phaseId !== undefined ? resolvePhase(event.phaseId, event.progress ?? 0) : null
        appendLog(event.phase, event.message, resolved ? PHASES[resolved.idx].id : undefined, event.meta)
        if (!resolved) return // event with an unknown phase_id → log only
        setMission((prev) => {
          // monotonic guard: the index only grows, progress only grows within a phase
          if (resolved.idx < prev.idx || (resolved.idx === prev.idx && resolved.progress <= prev.progress)) {
            return event.meta ? { ...prev, meta: { ...prev.meta, ...event.meta } } : prev
          }
          return {
            idx: resolved.idx,
            progress: resolved.idx === prev.idx ? Math.max(prev.progress, resolved.progress) : resolved.progress,
            meta: { ...prev.meta, ...event.meta },
          }
        })
      },
      onComplete: (rawRows) => {
        if (!runActiveRef.current) return
        runActiveRef.current = false
        setNetworkStalled(false)
        const mapped = mapApiTransactions(rawRows)
        setResults(mapped)
        setMission((prev) => ({ idx: LAST_PHASE, progress: 1, meta: prev.meta }))
        appendLog('', `Otrzymano ${mapped.length} rekordów — zamykam połączenie.`)
        streamRef.current = null
        // let the robot's travel tween reach the last checkpoint before the swap
        window.setTimeout(() => settleTo('results'), 1400)
      },
      onError: (detail) => {
        if (!runActiveRef.current) return
        runActiveRef.current = false
        streamRef.current = null
        setNetworkStalled(false)
        // the error stays on the mission screen: full message in the console, the robot panics
        appendLog('BŁĄD', detail, undefined, undefined, 'error')
        setPhase('failed')
      },
      // stream open but silent past the watchdog window (or data finally flowing again)
      onStall: (stalled) => {
        if (runActiveRef.current) setNetworkStalled(stalled)
      },
    })
  }, [transitionTo, settleTo, appendLog, onAuthError, useOpoint])

  const showOpointNotice = useCallback((text: string) => {
    if (opointNoticeTimerRef.current !== null) window.clearTimeout(opointNoticeTimerRef.current)
    setOpointNotice(text)
    opointNoticeTimerRef.current = window.setTimeout(() => {
      setOpointNotice(null)
      opointNoticeTimerRef.current = null
    }, OPOINT_NOTICE_MS)
  }, [])

  /** Switching Opoint on is allowed only when the backend reports it as available; otherwise a toast explains why. */
  const handleToggleOpoint = useCallback(() => {
    if (useOpoint) {
      setUseOpoint(false)
      return
    }
    // re-check on every attempt, so flipping OPOINT_ENABLED on the server needs no page reload
    void fetchOpointAvailability().then((status) => {
      setOpointAvailability(status)
      if (status === 'available') {
        setUseOpoint(true)
        return
      }
      showOpointNotice(status === 'not_configured' ? t.opointNotConfigured : t.opointUnavailable)
    })
  }, [useOpoint, showOpointNotice, t])

  const handleStop = useCallback(() => {
    if (phaseRef.current !== 'searching' || transitionPendingRef.current) return
    runActiveRef.current = false
    streamRef.current?.abort()
    streamRef.current = null
    setNetworkStalled(false)
    appendLog('', 'Połączenie przerwane przez użytkownika.')
    setPhase('cancelled')
    resetTimerRef.current = window.setTimeout(() => transitionTo('idle'), 3000)
  }, [transitionTo, appendLog])

  const handleMockError = useCallback(() => {
    if (phaseRef.current !== 'searching' || transitionPendingRef.current) return
    runActiveRef.current = false
    streamRef.current?.abort()
    streamRef.current = null
    setNetworkStalled(false)
    appendLog(
      'BŁĄD',
      [
        'Symulacja błędu backendu (Mock Error) — połączenie SSE przerwane ręcznie.',
        `POST ${API_LABEL}`,
        `HTTP 503 Service Unavailable · ${new Date().toISOString()}`,
        '{"error":"UPSTREAM_TIMEOUT","retryAfter":30}',
      ].join('\n'),
      undefined,
      undefined,
      'error',
    )
    setPhase('failed')
  }, [appendLog])

  const handleToggleAvatar = useCallback(() => {
    setShowAvatar((prev) => {
      const next = !prev
      localStorage.setItem(SHOW_AVATAR_KEY, next ? '1' : '0')
      return next
    })
  }, [])

  const handleToggleLog = useCallback(() => {
    setShowLog((prev) => {
      const next = !prev
      localStorage.setItem(SHOW_LOG_KEY, next ? '1' : '0')
      return next
    })
  }, [])

  return (
    <div className="relative flex min-h-screen flex-col lg:h-screen lg:flex-row lg:overflow-hidden">
      <BackgroundScene />

      <Sidebar
        phase={phase}
        onStart={handleStart}
        onStop={handleStop}
        onMockError={handleMockError}
        showAvatar={showAvatar}
        onToggleAvatar={handleToggleAvatar}
        showLog={showLog}
        onToggleLog={handleToggleLog}
        useOpoint={useOpoint}
        opointAvailable={opointAvailability === 'available'}
        onToggleOpoint={handleToggleOpoint}
        opointNotice={opointNotice}
      />

      <main className="relative z-10 flex min-h-[60vh] flex-1 flex-col overflow-hidden">
        {/* slim product header */}
        <header className="flex items-center justify-between px-6 pt-5 pb-1 lg:px-10">
          <p className="font-mono text-[11px] tracking-[0.18em] text-white/35 uppercase">
            {t.headerTools} <span className="mx-1 text-white/20">/</span> {t.headerResearch}
          </p>
          <p className="hidden items-center font-mono text-[11px] tracking-[0.18em] text-white/35 sm:flex">
            {new Date().toLocaleDateString(t.dateLocale, { day: 'numeric', month: 'long', year: 'numeric' })}
            <button
              type="button"
              onClick={toggle}
              title={lang === 'pl' ? 'Switch to English' : 'Przełącz na polski'}
              className="ml-3 cursor-pointer rounded border border-white/15 px-1.5 py-0.5 text-[10px] text-den-gold/80 transition-colors hover:border-den-gold/60 hover:text-den-gold"
            >
              {lang.toUpperCase()}
            </button>
          </p>
        </header>

        <div ref={stageRef} className="flex flex-1 flex-col overflow-hidden">
          {phase === 'idle' && <IdleState />}
          {(phase === 'searching' || phase === 'cancelled' || phase === 'failed') && (
            <SearchingState
              key={runId}
              cancelled={phase === 'cancelled'}
              failed={phase === 'failed'}
              mission={mission}
              entries={logEntries}
              showAvatar={showAvatar}
              showLog={showLog}
              networkStalled={networkStalled && phase === 'searching'}
            />
          )}
          {phase === 'results' && <ResultsTable rows={results} />}
        </div>
      </main>
    </div>
  )
}
