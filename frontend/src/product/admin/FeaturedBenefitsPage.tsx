import { useCallback, useState } from 'react'
import type { FormEvent } from 'react'
import { messageOf } from '../shared'
import { adminApi, collection } from './api'
import { formatValue } from './formatValue'
import { useAdminLoad } from './hooks'
import type { Row } from './types'
import { LoadState, Status } from './UI'
import './featured-benefits.css'

const path = '/gestion/beneficios-destacados'
const limit = 5

export function FeaturedBenefitsPage({ search }: { search: string }) {
  const query = new URLSearchParams(search)
  const requestedPage = Number(query.get('page'))
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1
  const term = query.get('search') ?? ''
  const load = useCallback(async (signal: AbortSignal) => {
    const listQuery = new URLSearchParams({ page: String(page), search: term })
    const [benefits, selected] = await Promise.all([
      collection('benefits', listQuery.toString(), signal),
      collection('benefits', 'featured=true&page_size=5', signal),
    ])
    return { benefits, selected }
  }, [page, term])
  const { data, loading, error, reload, setState } = useAdminLoad(load)
  const [pending, setPending] = useState(false)
  const [feedback, setFeedback] = useState<{ message: string; error?: boolean } | null>(null)

  function navigate(params: URLSearchParams) {
    window.dispatchEvent(new CustomEvent('llave:navigate', { detail: `${path}${params.size ? `?${params}` : ''}` }))
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const term = String(new FormData(event.currentTarget).get('search') ?? '').trim()
    navigate(new URLSearchParams(term ? { search: term } : {}))
  }

  async function changeSelection(row: Row, featured: boolean) {
    setPending(true)
    setFeedback(null)
    try {
      await adminApi(`benefits/${encodeURIComponent(String(row.id))}/`, {
        method: 'PATCH',
        body: { featured, version: row.version },
      })
      setFeedback({ message: featured ? 'Beneficio agregado a los destacados.' : 'Quitaste el beneficio de los destacados.' })
    } catch (error) {
      setFeedback({ message: messageOf(error), error: true })
    } finally {
      setState({ data: null, loading: true, error: '' })
      reload()
      setPending(false)
    }
  }

  return <>
    <p>Elegí hasta cinco beneficios para el carrusel del inicio. Solo se muestran los publicados y vigentes de prestadores publicados cuando el catálogo público está habilitado.</p>
    {feedback && <Status error={feedback.error}>{feedback.message}</Status>}
    <LoadState loading={loading} error={error} retry={reload} />
    {data && <section className="admin-panel admin-featured-selection" aria-labelledby="featured-selection">
      <h2 id="featured-selection">{data.selected.count} de {limit} seleccionados</h2>
      {data.selected.count === 0
        ? <p>Todavía no elegiste beneficios para el inicio.</p>
        : <ul>{data.selected.results.map(row => <li key={String(row.id)}>
          <span><strong>{String(row.title)}</strong> · {String(row.provider_name)}</span>
          <button className="button button-ghost" type="button" disabled={pending}
            aria-label={`Quitar ${row.title} de destacados`} onClick={() => void changeSelection(row, false)}>Quitar</button>
        </li>)}</ul>}
      {data.selected.count >= limit && <p>Quitá un beneficio para poder destacar otro.</p>}
    </section>}
    <form key={search} className="admin-filters" onSubmit={submit}>
      <label>Buscar<input name="search" defaultValue={term} maxLength={160} placeholder="Beneficio o prestador" /></label>
      <button className="button button-dark" type="submit">Buscar</button>
    </form>
    {data && <section aria-labelledby="featured-catalog">
      <h2 id="featured-catalog">Todos los beneficios</h2>
      {data.benefits.results.length === 0 ? <p>No hay beneficios que coincidan con la búsqueda.</p>
        : <div className="admin-table-scroll"><table className="admin-table">
          <thead><tr><th scope="col">Beneficio</th><th scope="col">Prestador</th><th scope="col">Estado</th><th scope="col">Hasta</th><th scope="col">Carrusel</th></tr></thead>
          <tbody>{data.benefits.results.map(row => {
            const selected = data.selected.results.some(benefit => benefit.id === row.id)
            return <tr key={String(row.id)}>
              <td data-label="Beneficio">{String(row.title)}</td>
              <td data-label="Prestador">{String(row.provider_name)}</td>
              <td data-label="Estado">{formatValue(row.status)}</td>
              <td data-label="Hasta">{formatValue(row.valid_until)}</td>
              <td data-label="Carrusel">{selected ? 'Seleccionado' : <button className="button button-dark" type="button"
                disabled={pending || data.selected.count >= limit}
                aria-label={`Destacar ${row.title}`} onClick={() => void changeSelection(row, true)}>Destacar</button>}</td>
            </tr>
          })}</tbody>
        </table></div>}
      <nav className="admin-pagination" aria-label="Páginas de beneficios">
        <button disabled={!data.benefits.previous} onClick={() => { query.set('page', String(page - 1)); navigate(query) }}>← Anterior</button>
        <span>Página {page}</span>
        <button disabled={!data.benefits.next} onClick={() => { query.set('page', String(page + 1)); navigate(query) }}>Siguiente →</button>
      </nav>
    </section>}
  </>
}
