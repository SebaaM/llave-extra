import { useState } from 'react'
import type { FormEvent } from 'react'
import { api, AuthCoordinationError, authenticate, register } from './api'
import type { User } from './api'
import { messageOf } from './shared'
import { resetToken, setReferralToken, setResetToken } from './qr-intent'
import { ProductLink } from './navigation'

export function Auth({ mode, referral, onLogin, onLoginStart, onRegistered }: { mode: 'login' | 'register' | 'forgot' | 'reset'; referral?: string | null; onLogin: (user: User) => void; onLoginStart?: () => void; onRegistered: (email: string) => void }) {
  const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false), [notice, setNotice] = useState('')
  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault(); setError(''); setNotice(''); setBusy(true)
    try {
      if (mode === 'login') {
        onLoginStart?.()
        onLogin(await authenticate(email, password))
      }
      else if (mode === 'register') { await register(email, password, referral ?? undefined); setReferralToken(null); onRegistered(email) }
      else if (mode === 'forgot') { await api('/api/v1/auth/forgot-password/', { method: 'POST', auth: false, body: { email } }); setNotice('Si corresponde, recibirás un email con los pasos para continuar.') }
      else if (resetToken) { await api('/api/v1/auth/reset-password/', { method: 'POST', auth: false, body: { token: resetToken, password } }); setResetToken(null); setNotice('La contraseña se actualizó. Ya podés ingresar.') }
    } catch (caught) { setError(caught instanceof AuthCoordinationError ? caught.message : messageOf(caught)) } finally { setBusy(false) }
  }
  const title = mode === 'register' ? 'Creá tu cuenta' : mode === 'login' ? 'Qué bueno verte' : mode === 'forgot' ? 'Recuperá tu acceso' : 'Elegí una nueva contraseña'
  return <main id="contenido" className="product-auth"><div className="auth-art"><span>LLAVE EXTRA / USHUAIA</span><div>✳</div><p>Tu próxima buena historia empieza acá.</p><small>54°48′ S — 68°18′ O</small></div><section className="auth-panel"><ProductLink className="back-link" href="/">← Volver al inicio</ProductLink><p className="eyebrow">{mode === 'register' ? 'PARA QUIENES VIAJAN' : 'MI CUENTA'}</p><h1>{title}</h1><p>{mode === 'register' ? 'Creá tu cuenta de viajero. Te vamos a enviar un email para verificarla.' : mode === 'login' ? 'Ingresá para ver tus beneficios y tu viaje.' : mode === 'forgot' ? 'Ingresá tu email y te enviaremos instrucciones si corresponde.' : 'Usá una contraseña segura para proteger tu cuenta.'}</p>{referral && mode === 'register' && <p className="auth-referral-note">Este registro incluye el QR de un colaborador.</p>}{notice && <div className="form-success" role="status">{notice}</div>}<form onSubmit={handleSubmit} noValidate><label htmlFor="account-email">Email</label><input id="account-email" type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} />{mode !== 'forgot' && <><label htmlFor="account-password">Contraseña</label><input id="account-password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={8} value={password} onChange={event => setPassword(event.target.value)} /></>}{error && <p className="form-error" role="alert">{error}</p>}<button className="button button-orange form-submit" disabled={busy}>{busy ? 'Un momento…' : mode === 'register' ? 'Crear mi cuenta' : mode === 'login' ? 'Ingresar' : mode === 'forgot' ? 'Enviar instrucciones' : 'Actualizar contraseña'}</button></form><p className="auth-helper">{mode === 'register' ? <>¿Ya tenés cuenta? <ProductLink href="/ingresar">Ingresá</ProductLink></> : mode === 'login' ? <>¿Todavía no tenés cuenta? <ProductLink href="/registro">Crear mi cuenta</ProductLink><br /><ProductLink href="/recuperar">Olvidé mi contraseña</ProductLink></> : <ProductLink href="/ingresar">Volver a ingresar</ProductLink>}</p></section></main>
}
