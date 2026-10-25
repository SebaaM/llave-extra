import { useCallback, useEffect, useRef, useState } from 'react'
import { currentSessionVersion, privateImage } from '../api'
import { ProductLink } from '../navigation'
import { adminApi, authorizedDownload, detail, permissionLost } from './api'
import { RecordActions, PrivateQr } from './Actions'
import { fieldLabels } from './data'
import { useAdminLoad } from './hooks'
import { RecordForm } from './RecordForm'
import { checkAdminNavigation } from './hooks'
import { routeFor } from './routes'
import type { Resource, Row } from './types'
import { BackLink, DetailFields, LoadState, Status } from './UI'
import { formatValue } from './formatValue'

export function RecordDetail({ resource, id, search }: { resource: Resource; id: string; search: string }) {
  const [editing, setEditing] = useState(false)
  const [related, setRelated] = useState<Row[] | null>(null)
  const [relatedError, setRelatedError] = useState('')
  const request = useRef(0)
  useEffect(() => () => { request.current += 1 }, [])
  const base = `/gestion/${routeFor(resource.key)}`
  const load = useCallback((signal: AbortSignal) => detail(resource.key, id, signal), [resource.key, id])
  const { data, loading, error, reload, setState } = useAdminLoad(load)
  const refresh = async () => {
    const sequence = ++request.current
    const version = currentSessionVersion()
    const next = await detail(resource.key, id, new AbortController().signal)
    if (sequence !== request.current || version !== currentSessionVersion()) throw new DOMException('Ficha reemplazada', 'AbortError')
    setState({ data: next, loading: false, error: '' })
    setRelated(null)
    return next
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
    <BackLink href={`${base}${search}`} />
    <LoadState loading={loading} error={error} retry={reload} />
    {data && <>
      <div className="admin-record-heading"><div><p className="eyebrow">FICHA DE {resource.singular.toUpperCase()}</p><h2>{String(data.name ?? data.title ?? data.email ?? data.user_email ?? data.customer_email ?? data.id)}</h2><span className="admin-id">ID {data.id}</span></div><div className="admin-actions"><button className="button button-ghost" disabled={editing} onClick={() => void refresh()}>Actualizar ficha</button>{resource.fields && <button className="button button-dark" onClick={() => { if (!editing || checkAdminNavigation()) setEditing(value => !value) }}>{editing ? 'Cerrar edición' : 'Editar'}</button>}</div></div>
      {editing && resource.fields && <RecordForm key={`${resource.key}:${id}`} resource={resource} data={data} back={`${base}/${id}${search}`} onReload={refresh} onSaved={row => { setState({ data: row, loading: false, error: '' }); setEditing(false) }} />}
      <section className="admin-panel"><h2>Información</h2><DetailFields data={data} names={[...resource.columns, ...(resource.detail ?? [])].filter((name, index, all) => all.indexOf(name) === index && name !== 'image_url')} />{typeof data.image_url === 'string' && <PrivateMedia key={data.image_url} path={data.image_url} />}</section>
      {resource.key === 'collaborators' && <section className="admin-panel"><h2>Beneficios seleccionados</h2><p>Solo estas ofertas concretas integran la carpeta del colaborador.</p><button className="button button-ghost" onClick={() => void loadRelated()}>Consultar selección actual</button>{relatedError && <Status error>{relatedError}</Status>}{related && (related.length ? <ul className="admin-related">{related.map(item => <li key={String(item.benefit_id)}><strong>{item.available ? 'Disponible' : 'No disponible'}</strong> · {String(item.benefit_id)}{Boolean(item.benefit) && <span> · {String((item.benefit as Row).title)}</span>}</li>)}</ul> : <p>No hay beneficios seleccionados.</p>)}</section>}
      {(resource.key === 'providers' || resource.key === 'collaborators') && <PrivateQr key={`${data.id}:${data.version}`} resource={resource.key} id={data.id} />}
      <section className="admin-panel"><h2>Acciones</h2><p className="admin-muted">Cada operación comprueba el estado actual. Después de un cambio, la ficha se actualiza para la próxima acción.</p><div className="admin-action-grid"><RecordActions resource={resource.key} data={data} onSuccess={() => refresh().then(() => undefined)} /></div></section>
      {resource.key === 'wallets' && data.movements && <section className="admin-panel"><h2>Movimientos de billetera</h2><p>Los movimientos son de solo lectura.</p>{formatValue(data.movements)}</section>}
      {resource.key === 'orders' && <section className="admin-panel"><h2>Detalles del pedido</h2>{['lines', 'cancellations', 'payment_operations', 'audit'].map(name => <div key={name}><h3>{fieldLabels[name] ?? name.replaceAll('_', ' ')}</h3>{formatValue(data[name])}</div>)}</section>}
    </>}
  </>
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
  return <><BackLink href={`${base}${search}`} />{saved ? <section className="admin-panel"><Status>El registro fue creado.</Status><ProductLink className="button button-orange" href={`${base}/${saved.id}`}>Abrir ficha →</ProductLink></section> : <RecordForm resource={resource} data={null} back={`${base}${search}`} onSaved={setSaved} />}</>
}
