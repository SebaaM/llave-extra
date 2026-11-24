import { useState } from 'react'
import type { Consumption, Progress, Wallet } from './api'
import { ProductLink } from './navigation'
import { Passport } from './journey/Passport'

export function Trip({ wallet, progress, history, onRefresh }: { wallet: Wallet | null; progress: Progress | null; history: Consumption[]; onRefresh: () => void }) {
  const [mode, setMode] = useState<'passport' | 'history'>('passport')
  const validProgress = progress !== null && Number.isInteger(progress.total) && progress.total >= 0
    && Number.isInteger(progress.target) && progress.target > 0
  const remaining = validProgress ? Math.max(progress.target - progress.total, 0) : null

  return <main id="contenido" className="trip-page client-trip"><div className="content-width">
    <div className="trip-heading">
      <div><p className="eyebrow">MI VIAJE / USHUAIA</p><h1>Tu pasaporte local.</h1><p>Los sellos de tus visitas verificadas, en un solo lugar.</p></div>
      <div className="trip-stamp" aria-hidden="true"><span>LLAVE EXTRA</span><strong>✳</strong><small>USHUAIA</small></div>
    </div>
    <div className="trip-stats">
      <section className="trip-balance" aria-label="Créditos disponibles">
        <span>CRÉDITOS DISPONIBLES</span><strong>{wallet?.balance.toLocaleString('es-AR') ?? '—'}</strong>
        <p>{!wallet ? 'Saldo todavía no disponible.' : wallet.redemptions_frozen ? 'El uso de créditos está pausado mientras se revisa tu cuenta.' : 'Créditos listos para usar.'}</p>
        <ProductLink href="/tienda" className="trip-shop-link">Explorar la tienda · Vista previa →</ProductLink>
      </section>
      <section className="trip-progress" aria-label="Visitas válidas">
        <span>VISITAS VÁLIDAS</span><strong>{progress?.total ?? '—'} <small>/ {progress?.target ?? '—'}</small></strong>
        {validProgress ? <>
          <progress aria-label="Progreso de visitas válidas" aria-valuetext={`${progress.total} visitas válidas; meta actual ${progress.target}.`} value={progress.total} max={progress.target} />
          <p>{progress.completed ? 'Llegaste a la meta actual.' : `Progreso hacia la meta actual: ${progress.total} de ${progress.target}.`}</p>
          <p>{remaining === 1 ? 'Te falta 1 visita para la meta actual.' : `Te faltan ${remaining} visitas para la meta actual.`}</p>
        </> : <p>Progreso todavía no disponible.</p>}
        <p>Gastar créditos no borra tus visitas.</p>
      </section>
    </div>
    <section aria-labelledby="client-trip-visits">
      <div className="trip-history-head">
        <div><h2 id="client-trip-visits">Sellos de tu viaje</h2><p>Solo las visitas válidas cuentan para el progreso.</p></div>
        <button type="button" className="button button-ghost" onClick={onRefresh}>Actualizar</button>
      </div>
      <div className="client-trip-modes" role="group" aria-label="Vista de tus visitas">
        <button type="button" aria-pressed={mode === 'passport'} aria-controls="client-trip-records" onClick={() => setMode('passport')}>Pasaporte</button>
        <button type="button" aria-pressed={mode === 'history'} aria-controls="client-trip-records" onClick={() => setMode('history')}>Historial</button>
      </div>
      {history.length > 0 && <p className="client-trip-name-note">Los nombres de los comercios son los actuales.</p>}
      <div id="client-trip-records" className={mode === 'history' ? 'client-trip-history' : 'client-trip-passport'}>
        {history.length ? <Passport history={history} /> : <div className="product-empty">
          <span aria-hidden="true">✳</span><h2>Tu primer sello todavía no llegó.</h2>
          <p>Cuando registres una visita que cumpla las condiciones del beneficio, vas a encontrarla acá.</p>
          <ProductLink className="button button-dark" href="/beneficios">Ver mis beneficios</ProductLink>
        </div>}
      </div>
    </section>
  </div></main>
}
