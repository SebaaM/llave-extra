import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from '../api'
import { messageOf } from '../shared'
import { collection, detail, adminApi } from './api'
import { useAdminLoad } from './hooks'
import type { Page, Row } from './types'
import { LoadState } from './UI'

type VisitReport = {
  period: { from: string; to: string; timezone: string }
  linked_clients: { status: 'available' | 'unavailable'; value: number | null }
  valid_attributed_visits: number
  businesses: {
    count: number
    page: number
    page_size: number
    results: { provider_id: string; provider_name: string; visits: number }[]
  }
}

type Collaborator = Row & { user_email?: string }
type CollaboratorLookup = { search: string; page: number }
type DraftFilters = { from: string; to: string; collaboratorId: string; datesEdited: boolean }
type LoadedVisitReport = { requestKey: string; report?: VisitReport; error?: string }

const reportPath = '/gestion/analitica/visitas'
const pageSize = 100

function positivePage(value: string | null) {
  const parsed = Number(value ?? '1')
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1
}

function numberLabel(value: number) {
  return value.toLocaleString('es-AR')
}

function dispatchNavigation(params: URLSearchParams) {
  const query = params.toString()
  window.dispatchEvent(new CustomEvent('llave:navigate', { detail: `${reportPath}${query ? `?${query}` : ''}` }))
}

export function VisitAnalyticsPage({ search }: { search: string }) {
  const query = new URLSearchParams(search)
  const appliedFrom = query.get('from') ?? ''
  const appliedTo = query.get('to') ?? ''
  const appliedCollaboratorId = query.get('collaborator_id') ?? ''
  const page = positivePage(query.get('page'))
  const [draft, setDraft] = useState<DraftFilters>(() => ({
    from: appliedFrom,
    to: appliedTo,
    collaboratorId: appliedCollaboratorId,
    datesEdited: Boolean(appliedFrom || appliedTo),
  }))
  const [filterError, setFilterError] = useState('')
  const [collaboratorSearchInput, setCollaboratorSearchInput] = useState('')
  const [collaboratorLookup, setCollaboratorLookup] = useState<CollaboratorLookup>({ search: '', page: 1 })
  const [selectedDraftCollaborator, setSelectedDraftCollaborator] = useState<Collaborator | null>(null)
  const [reportRevoked, setReportRevoked] = useState(false)
  const paginationFocusPending = useRef(false)
  const paginationRef = useRef<HTMLElement | null>(null)

  const reportParams = new URLSearchParams()
  if (appliedFrom) reportParams.set('from', appliedFrom)
  if (appliedTo) reportParams.set('to', appliedTo)
  if (appliedCollaboratorId) reportParams.set('collaborator_id', appliedCollaboratorId)
  reportParams.set('page', String(page))
  const reportRequestKey = reportParams.toString()

  const loadReport = useCallback(async (signal: AbortSignal): Promise<LoadedVisitReport> => {
    try {
      const report = await adminApi<VisitReport>(`analytics/visits/?${reportRequestKey}`, { signal })
      return { requestKey: reportRequestKey, report }
    } catch (error) {
      return { requestKey: reportRequestKey, error: messageOf(error) }
    }
  }, [reportRequestKey])
  const { data: loadedReport, loading: loadReportLoading, reload: reloadReport, setState: setReportState } = useAdminLoad(loadReport)
  const currentReport = loadedReport?.requestKey === reportRequestKey ? loadedReport : null
  const reportData = currentReport?.report ?? null
  const reportError = reportRevoked ? 'La sesión administrativa ya no está disponible.' : currentReport?.error ?? ''
  const reportLoading = loadReportLoading || (!currentReport && !reportRevoked)

  const loadCollaborators = useCallback(async (signal: AbortSignal): Promise<Page<Collaborator>> => {
    const params = new URLSearchParams({ page: String(collaboratorLookup.page), page_size: String(pageSize) })
    if (collaboratorLookup.search) params.set('search', collaboratorLookup.search)
    const result = await collection('collaborators', params.toString(), signal) as Page<Collaborator>
    if (!appliedCollaboratorId || result.results.some(row => String(row.id) === appliedCollaboratorId)) return result
    try {
      const selected = await detail('collaborators', appliedCollaboratorId, signal) as Collaborator
      return { ...result, results: [selected, ...result.results] }
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        return { ...result, results: [{ id: appliedCollaboratorId, user_email: 'Colaborador seleccionado no disponible' }, ...result.results] }
      }
      throw error
    }
  }, [appliedCollaboratorId, collaboratorLookup.page, collaboratorLookup.search])
  const collaborators = useAdminLoad(loadCollaborators)

  useEffect(() => {
    if (!paginationFocusPending.current || !reportData || reportLoading) return
    paginationFocusPending.current = false
    paginationRef.current?.focus()
  }, [reportData, reportLoading])

  useEffect(() => {
    const clearReport = () => {
      setReportRevoked(true)
      setReportState({ data: null, loading: false, error: '' })
    }
    window.addEventListener('llave:admin-revoked', clearReport)
    return () => window.removeEventListener('llave:admin-revoked', clearReport)
  }, [setReportState])

  const fromValue = draft.datesEdited ? draft.from : reportData?.period.from ?? ''
  const toValue = draft.datesEdited ? draft.to : reportData?.period.to ?? ''

  const applyFilters = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (Boolean(fromValue) !== Boolean(toValue)) {
      setFilterError('Completa ambas fechas o deja el período sin fechas.')
      return
    }
    setFilterError('')
    const params = new URLSearchParams()
    if (fromValue && toValue) {
      params.set('from', fromValue)
      params.set('to', toValue)
    }
    if (draft.collaboratorId) params.set('collaborator_id', draft.collaboratorId)
    params.set('page', '1')
    dispatchNavigation(params)
  }

  const searchCollaborators = () => {
    const next = { search: collaboratorSearchInput.trim(), page: 1 }
    collaborators.setState({ data: null, loading: true, error: '' })
    setCollaboratorLookup(next)
    if (next.search === collaboratorLookup.search && collaboratorLookup.page === 1) collaborators.reload()
  }

  const changeCollaboratorPage = (nextPage: number) => {
    collaborators.setState({ data: null, loading: true, error: '' })
    setCollaboratorLookup(current => ({ ...current, page: nextPage }))
  }

  const resetFilters = () => {
    setDraft({ from: '', to: '', collaboratorId: '', datesEdited: false })
    setSelectedDraftCollaborator(null)
    setFilterError('')
    setCollaboratorSearchInput('')
    collaborators.setState({ data: null, loading: true, error: '' })
    const resetLookup = { search: '', page: 1 }
    const lookupChanged = collaboratorLookup.search !== resetLookup.search || collaboratorLookup.page !== resetLookup.page
    setCollaboratorLookup(resetLookup)
    if (!lookupChanged) collaborators.reload()
    dispatchNavigation(new URLSearchParams('page=1'))
  }

  const changeReportPage = (nextPage: number) => {
    paginationFocusPending.current = true
    const params = new URLSearchParams(search)
    params.set('page', String(nextPage))
    dispatchNavigation(params)
  }

  const totalPages = reportData ? Math.max(1, Math.ceil(reportData.businesses.count / reportData.businesses.page_size)) : 1
  const linkedClients = reportData?.linked_clients
  const linkedClientsValue = linkedClients?.status === 'available' && linkedClients.value !== null
    ? numberLabel(linkedClients.value)
    : 'No disponible para este período'

  const collaboratorRows = collaborators.data?.results ?? []
  const selectedDraftRow = selectedDraftCollaborator && String(selectedDraftCollaborator.id) === draft.collaboratorId
    ? selectedDraftCollaborator
    : null
  const collaboratorOptions = selectedDraftRow && !collaboratorRows.some(row => String(row.id) === draft.collaboratorId)
    ? [selectedDraftRow, ...collaboratorRows]
    : collaboratorRows

  return <section className="admin-panel admin-visit-analytics" aria-labelledby="visit-analytics-heading">
    <h2 id="visit-analytics-heading">Visitas atribuidas</h2>
    <p>Consulta visitas válidas atribuidas a Colaboradores y Clientes vinculados dentro del período elegido.</p>

    <form className="admin-filters admin-visit-filters" onSubmit={applyFilters}>
      <label htmlFor="visit-from">Desde<input id="visit-from" type="date" value={fromValue} required={Boolean(fromValue || toValue)} onChange={event => { setFilterError(''); setDraft(current => ({ ...current, from: event.target.value, to: toValue, datesEdited: true })) }} /></label>
      <label htmlFor="visit-to">Hasta<input id="visit-to" type="date" value={toValue} required={Boolean(fromValue || toValue)} onChange={event => { setFilterError(''); setDraft(current => ({ ...current, from: fromValue, to: event.target.value, datesEdited: true })) }} /></label>
      <div className="admin-visit-collaborator-filter">
        <label htmlFor="visit-collaborator-search">Buscar colaboradores<input id="visit-collaborator-search" value={collaboratorSearchInput} onChange={event => setCollaboratorSearchInput(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); searchCollaborators() } }} placeholder="Email o nombre de carpeta" /></label>
        <button type="button" className="button button-ghost" onClick={searchCollaborators} disabled={collaborators.loading}>Buscar colaboradores</button>
        {collaborators.error && <p role="alert">{collaborators.error}</p>}
      </div>
      <label htmlFor="visit-collaborator">Colaborador<select id="visit-collaborator" value={draft.collaboratorId} onChange={event => {
        const collaboratorId = event.target.value
        const selected = collaboratorRows.find(row => String(row.id) === collaboratorId) ?? null
        setSelectedDraftCollaborator(selected)
        setDraft(current => ({ ...current, collaboratorId }))
      }}>
        <option value="">Todos</option>
        {collaboratorOptions.map(collaborator => <option key={String(collaborator.id)} value={String(collaborator.id)}>{String(collaborator.user_email ?? 'Colaborador')}</option>)}
      </select></label>
      <div className="admin-visit-lookup-controls">
        <span>{collaborators.data ? `Página ${collaboratorLookup.page} de ${Math.max(1, Math.ceil(collaborators.data.count / pageSize))}` : collaborators.loading ? 'Buscando colaboradores…' : ''}</span>
        <button type="button" className="button button-ghost" onClick={() => changeCollaboratorPage(collaboratorLookup.page - 1)} disabled={collaborators.loading || !collaborators.data?.previous}>Colaboradores anteriores</button>
        <button type="button" className="button button-ghost" onClick={() => changeCollaboratorPage(collaboratorLookup.page + 1)} disabled={collaborators.loading || !collaborators.data?.next}>Siguientes colaboradores</button>
      </div>
      <div className="admin-filter-actions">
        <button className="button button-dark">Aplicar filtros</button>
        <button type="button" className="button button-ghost" onClick={resetFilters}>Restablecer filtros</button>
      </div>
      {filterError && <p className="admin-field-error" role="alert">{filterError}</p>}
    </form>

    <LoadState loading={reportLoading} error={reportError} retry={reloadReport} />
    {reportData && <>
      <p className="admin-visit-period">Período: {reportData.period.from} al {reportData.period.to} ({reportData.period.timezone})</p>
      <dl className="admin-details admin-visit-totals">
        <div><dt>Clientes vinculados</dt><dd>{linkedClientsValue}</dd></div>
        <div><dt>Visitas atribuidas válidas</dt><dd>{numberLabel(reportData.valid_attributed_visits)}</dd></div>
      </dl>
      <p className="admin-visit-metric-definitions">Clientes vinculados cuenta personas distintas vinculadas mediante QR durante el período. Visitas atribuidas válidas cuenta visitas actualmente válidas atribuidas dentro del período. Son conteos independientes y no representan una tasa de conversión.</p>
      <div className="admin-visit-business-heading"><h3>Comercios con visitas</h3><p>{numberLabel(reportData.businesses.count)} comercios en total</p></div>
      {reportData.businesses.count === 0 ? <p className="admin-visit-empty">No hay visitas atribuidas en este período.</p> : <>
        <div className="admin-table-scroll admin-visit-table-scroll" tabIndex={0} aria-label="Tabla de comercios por visitas atribuidas">
          <table className="admin-table">
            <thead><tr><th scope="col">Comercio</th><th scope="col">Visitas válidas</th></tr></thead>
            <tbody>{reportData.businesses.results.map(row => <tr key={row.provider_id}>
              <td data-label="Comercio">{row.provider_name}</td>
              <td data-label="Visitas válidas">{numberLabel(row.visits)}</td>
            </tr>)}</tbody>
          </table>
        </div>
        {totalPages > 1 && <nav ref={paginationRef} tabIndex={-1} className="admin-pagination" aria-label="Páginas de comercios">
          <button type="button" disabled={reportData.businesses.page <= 1 || reportLoading} onClick={() => changeReportPage(reportData.businesses.page - 1)}>← Anterior</button>
          <span>Página {reportData.businesses.page} de {totalPages}</span>
          <button type="button" disabled={reportData.businesses.page >= totalPages || reportLoading} onClick={() => changeReportPage(reportData.businesses.page + 1)}>Siguiente →</button>
        </nav>}
      </>}
    </>}
  </section>
}
