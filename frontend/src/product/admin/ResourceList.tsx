import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { ApiError, privateImage } from '../api'
import { ProductLink } from '../navigation'
import { collection, settings } from './api'
import { ReferencePicker } from './ReferencePicker'
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
  const [categoryInput, setCategoryInput] = useState({ source: search, value: query.get('category') ?? '' })
  const term = searchInput.source === search ? searchInput.value : query.get('search') ?? ''
  const page = Math.max(1, Number(query.get('page') ?? '1') || 1)
  const load = useCallback(async (signal: AbortSignal) => {
    try { return await collection(resource.key, new URLSearchParams({ ...Object.fromEntries(new URLSearchParams(search)), page: String(page) }).toString(), signal) }
    catch (error) {
      if (resource.key !== 'products' || page === 1 || !(error instanceof ApiError) || error.status !== 404) throw error
      const next = new URLSearchParams(search); next.delete('page')
      const first = await collection(resource.key, next.toString(), signal)
      if (!signal.aborted) window.dispatchEvent(new CustomEvent('llave:navigate', { detail: `/gestion/productos${next.size ? `?${next}` : ''}` }))
      return first
    }
  }, [resource.key, search, page])
  const { data, loading, error, reload } = useAdminLoad(load)
  const loadShop = useCallback((signal: AbortSignal) => resource.key === 'products' ? settings<{ low_stock_threshold: number }>('shop', signal) : Promise.resolve({ low_stock_threshold: 5 }), [resource.key])
  const shopSettings = useAdminLoad(loadShop)
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
  const sort = (name: string) => {
    const field = name === 'category_name' ? 'category' : name
    const next = new URLSearchParams(search)
    next.set('ordering', (query.get('ordering') ?? 'name') === field ? `-${field}` : field)
    next.delete('page')
    window.dispatchEvent(new CustomEvent('llave:navigate', { detail: `${base}?${next}` }))
  }
  return <>
    <div className="admin-section-lead"><p>{resource.description ?? `Consultá y gestioná ${resource.title.toLowerCase()} de la red.`}</p>{resource.fields && <ProductLink className="button button-orange" href={`${base}/nuevo${search}`}>+ Nuevo {resource.singular.toLowerCase()}</ProductLink>}</div>
    <form key={search} className="admin-filters" onSubmit={submit}><label>Buscar<input name="search" value={term} onChange={event => setSearchInput({ source: search, value: event.target.value })} placeholder={`Buscar ${resource.title.toLowerCase()}`} /></label>{resource.key === 'products' && <div className="admin-field"><span>Categoría</span><ReferencePicker kind="product-categories" label="Categoría" required={false} emptyLabel="Todas las categorías" value={categoryInput.source === search ? categoryInput.value : query.get('category') ?? ''} onChange={value => setCategoryInput({ source: search, value })} /><input type="hidden" name="category" value={categoryInput.source === search ? categoryInput.value : query.get('category') ?? ''} /></div>}{(extraFilters[resource.key] ?? []).map(([name, label, kind]) => <label key={name}>{label}<input name={name} type={kind} defaultValue={query.get(name) ?? ''} /></label>)}{dated.has(resource.key) && <><label>Desde<input name="created_from" type="date" defaultValue={query.get('created_from') ?? ''} /></label><label>Hasta<input name="created_to" type="date" defaultValue={query.get('created_to') ?? ''} /></label></>}{resource.filters?.map(filter => <label key={filter.name}>{filter.label}<select name={filter.name} defaultValue={query.get(filter.name) ?? ''}><option value="">Todos</option>{filter.options.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>)}<button className="button button-dark" type="submit">Aplicar filtros</button>{resource.key === 'products' && <ProductLink className="button button-ghost" href={base}>Limpiar filtros</ProductLink>}</form>
    <LoadState loading={loading} error={error} retry={reload} />
    {data && <><p className="admin-result-count">{resource.key === 'products' && data.count ? `${(page - 1) * 20 + 1}–${Math.min(page * 20, data.count)} de ${data.count} productos` : `${data.count.toLocaleString('es-AR')} registros`}</p>{data.results.length === 0 ? <section className="admin-panel"><h2>Sin resultados</h2><p>No hay registros que coincidan con estos filtros.</p></section> : <div className="admin-table-scroll"><table className="admin-table"><thead><tr>{resource.columns.map(name => <th key={name} scope="col" aria-sort={resource.key === 'products' && (query.get('ordering') ?? 'name').replace(/^-/, '') === (name === 'category_name' ? 'category' : name) ? (query.get('ordering')?.startsWith('-') ? 'descending' : 'ascending') : undefined}>{resource.key === 'products' ? <button type="button" className="admin-sort" onClick={() => sort(name)}>{fieldLabels[name] ?? name.replaceAll('_', ' ')} ↕</button> : fieldLabels[name] ?? name.replaceAll('_', ' ')}</th>)}<th scope="col">Ficha</th></tr></thead><tbody>{data.results.map(row => <tr key={String(row.id)}>{resource.columns.map(name => <td data-label={fieldLabels[name] ?? name} key={name}>{resource.key === 'products' && name === 'name' ? <><ProductThumbnail path={typeof row.image_url === 'string' ? row.image_url : null} />{String(row.name)}</> : resource.key === 'products' && name === 'active' ? <><span className={row.active ? 'admin-product-published' : ''}>{row.active ? 'Publicado' : 'Borrador'}</span>{row.active && row.category_active === false && <small>Oculto por categoría inactiva</small>}</> : resource.key === 'products' && name === 'stock' ? <span className={Number(row.stock) === 0 ? 'admin-stock-out' : shopSettings.data && Number(row.stock) <= shopSettings.data.low_stock_threshold ? 'admin-stock-low' : ''}>{Number(row.stock) === 0 ? 'Agotado' : shopSettings.data && Number(row.stock) <= shopSettings.data.low_stock_threshold ? `${row.stock} · Stock bajo` : `${row.stock} · Con stock`}</span> : formatValue(row[name])}</td>)}<td data-label="Ficha"><ProductLink href={`${base}/${row.id}${detailQuery.size ? `?${detailQuery}` : ''}`}>Ver detalle →</ProductLink></td></tr>)}</tbody></table></div>}
      <nav className="admin-pagination" aria-label="Páginas"><button disabled={!data.previous} onClick={() => goto(page - 1)}>← Anterior</button><span>Página {page}</span><button disabled={!data.next} onClick={() => goto(page + 1)}>Siguiente →</button></nav></>}
  </>
}

function ProductThumbnail({ path }: { path: string | null }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let disposed = false
    let blob: string | null = null
    if (path) privateImage(path).then(value => { if (disposed) { if (value) URL.revokeObjectURL(value) } else { blob = value; setUrl(value) } }).catch(() => {})
    return () => { disposed = true; if (blob) URL.revokeObjectURL(blob) }
  }, [path])
  return url ? <img className="admin-product-thumb" src={url} alt="" /> : <span className="admin-product-thumb admin-product-placeholder" aria-label="Sin imagen">◈</span>
}
