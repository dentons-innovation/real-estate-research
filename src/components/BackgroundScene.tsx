import { useEffect, useRef } from 'react'
import gsap from 'gsap'

interface Building {
  x: number
  w: number
  h: number
  antenna?: boolean
}

/** Deterministic pseudo-random so the skyline is identical on every render. */
function seeded(seed: number) {
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return s / 2147483647
  }
}

function makeSkyline(seed: number, count: number, maxH: number, totalW: number): Building[] {
  const rand = seeded(seed)
  const buildings: Building[] = []
  let x = 0
  const avgW = totalW / count
  for (let i = 0; i < count; i++) {
    const w = avgW * (0.55 + rand() * 0.7)
    const h = maxH * (0.25 + rand() * 0.75)
    buildings.push({ x, w, h, antenna: rand() > 0.82 })
    x += w + 6 + rand() * 18
  }
  return buildings
}

const BACK = makeSkyline(7, 26, 210, 1560)
const FRONT = makeSkyline(23, 18, 160, 1500)

function windowsFor(b: Building, rand: () => number) {
  const out: { x: number; y: number }[] = []
  const cols = Math.max(1, Math.floor(b.w / 16))
  const rows = Math.max(2, Math.floor(b.h / 22))
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      if (rand() > 0.86) {
        out.push({ x: b.x + 6 + c * 14, y: 300 - b.h + 8 + r * 20 })
      }
    }
  }
  return out
}

const windowRand = seeded(99)
const WINDOWS = FRONT.flatMap((b) => windowsFor(b, windowRand))

export default function BackgroundScene() {
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const mm = gsap.matchMedia()
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      const root = rootRef.current
      if (!root) return

      gsap.to(root.querySelectorAll('[data-glass-panel]'), {
        y: (i) => (i % 2 === 0 ? -26 : 22),
        rotation: (i) => (i % 2 === 0 ? 2 : -2),
        duration: 14,
        ease: 'sine.inOut',
        yoyo: true,
        repeat: -1,
        stagger: 2.5,
      })

      gsap.to(root.querySelector('[data-skyline-back]'), {
        x: -40,
        duration: 46,
        ease: 'sine.inOut',
        yoyo: true,
        repeat: -1,
      })

      gsap.to(root.querySelectorAll('[data-window]'), {
        opacity: () => 0.15 + Math.random() * 0.8,
        duration: () => 1.6 + Math.random() * 3,
        ease: 'sine.inOut',
        yoyo: true,
        repeat: -1,
        repeatRefresh: true,
        stagger: { each: 0.12, from: 'random' },
      })
    })
    return () => mm.revert()
  }, [])

  return (
    <div ref={rootRef} className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden="true">
      {/* fine architectural grid, fading upward */}
      <div
        className="absolute inset-0 opacity-[0.045]"
        style={{
          backgroundImage:
            'linear-gradient(to right, #c7c9c7 1px, transparent 1px), linear-gradient(to bottom, #c7c9c7 1px, transparent 1px)',
          backgroundSize: '56px 56px',
          maskImage: 'linear-gradient(to top, black 0%, transparent 70%)',
          WebkitMaskImage: 'linear-gradient(to top, black 0%, transparent 70%)',
        }}
      />

      {/* floating glass panels */}
      <div
        data-glass-panel
        className="absolute -top-16 right-[8%] h-72 w-56 rotate-12 rounded-3xl border border-white/[0.08] bg-white/[0.025] backdrop-blur-sm"
      />
      <div
        data-glass-panel
        className="absolute top-[38%] right-[-60px] h-80 w-44 -rotate-6 rounded-3xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-sm"
      />
      <div
        data-glass-panel
        className="absolute bottom-[24%] left-[30%] hidden h-52 w-52 rotate-45 rounded-3xl border border-den-light/10 bg-den-light/[0.03] backdrop-blur-sm lg:block"
      />

      {/* thin gold sightline */}
      <div className="absolute top-[22%] -right-10 h-px w-[46%] rotate-[-24deg] bg-gradient-to-l from-transparent via-den-gold/25 to-transparent" />

      {/* skyline — back silhouette layer */}
      <svg
        data-skyline-back
        className="absolute bottom-0 left-[-60px] h-[34vh] w-[calc(100%+160px)] min-w-[900px]"
        viewBox="0 0 1560 300"
        preserveAspectRatio="xMidYMax slice"
      >
        {BACK.map((b, i) => (
          <rect key={i} x={b.x} y={300 - b.h} width={b.w} height={b.h} fill="#3c1053" opacity="0.35" />
        ))}
      </svg>

      {/* skyline — front blueprint layer */}
      <svg
        className="absolute bottom-0 left-0 h-[28vh] w-full min-w-[900px]"
        viewBox="0 0 1560 300"
        preserveAspectRatio="xMidYMax slice"
      >
        {FRONT.map((b, i) => (
          <g key={i}>
            <rect
              x={b.x}
              y={300 - b.h}
              width={b.w}
              height={b.h}
              fill="rgba(24, 10, 33, 0.5)"
              stroke="#a05eb5"
              strokeOpacity="0.28"
              strokeWidth="1"
            />
            {b.antenna && (
              <line
                x1={b.x + b.w / 2}
                y1={300 - b.h}
                x2={b.x + b.w / 2}
                y2={300 - b.h - 26}
                stroke="#a05eb5"
                strokeOpacity="0.35"
                strokeWidth="1"
              />
            )}
          </g>
        ))}
        {WINDOWS.map((w, i) => (
          <rect key={i} data-window x={w.x} y={w.y} width="5" height="7" fill="#f1b434" opacity="0.25" />
        ))}
      </svg>

      {/* bottom fade so content stays readable over the skyline */}
      <div className="absolute right-0 bottom-0 left-0 h-40 bg-gradient-to-t from-[#0b0412]/80 to-transparent" />
    </div>
  )
}
