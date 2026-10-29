import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { api, AuthCoordinationError, authenticate, register } from './api'
import type { User } from './api'
import { messageOf } from './shared'
import { resetToken, setReferralToken, setResetToken } from './qr-intent'
import { ProductLink } from './navigation'
import { PasswordField } from './ui/PasswordField'

export function Auth({ mode, referral, onLogin, onLoginStart, onRegistered }: { mode: 'login' | 'register' | 'forgot' | 'reset'; referral?: string | null; onLogin: (user: User) => void; onLoginStart?: () => void; onRegistered: (email: string) => void }) {
  const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false), [notice, setNotice] = useState('')
  const [emailError, setEmailError] = useState('')
  const submitting = useRef(false)
  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (submitting.current) return
    setError(''); setNotice(''); setEmailError('')
    const form = event.currentTarget as HTMLFormElement
    const emailInput = form.querySelector<HTMLInputElement>('#account-email')
    if (emailInput && !emailInput.validity.valid) {
      setEmailError('Ingresá un email válido para continuar.')
      emailInput.focus()
      return
    }
    const passwordInput = form.querySelector<HTMLInputElement>('#account-password')
    if (passwordInput && !password) {
      setError('Ingresá tu contraseña para continuar.')
      passwordInput.focus()
      return
    }
    submitting.current = true
    setBusy(true)
    try {
      if (mode === 'login') {
        onLoginStart?.()
        onLogin(await authenticate(email, password))
      }
      else if (mode === 'register') { await register(email, password, referral ?? undefined); setReferralToken(null); onRegistered(email) }
      else if (mode === 'forgot') { await api('/api/v1/auth/forgot-password/', { method: 'POST', auth: false, body: { email } }); setNotice('Si corresponde, recibirás un email con los pasos para continuar.') }
      else if (resetToken) { await api('/api/v1/auth/reset-password/', { method: 'POST', auth: false, body: { token: resetToken, password } }); setResetToken(null); setNotice('La contraseña se actualizó. Ya podés ingresar.') }
    } catch (caught) { setError(caught instanceof AuthCoordinationError ? caught.message : messageOf(caught)) } finally { submitting.current = false; setBusy(false) }
  }
  const title = mode === 'register' ? 'Creá tu cuenta' : mode === 'login' ? 'Qué bueno verte' : mode === 'forgot' ? 'Recuperá tu acceso' : 'Elegí una nueva contraseña'
  return <main id="contenido" className="product-auth client-auth-page"><div className="auth-art"><span>LLAVE EXTRA / USHUAIA</span><div>✳</div><p>Tu próxima buena historia empieza acá.</p><small>54°48′ S — 68°18′ O</small></div><section className="auth-panel"><ProductLink className="back-link" href="/">← Volver al inicio</ProductLink><p className="eyebrow">{mode === 'register' ? 'PARA QUIENES VIAJAN' : 'MI CUENTA'}</p><h1>{title}</h1><p>{mode === 'register' ? 'Creá tu cuenta de Cliente. Te vamos a enviar un email para verificarla.' : mode === 'login' ? 'Ingresá para ver tus beneficios y tu viaje.' : mode === 'forgot' ? 'Ingresá tu email y te enviaremos instrucciones si corresponde.' : 'Usá una contraseña segura para proteger tu cuenta.'}</p>{referral && mode === 'register' && <p className="auth-referral-note">Este registro incluye el QR de un colaborador.</p>}{notice && <div className="form-success" role="status">{notice}</div>}<form onSubmit={handleSubmit} noValidate>{mode !== 'reset' && <><label htmlFor="account-email">Email</label><input id="account-email" type="email" autoComplete="email" required value={email} disabled={busy} aria-invalid={emailError ? true : undefined} aria-describedby={emailError ? 'account-email-error' : undefined} onChange={event => { setEmail(event.target.value); setEmailError('') }} />{emailError && <p id="account-email-error" className="form-error" role="alert">{emailError}</p>}</>}{mode !== 'forgot' && <PasswordField id="account-password" label="Contraseña" value={password} onChange={setPassword} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} disabled={busy} />}{error && <p className="form-error" role="alert">{error}</p>}<button className="button button-orange form-submit" disabled={busy}>{busy ? 'Un momento…' : mode === 'register' ? 'Crear mi cuenta' : mode === 'login' ? 'Ingresar' : mode === 'forgot' ? 'Enviar instrucciones' : 'Actualizar contraseña'}</button></form><p className="auth-helper">{mode === 'register' ? <>¿Ya tenés cuenta? <ProductLink href="/ingresar">Ingresá</ProductLink></> : mode === 'login' ? <>¿Todavía no tenés cuenta? <ProductLink href="/registro">Crear mi cuenta</ProductLink><br /><ProductLink href="/recuperar">Olvidé mi contraseña</ProductLink></> : <ProductLink href="/ingresar">Volver a ingresar</ProductLink>}</p></section></main>
}
