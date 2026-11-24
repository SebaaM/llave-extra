<<<<<<< HEAD
import { useState } from 'react'
import { api } from './api'
import type { Folder } from './api'
import { messageOf } from './shared'
import { referralToken, setReferralToken } from './qr-intent'
import { ProductLink } from './navigation'

export function QrPage({ signedIn, canRedeem, folders, onRedeemed }: { signedIn: boolean; canRedeem: boolean; folders: Folder[]; onRedeemed: () => void }) {
  const [token, setToken] = useState(referralToken ?? ''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('')
  const redeem = async (value: string) => { if (!value || !signedIn) return; setBusy(true); setError(''); try { await api('/api/v1/referrals/redeem/', { method: 'POST', body: { token: value } }); setReferralToken(null); setToken(''); setNotice('La referencia se vinculó a tu cuenta.'); onRedeemed() } catch (caught) { setError(messageOf(caught)) } finally { setBusy(false) } }
  return <main id="contenido" className="qr-page page-container"><div className="qr-copy"><p className="eyebrow">TUS RECOMENDACIONES</p><h1>Una referencia abre nuevas puertas.</h1><p>El QR de un colaborador habilita el acceso a su carpeta privada de recomendaciones. No acredita una visita por sí solo.</p><div className="qr-hint"><span aria-hidden="true">✳</span><div><strong>¿Todavía no tenés cuenta?</strong><p>Creala desde el enlace de registro del mismo QR. La referencia se conserva durante ese paso.</p><ProductLink href="/registro">Crear cuenta con este QR</ProductLink><br /><ProductLink href="/ingresar">Ya tengo cuenta</ProductLink></div></div></div>{canRedeem ? <form className="qr-form" onSubmit={event => { event.preventDefault(); void redeem(token.trim()) }}><div className="qr-symbol" aria-hidden="true">⌑</div><label htmlFor="referral-token">Código de referencia</label><input id="referral-token" value={token} onChange={event => { const value = event.target.value; setToken(value); setReferralToken(value || null) }} autoComplete="off" aria-invalid={!!error} placeholder="Escaneá un QR o pegá su token" />{error && <p className="form-error" role="alert">{error}</p>}{notice && <p className="form-success" role="status">{notice}</p>}{!signedIn && <p className="form-help">Ingresá para vincular la referencia a tu cuenta.</p>}<button className="button button-orange form-submit" disabled={busy || !signedIn}>{busy ? 'Validando…' : signedIn ? 'Abrir recomendaciones' : 'Iniciá sesión para continuar'}</button>{folders.length > 0 && <a className="inline-link" href="/recomendaciones">Ver mis carpetas actuales →</a>}</form> : <section className="qr-form"><div className="qr-symbol" aria-hidden="true">⌑</div><h2>Ingresá como Cliente</h2><p>La vinculación de referencias está disponible para cuentas Cliente.</p><ProductLink className="button button-orange form-submit" href="/beneficios">Explorar beneficios</ProductLink></section>}</main>
=======
import type { QrCoordinator } from './useQrContext'
import { ProductLink } from './navigation'
import { QrSelection } from './QrSelection'

export function QrPage({ signedIn, canRedeem, coordinator }: { signedIn: boolean; canRedeem: boolean; coordinator: QrCoordinator }) {
  const { state, draftToken } = coordinator
  if (signedIn && canRedeem && (state.collaborator || state.status === 'loading')) return <QrSelection coordinator={coordinator} />
  return <main id="contenido" className="qr-page page-container client-qr-page">
    <div className="qr-copy"><p className="eyebrow">IDEAS PARA TU VISITA</p><h1>Recibí nuevas recomendaciones.</h1>
      <p>Abrí el QR que recibiste e ingresá a tu cuenta para ver los negocios y beneficios elegidos por quien te recomendó. Podés explorar el catálogo sin QR.</p>
      <ol className="client-qr-steps" aria-label="Pasos para abrir recomendaciones">
        <li><strong>1. QR de recomendaciones</strong><span>Recibí el enlace o pegá su código.</span></li>
        <li><strong>2. Tu cuenta Cliente</strong><span>Ingresá o creá tu cuenta conservando este QR.</span></li>
        <li><strong>3. Tu selección local</strong><span>Consultá los negocios, beneficios y condiciones vigentes.</span></li>
      </ol>
      {!signedIn && <div className="qr-hint"><span aria-hidden="true">✳</span><div><strong>¿Todavía no tenés cuenta?</strong><p>El QR se conserva mientras ingresás o creás tu cuenta.</p><ProductLink href="/registro">Crear cuenta con este QR</ProductLink><br /><ProductLink href="/ingresar">Ya tengo cuenta</ProductLink></div></div>}
    </div>
    {canRedeem ? <form className="qr-form" onSubmit={event => { event.preventDefault(); void coordinator.redeem(draftToken.trim()) }}>
      <div className="qr-symbol" aria-hidden="true">⌑</div><h2>Abrí las recomendaciones</h2>
      <label htmlFor="referral-token">Código de recomendaciones</label><input id="referral-token" value={draftToken} onChange={event => coordinator.changeToken(event.target.value)} autoComplete="off" aria-invalid={!!state.error} placeholder="Escaneá un QR o pegá su código" aria-describedby="reference-help" />
      <p id="reference-help" className="form-help">Este QR abre una selección; no acredita visitas ni créditos.</p>
      {state.error && <p className="form-error" role="alert">{state.error}</p>}
      {!signedIn && <p className="form-help">Ingresá para consultar esta selección.</p>}
      <button className="button button-orange form-submit" disabled={!signedIn || !draftToken.trim()}>{signedIn ? 'Abrir recomendaciones' : 'Iniciá sesión para continuar'}</button>
      <ProductLink className="inline-link" href="/beneficios">Explorar beneficios →</ProductLink>
    </form> : <section className="qr-form"><h2>Ingresá como Cliente</h2><p>Las recomendaciones recibidas están disponibles para cuentas Cliente.</p><ProductLink className="button button-orange" href="/beneficios">Explorar beneficios</ProductLink></section>}
  </main>
>>>>>>> develop
}
