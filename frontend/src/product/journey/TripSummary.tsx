import type { Progress, Wallet } from '../api'
import { ProductLink } from '../navigation'

export function TripSummary({ wallet, progress }: { wallet: Wallet | null; progress: Progress | null }) {
  return <section className="client-trip-summary" aria-label="Resumen de Mi viaje">
    <h3>Tu viaje hasta ahora</h3>
    {wallet && progress ? <>
      <dl><div><dt>Visitas verificadas</dt><dd>{progress.total}</dd></div><div><dt>Meta vigente</dt><dd>{progress.target}</dd></div><div><dt>Créditos disponibles</dt><dd>{wallet.balance}</dd></div></dl>
      {progress.completed && <p>Alcanzaste la meta vigente.</p>}
      {wallet.redemptions_frozen && <p>Los canjes están en revisión.</p>}
    </> : <p>Consultá tus visitas y créditos en Mi viaje.</p>}
    <ProductLink className="inline-link" href="/mi-viaje">Entrar a Mi viaje →</ProductLink>
  </section>
}
