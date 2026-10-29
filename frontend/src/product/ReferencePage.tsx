import { useEffect, useRef, useState } from 'react'
import { api, currentSessionVersion } from './api'
import type { Folder } from './api'
import { messageOf } from './shared'
import { referralToken, setReferralToken } from './qr-intent'
import { ProductLink } from './navigation'

export function QrPage({ signedIn, canRedeem, folders, onRedeemed }: { signedIn: boolean; canRedeem: boolean; folders: Folder[]; onRedeemed: () => void }) {
  const [token, setToken] = useState(referralToken ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const inFlight = useRef(false)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const redeem = async (value: string) => {
    if (!value || !signedIn || !canRedeem || inFlight.current) return
    inFlight.current = true
    const version = currentSessionVersion()
    const current = () => mounted.current && version === currentSessionVersion()
    setBusy(true); setError(''); setNotice('')
    try {
      await api('/api/v1/referrals/redeem/', { method: 'POST', body: { token: value } })
      if (!current()) return
      setReferralToken(null); setToken(''); setNotice('La referencia se vinculó a tu cuenta.')
    } catch (caught) {
      if (current()) setError(messageOf(caught))
      return
    } finally {
      inFlight.current = false
      if (current()) setBusy(false)
    }
    if (current()) onRedeemed()
  }
  return <main id="contenido" className="qr-page page-container client-qr-page">
    <div className="qr-copy"><p className="eyebrow">TUS RECOMENDACIONES</p><h1>Una referencia abre nuevas puertas.</h1>
      <p>El QR de un colaborador habilita el acceso a su carpeta privada de recomendaciones. No acredita una visita por sí solo.</p>
      <ol className="client-qr-steps" aria-label="Pasos para abrir recomendaciones">
        <li><strong>1. QR de colaborador</strong><span>Recibí el enlace o pegá su código.</span></li>
        <li aria-current={!signedIn ? 'step' : undefined}><strong>2. Tu cuenta Cliente</strong><span>Ingresá o creá tu cuenta conservando este QR.</span></li>
        <li aria-current={signedIn ? 'step' : undefined}><strong>3. Carpeta privada</strong><span>Abrí las recomendaciones habilitadas.</span></li>
      </ol>
      <div className="qr-hint"><span aria-hidden="true">✳</span><div><strong>¿Todavía no tenés cuenta?</strong><p>Creala desde el enlace de registro del mismo QR. La referencia se conserva durante ese paso.</p><ProductLink href="/registro">Crear cuenta con este QR</ProductLink><br /><ProductLink href="/ingresar">Ya tengo cuenta</ProductLink></div></div>
    </div>
    {canRedeem ? <form className="qr-form" aria-busy={busy} onSubmit={event => { event.preventDefault(); void redeem(token.trim()) }}>
      <div className="qr-symbol" aria-hidden="true">⌑</div><h2>Abrí tu carpeta</h2>
      <label htmlFor="referral-token">Código de referencia</label><input id="referral-token" value={token} disabled={busy} onChange={event => { if (inFlight.current) return; const value = event.target.value; setToken(value); setReferralToken(value || null); setNotice('') }} autoComplete="off" aria-invalid={!!error} placeholder="Escaneá un QR o pegá su token" aria-describedby="reference-help" />
      <p id="reference-help" className="form-help">Este QR abre recomendaciones; no acredita visitas ni créditos.</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      {notice && <div className="form-success" role="status"><p>{notice}</p><ProductLink href="/recomendaciones">Explorar recomendaciones →</ProductLink></div>}
      {!signedIn && <p className="form-help">Ingresá para vincular la referencia a tu cuenta.</p>}
      <button className="button button-orange form-submit" disabled={busy || !signedIn || !token.trim()}>{busy ? 'Validando…' : signedIn ? 'Abrir recomendaciones' : 'Iniciá sesión para continuar'}</button>
      {folders.length > 0 && <ProductLink className="inline-link" href="/recomendaciones">Ver mis carpetas actuales →</ProductLink>}
    </form> : <section className="qr-form"><div className="qr-symbol" aria-hidden="true">⌑</div><h2>Ingresá como Cliente</h2><p>La vinculación de referencias está disponible para cuentas Cliente.</p><ProductLink className="button button-orange form-submit" href="/beneficios">Explorar beneficios</ProductLink></section>}
  </main>
}
