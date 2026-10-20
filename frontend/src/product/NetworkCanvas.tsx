import { useEffect, useRef, useState } from 'react'
import { ApiError, api } from './api'
import { privateImage } from './api'
import { publicNetwork } from './catalog'
import type { NetworkItem, NetworkPage, Presentation } from './catalog'
import { PublicPhoto } from './CatalogPages'
import { ProductLink } from './navigation'
import { messageOf } from './shared'

function PrivateNetworkPhoto({ path, name }: { path: string | null; name: string }) {
  const [image, setImage] = useState<{ path: string; url: string } | null>(null)
  useEffect(() => {
    if (!path) return
    let alive = true
    let created: string | null = null
    void privateImage(path).then(url => {
      if (!url) return
      created = url
      if (alive) setImage({ path, url })
      else URL.revokeObjectURL(url)
    }).catch(() => { if (alive) setImage(null) })
    return () => { alive = false; if (created) URL.revokeObjectURL(created) }
  }, [path])
  return <span className="network-node-photo">{image?.path === path ? <img src={image.url} alt="" /> : name.slice(0, 2).toLocaleUpperCase()}</span>
}

const backgroundImage = { HARBOR: '/images/ushuaia-harbor.jpg', BEAGLE: '/images/ushuaia-beagle.jpg' }

export function NetworkCanvas({ folderId, onOpenProvider, onAccessRevoked }: { folderId?: string; onOpenProvider?: (id: string) => void; onAccessRevoked?: () => void }) {
  const [page, setPage] = useState(1)
  const [response, setResponse] = useState<{ key: string; data: NetworkPage | null; error: string }>({ key: '', data: null, error: '' })
  const [paused, setPaused] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [focusWithin, setFocusWithin] = useState(false)
  const [hidden, setHidden] = useState(document.visibilityState === 'hidden')
  const [reduced, setReduced] = useState(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false)
  const [revision, setRevision] = useState(0)
  const key = `${folderId ?? 'public'}:${page}:${revision}`
  const loading = response.key !== key
  const data = loading ? null : response.data
  const error = loading ? '' : response.error
  const revokedRef = useRef(onAccessRevoked)
  useEffect(() => { revokedRef.current = onAccessRevoked }, [onAccessRevoked])

  useEffect(() => {
    const controller = new AbortController()
    // Public pages carry no JWT. Folder pages use the regular private client.
    const request = folderId
      ? api<NetworkPage>(`/api/v1/folders/${encodeURIComponent(folderId)}/network/?page=${page}`, { signal: controller.signal })
      : publicNetwork(page, controller.signal)
    void request.then(result => { if (!controller.signal.aborted) setResponse({ key, data: result, error: '' }) }).catch(caught => {
      if (controller.signal.aborted) return
      setResponse({ key, data: null, error: messageOf(caught) })
      if (folderId && caught instanceof ApiError && [401, 403, 404].includes(caught.status)) revokedRef.current?.()
    })
    return () => controller.abort()
  }, [folderId, page, revision, key])

  useEffect(() => {
    const visibility = () => { setHidden(document.visibilityState === 'hidden'); if (document.visibilityState === 'visible') setRevision(value => value + 1) }
    const motion = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    const change = () => setReduced(motion?.matches ?? false)
    document.addEventListener('visibilitychange', visibility)
    motion?.addEventListener('change', change)
    return () => { document.removeEventListener('visibilitychange', visibility); motion?.removeEventListener('change', change) }
  }, [])
  // Keep the server's board configuration mounted while a different page loads.
  const presentation: Presentation = response.data?.presentation ?? { title: folderId ? 'Red de recomendaciones' : 'La red Llave Extra', layout: 'RADIAL', theme: 'SAND', background: 'BEAGLE', page_size: 12, interval_seconds: 10, city: 'Ushuaia' }
  const totalPages = data ? Math.max(1, Math.ceil(data.count / presentation.page_size)) : 1
  useEffect(() => {
    if (!data?.next || paused || hovered || focusWithin || loading || hidden || reduced) return
    const timer = window.setTimeout(() => setPage(value => value + 1), presentation.interval_seconds * 1000)
    return () => window.clearTimeout(timer)
  }, [data, paused, hovered, focusWithin, loading, hidden, reduced, presentation.interval_seconds])

  const slotCount = Math.min(presentation.page_size, response.data?.count ?? presentation.page_size)
  const slots = Array.from({ length: slotCount }, (_, index) => {
    const angle = (index / slotCount) * Math.PI * 2 - Math.PI / 2
    const radius = presentation.layout === 'ORBIT' ? (index % 2 ? 41 : 34) : 39
    return { x: 50 + Math.cos(angle) * radius, y: 50 + Math.sin(angle) * radius }
  })
  const nodes = data?.results ?? []
  return <section className={`network-section network-${presentation.theme.toLowerCase()}`} aria-label={presentation.title} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} onFocusCapture={() => setFocusWithin(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocusWithin(false) }}>
    <div className="content-width network-heading"><div><p className="eyebrow">{folderId ? 'TU RED PRIVADA' : 'RED ACTIVA EN USHUAIA'}</p><h2>{presentation.title}</h2><p>Prestadores con beneficios vigentes. Cada punto representa un lugar de la red; su posición es visual y no indica una ubicación real.</p></div><span className="network-city">{presentation.city} · Tierra del Fuego</span></div>
    <div className="network-scene" style={{ backgroundImage: `linear-gradient(90deg,rgba(12,50,53,.78),rgba(12,50,53,.3)),url(${backgroundImage[presentation.background]})` }}><div className="network-board"><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" className="network-lines">{slots.map((slot, index) => <line key={index} x1="50" y1="50" x2={slot.x} y2={slot.y} />)}</svg><div className="network-center"><img src="/logo-llave-extra.png" alt="" /><strong>La red que conecta tu viaje</strong></div>{slots.map((slot, index) => {
      const item: NetworkItem | undefined = nodes[index]
      return <div key={index} className={`network-slot ${item ? 'network-slot-filled' : ''}`} style={{ left: `${slot.x}%`, top: `${slot.y}%` }}>{item && (folderId ? <button onClick={() => onOpenProvider?.(item.provider.id)} aria-label={`${item.provider.name}: ${item.benefit_title}`}><PrivateNetworkPhoto path={item.provider.image_url} name={item.provider.name} /><span>{item.provider.name}</span></button> : <ProductLink href={`/beneficios/${item.benefit_id}`} aria-label={`${item.provider.name}: ${item.benefit_title}`}><PublicPhoto path={item.provider.image_url} alt="" name={item.provider.name} className="network-node-photo" /><span>{item.provider.name}</span></ProductLink>)}</div>
    })}</div></div>
    <div className="content-width network-controls"><div>{loading ? <span role="status">Cargando red…</span> : error ? <span role="alert">{error} <button onClick={() => setRevision(value => value + 1)}>Reintentar</button></span> : data?.count === 0 ? <span>Pronto habrá prestadores vigentes para mostrar.</span> : <span>Página {page} de {totalPages} · {data?.count ?? 0} prestadores</span>}</div><div><button disabled={loading || page <= 1} onClick={() => setPage(value => value - 1)} aria-label="Página anterior">←</button><button onClick={() => setPaused(value => !value)} aria-pressed={paused}>{paused ? 'Reanudar' : 'Pausar'}</button><button disabled={loading || !data?.next} onClick={() => setPage(value => value + 1)} aria-label="Página siguiente">→</button></div></div>
  </section>
}
