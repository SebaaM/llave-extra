import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { ApiError, api, currentSessionVersion } from './api'
import { publicNetwork } from './catalog'
import type { NetworkItem, NetworkPage, Presentation } from './catalog'
import { PublicPhoto } from './CatalogPages'
import { PrivatePhoto } from './PrivatePhoto'
import { NetworkPreview } from './NetworkPreview'
import { messageOf } from './shared'

function NetworkPhoto({ item, folderId, onDenied, onMissing }: { item: NetworkItem; folderId?: string; onDenied: () => void; onMissing: (path: string) => void }) {
  const path = item.provider.image_url
  const missing = useCallback(() => { if (path) onMissing(path) }, [path, onMissing])
  return folderId
    ? <PrivatePhoto path={path} alt="" className="network-node-photo" onDenied={onDenied} onMissing={missing} />
    : <PublicPhoto path={path} alt="" name={item.provider.name} className="network-node-photo" />
}

const backgroundImage = { HARBOR: '/images/ushuaia-harbor.jpg', BEAGLE: '/images/ushuaia-beagle.jpg' }

export function NetworkCanvas({ folderId, onOpenProvider, onAccessRevoked, onAvailabilityChange }: { folderId?: string; onOpenProvider?: (id: string) => void; onAccessRevoked?: () => void; onAvailabilityChange?: (available: boolean) => void }) {
  const [page, setPage] = useState(1)
  const [response, setResponse] = useState<{ key: string; data: NetworkPage | null; error: string }>({ key: '', data: null, error: '' })
  const [paused, setPaused] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [focusWithin, setFocusWithin] = useState(false)
  const [hidden, setHidden] = useState(document.visibilityState === 'hidden')
  const [reduced, setReduced] = useState(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false)
  const [revision, setRevision] = useState(0)
  const [view, setView] = useState<'network' | 'list'>(() => window.matchMedia?.('(max-width: 680px)').matches ? 'list' : 'network')
  const section = useRef<HTMLElement>(null)
  const resizeFocus = useRef<string | null>(null)
  const [selection, setSelection] = useState<{ key: string; id: string } | null>(null)
  const [missingImages, setMissingImages] = useState<{ context: string; paths: string[] }>({ context: '', paths: [] })
  const sessionVersion = folderId ? currentSessionVersion() : 0
  const context = `${folderId ?? 'public'}:${sessionVersion}`
  const key = `${context}:${page}:${revision}`
  // Descartar la selección también si se vuelve luego a la página o carpeta anterior.
  if (selection && selection.key !== key) setSelection(null)
  const previewId = useId()
  const selectedButton = useRef<HTMLButtonElement | null>(null)
  const requestRef = useRef<AbortController | null>(null)
  const loading = response.key !== key
  const data = loading ? null : response.data
  const error = loading ? '' : response.error
  const revokedRef = useRef(onAccessRevoked)
  const availabilityRef = useRef(onAvailabilityChange)
  useEffect(() => { revokedRef.current = onAccessRevoked }, [onAccessRevoked])
  useEffect(() => { availabilityRef.current = onAvailabilityChange }, [onAvailabilityChange])

  useEffect(() => {
    const media = window.matchMedia?.('(max-width: 680px)')
    const change = () => {
      const focused = document.activeElement
      if (focused instanceof HTMLButtonElement && section.current?.contains(focused)) resizeFocus.current = focused.dataset.networkId ?? null
      setView(media?.matches ? 'list' : 'network')
    }
    media?.addEventListener('change', change)
    return () => media?.removeEventListener('change', change)
  }, [])
  useLayoutEffect(() => {
    const id = resizeFocus.current
    resizeFocus.current = null
    if (id) Array.from(section.current?.querySelectorAll<HTMLButtonElement>('button[data-network-id]') ?? []).find(button => button.dataset.networkId === id)?.focus()
  }, [view])

  useEffect(() => {
    const controller = new AbortController()
    requestRef.current = controller
    const availabilityChanged = availabilityRef.current
    // Las páginas públicas no envían JWT; la carpeta revalida su acceso privado.
    const request = folderId
      ? api<NetworkPage>(`/api/v1/folders/${encodeURIComponent(folderId)}/network/?page=${page}`, { signal: controller.signal })
      : publicNetwork(page, controller.signal)
    void request.then(result => {
      if (controller.signal.aborted || (folderId && sessionVersion !== currentSessionVersion())) return
      setResponse({ key, data: result, error: '' })
      // La ausencia de resultados en una página no prueba una selección vacía.
      if (folderId && (result.count === 0 || result.count > 0)) availabilityChanged?.(result.count > 0)
    }).catch(caught => {
      if (controller.signal.aborted || (folderId && sessionVersion !== currentSessionVersion())) return
      setResponse({ key, data: null, error: messageOf(caught) })
      if (folderId && caught instanceof ApiError && [401, 403, 404].includes(caught.status)) revokedRef.current?.()
    })
    return () => controller.abort()
  }, [folderId, page, revision, key, sessionVersion])

  const denyMedia = useCallback(() => {
    if (!folderId || sessionVersion !== currentSessionVersion() || requestRef.current?.signal.aborted) return
    requestRef.current?.abort()
    setResponse({ key, data: null, error: 'El acceso a esta red ya no está disponible.' })
    revokedRef.current?.()
  }, [folderId, sessionVersion, key])
  const missingMedia = useCallback((path: string) => {
    if (!folderId || sessionVersion !== currentSessionVersion() || requestRef.current?.signal.aborted) return
    requestRef.current?.abort()
    // Un 404 puede ser un archivo ausente. Ocultar contenido y revalidar la red,
    // conservando ese archivo como ausente para no provocar reintentos en bucle.
    setMissingImages(previous => ({ context, paths: [...(previous.context === context ? previous.paths : []), path] }))
    setRevision(value => value + 1)
  }, [folderId, sessionVersion, context])
  const nodes = (data?.results ?? []).map(item => missingImages.context === context && missingImages.paths.includes(item.provider.image_url ?? '')
    ? { ...item, provider: { ...item.provider, image_url: null } } : item)
  const selected = selection?.key === key ? nodes.find(item => item.provider.id === selection.id) : undefined

  useEffect(() => {
    const visibility = () => { setHidden(document.visibilityState === 'hidden'); if (document.visibilityState === 'visible') setRevision(value => value + 1) }
    const motion = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    const change = () => setReduced(motion?.matches ?? false)
    document.addEventListener('visibilitychange', visibility)
    motion?.addEventListener('change', change)
    return () => { document.removeEventListener('visibilitychange', visibility); motion?.removeEventListener('change', change) }
  }, [])
  // Mantener la presentación del servidor durante la carga, sin nodos anteriores.
  const presentation: Presentation = response.data?.presentation ?? { title: folderId ? 'Red de recomendaciones' : 'La red Llave Extra', layout: 'RADIAL', theme: 'SAND', background: 'BEAGLE', page_size: 12, interval_seconds: 10, city: 'Ushuaia' }
  const totalPages = data ? Math.max(1, Math.ceil(data.count / presentation.page_size)) : 1
  useEffect(() => {
    if (!data?.next || selected || paused || hovered || focusWithin || loading || hidden || reduced) return
    const timer = window.setTimeout(() => setPage(value => value + 1), presentation.interval_seconds * 1000)
    return () => window.clearTimeout(timer)
  }, [data, selected, paused, hovered, focusWithin, loading, hidden, reduced, presentation.interval_seconds])

  const slotCount = Math.min(presentation.page_size, response.data?.count ?? presentation.page_size)
  const slots = Array.from({ length: slotCount }, (_, index) => {
    const angle = (index / slotCount) * Math.PI * 2 - Math.PI / 2
    const radius = presentation.layout === 'ORBIT' ? (index % 2 ? 41 : 34) : 39
    return { x: 50 + Math.cos(angle) * radius, y: 50 + Math.sin(angle) * radius }
  })
  const selectItem = (item: NetworkItem, button: HTMLButtonElement) => {
    selectedButton.current = button
    setSelection({ key, id: item.provider.id })
  }
  const nodeButton = (item: NetworkItem) => <button data-network-id={item.provider.id} ref={button => { if (button && selected?.provider.id === item.provider.id) selectedButton.current = button }} onClick={event => selectItem(item, event.currentTarget)} aria-label={`${item.provider.name}: ${item.benefit_title}`} aria-pressed={selected?.provider.id === item.provider.id} aria-controls={previewId}>
    <NetworkPhoto key={`${key}:${item.provider.id}`} item={item} folderId={folderId} onDenied={denyMedia} onMissing={missingMedia} /><span>{item.provider.name}</span>{view === 'list' && <span>{item.benefit_title}</span>}
  </button>
  return <section ref={section} className={`network-section network-${presentation.theme.toLowerCase()}`} aria-label={presentation.title} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} onFocusCapture={() => setFocusWithin(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocusWithin(false) }}>
    <div className="content-width network-heading"><div><p className="eyebrow">{folderId ? 'RECOMENDACIONES RECIBIDAS' : 'RED ACTIVA EN USHUAIA'}</p><h2>{presentation.title}</h2><p>Negocios con beneficios vigentes.{view === 'network' && ' Cada punto representa un lugar de la red; su posición es visual y no indica una ubicación real.'}</p></div><span className="network-city">{presentation.city} · Tierra del Fuego</span></div>
    <div className="network-scene" hidden={view !== 'network'} style={{ backgroundImage: `linear-gradient(90deg,rgba(12,50,53,.78),rgba(12,50,53,.3)),url(${backgroundImage[presentation.background]})` }}><div className="network-board"><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" className="network-lines">{slots.map((slot, index) => <line key={index} x1="50" y1="50" x2={slot.x} y2={slot.y} />)}</svg><div className="network-center"><img src="/logo-llave-extra.png" alt="" /><strong>La red que conecta tu viaje</strong></div>{slots.map((slot, index) => {
      const item: NetworkItem | undefined = nodes[index]
      return <div key={index} className={`network-slot ${item ? 'network-slot-filled' : ''}`} style={{ left: `${slot.x}%`, top: `${slot.y}%` }}>{view === 'network' && item && nodeButton(item)}</div>
    })}</div></div>
    {view === 'list' && <ul className="content-width client-network-list" aria-label="Negocios de esta página">{nodes.map(item => <li key={item.provider.id}>{nodeButton(item)}</li>)}</ul>}
    <div className="content-width network-controls"><div>{loading ? <span role="status">Cargando red…</span> : error ? <span role="alert">{error} <button onClick={() => setRevision(value => value + 1)}>Reintentar</button></span> : data?.count === 0 ? <span>Pronto habrá negocios con beneficios para mostrar.</span> : <span>Página {page} de {totalPages} · {data?.count ?? 0} negocios</span>}</div><div><button disabled={loading || page <= 1} onClick={() => setPage(value => value - 1)} aria-label="Página anterior">←</button><button onClick={() => setPaused(value => !value)} aria-pressed={paused}>{paused ? 'Reanudar' : 'Pausar'}</button><button disabled={loading || !data?.next} onClick={() => setPage(value => value + 1)} aria-label="Página siguiente">→</button></div></div>
    <div className="content-width" id={previewId}>{selected && <NetworkPreview key={`${key}:${selected.provider.id}`} item={selected} folderId={folderId} onOpenProvider={onOpenProvider ? id => { setSelection(null); onOpenProvider(id) } : undefined} onClose={() => { setSelection(null); if (selectedButton.current?.isConnected) selectedButton.current.focus() }} onDenied={denyMedia} onMissing={missingMedia} />}</div>
  </section>
}
