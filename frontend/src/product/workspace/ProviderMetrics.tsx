import { useCallback, useState } from 'react'
import { api, ApiError } from '../api'
import { useResource } from './hooks'
import { Stats } from './UI'

type ProviderBenefitVisit = {
  benefit_id: string | null
  benefit_title: string | null
  visits: number
}

type ProviderVisitsReport = {
  period: {
    from: string
    to: string
    timezone: string
  }
  direct_visits: number
  referred_visits: number
  benefits: ProviderBenefitVisit[]
  other_benefit_visits: number
}

type ProviderVisitsPeriod = {
  from: string
  to: string
}

const PROVIDER_VISITS_ENDPOINT = '/api/v1/provider/analytics/visits/'

async function loadProviderVisits(
  period: ProviderVisitsPeriod | null,
  signal: AbortSignal,
): Promise<ProviderVisitsReport | null> {
  try {
    const params = new URLSearchParams()
    if (period) {
      params.set('from', period.from)
      params.set('to', period.to)
    }
    const query = params.toString()
    return await api<ProviderVisitsReport>(PROVIDER_VISITS_ENDPOINT + (query ? '?' + query : ''), { signal })
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

export function ProviderMetrics() {
  const [period, setPeriod] = useState<ProviderVisitsPeriod | null>(null)
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const load = useCallback((signal: AbortSignal) => loadProviderVisits(period, signal), [period])
  const { data, loading, error, reload } = useResource(load)
  const hasDraftPeriod = Boolean(fromDate || toDate)

  function resetPeriod() {
    setPeriod(null)
    setFromDate('')
    setToDate('')
  }

  if (data === null && !loading && !error) return null

  return (
    <section className="workspace-panel" aria-labelledby="provider-activity-title" aria-busy={loading}>
      <h2 id="provider-activity-title">Actividad de tu negocio</h2>
      {loading && <p role="status">Cargando visitas del período…</p>}
      {error && (
        <div>
          <p className="workspace-feedback is-error" role="alert">{error}</p>
          <button className="button button-dark" onClick={reload}>Volver a intentar</button>
        </div>
      )}
      <form aria-label="Filtrar visitas por período" onSubmit={event => {
        event.preventDefault()
        setPeriod(fromDate && toDate ? { from: fromDate, to: toDate } : null)
      }}>
        <div className="workspace-form-grid">
          <label htmlFor="provider-visits-from">Desde<input id="provider-visits-from" type="date" value={fromDate} required={hasDraftPeriod} onChange={event => setFromDate(event.target.value)} /></label>
          <label htmlFor="provider-visits-to">Hasta<input id="provider-visits-to" type="date" value={toDate} required={hasDraftPeriod} onChange={event => setToDate(event.target.value)} /></label>
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
          <Stats items={[
            ['Visitas directas', data.direct_visits],
            ['Visitas referidas', data.referred_visits],
          ]} />
          {data.benefits.length > 0 ? (
            <div>
              <h3>Visitas referidas por beneficio</h3>
              <ul>
                {data.benefits.map(benefit => (
                  <li key={benefit.benefit_id ?? 'sin-beneficio'}>
                    {benefit.benefit_title ?? 'Sin beneficio registrado'}: {formatCount(benefit.visits)}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p>No hay visitas referidas en este período.</p>
          )}
          <p className="workspace-muted">Otros beneficios: {formatCount(data.other_benefit_visits)}</p>
        </>
      )}
    </section>
  )
}