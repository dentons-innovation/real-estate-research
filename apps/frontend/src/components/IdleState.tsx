import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { useI18n } from '../lib/i18n'

export default function IdleState() {
  const { t } = useI18n()
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.from('[data-hero-item]', {
        opacity: 0,
        y: 22,
        duration: 0.8,
        ease: 'power3.out',
        stagger: 0.09,
        clearProps: 'all',
      })
      gsap.from('[data-corner]', {
        scale: 0,
        opacity: 0,
        duration: 0.6,
        delay: 0.5,
        ease: 'back.out(2)',
        stagger: 0.07,
        clearProps: 'all',
      })
    }, rootRef)
    return () => ctx.revert()
  }, [])

  return (
    <div ref={rootRef} className="flex flex-1 items-center justify-center px-6 py-10 lg:px-12">
      <div className="relative max-w-2xl text-center">
        {/* blueprint corner marks */}
        <span data-corner className="absolute -top-8 -left-8 hidden h-5 w-5 border-t border-l border-den-gold/50 sm:block" />
        <span data-corner className="absolute -top-8 -right-8 hidden h-5 w-5 border-t border-r border-den-gold/50 sm:block" />
        <span data-corner className="absolute -bottom-8 -left-8 hidden h-5 w-5 border-b border-l border-den-gold/50 sm:block" />
        <span data-corner className="absolute -right-8 -bottom-8 hidden h-5 w-5 border-b border-r border-den-gold/50 sm:block" />

        <p data-hero-item className="font-mono text-[11px] tracking-[0.34em] text-den-gold/85 uppercase">
          {t.idleEyebrow}
        </p>

        <h1 data-hero-item className="mt-5 text-4xl leading-[1.08] font-light tracking-tight text-white sm:text-5xl lg:text-[3.4rem]">
          {t.idleTitlePre}{' '}
          <span className="bg-gradient-to-r from-den-light to-den-gold bg-clip-text font-normal text-transparent">
            {t.idleTitleAccent}
          </span>
        </h1>

        <p data-hero-item className="mx-auto mt-6 max-w-xl text-[15px] leading-relaxed text-white/60">
          {t.idleDescription}
        </p>

        <div data-hero-item className="mt-8 flex flex-wrap items-center justify-center gap-2">
          {t.idleCapabilities.map((c) => (
            <span
              key={c}
              className="glass rounded-full px-3.5 py-1.5 font-mono text-[11px] tracking-[0.12em] text-white/55"
            >
              {c}
            </span>
          ))}
        </div>

        <div data-hero-item className="mt-12 inline-flex items-center gap-3 text-sm text-white/45">
          <svg className="h-4 w-4 text-den-gold/70 max-lg:-rotate-90" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M10 3 L4 8 L10 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {t.idleHintPre}{' '}
          <span className="font-medium text-white/75">{t.idleHintButton}</span>
        </div>
      </div>
    </div>
  )
}
