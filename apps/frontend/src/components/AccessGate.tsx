import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import gsap from 'gsap'
import BackgroundScene from './BackgroundScene'
import logo from '../dentons_logo.png'
import { checkPassword, clearPassword, getPassword, setPassword, type AuthCheck } from '../lib/auth'
import { useI18n } from '../lib/i18n'

type GateState = 'checking' | 'locked' | 'open'

interface AccessGateProps {
  /** Rendered once access is confirmed; `onAuthError` sends the user back to the gate. */
  children: (onAuthError: () => void) => ReactNode
}

/**
 * Asks for the shared access password once per browser. The password is
 * verified by the backend; the app behind the gate is not rendered before that.
 */
export default function AccessGate({ children }: AccessGateProps) {
  const { lang, toggle, t } = useI18n()
  const [state, setState] = useState<GateState>('checking')
  const [value, setValue] = useState('')
  const [problem, setProblem] = useState<Exclude<AuthCheck, 'ok'> | null>(null)
  const [busy, setBusy] = useState(false)
  const cardRef = useRef<HTMLFormElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // first load: a stored password (or a backend that needs none) opens the app straight away
  useEffect(() => {
    let cancelled = false
    void checkPassword(getPassword()).then((result) => {
      if (cancelled) return
      if (result === 'ok') setState('open')
      else {
        if (result === 'unauthorized') clearPassword()
        // a missing password is not an error worth showing
        setProblem(result === 'unauthorized' ? null : result)
        setState('locked')
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (state !== 'locked' || !cardRef.current) return
    const ctx = gsap.context(() => {
      gsap.from('[data-gate-item]', { opacity: 0, y: 18, duration: 0.7, ease: 'power3.out', stagger: 0.08, clearProps: 'all' })
    }, cardRef)
    inputRef.current?.focus()
    return () => ctx.revert()
  }, [state])

  const handleSubmit = useCallback(
    async (event: FormEvent) => {
      event.preventDefault()
      const password = value.trim()
      if (!password || busy) return
      setBusy(true)
      const result = await checkPassword(password)
      setBusy(false)
      if (result === 'ok') {
        setPassword(password)
        setValue('')
        setProblem(null)
        setState('open')
        return
      }
      setProblem(result)
      if (cardRef.current) gsap.fromTo(cardRef.current, { x: -8 }, { x: 0, duration: 0.45, ease: 'elastic.out(1, 0.35)' })
      inputRef.current?.select()
    },
    [value, busy],
  )

  const handleAuthError = useCallback(() => {
    clearPassword()
    setProblem('unauthorized')
    setState('locked')
  }, [])

  if (state === 'open') return <>{children(handleAuthError)}</>

  const message =
    problem === 'unauthorized' ? t.gateWrongPassword : problem === 'locked' ? t.gateLocked : problem === 'unreachable' ? t.gateUnreachable : null

  return (
    <div className="relative flex min-h-screen items-center justify-center px-6 py-10">
      <BackgroundScene />
      {state === 'locked' && (
        <form ref={cardRef} onSubmit={handleSubmit} className="glass relative z-10 w-full max-w-sm rounded-2xl px-7 py-8" noValidate>
          <div data-gate-item className="flex items-start justify-between">
            <img src={logo} alt="Dentons" className="h-9 w-auto select-none" draggable={false} />
            <button
              type="button"
              onClick={toggle}
              title={lang === 'pl' ? 'Switch to English' : 'Przełącz na polski'}
              className="cursor-pointer rounded border border-white/15 px-1.5 py-0.5 font-mono text-[10px] text-den-gold/80 transition-colors hover:border-den-gold/60 hover:text-den-gold"
            >
              {lang.toUpperCase()}
            </button>
          </div>
          <p data-gate-item className="mt-2 font-mono text-[10px] tracking-[0.32em] text-den-grey/70 uppercase">
            {t.brandTagline}
          </p>

          <h1 data-gate-item className="mt-7 text-2xl font-light tracking-tight text-white">
            {t.gateTitle}
          </h1>
          <p data-gate-item className="mt-2 text-[13px] leading-relaxed text-white/55">
            {t.gateDescription}
          </p>

          <label data-gate-item className="mt-6 block">
            <span className="font-mono text-[10px] tracking-[0.28em] text-white/40 uppercase">{t.gateLabel}</span>
            <input
              ref={inputRef}
              type="password"
              name="password"
              autoComplete="current-password"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              aria-invalid={message !== null}
              aria-describedby={message ? 'gate-problem' : undefined}
              className="mt-2 w-full rounded-lg border border-white/15 bg-white/5 px-3.5 py-2.5 text-[15px] text-white transition-colors placeholder:text-white/25 hover:border-den-light/50 focus-visible:border-den-light focus-visible:outline-none"
            />
          </label>

          {message && (
            <p id="gate-problem" role="alert" className="mt-3 text-[13px] leading-snug text-red-300">
              {message}
            </p>
          )}

          <button
            data-gate-item
            type="submit"
            disabled={busy || value.trim() === ''}
            className="mt-6 w-full rounded-xl bg-gradient-to-r from-den-purple via-den-light to-den-purple bg-[length:200%_100%] bg-left px-4 py-3.5 text-[15px] font-semibold text-white shadow-glow-purple transition-all duration-500 hover:bg-right active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
          >
            {busy ? t.gateChecking : t.gateSubmit}
          </button>
        </form>
      )}
    </div>
  )
}
