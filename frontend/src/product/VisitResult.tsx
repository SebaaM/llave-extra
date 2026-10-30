import type { ConsumptionResult } from './api'
import { ProductLink } from './navigation'

export function VisitResult({ result }: { result: ConsumptionResult }) {
  const valid = result.state === 'VALID'
  return <section className={`client-visit-result${valid ? ' client-visit-result-valid' : ''}`} role="status" aria-live="polite">
    {valid ? <>
      <div className="client-result-stamp" aria-hidden="true">✓</div>
      <p className="eyebrow">UN NUEVO SELLO EN TU VIAJE</p><h2>Visita verificada</h2>
      <p className="client-result-award">{result.award.toLocaleString('es-AR')} créditos acreditados</p>
      {result.award === 0 && <p>Tu visita quedó registrada con una acreditación de 0 créditos.</p>}
      <dl><dt>Saldo confirmado</dt><dd>{result.balance.toLocaleString('es-AR')} créditos</dd></dl>
    </> : <>
      <div className="qr-symbol" aria-hidden="true">ⓘ</div><h2>Resultado de tu visita</h2>
      <p>{result.state === 'ANNULLED' ? 'Visita anulada' : `Estado recibido: ${result.state}`}</p>
      <p>Consultá el estado actualizado en Mi viaje.</p>
    </>}
    <ProductLink className="button button-dark" href="/mi-viaje">Ver Mi viaje →</ProductLink>
  </section>
}
