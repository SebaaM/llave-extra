import { useCallback, useState } from 'react'
import { api } from '../api'
import { localDateTime, pesos } from '../commission-data'
import { useResource } from './hooks'
import '../commissions.css'
import './collaborator-commissions.css'

type Item = {
  id: string
  created_at: string
  provider_name: string
  benefit_title: string | null
  state: string
  rate: string | null
  approved_amount: string | null
  payment_reported: boolean
}
type Page = { count: number; next: string | null; previous: string | null; pending_total: string; results: Item[] }
const labels: Record<string, string> = {
  AWAITING_PROVIDER: 'A la espera del Prestador', TO_PAY: 'Pendiente de pago', COMPLETED: 'Cerrada',
  NO_COMMISSION: 'Sin comisión', ANNULLED: 'Anulada', HISTORICAL: 'Histórica', DEMO: 'Demostración',
}

export function CollaboratorCommissions() {
  const [page, setPage] = useState(1)
  const load = useCallback((signal: AbortSignal) => api<Page>(`/api/v1/collaborator/commissions/?page=${page}`, { signal }), [page])
  const { data, error, loading, reload } = useResource(load)
  return <section className="commission-page collaborator-commissions">
    <p className="commission-muted">Consultá las comisiones generadas por los consumos que llegaron desde tus recomendaciones.</p>
    {loading && <p role="status">Cargando tus comisiones…</p>}
    {error && <div role="alert" className="commission-feedback"><p>{error}</p><button className="button button-dark" onClick={reload}>Volver a intentar</button></div>}
    {data && <>
      <section className="commission-card collaborator-pending-total" aria-label="Total pendiente">
        <div><h2>Pendiente de cobro</h2><p>Comisiones aprobadas que todavía no se conciliaron.</p></div>
        <strong>{pesos.format(Number(data.pending_total))}</strong>
      </section>
      {data.results.length === 0 ? <p>No hay consumos referidos en tu historial.</p> : <div className="commission-list">
        {data.results.map(item => <article className="commission-card collaborator-commission-row" key={item.id}>
          <div className="collaborator-commission-title"><strong>{item.benefit_title || 'Beneficio no registrado'}</strong><span>{item.provider_name}</span></div>
          <div className="collaborator-commission-meta"><span>Validado el <time dateTime={item.created_at}>{localDateTime(item.created_at)}</time></span>
            <strong className={`commission-state state-${item.state.toLowerCase()}`}>{item.state === 'TO_PAY' && item.approved_amount == null ? 'Pendiente de aprobación' : labels[item.state] || item.state}</strong></div>
          <dl className="commission-facts">
            <div><dt>Comisión aprobada</dt><dd>{item.approved_amount == null ? 'Aún sin aprobar' : pesos.format(Number(item.approved_amount))}</dd></div>
            <div><dt>Tasa aplicada</dt><dd>{item.rate == null ? 'Sin dato histórico' : `${item.rate} %`}</dd></div>
            {item.state === 'TO_PAY' && item.payment_reported && <div><dt>Pago</dt><dd>Informado, pendiente de conciliación</dd></div>}
          </dl>
        </article>)}
      </div>}
      <nav className="commission-pagination" aria-label="Paginación de comisiones">
        <span>{data.count} {data.count === 1 ? 'consumo' : 'consumos'}</span>
        <button type="button" className="button button-ghost" disabled={loading || !data.previous} onClick={() => setPage(value => Math.max(1, value - 1))}>Anterior</button>
        <span>Página {page}</span>
        <button type="button" className="button button-ghost" disabled={loading || !data.next} onClick={() => setPage(value => value + 1)}>Siguiente</button>
      </nav>
    </>}
  </section>
}
