import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import AgentAvatar from './AgentAvatar'
import { PHASES, LAST_PHASE, type MissionState } from '../lib/phases'
import { useI18n } from '../lib/i18n'

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))
const clamp01 = (v: number) => clamp(v, 0, 1)
const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

interface MissionTimelineProps {
  mission: MissionState
  cancelled: boolean
  /** Backend error: the robot stops in place and grabs its head (panic mood). */
  failed: boolean
  /** false → a glowing dot rides the path instead of the robot. */
  showAvatar: boolean
  /** Bubble text (the witty message rotation is driven by SearchingState). */
  bubbleText: string
}

/**
 * Mission Map: a neon data path with checkpoints and a robot that smoothly
 * travels to overallT = (idx + progress) / LAST_PHASE.
 * A single parametric curve curve(t) is the source of truth for the geometry
 * of the SVG path, the checkpoints, the robot and the bubble — the DOM overlay
 * matches the viewBox 1:1 in real pixels.
 */
export default function MissionTimeline({ mission, cancelled, failed, showAvatar, bubbleText }: MissionTimelineProps) {
  const { lang, t } = useI18n()
  const rootRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const litRef = useRef<SVGPathElement>(null)
  const glowRef = useRef<SVGPathElement>(null)
  const flowRef = useRef<SVGPathElement>(null)
  const robotRef = useRef<HTMLDivElement>(null)
  const beamRef = useRef<HTMLDivElement>(null)
  const bubbleRef = useRef<HTMLDivElement>(null)
  const tailRef = useRef<HTMLDivElement>(null)
  const msgRef = useRef<HTMLParagraphElement>(null)
  /** Robot position on the path (0..1) — tween target, survives re-renders. */
  const proxyRef = useRef({ t: 0 })
  const lengthRef = useRef(0)
  const [size, setSize] = useState({ w: 0, h: 0 })

  useLayoutEffect(() => {
    const el = rootRef.current
    if (!el) return
    const ro = new ResizeObserver((es) => {
      const r = es[0].contentRect
      setSize({ w: Math.round(r.width), h: Math.round(r.height) })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const { w, h } = size
  const doneAll = mission.idx >= LAST_PHASE && mission.progress >= 1
  const halted = cancelled || failed
  const robotW = w < 640 ? 112 : 144
  const robotH = Math.round(robotW * 1.1)
  // the path starts so that the large robot never sticks out of the band at the edges
  const pad = clamp(Math.max(w * 0.05, showAvatar ? robotW / 2 + 4 : 0), 24, 96)
  const base = h - 46 // path baseline; the numbers/labels zone sits below it

  const curve = useCallback(
    (t: number) => ({
      x: pad + t * (w - 2 * pad),
      y: base + 7 * Math.sin(t * 2.2 * Math.PI),
    }),
    [pad, w, base],
  )

  /** Seats the robot/dot, the bubble with its tail and the lit path portion at point t. */
  const positionAt = useCallback(
    (t: number) => {
      const { x, y } = curve(t)
      if (robotRef.current) gsap.set(robotRef.current, { x: x - robotW / 2, y: y - robotH + 6 })
      if (beamRef.current) gsap.set(beamRef.current, { x: x - 5, y: y - 5 })
      const b = bubbleRef.current
      if (b) {
        const bw = b.offsetWidth
        const left = clamp(x - bw / 2, 6, Math.max(6, w - bw - 6))
        gsap.set(b, { x: left, y: y - robotH - b.offsetHeight - 2 })
        if (tailRef.current) gsap.set(tailRef.current, { x: clamp(x - left - 6, 12, Math.max(12, bw - 24)) })
      }
      const L = lengthRef.current
      if (L > 0) {
        const off = L * (1 - t)
        if (litRef.current) gsap.set(litRef.current, { strokeDashoffset: off })
        if (glowRef.current) gsap.set(glowRef.current, { strokeDashoffset: off })
      }
    },
    [curve, robotW, robotH, w],
  )

  // path geometry — 48 samples of the shared curve
  let d = ''
  if (w > 0 && h > 0) {
    const pts = Array.from({ length: 49 }, (_, i) => curve(i / 48))
    d = 'M' + pts.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' L ')
  }

  // after every geometry change: measure the length, set the dasharray, reseat everything at once
  useLayoutEffect(() => {
    const lit = litRef.current
    if (!lit || !d) return
    const L = lit.getTotalLength()
    lengthRef.current = L
    gsap.set([litRef.current, glowRef.current].filter(Boolean), { strokeDasharray: L })
    positionAt(proxyRef.current.t)
  }, [d, positionAt, showAvatar])

  // robot travel to the current mission target
  useEffect(() => {
    if (!d || halted) return
    const target = clamp01((mission.idx + clamp01(mission.progress)) / LAST_PHASE)
    const proxy = proxyRef.current
    const dist = Math.abs(target - proxy.t)
    if (dist < 0.0005) return
    if (reduceMotion()) {
      proxy.t = target
      positionAt(target)
      return
    }
    gsap.to(proxy, {
      t: target,
      duration: clamp(0.35 + dist * 6, 0.6, 2.4),
      ease: 'power2.inOut',
      overwrite: true,
      onUpdate: () => positionAt(proxy.t),
    })
  }, [mission.idx, mission.progress, halted, d, positionAt])

  // ambient: data-flow shimmer + pulsing halo of the active checkpoint
  useEffect(() => {
    if (!d || halted || doneAll || reduceMotion()) return
    const ctx = gsap.context(() => {
      if (flowRef.current) {
        gsap.to(flowRef.current, { strokeDashoffset: -42, duration: 1.8, ease: 'none', repeat: -1 })
      }
      gsap.fromTo(
        '[data-cp-halo]',
        { attr: { r: 6.5 }, opacity: 0.7 },
        { attr: { r: 13 }, opacity: 0, duration: 1.4, ease: 'sine.out', repeat: -1 },
      )
    }, rootRef)
    return () => ctx.revert()
  }, [d, halted, doneAll, mission.idx])

  // cancel or error: the robot stops in place, the path dims
  useEffect(() => {
    if (!halted) return
    gsap.killTweensOf(proxyRef.current)
    if (svgRef.current) gsap.to(svgRef.current, { opacity: 0.35, duration: 0.6, ease: 'power2.out' })
  }, [halted])

  // bubble text swap — fade-out → text → fade-in + bubble pop
  useEffect(() => {
    const el = msgRef.current
    if (!el || !showAvatar) return
    if (reduceMotion()) {
      el.textContent = bubbleText
      positionAt(proxyRef.current.t)
      return
    }
    const tl = gsap
      .timeline()
      .to(el, {
        opacity: 0,
        y: -6,
        duration: 0.18,
        ease: 'power2.in',
        onComplete: () => {
          el.textContent = bubbleText
        },
      })
      .fromTo(el, { opacity: 0, y: 7 }, { opacity: 1, y: 0, duration: 0.3, ease: 'power2.out' })
      .fromTo(bubbleRef.current, { scale: 0.97 }, { scale: 1, duration: 0.28, ease: 'back.out(3)' }, '<')
      // the bubble width may have changed — re-clamp its position to the robot
      .call(() => positionAt(proxyRef.current.t))
    return () => {
      tl.kill()
    }
  }, [bubbleText, showAvatar, positionAt])

  return (
    <div
      ref={rootRef}
      className={`relative w-full ${showAvatar ? 'h-[240px] sm:h-[290px]' : 'h-[96px] sm:h-[110px]'}`}
      aria-label={t.missionMapAria}
    >
      {w > 0 && h > 0 && (
        <>
          <svg ref={svgRef} width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="absolute inset-0" aria-hidden="true">
            <defs>
              <linearGradient id="mt-grad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#f1b434" />
                <stop offset="100%" stopColor="#a05eb5" />
              </linearGradient>
              <filter id="mt-blur" x="-20%" y="-300%" width="140%" height="700%">
                <feGaussianBlur stdDeviation="4" />
              </filter>
            </defs>

            {/* base path → glow → lit portion → data-flow shimmer */}
            <path d={d} fill="none" stroke="rgba(160,94,181,0.25)" strokeWidth="3" strokeLinecap="round" />
            <path
              ref={glowRef}
              d={d}
              fill="none"
              stroke="#f1b434"
              strokeWidth="7"
              strokeLinecap="round"
              opacity="0.35"
              filter="url(#mt-blur)"
            />
            <path ref={litRef} d={d} fill="none" stroke="url(#mt-grad)" strokeWidth="3" strokeLinecap="round" />
            {!halted && !doneAll && (
              <path
                ref={flowRef}
                d={d}
                fill="none"
                stroke="rgba(255,255,255,0.3)"
                strokeWidth="1.5"
                strokeDasharray="5 16"
                className="motion-reduce:hidden"
              />
            )}

            {/* checkpoints */}
            {PHASES.map((p, i) => {
              const { x, y } = curve(i / LAST_PHASE)
              const done = i < mission.idx || (i === LAST_PHASE && doneAll)
              const active = i === mission.idx && !done
              return (
                <g key={p.id}>
                  {active && !halted && (
                    <circle data-cp-halo cx={x} cy={y} r="6.5" fill="none" stroke="#f1b434" strokeWidth="1.5" />
                  )}
                  <circle
                    cx={x}
                    cy={y}
                    r={active ? 6 : 5}
                    fill={done || active ? '#f1b434' : '#1a0b26'}
                    stroke={done || active ? '#f1b434' : 'rgba(255,255,255,0.18)'}
                    strokeWidth="1.5"
                  />
                  {done && (
                    <path
                      d={`M${(x - 2.4).toFixed(1)} ${(y + 0.2).toFixed(1)} l1.7 1.7 l3.1 -3.9`}
                      stroke="#3c1053"
                      strokeWidth="1.6"
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  )}
                  <text
                    x={x}
                    y={y + 18}
                    textAnchor="middle"
                    className={`font-mono text-[9px] ${active ? 'fill-den-gold' : 'fill-white/40'}`}
                  >
                    {p.num}
                  </text>
                  <text
                    x={x}
                    y={y + 30}
                    textAnchor="middle"
                    className={`hidden font-mono text-[8.5px] uppercase lg:block ${
                      active ? 'fill-den-gold' : done ? 'fill-den-teal/80' : 'fill-white/35'
                    }`}
                  >
                    {p.label[lang]}
                  </text>
                </g>
              )
            })}
          </svg>

          {/* the robot (or a glowing dot) riding the path */}
          {showAvatar ? (
            <div ref={robotRef} className="absolute top-0 left-0 will-change-transform" style={{ width: robotW }}>
              <AgentAvatar mood={failed ? 'panic' : cancelled ? 'cancel' : 'work'} className="h-auto w-full" />
            </div>
          ) : (
            <div
              ref={beamRef}
              className="absolute top-0 left-0 h-2.5 w-2.5 rounded-full bg-den-gold shadow-glow-gold will-change-transform"
            />
          )}

          {/* bubble above the robot — clamped to the edges, the tail tracks the robot */}
          {showAvatar && (
            <div ref={bubbleRef} className="absolute top-0 left-0 w-max max-w-[270px] will-change-transform sm:max-w-[320px]">
              <div
                role="status"
                aria-live="polite"
                className={`min-h-[40px] rounded-xl border bg-[#2a1638]/85 px-4 py-2 shadow-[0_12px_40px_rgba(0,0,0,0.35)] backdrop-blur-md ${
                  failed ? 'border-den-red/40' : 'border-white/12'
                }`}
              >
                <p ref={msgRef} className="text-center text-[12.5px] leading-snug text-white/90" />
              </div>
              <div
                ref={tailRef}
                className={`absolute -bottom-[6px] left-0 h-3 w-3 rotate-45 border-r border-b bg-[#2a1638]/85 ${
                  failed ? 'border-den-red/40' : 'border-white/12'
                }`}
              />
            </div>
          )}
        </>
      )}
    </div>
  )
}
