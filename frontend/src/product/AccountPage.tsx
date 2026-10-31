import { useRef, useState } from 'react'
import type { User } from './api'
import { ProductLink } from './navigation'
import { messageOf } from './shared'

export function AccountPage({ user, notice, onResend }: { user: User; notice: string; onResend: () => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const sending = useRef(false)
  async function resend() {
    if (sending.current) return
    sending.current = true
    setBusy(true)
    setError('')
    try { await onResend() }
    catch (caught) { setError(messageOf(caught)) }
    finally { sending.current = false; setBusy(false) }
  }
  return <main id="contenido" className="content-width client-account-page">
    <section className="client-account-passport">
      <span className="client-account-mark" aria-hidden="true">✳</span>
      <p className="eyebrow">MI CUENTA / LLAVE EXTRA</p>
      <h1>{user.email}</h1>
      <p className="client-account-verification"><span aria-hidden="true">{user.email_verified ? '✓' : '◷'}</span> Email {user.email_verified ? 'verificado' : 'pendiente de verificación'}</p>
      <p>{user.email_verified ? 'Tu cuenta está lista para seguir recorriendo la red.' : 'Verificá tu email para validar visitas y sumar créditos a tu viaje.'}</p>
      {!user.email_verified && <button className="button button-orange" disabled={busy} onClick={() => void resend()}>{busy ? 'Enviando…' : 'Reenviar email de verificación'}</button>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      <ProductLink className="button button-dark" href="/mi-viaje">Ver Mi viaje</ProductLink>
    </section>
  </main>
}
