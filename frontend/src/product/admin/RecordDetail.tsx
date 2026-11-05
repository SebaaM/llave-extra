import { useCallback, useEffect, useRef, useState } from 'react'
import { currentSessionVersion, privateImage } from '../api'
import { ProductLink } from '../navigation'
import { messageOf } from '../shared'
import { adminApi, authorizedDownload, detail, permissionLost } from './api'
import { RecordActions, PrivateQr } from './Actions'
import { OrderHistory, WalletMovements } from './History'
import { orderHistories } from './data'
import { useAdminLoad } from './hooks'
import { RecordForm } from './RecordForm'
import { checkAdminNavigation } from './hooks'
import { routeFor } from './routes'
import type { Page, Resource, Row } from './types'
import { BackLink, DetailFields, LoadState, Status } from './UI'

export function RecordDetail({ resource, id, search }: { resource: Resource; id: string; search: string }) {
  return <RecordDetailContent key={`${resource.key}:${id}:${currentSessionVersion()}`} resource={resource} id={id} search={search} />
}

function RecordDetailContent({ resource, id, search }: { resource: Resource; id: string; search: string }) {
  const [editing, setEditing] = useState(false)
  const [related, setRelated] = useState<Row[] | null>(null)
  const [relatedError, setRelatedError] = useState('')
  const [removed, setRemoved] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState('')
  const request = useRef(0)
  useEffect(() => () => { request.current += 1 }, [])
  const base = `/gestion/${routeFor(resource.key)}`
  const isProduct = resource.key === 'products'
  const detailQuery = resource.key === 'wallets' ? `page=${Math.max(1, Number(new URLSearchParams(search).get('page')) || 1)}` : ''
  const backQuery = new URLSearchParams(search)
  if (resource.key === 'wallets') {
    backQuery.delete('page')
    if (backQuery.has('list_page')) backQuery.set('page', backQuery.get('list_page')!)
    backQuery.delete('list_page')
  }
  const load = useCallback((signal: AbortSignal) => detail(resource.key, id, signal, detailQuery), [resource.key, id, detailQuery])
  const { data, loading, error, reload, setState } = useAdminLoad(load)
  useEffect(() => {
    if (data && resource.key === 'products' && window.location.hash === '#stock') {
      document.getElementById('stock')?.scrollIntoView?.({ block: 'start' })
    }
  }, [data, resource.key])
  const refresh = async () => {
    const sequence = ++request.current
    const version = currentSessionVersion()
    const next = await detail(resource.key, id, new AbortController().signal, detailQuery)
    if (sequence !== request.current || version !== currentSessionVersion()) throw new DOMException('Ficha reemplazada', 'AbortError')
    setState({ data: next, loading: false, error: '' })
    setRelated(null)
    return next
  }
  const manualRefresh = async () => {
    if (refreshing || editing) return
    const session = currentSessionVersion()
    setRefreshing(true); setRefreshError('')
    try { await refresh() }
    catch (cause) { if (session === currentSessionVersion() && !(cause instanceof DOMException && cause.name === 'AbortError')) setRefreshError(`No se pudo actualizar la ficha: ${messageOf(cause)}`) }
    finally { if (session === currentSessionVersion()) setRefreshing(false) }
  }
  const loadRelated = async () => {
    const sequence = ++request.current
    const version = currentSessionVersion()
    setRelatedError('')
    try {
      const response = await adminApi<{ recommendations: Row[] }>(`collaborators/${id}/recommendations/`)
      if (sequence === request.current && version === currentSessionVersion()) setRelated(response.recommendations)
    } catch (cause) { if (sequence === request.current && version === currentSessionVersion()) setRelatedError(cause instanceof Error ? cause.message : 'No se pudieron consultar las selecciones.') }
  }
  return <>
    <BackLink href={`${base}${backQuery.size ? `?${backQuery}` : ''}`} />
    {removed ? <section className="admin-panel"><Status>El registro fue eliminado.</Status></section> : <>
    <LoadState loading={loading} error={error} retry={reload} />
    {data && <>
      <div className="admin-record-heading"><div><p className="eyebrow">FICHA DE {resource.singular.toUpperCase()}</p><h2>{String(data.name ?? data.title ?? data.email ?? data.user_email ?? data.customer_email ?? data.id)}</h2><span className="admin-id">ID {data.id}</span></div><div className="admin-actions"><button className="button button-ghost" disabled={editing || refreshing} onClick={() => void manualRefresh()}>{refreshing ? 'Actualizando ficha…' : 'Actualizar ficha'}</button>{resource.fields && <button className="button button-dark" disabled={refreshing} onClick={() => { if (!editing || checkAdminNavigation()) setEditing(value => !value) }}>{editing ? 'Cerrar edición' : 'Editar'}</button>}</div></div>
      {refreshError && <><Status error>{refreshError}</Status><button className="button button-ghost" disabled={refreshing || editing} onClick={() => void manualRefresh()}>Reintentar actualización de ficha</button></>}
      {editing && resource.fields && <RecordForm key={`${resource.key}:${id}`} resource={resource} data={data} back={`${base}/${id}${search}`} onCancel={() => { if (checkAdminNavigation()) setEditing(false) }} onReload={refresh} onSaved={row => { setState({ data: row, loading: false, error: '' }); setEditing(false) }} />}
      <section className="admin-panel"><h2>Información</h2>{isProduct && data.active === true && data.category_active === false && <Status error>Este producto está oculto porque su categoría está inactiva.</Status>}<DetailFields data={data} names={[...resource.columns, ...(resource.detail ?? [])].filter((name, index, all) => all.indexOf(name) === index && name !== 'image_url' && name !== 'movements' && !(resource.key === 'orders' && name in orderHistories))} />{typeof data.image_url === 'string' && <PrivateMedia key={data.image_url} path={data.image_url} />}</section>
      {resource.key === 'collaborators' && !loading && !error && String(data.id) === id && <CollaboratorSummary key={`${id}:${data.version}:${currentSessionVersion()}`} id={id} />}
      {resource.key === 'collaborators' && <section className="admin-panel"><h2>Beneficios seleccionados</h2><p>Solo estas ofertas concretas integran la carpeta del colaborador.</p><button className="button button-ghost" onClick={() => void loadRelated()}>Consultar selección actual</button>{relatedError && <Status error>{relatedError}</Status>}{related && (related.length ? <ul className="admin-related">{related.map(item => <li key={String(item.benefit_id)}><strong>{item.available ? 'Disponible' : 'No disponible'}</strong> · {String(item.benefit_id)}{Boolean(item.benefit) && <span> · {String((item.benefit as Row).title)}</span>}</li>)}</ul> : <p>No hay beneficios seleccionados.</p>)}</section>}
      {(resource.key === 'providers' || resource.key === 'collaborators') && <PrivateQr key={`${data.id}:${data.version}`} resource={resource.key} id={data.id} />}
      <section className="admin-panel" id={isProduct ? 'stock' : undefined}>
        {isProduct ? <div className="admin-section-lead"><h2>Inventario</h2><ProductLink href={`/gestion/movimientos-stock?product=${encodeURIComponent(String(data.id))}`}>Ver historial de movimientos →</ProductLink></div> : <><h2>Acciones</h2><p className="admin-muted">Cada operación comprueba el estado actual. Después de un cambio, la ficha se actualiza para la próxima acción.</p></>}
        <div className={isProduct ? undefined : 'admin-action-grid'}><RecordActions resource={resource.key} data={data} onSuccess={async result => { if (result?.removed === true) setRemoved(true); else await refresh() }} /></div>
      </section>
      {resource.key === 'wallets' && Boolean(data.movements) && <WalletMovements movements={data.movements as Page<Row>} search={search} base={`${base}/${id}`} />}
      {resource.key === 'orders' && <section className="admin-panel"><h2>Detalles del pedido</h2>{Object.keys(orderHistories).map(name => <OrderHistory key={name} name={name} value={data[name]} />)}</section>}
    </>}</>}
  </>
}

type Summary = { collaborator_id: string; linked_clients: number; valid_attributed_consumptions: number }
function CollaboratorSummary({ id }: { id: string }) {
  const load = useCallback(async (signal: AbortSignal) => {
    const result = await adminApi<Summary>(`collaborators/${encodeURIComponent(id)}/summary/`, { signal })
    if (result.collaborator_id !== id) throw new Error('El resumen no corresponde a esta ficha.')
    return result
  }, [id])
  const { data, loading, error, reload } = useAdminLoad(load)
  return <section className="admin-panel" aria-label="Ingresos y visitas"><h2>Ingresos y visitas</h2><p>Clientes vinculados históricamente y visitas válidas atribuidas a este colaborador. No representa escaneos del QR.</p>
    {loading ? <p role="status">Cargando resumen…</p> : error ? <><Status error>{error}</Status><button className="button button-ghost" onClick={reload}>Reintentar resumen</button></> : data && <dl className="admin-details"><div><dt>Clientes que ingresaron por QR</dt><dd>{data.linked_clients}</dd></div><div><dt>Visitas válidas atribuidas</dt><dd>{data.valid_attributed_consumptions}</dd></div></dl>}
  </section>
}

function PrivateMedia({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState('')
  const request = useRef(0)
  useEffect(() => () => { request.current += 1; if (url) URL.revokeObjectURL(url) }, [url])
  const load = async () => {
    const sequence = ++request.current
    const version = currentSessionVersion()
    try {
      const next = await privateImage(path)
      if (sequence !== request.current || version !== currentSessionVersion()) { if (next) URL.revokeObjectURL(next); return }
      setUrl(next)
    } catch (cause) { permissionLost(cause); if (sequence === request.current && version === currentSessionVersion()) setError(cause instanceof Error ? cause.message : 'No se pudo cargar la imagen.') }
  }
  return <div className="admin-media">{error && <Status error>{error}</Status>}{url && <img src={url} alt="Imagen del registro" />}<div className="admin-actions"><button className="button button-ghost" onClick={() => void load()}>Mostrar imagen</button><button className="button button-ghost" onClick={() => void authorizedDownload(path, 'imagen.png').catch(cause => setError(cause instanceof Error ? cause.message : 'No se pudo descargar.'))}>Descargar imagen</button></div></div>
}

export function NewRecord({ resource, search }: { resource: Resource; search: string }) {
  const base = `/gestion/${routeFor(resource.key)}`
  const [saved, setSaved] = useState<Row | null>(null)
  return <><BackLink href={`${base}${search}`} />{saved ? <section className="admin-panel"><Status>El registro fue creado.{resource.key === 'products' && ' Está en borrador y sin existencias.'}</Status><ProductLink className="button button-orange" href={`${base}/${saved.id}${search}${resource.key === 'products' ? '#stock' : ''}`}>{resource.key === 'products' ? 'Abrir ficha y cargar existencias →' : 'Abrir ficha →'}</ProductLink></section> : <RecordForm resource={resource} data={null} back={`${base}${search}`} onSaved={setSaved} />}</>
}
