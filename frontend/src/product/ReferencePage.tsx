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
}
