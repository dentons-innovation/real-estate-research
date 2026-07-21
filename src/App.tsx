import { useCallback, useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import Sidebar, { TIME_RANGES } from './components/Sidebar'
import BackgroundScene from './components/BackgroundScene'
import IdleState from './components/IdleState'
import SearchingState from './components/SearchingState'
import ErrorState from './components/ErrorState'
import ResultsTable from './components/ResultsTable'
import { mapApiTransactions, type Transaction } from './data/transactions'
import { startResearchStream, type ResearchStreamHandle, type ResearchEventMeta } from './lib/researchStream'
import { PHASE_INDEX, LAST_PHASE, type MissionState } from './lib/phases'
import { N8N_SSE_WEBHOOK_URL } from './config'
import type { LogEntry } from './components/BackendLog'

export type Phase = 'idle' | 'searching' | 'cancelled' | 'error' | 'results'

const SHOW_AVATAR_KEY = 'dentons-re-show-avatar'

export default function App() {
  const [phase, setPhase] = useState<Phase>('idle')
  const [timeRange, setTimeRange] = useState('30d')
  const [showAvatar, setShowAvatar] = useState(() => localStorage.getItem(SHOW_AVATAR_KEY) !== '0')
  const [results, setResults] = useState<Transaction[]>([])
  const [logEntries, setLogEntries] = useState<LogEntry[]>([])
  const [mission, setMission] = useState<MissionState>({ idx: 0, progress: 0 })
  const [errorDetail, setErrorDetail] = useState<string | undefined>(undefined)
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
      streamRef.current?.abort()
    }
  }, [])

  const appendLog = useCallback(
    (phaseName: string, message: string, phaseId?: string, meta?: ResearchEventMeta) => {
      const time = new Date().toLocaleTimeString('pl-PL', { hour12: false })
      setLogEntries((prev) => [...prev, { time, phase: phaseName, message, phaseId, meta }])
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
    setErrorDetail(undefined)
    runActiveRef.current = true
    transitionTo('searching')

    const time = new Date().toLocaleTimeString('pl-PL', { hour12: false })
    setLogEntries([{ time, phase: '', message: `Łączenie z backendem (${N8N_SSE_WEBHOOK_URL})...` }])
    streamRef.current?.abort()
    streamRef.current = startResearchStream({
      url: N8N_SSE_WEBHOOK_URL,
      range: timeRange,
      onEvent: (event) => {
        if (!runActiveRef.current) return
        appendLog(event.phase, event.message, event.phaseId, event.meta)
        const targetIdx = event.phaseId !== undefined ? PHASE_INDEX[event.phaseId] : undefined
        if (targetIdx === undefined) return // event bez znanego phase_id → tylko log
        const progress = event.progress ?? 0
        setMission((prev) => {
          // guard monotoniczny: indeks tylko rośnie, progress rośnie w obrębie fazy
          if (targetIdx < prev.idx || (targetIdx === prev.idx && progress <= prev.progress)) {
            return event.meta ? { ...prev, meta: { ...prev.meta, ...event.meta } } : prev
          }
          return {
            idx: targetIdx,
            progress: targetIdx === prev.idx ? Math.max(prev.progress, progress) : progress,
            meta: { ...prev.meta, ...event.meta },
          }
        })
      },
      onComplete: (rawRows) => {
        if (!runActiveRef.current) return
        runActiveRef.current = false
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
        setErrorDetail(detail)
        settleTo('error')
      },
    })
  }, [transitionTo, settleTo, appendLog, timeRange])

  const handleStop = useCallback(() => {
    if (phaseRef.current !== 'searching' || transitionPendingRef.current) return
    runActiveRef.current = false
    streamRef.current?.abort()
    streamRef.current = null
    appendLog('', 'Połączenie przerwane przez użytkownika.')
    setPhase('cancelled')
    resetTimerRef.current = window.setTimeout(() => transitionTo('idle'), 3000)
  }, [transitionTo, appendLog])

  const handleMockError = useCallback(() => {
    if (phaseRef.current !== 'searching' || transitionPendingRef.current) return
    runActiveRef.current = false
    streamRef.current?.abort()
    streamRef.current = null
    setErrorDetail(
      [
        'Symulacja błędu backendu (Mock Error) — połączenie SSE przerwane ręcznie.',
        `POST ${N8N_SSE_WEBHOOK_URL}`,
        new Date().toISOString(),
      ].join('\n'),
    )
    transitionTo('error')
  }, [transitionTo])

  const handleToggleAvatar = useCallback(() => {
    setShowAvatar((prev) => {
      const next = !prev
      localStorage.setItem(SHOW_AVATAR_KEY, next ? '1' : '0')
      return next
    })
  }, [])

  const handleRetry = useCallback(() => {
    if (phaseRef.current !== 'error' || transitionPendingRef.current) return
    transitionTo('idle')
  }, [transitionTo])

  const timeRangeLabel = TIME_RANGES.find((r) => r.value === timeRange)?.label ?? ''

  return (
    <div className="relative flex min-h-screen flex-col lg:h-screen lg:flex-row lg:overflow-hidden">
      <BackgroundScene />

      <Sidebar
        phase={phase}
        timeRange={timeRange}
        onTimeRangeChange={setTimeRange}
        onStart={handleStart}
        onStop={handleStop}
        onMockError={handleMockError}
        showAvatar={showAvatar}
        onToggleAvatar={handleToggleAvatar}
      />

      <main className="relative z-10 flex min-h-[60vh] flex-1 flex-col overflow-hidden">
        {/* slim product header */}
        <header className="flex items-center justify-between px-6 pt-5 pb-1 lg:px-10">
          <p className="font-mono text-[11px] tracking-[0.18em] text-white/35 uppercase">
            Narzędzia <span className="mx-1 text-white/20">/</span> Research transakcji
          </p>
          <p className="hidden font-mono text-[11px] tracking-[0.18em] text-white/35 sm:block">
            {new Date().toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' })}
            <span className="ml-3 rounded border border-white/15 px-1.5 py-0.5 text-[10px] text-den-gold/80">PL</span>
          </p>
        </header>

        <div ref={stageRef} className="flex flex-1 flex-col overflow-hidden">
          {phase === 'idle' && <IdleState />}
          {(phase === 'searching' || phase === 'cancelled') && (
            <SearchingState
              cancelled={phase === 'cancelled'}
              mission={mission}
              entries={logEntries}
              showAvatar={showAvatar}
            />
          )}
          {phase === 'error' && <ErrorState onRetry={handleRetry} errorDetail={errorDetail} showAvatar={showAvatar} />}
          {phase === 'results' && <ResultsTable rows={results} timeRangeLabel={timeRangeLabel} />}
        </div>
      </main>
    </div>
  )
}
