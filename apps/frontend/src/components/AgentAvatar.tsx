import { useEffect, useRef } from 'react'
import gsap from 'gsap'

export type AgentMood = 'work' | 'cancel' | 'panic'

/**
 * The Dentons research agent: a floating robot in a gold hard hat,
 * magnifying glass in one hand, clipboard in the other. All animation
 * is GSAP-driven; `mood` switches between working, the "phew, coffee
 * break" pose, and full terrified meltdown (hands on head, trembling).
 */
export default function AgentAvatar({ mood, className }: { mood: AgentMood; className?: string }) {
  const rootRef = useRef<SVGSVGElement>(null)
  const moodTweensRef = useRef<gsap.core.Tween[]>([])

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const ctx = gsap.context(() => {
      const mm = gsap.matchMedia()
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        // gentle hover
        gsap.to('[data-float]', { y: -8, duration: 2.4, ease: 'sine.inOut', yoyo: true, repeat: -1 })
        gsap.to('[data-shadow]', {
          scaleX: 0.86,
          opacity: 0.22,
          transformOrigin: '50% 50%',
          duration: 2.4,
          ease: 'sine.inOut',
          yoyo: true,
          repeat: -1,
        })
        // blink
        gsap
          .timeline({ repeat: -1, repeatDelay: 3.3, delay: 1.2 })
          .to('[data-eye]', { scaleY: 0.08, transformOrigin: '50% 50%', duration: 0.07 })
          .to('[data-eye]', { scaleY: 1, duration: 0.09 })
        // look around
        gsap
          .timeline({ repeat: -1, repeatDelay: 1.4 })
          .to('[data-eyes-open]', { x: 3.5, duration: 0.4, ease: 'power2.inOut', delay: 0.8 })
          .to('[data-eyes-open]', { x: -3.5, duration: 0.5, ease: 'power2.inOut', delay: 1.1 })
          .to('[data-eyes-open]', { x: 0, duration: 0.4, ease: 'power2.inOut', delay: 0.7 })
        // antenna pulse
        gsap.to('[data-antenna-ball]', {
          scale: 1.25,
          transformOrigin: '50% 50%',
          duration: 0.8,
          ease: 'sine.inOut',
          yoyo: true,
          repeat: -1,
        })
        gsap.fromTo(
          '[data-antenna-halo]',
          { scale: 0.6, opacity: 0.5, transformOrigin: '50% 50%' },
          { scale: 1.9, opacity: 0, duration: 1.5, ease: 'power1.out', repeat: -1 },
        )
        // arms sway
        gsap.to('[data-arm-left]', {
          rotation: -7,
          svgOrigin: '66 142',
          duration: 1.9,
          ease: 'sine.inOut',
          yoyo: true,
          repeat: -1,
        })
        gsap.to('[data-arm-right]', {
          rotation: 5,
          svgOrigin: '134 142',
          duration: 2.2,
          ease: 'sine.inOut',
          yoyo: true,
          repeat: -1,
        })
        // chest LEDs
        gsap.to('[data-dot]', {
          opacity: 0.15,
          duration: 0.55,
          ease: 'sine.inOut',
          yoyo: true,
          repeat: -1,
          stagger: 0.28,
        })
      })
      return () => mm.revert()
    }, root)
    return () => ctx.revert()
  }, [])

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const q = gsap.utils.selector(root)
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    moodTweensRef.current.forEach((t) => t.kill())
    const tweens: gsap.core.Tween[] = []

    if (mood !== 'work') {
      // stop the ambient arm sway so the pose is not fought over
      gsap.killTweensOf([...q('[data-arm-left]'), ...q('[data-arm-right]')])
    }

    if (mood === 'cancel') {
      tweens.push(
        gsap.to(q('[data-eyes-open]'), { opacity: 0, duration: 0.15 }),
        gsap.to(q('[data-eyes-panic]'), { opacity: 0, duration: 0.15 }),
        gsap.to(q('[data-mouth-panic]'), { opacity: 0, duration: 0.15 }),
        gsap.to(q('[data-eyes-happy]'), { opacity: 1, duration: 0.2 }),
        gsap.to(q('[data-head]'), { rotation: -5, svgOrigin: '100 114', duration: 0.4, ease: 'back.out(2)' }),
        gsap.to(q('[data-arm-left]'), { rotation: 26, svgOrigin: '66 142', duration: 0.5, ease: 'power2.out' }),
        gsap.to(q('[data-arm-right]'), { rotation: -20, svgOrigin: '134 142', duration: 0.5, ease: 'power2.out' }),
      )
    } else if (mood === 'panic') {
      tweens.push(
        gsap.to(q('[data-eyes-open]'), { opacity: 0, duration: 0.1 }),
        gsap.to(q('[data-eyes-happy]'), { opacity: 0, duration: 0.1 }),
        gsap.to(q('[data-eyes-panic]'), { opacity: 1, scale: 1, transformOrigin: '50% 50%', duration: 0.2, ease: 'back.out(3)' }),
        gsap.to(q('[data-mouth-panic]'), { opacity: 1, duration: 0.25 }),
        // hands fly up to grab the head
        gsap.to(q('[data-arm-left]'), { rotation: 104, svgOrigin: '68 142', duration: 0.45, ease: 'back.out(1.6)' }),
        gsap.to(q('[data-arm-right]'), { rotation: -104, svgOrigin: '132 142', duration: 0.45, ease: 'back.out(1.6)' }),
        // status lights go red
        gsap.to(q('[data-antenna-ball]'), { fill: '#da291c', duration: 0.3 }),
        gsap.to(q('[data-antenna-halo]'), { stroke: '#da291c', duration: 0.3 }),
        gsap.to(q('[data-dot]'), { fill: '#da291c', duration: 0.3 }),
      )
      if (!reduceMotion) {
        tweens.push(
          gsap.to(q('[data-head]'), { rotation: 2.5, svgOrigin: '100 114', duration: 0.09, yoyo: true, repeat: -1, ease: 'none' }),
          gsap.to(q('[data-float]'), { x: 1.8, duration: 0.07, yoyo: true, repeat: -1, ease: 'none' }),
        )
        q('[data-sweat]').forEach((el, i) => {
          tweens.push(
            gsap.fromTo(
              el,
              { opacity: 0, y: 0 },
              { opacity: 0.9, y: 15, duration: 0.9, repeat: -1, delay: i * 0.45, ease: 'power1.in' },
            ),
          )
        })
      } else {
        tweens.push(gsap.to(q('[data-sweat]'), { opacity: 0.8, duration: 0.3 }))
      }
    } else {
      tweens.push(
        gsap.to(q('[data-eyes-open]'), { opacity: 1, duration: 0.15 }),
        gsap.to(q('[data-eyes-happy]'), { opacity: 0, duration: 0.15 }),
        gsap.to(q('[data-eyes-panic]'), { opacity: 0, duration: 0.15 }),
        gsap.to(q('[data-mouth-panic]'), { opacity: 0, duration: 0.15 }),
        gsap.to(q('[data-head]'), { rotation: 0, svgOrigin: '100 114', duration: 0.4, ease: 'back.out(2)' }),
        gsap.to(q('[data-arm-left]'), { rotation: 0, svgOrigin: '66 142', duration: 0.5, ease: 'power2.out' }),
        gsap.to(q('[data-arm-right]'), { rotation: 0, svgOrigin: '134 142', duration: 0.5, ease: 'power2.out' }),
      )
    }
    moodTweensRef.current = tweens
  }, [mood])

  return (
    <svg ref={rootRef} viewBox="0 0 200 220" className={className} role="img" aria-label="Agent AI Dentons">
      <defs>
        <linearGradient id="agent-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#702082" />
          <stop offset="100%" stopColor="#3c1053" />
        </linearGradient>
        <linearGradient id="agent-head" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#8a3ba0" />
          <stop offset="100%" stopColor="#5f2167" />
        </linearGradient>
        <linearGradient id="agent-hat" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f9cd60" />
          <stop offset="100%" stopColor="#e5a71e" />
        </linearGradient>
      </defs>

      <ellipse data-shadow cx="100" cy="207" rx="44" ry="7" fill="#000" opacity="0.32" />

      <g data-float>
        {/* arms behind the body */}
        <g data-arm-left>
          <path d="M68 142 Q52 147 47 158" stroke="#4a1859" strokeWidth="9" strokeLinecap="round" fill="none" />
          {/* magnifying glass */}
          <circle cx="44" cy="167" r="11.5" fill="rgba(160,94,181,0.16)" stroke="#f1b434" strokeWidth="2.6" />
          <path d="M38.5 162.5 A7.5 7.5 0 0 1 44 160" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" opacity="0.65" fill="none" />
          <line x1="52" y1="176" x2="59" y2="184" stroke="#f1b434" strokeWidth="3.6" strokeLinecap="round" />
        </g>
        <g data-arm-right>
          <path d="M132 142 Q148 147 152 157" stroke="#4a1859" strokeWidth="9" strokeLinecap="round" fill="none" />
          {/* clipboard */}
          <g transform="rotate(7 158 166)">
            <rect x="146" y="150" width="25" height="33" rx="3" fill="#fbfafd" stroke="#c7c9c7" strokeWidth="1" />
            <rect x="153.5" y="146.5" width="10" height="6" rx="2" fill="#f1b434" />
            <line x1="151" y1="159" x2="166" y2="159" stroke="#a05eb5" strokeWidth="1.6" opacity="0.65" />
            <line x1="151" y1="165" x2="166" y2="165" stroke="#a05eb5" strokeWidth="1.6" opacity="0.65" />
            <line x1="151" y1="171" x2="161" y2="171" stroke="#a05eb5" strokeWidth="1.6" opacity="0.65" />
            <path d="M151 176 l3 3 l6 -6" stroke="#00a499" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </g>
        </g>

        {/* body */}
        <rect x="62" y="122" width="76" height="62" rx="24" fill="url(#agent-body)" stroke="rgba(255,255,255,0.22)" strokeWidth="1.2" />
        <rect x="82" y="140" width="36" height="22" rx="6" fill="#140820" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
        <circle data-dot cx="92" cy="151" r="2.6" fill="#00a499" />
        <circle data-dot cx="100" cy="151" r="2.6" fill="#f1b434" />
        <circle data-dot cx="108" cy="151" r="2.6" fill="#a05eb5" />

        {/* head */}
        <g data-head>
          <rect x="93" y="110" width="14" height="14" rx="4" fill="#3c1053" />
          <rect x="50" y="74" width="9" height="20" rx="4.5" fill="#3c1053" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
          <rect x="141" y="74" width="9" height="20" rx="4.5" fill="#3c1053" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
          <rect x="57" y="56" width="86" height="58" rx="22" fill="url(#agent-head)" stroke="rgba(255,255,255,0.25)" strokeWidth="1.2" />
          <rect x="67" y="70" width="66" height="34" rx="15" fill="#10061a" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />

          <g data-eyes-open>
            <ellipse data-eye cx="86" cy="87" rx="5.5" ry="8" fill="#f1b434" />
            <circle cx="88" cy="83.5" r="1.8" fill="#fff" opacity="0.85" />
            <ellipse data-eye cx="114" cy="87" rx="5.5" ry="8" fill="#f1b434" />
            <circle cx="116" cy="83.5" r="1.8" fill="#fff" opacity="0.85" />
          </g>
          <g data-eyes-happy opacity="0">
            <path d="M79 89 Q86 80 93 89" stroke="#f1b434" strokeWidth="3" strokeLinecap="round" fill="none" />
            <path d="M107 89 Q114 80 121 89" stroke="#f1b434" strokeWidth="3" strokeLinecap="round" fill="none" />
          </g>
          {/* terrified: the same gold idle eyes, just huge and wide open */}
          <g data-eyes-panic opacity="0">
            <ellipse cx="86" cy="87" rx="7.6" ry="10.6" fill="#f1b434" />
            <circle cx="88.8" cy="81.8" r="2.3" fill="#fff" opacity="0.85" />
            <ellipse cx="114" cy="87" rx="7.6" ry="10.6" fill="#f1b434" />
            <circle cx="116.8" cy="81.8" r="2.3" fill="#fff" opacity="0.85" />
          </g>
          <ellipse data-mouth-panic cx="100" cy="98.5" rx="4.2" ry="3" fill="#fff" opacity="0" />
          <path data-sweat d="M57 64 q4.5 6.5 0 10.5 q-4.5 -4 0 -10.5" fill="#8fd9ec" opacity="0" />
          <path data-sweat d="M143 60 q4.5 6.5 0 10.5 q-4.5 -4 0 -10.5" fill="#8fd9ec" opacity="0" />

          {/* hard hat */}
          <g data-hat>
            <line x1="127" y1="42" x2="131" y2="22" stroke="#c7c9c7" strokeWidth="1.6" strokeLinecap="round" />
            <circle data-antenna-halo cx="132" cy="17" r="8" fill="none" stroke="#00a499" strokeWidth="1.5" opacity="0.4" />
            <circle data-antenna-ball cx="132" cy="17" r="4.6" fill="#00a499" />
            <path d="M62 58 Q64 34 100 32 Q136 34 138 58 Z" fill="url(#agent-hat)" stroke="rgba(120,80,0,0.35)" strokeWidth="1" />
            <rect x="93" y="27" width="14" height="10" rx="4" fill="#f1b434" />
            <rect x="52" y="55" width="96" height="9" rx="4.5" fill="#f1b434" stroke="rgba(120,80,0,0.25)" strokeWidth="1" />
            <rect x="91" y="39" width="18" height="14" rx="3" fill="#3c1053" />
            <text x="100" y="50" textAnchor="middle" fontSize="10.5" fontWeight="700" fill="#fff" fontFamily="inherit">
              D
            </text>
          </g>
        </g>
      </g>
    </svg>
  )
}
