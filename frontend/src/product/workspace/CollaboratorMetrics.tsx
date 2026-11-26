import { useCallback, useState } from 'react'
import { api, ApiError } from '../api'
import { ProductLink } from '../navigation'
import { useResource } from './hooks'

type CollaboratorBusinessVisit = {
  provider_id: string
  provider_name: string
  visits: number
}

type CollaboratorVisitsReport = {
  period: {
    from: string
    to: string
    timezone: string
  }
  linked_clients: {
    status: 'available' | 'unavailable'
    value: number | null
  }
  valid_attributed_visits: number
  businesses: {
    count: number
    page: number
    page_size: number
    results: CollaboratorBusinessVisit[]
  }
  other_business_visits: number
}

type CollaboratorVisitsPeriod = {
  from: string
  to: string
}

const COLLABORATOR_VISITS_ENDPOINT = '/api/v1/collaborator/analytics/visits/'

async function loadCollaboratorVisits(
  page: number,
  period: CollaboratorVisitsPeriod | null,
  signal: AbortSignal,
): Promise<CollaboratorVisitsReport | null> {
  try {
    const params = new URLSearchParams()
    if (period) {
      params.set('from', period.from)
      params.set('to', period.to)
    }
    if (page > 1) params.set('page', String(page))
    const query = params.toString()
    return await api<CollaboratorVisitsReport>(COLLABORATOR_VISITS_ENDPOINT + (query ? '?' + query : ''), { signal })
  } catch (error) {
    if (error instanceof ApiError && [401, 403, 404].includes(error.status)) return null
    throw error
  }
}

function formatDate(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return new Intl.DateTimeFormat('es-AR', {
    dateStyle: 'medium',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)))
}

function formatCount(value: number) {
  return value.toLocaleString('es-AR')
}

export function CollaboratorMetrics() {
  const [page, setPage] = useState(1)
  const [period, setPeriod] = useState<CollaboratorVisitsPeriod | null>(null)
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const load = useCallback((signal: AbortSignal) => loadCollaboratorVisits(page, period, signal), [page, period])
  const { data, loading, error, reload } = useResource(load)
  const pageCount = data ? Math.max(1, Math.ceil(data.businesses.count / data.businesses.page_size)) : 1
  const linkedClients = data?.linked_clients.status === 'available' && data.linked_clients.value !== null
    ? formatCount(data.linked_clients.value)
    : 'No disponible para este período'
  const hasDraftPeriod = Boolean(fromDate || toDate)

  function resetPeriod() {
    setPage(1)
    setPeriod(null)
    setFromDate('')
    setToDate('')
  }

  return (
    <section className="workspace-panel" aria-labelledby="collaborator-activity-title" aria-busy={loading}>
      <div className="workspace-section-heading">
        <div><h2 id="collaborator-activity-title">Resultados de tu red</h2></div>
        <ProductLink className="button button-ghost" href="/colaborador/comisiones">Mis comisiones →</ProductLink>
      </div>
      {loading && <p role="status">Cargando visitas del período…</p>}
      {error && (
        <div>
          <p className="workspace-feedback is-error" role="alert">{error}</p>
          <button className="button button-dark" onClick={reload}>Volver a intentar</button>
          {page > 1 && <button type="button" className="button button-ghost" onClick={() => setPage(1)}>Volver a la página 1</button>}
        </div>
      )}
      {!loading && !error && data === null && <p className="workspace-muted">El resumen de tu red no está disponible ahora.</p>}
      <form aria-label="Filtrar visitas por período" onSubmit={event => {
        event.preventDefault()
        setPage(1)
        setPeriod(fromDate && toDate ? { from: fromDate, to: toDate } : null)
      }}>
        <div className="workspace-form-grid">
          <label htmlFor="collaborator-visits-from">Desde<input id="collaborator-visits-from" type="date" value={fromDate} required={hasDraftPeriod} onChange={event => setFromDate(event.target.value)} /></label>
          <label htmlFor="collaborator-visits-to">Hasta<input id="collaborator-visits-to" type="date" value={toDate} required={hasDraftPeriod} onChange={event => setToDate(event.target.value)} /></label>
        </div>
        <div className="workspace-actions">
          <button className="button button-orange">Aplicar período</button>
          <button type="button" className="button button-ghost" onClick={resetPeriod} disabled={!period && !hasDraftPeriod}>Restablecer período</button>
        </div>
      </form>
      {data && (
        <>
          <p className="workspace-muted">
            Del {formatDate(data.period.from)} al {formatDate(data.period.to)} (hora de Ushuaia)
          </p>
          <div className="workspace-stats" aria-label="Indicadores de tu red">
            <div><span>Clientes vinculados</span><strong>{linkedClients}</strong></div>
            <div><span>Visitas válidas atribuidas</span><strong>{formatCount(data.valid_attributed_visits)}</strong></div>
            <div><span>Visitas en otros negocios</span><strong>{formatCount(data.other_business_visits)}</strong></div>
          </div>
          {data.businesses.results.length > 0 ? (
            <div>
              <h3>Negocios con visitas visibles</h3>
              <ol className="workspace-list" aria-label="Visitas por negocio visible">
                {data.businesses.results.map(business => (
                  <li key={business.provider_id}>
                    <span>{business.provider_name}</span>
                    <strong>{formatCount(business.visits)}</strong>
                  </li>
                ))}
              </ol>
            </div>
          ) : (
            <p>No hay negocios actualmente visibles con visitas en este período.</p>
          )}
          {pageCount > 1 && (
            <div className="workspace-pagination" aria-label="Paginación de negocios">
              <button className="button button-ghost" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>
                ← Anterior
              </button>
              <span>Página {page} de {pageCount}</span>
              <button className="button button-ghost" disabled={page >= pageCount} onClick={() => setPage(value => value + 1)}>
                Siguiente →
              </button>
            </div>
          )}
        </>
      )}
    </section>
  )
}