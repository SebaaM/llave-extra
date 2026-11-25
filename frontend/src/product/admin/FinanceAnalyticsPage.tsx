import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { messageOf } from '../shared'
import { adminApi } from './api'
import { useAdminLoad } from './hooks'
import { LoadState } from './UI'

type Metric<T> =
  | { status: 'available'; value: T }
  | { status: 'unavailable'; value: null }

type FinanceReport = {
  period: { from: string; to: string; timezone: string }
  valid_visits: { direct: Metric<number>; referred: Metric<number> }
  credits: {
    earn: Metric<number>
    reversal: Metric<number>
    redeem: Metric<number>
    refund: Metric<number>
    adjustment: Metric<number>
  }
  shop: {
    credit_redemptions: Metric<number>
    confirmed_ars: Metric<string>
    refunded_ars: Metric<string>
    undated_confirmations_count: Metric<number>
  }
}

type LoadedReport = { requestKey: string; report?: FinanceReport; error?: string }
type DraftPeriod = { from: string; to: string; datesEdited: boolean }

const reportPath = '/gestion/analitica/actividad'

function dispatchNavigation(params: URLSearchParams) {
  const query = params.toString()
  window.dispatchEvent(new CustomEvent('llave:navigate', {
    detail: reportPath + (query ? '?' + query : ''),
  }))
}

function numberLabel(value: number) {
  return value.toLocaleString('es-AR')
}

function countLabel(value: number, singular: string, plural: string) {
  return numberLabel(value) + ' ' + (value === 1 ? singular : plural)
}

function visitLabel(value: number) {
  return countLabel(value, 'visita', 'visitas')
}

function creditsLabel(value: number) {
  const sign = value > 0 ? '+' : ''
  return sign + numberLabel(value) + ' créditos'
}

function arsLabel(value: string) {
  const [whole, fraction = '00'] = value.split('.')
  const groupedWhole = BigInt(whole).toLocaleString('es-AR')
  return 'ARS ' + groupedWhole + ',' + fraction.padEnd(2, '0').slice(0, 2)
}

function metricLabel<T>(metric: Metric<T>, format: (value: T) => string) {
  return metric.status === 'available' ? format(metric.value) : 'No disponible'
}

function isZeroMetric(metric: Metric<number | string>) {
  return metric.status === 'available' && Number(metric.value) === 0
}

function hasNoPeriodActivity(report: FinanceReport) {
  const metrics: Metric<number | string>[] = [
    report.valid_visits.direct,
    report.valid_visits.referred,
    report.credits.earn,
    report.credits.reversal,
    report.credits.redeem,
    report.credits.refund,
    report.credits.adjustment,
    report.shop.credit_redemptions,
    report.shop.confirmed_ars,
    report.shop.refunded_ars,
  ]
  return metrics.every(isZeroMetric)
}

function FinancePeriodFilters({ appliedFrom, appliedTo, reportPeriod }: {
  appliedFrom: string
  appliedTo: string
  reportPeriod?: FinanceReport['period']
}) {
  const [draft, setDraft] = useState<DraftPeriod>(() => ({
    from: appliedFrom,
    to: appliedTo,
    datesEdited: Boolean(appliedFrom || appliedTo),
  }))
  const [filterError, setFilterError] = useState('')
  const fromValue = draft.datesEdited ? draft.from : reportPeriod?.from ?? ''
  const toValue = draft.datesEdited ? draft.to : reportPeriod?.to ?? ''

  const applyPeriod = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (Boolean(fromValue) !== Boolean(toValue)) {
      setFilterError('Completá ambas fechas o dejá el período sin fechas.')
      return
    }
    setFilterError('')
    const params = new URLSearchParams()
    if (fromValue && toValue) {
      params.set('from', fromValue)
      params.set('to', toValue)
    }
    dispatchNavigation(params)
  }

  const resetPeriod = () => {
    setDraft({ from: '', to: '', datesEdited: false })
    setFilterError('')
    dispatchNavigation(new URLSearchParams())
  }

  return <form className="admin-filters admin-finance-filters" aria-label="Filtros de actividad financiera" onSubmit={applyPeriod}>
    <label htmlFor="finance-from">Desde<input
      id="finance-from"
      type="date"
      value={fromValue}
      required={Boolean(fromValue || toValue)}
      onChange={event => {
        setFilterError('')
        setDraft(current => ({ ...current, from: event.target.value, to: toValue, datesEdited: true }))
      }}
    /></label>
    <label htmlFor="finance-to">Hasta<input
      id="finance-to"
      type="date"
      value={toValue}
      required={Boolean(fromValue || toValue)}
      onChange={event => {
        setFilterError('')
        setDraft(current => ({ ...current, from: fromValue, to: event.target.value, datesEdited: true }))
      }}
    /></label>
    <div className="admin-filter-actions">
      <button className="button button-dark">Aplicar período</button>
      <button type="button" className="button button-ghost" onClick={resetPeriod}>Restablecer período</button>
    </div>
    {filterError && <p className="admin-field-error" role="alert">{filterError}</p>}
  </form>
}
export function FinanceAnalyticsPage({ search }: { search: string }) {
  const query = new URLSearchParams(search)
  const appliedFrom = query.get('from') ?? ''
  const appliedTo = query.get('to') ?? ''
  const reportParams = new URLSearchParams()
  if (appliedFrom) reportParams.set('from', appliedFrom)
  if (appliedTo) reportParams.set('to', appliedTo)
  const reportRequestKey = reportParams.toString()
  const [reportRevoked, setReportRevoked] = useState(false)

  const loadReport = useCallback(async (signal: AbortSignal): Promise<LoadedReport> => {
    try {
      const suffix = reportRequestKey ? '?' + reportRequestKey : ''
      const report = await adminApi<FinanceReport>('analytics/finance/' + suffix, { signal })
      return { requestKey: reportRequestKey, report }
    } catch (error) {
      return { requestKey: reportRequestKey, error: messageOf(error) }
    }
  }, [reportRequestKey])
  const { data: loadedReport, loading, reload, setState } = useAdminLoad(loadReport)
  const currentReport = loadedReport?.requestKey === reportRequestKey ? loadedReport : null
  const report = currentReport?.report ?? null
  const error = reportRevoked
    ? 'La sesión administrativa ya no está disponible.'
    : currentReport?.error ?? ''
  const reportLoading = loading || (!currentReport && !reportRevoked)


  useEffect(() => {
    const clearReport = () => {
      setReportRevoked(true)
      setState({ data: null, loading: false, error: '' })
    }
    window.addEventListener('llave:admin-revoked', clearReport)
    return () => window.removeEventListener('llave:admin-revoked', clearReport)
  }, [setState])


  return <section className="admin-panel admin-finance-analytics" aria-labelledby="finance-analytics-heading">
    <h2 id="finance-analytics-heading">Actividad financiera</h2>
    <p>Consulta visitas válidas, movimientos firmados de créditos y eventos monetarios verificados.</p>

    <FinancePeriodFilters
      key={reportRequestKey}
      appliedFrom={appliedFrom}
      appliedTo={appliedTo}
      reportPeriod={report?.period}
    />

    <LoadState loading={reportLoading} error={error} retry={reload} />
    {report && <>
      <p className="admin-visit-period">Período: {report.period.from} al {report.period.to} ({report.period.timezone})</p>
      {hasNoPeriodActivity(report) && <p className="admin-finance-empty" role="status">
        Los indicadores disponibles no registran actividad neta en este período.
      </p>}

      <section className="admin-finance-section" aria-labelledby="finance-visits-heading">
        <h3 id="finance-visits-heading">Visitas</h3>
        <div className="admin-table-scroll" tabIndex={0} aria-label="Tabla de visitas válidas">
          <table className="admin-table" aria-labelledby="finance-visits-heading">
            <thead><tr><th scope="col">Origen</th><th scope="col">Visitas válidas</th></tr></thead>
            <tbody>
              <tr><th scope="row">Directas</th><td>{metricLabel(report.valid_visits.direct, visitLabel)}</td></tr>
              <tr><th scope="row">Referidas</th><td>{metricLabel(report.valid_visits.referred, visitLabel)}</td></tr>
            </tbody>
          </table>
        </div>
        <p className="admin-finance-definition">
          Cuenta consumos que siguen válidos por fecha y origen; no son personas únicas.
        </p>
      </section>

      <section className="admin-finance-section" aria-labelledby="finance-credits-heading">
        <h3 id="finance-credits-heading">Movimientos de créditos</h3>
        <div className="admin-table-scroll" tabIndex={0} aria-label="Tabla de movimientos de créditos">
          <table className="admin-table" aria-labelledby="finance-credits-heading">
            <thead><tr><th scope="col">Tipo de movimiento</th><th scope="col">Total firmado en créditos</th></tr></thead>
            <tbody>
              <tr><th scope="row">Acreditaciones</th><td>{metricLabel(report.credits.earn, creditsLabel)}</td></tr>
              <tr><th scope="row">Anulaciones</th><td>{metricLabel(report.credits.reversal, creditsLabel)}</td></tr>
              <tr><th scope="row">Canjes de créditos</th><td>{metricLabel(report.credits.redeem, creditsLabel)}</td></tr>
              <tr><th scope="row">Reintegros de créditos</th><td>{metricLabel(report.credits.refund, creditsLabel)}</td></tr>
              <tr><th scope="row">Ajustes</th><td>{metricLabel(report.credits.adjustment, creditsLabel)}</td></tr>
            </tbody>
          </table>
        </div>
        <p className="admin-finance-definition">
          El período se calcula según la fecha del movimiento en la billetera. Los importes conservan su signo; no son pesos ni el saldo actual.
        </p>
      </section>

      <section className="admin-finance-section" aria-labelledby="finance-shop-heading">
        <h3 id="finance-shop-heading">Señales de tienda</h3>
        <div className="admin-table-scroll" tabIndex={0} aria-label="Tabla de actividad de tienda">
          <table className="admin-table" aria-labelledby="finance-shop-heading">
            <thead><tr><th scope="col">Indicador</th><th scope="col">Total</th></tr></thead>
            <tbody>
              <tr><th scope="row">Pedidos canjeados con créditos</th><td>{metricLabel(report.shop.credit_redemptions, value => countLabel(value, 'pedido', 'pedidos'))}</td></tr>
              <tr><th scope="row">Pagos monetarios confirmados</th><td>{metricLabel(report.shop.confirmed_ars, arsLabel)}</td></tr>
              <tr><th scope="row">Reintegros monetarios confirmados</th><td>{metricLabel(report.shop.refunded_ars, arsLabel)}</td></tr>
              <tr><th scope="row">Confirmaciones sin fecha comprobable</th><td>{metricLabel(report.shop.undated_confirmations_count, value => countLabel(value, 'confirmación', 'confirmaciones'))}</td></tr>
            </tbody>
          </table>
        </div>
        <p className="admin-finance-definition">
          Los pedidos canjeados con créditos se cuentan por fecha de creación del pedido. Los importes ARS se fechan por el primer evento auditado y autorizado de pago o reintegro de cada pedido, no por la creación del pedido.
          Las confirmaciones sin fecha cubren todo el historial y no se suman a los importes del período.
          Reservas, revisiones e integraciones simuladas no son ventas verificadas.
        </p>
      </section>

      <p className="admin-finance-definition">
        Los registros DEMO se excluyen. «No disponible» indica que el origen de esa métrica no pudo verificarse;
        no equivale a cero. No incluye comisiones de Colaboradores.
      </p>
    </>}
  </section>
}
