import { useCallback, useState } from 'react'
import type { FormEvent } from 'react'
import { ProductLink } from '../navigation'
import { collection } from './api'
import { fieldLabels } from './data'
import { useAdminLoad } from './hooks'
import type { Resource } from './types'
import { LoadState } from './UI'
import { formatValue } from './formatValue'
import { routeFor } from './routes'

const extraFilters: Record<string, readonly [string, string, 'text' | 'number' | 'date'][]> = {
  benefits: [['provider', 'ID del prestador', 'text']], consumptions: [['provider', 'ID del prestador', 'text'], ['tourist', 'ID del Cliente', 'number'], ['collaborator', 'ID del colaborador', 'text']],
  wallets: [['tourist', 'ID del Cliente', 'number']], adjustments: [['tourist', 'ID del Cliente', 'number']], orders: [['customer', 'ID del Cliente', 'number']],
  'credit-rules': [['provider', 'ID del prestador', 'text']], 'stock-adjustments': [['product', 'ID del producto', 'text']],
}
const dated = new Set(['consumptions', 'adjustments', 'orders', 'cancellations', 'stock-adjustments', 'payment-operations'])

export function ResourceList({ resource, search }: { resource: Resource; search: string }) {
  const query = new URLSearchParams(search)
  const [searchInput, setSearchInput] = useState({ source: search, value: query.get('search') ?? '' })
  const term = searchInput.source === search ? searchInput.value : query.get('search') ?? ''
  const page = Math.max(1, Number(query.get('page') ?? '1') || 1)
  const load = useCallback((signal: AbortSignal) => collection(resource.key, new URLSearchParams({ ...Object.fromEntries(new URLSearchParams(search)), page: String(page) }).toString(), signal), [resource.key, search, page])
  const { data, loading, error, reload } = useAdminLoad(load)
  const base = `/gestion/${routeFor(resource.key)}`
  const detailQuery = new URLSearchParams(search)
  if (resource.key === 'wallets') {
    if (detailQuery.has('page')) detailQuery.set('list_page', detailQuery.get('page')!)
    detailQuery.delete('page')
  }
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const next = new URLSearchParams(search)
    const form = new FormData(event.currentTarget)
    for (const [name, raw] of form) { const value = String(raw).trim(); if (value) next.set(name, value); else next.delete(name) }
    next.delete('page')
    window.dispatchEvent(new CustomEvent('llave:navigate', { detail: `${base}?${next}` }))
  }
  const goto = (target: number) => {
    const next = new URLSearchParams(search)
    next.set('page', String(target))
    window.dispatchEvent(new CustomEvent('llave:navigate', { detail: `${base}?${next}` }))
  }
  return <>
    <div className="admin-section-lead"><p>{resource.description ?? `Consultá y gestioná ${resource.title.toLowerCase()} de la red.`}</p>{resource.fields && <ProductLink className="button button-orange" href={`${base}/nuevo${search}`}>+ Nuevo {resource.singular.toLowerCase()}</ProductLink>}</div>
    <form className="admin-filters" onSubmit={submit}><label>Buscar<input name="search" value={term} onChange={event => setSearchInput({ source: search, value: event.target.value })} placeholder={`Buscar ${resource.title.toLowerCase()}`} /></label>{(extraFilters[resource.key] ?? []).map(([name, label, kind]) => <label key={name}>{label}<input name={name} type={kind} defaultValue={query.get(name) ?? ''} /></label>)}{dated.has(resource.key) && <><label>Desde<input name="created_from" type="date" defaultValue={query.get('created_from') ?? ''} /></label><label>Hasta<input name="created_to" type="date" defaultValue={query.get('created_to') ?? ''} /></label></>}{resource.filters?.map(filter => <label key={filter.name}>{filter.label}<select name={filter.name} defaultValue={query.get(filter.name) ?? ''}><option value="">Todos</option>{filter.options.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>)}<button className="button button-dark" type="submit">Aplicar filtros</button></form>
    <LoadState loading={loading} error={error} retry={reload} />
    {data && <><p className="admin-result-count">{data.count.toLocaleString('es-AR')} registros</p>{data.results.length === 0 ? <section className="admin-panel"><h2>Sin resultados</h2><p>No hay registros que coincidan con estos filtros.</p></section> : <div className="admin-table-scroll"><table className="admin-table"><thead><tr>{resource.columns.map(name => <th key={name} scope="col">{fieldLabels[name] ?? name.replaceAll('_', ' ')}</th>)}<th scope="col">Ficha</th></tr></thead><tbody>{data.results.map(row => <tr key={String(row.id)}>{resource.columns.map(name => <td data-label={fieldLabels[name] ?? name} key={name}>{formatValue(row[name])}</td>)}<td data-label="Ficha"><ProductLink href={`${base}/${row.id}${detailQuery.size ? `?${detailQuery}` : ''}`}>Ver detalle →</ProductLink></td></tr>)}</tbody></table></div>}
      <nav className="admin-pagination" aria-label="Páginas"><button disabled={!data.previous} onClick={() => goto(page - 1)}>← Anterior</button><span>Página {page}</span><button disabled={!data.next} onClick={() => goto(page + 1)}>Siguiente →</button></nav></>}
  </>
}
