import { PrivatePhoto } from './PrivatePhoto'
export { PrivatePhoto } from './PrivatePhoto'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, api, currentSessionVersion } from './api'
import type { Benefit, Folder, Provider } from './api'
import { messageOf } from './shared'
import { NetworkCanvas } from './NetworkCanvas'
import { safeExternal } from './catalog'
import { EmptyState } from './ui/EmptyState'

type FolderPageProps = {
  folders: Folder[]
  selected: string
  select: (value: string) => void
  providers: Provider[]
  onOpen: (id: string) => void
  onAccessRevoked?: () => void
  onProvidersChange?: (providers: Provider[]) => void
}

export function FolderPage(props: FolderPageProps) {
  return <FolderContent key={`${props.selected}:${currentSessionVersion()}`} {...props} />
}

function FolderPhoto({ provider, onDenied, onMissing }: { provider: Provider; onDenied: () => void; onMissing: (path: string) => void }) {
  const path = provider.image_url
  const missing = useCallback(() => { if (path) onMissing(path) }, [path, onMissing])
  return <PrivatePhoto path={path} alt={`Imagen de ${provider.name}`} onDenied={onDenied} onMissing={missing} />
}

function FolderContent({ folders, selected, select, providers: initialProviders, onOpen, onAccessRevoked, onProvidersChange }: FolderPageProps) {
  const version = currentSessionVersion()
  const [revision, setRevision] = useState(0)
  const [result, setResult] = useState<{ state: 'initial' | 'loading' | 'ready' | 'denied' | 'error'; providers: Provider[]; error: string }>({ state: 'initial', providers: [], error: '' })
  const [missingPaths, setMissingPaths] = useState<string[]>([])
  const revokedRef = useRef(onAccessRevoked)
  const providersChangeRef = useRef(onProvidersChange)
  const activeRef = useRef(true)
  const blockedRef = useRef(false)
  const controllerRef = useRef<AbortController | null>(null)
  useEffect(() => { revokedRef.current = onAccessRevoked }, [onAccessRevoked])
  useEffect(() => { providersChangeRef.current = onProvidersChange }, [onProvidersChange])
  useEffect(() => {
    activeRef.current = true
    return () => { activeRef.current = false; controllerRef.current?.abort() }
  }, [])
  const denyMedia = useCallback(() => {
    if (!activeRef.current || version !== currentSessionVersion() || blockedRef.current) return
    blockedRef.current = true
    controllerRef.current?.abort()
    setResult({ state: 'denied', providers: [], error: '' })
    providersChangeRef.current?.([])
    revokedRef.current?.()
  }, [version])
  const missingMedia = useCallback((path: string) => {
    if (!activeRef.current || version !== currentSessionVersion() || blockedRef.current) return
    // Retirar también red y filtros: el 404 todavía no confirma autorización.
    blockedRef.current = true
    setMissingPaths(previous => [...previous, path])
    setResult({ state: 'loading', providers: [], error: '' })
    providersChangeRef.current?.([])
    setRevision(value => value + 1)
  }, [version])
  useEffect(() => {
    if (revision === 0) return
    const controller = new AbortController()
    controllerRef.current = controller
    // Conservar el callback de la generación que inició la lectura; el padre
    // podrá descartar el resultado si ya actualizó sus accesos mientras tanto.
    const providersChanged = providersChangeRef.current
    void api<Provider[]>(`/api/v1/folders/${encodeURIComponent(selected)}/providers/`, { signal: controller.signal }).then(providers => {
      if (controller.signal.aborted || version !== currentSessionVersion()) return
      blockedRef.current = false
      setResult({ state: 'ready', providers, error: '' })
      providersChanged?.(providers)
    }).catch(error => {
      if (controller.signal.aborted || version !== currentSessionVersion()) return
      blockedRef.current = false
      if (error instanceof ApiError && [401, 403, 404].includes(error.status)) denyMedia()
      else setResult({ state: 'error', providers: [], error: messageOf(error) })
    })
    return () => controller.abort()
  }, [revision, selected, version, denyMedia])
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const providers = result.state === 'initial' ? initialProviders : result.providers
  const categories = [...new Set(providers.map(provider => provider.category).filter(Boolean))].sort()
  const shown = providers.filter(provider => {
    const matchesCategory = !category || provider.category === category
    const searchable = `${provider.name} ${provider.category} ${provider.description}`.toLocaleLowerCase()
    return matchesCategory && searchable.includes(query.toLocaleLowerCase())
  })
  const folderPicker = folders.length > 1 && <label className="folder-picker">
    Selección recibida
    <select value={selected} onChange={event => select(event.target.value)}>
      {folders.map((folder, index) => <option key={folder.collaborator_id} value={folder.collaborator_id}>Selección recibida {index + 1}</option>)}
    </select>
  </label>

  if (['loading', 'denied', 'error'].includes(result.state)) return <main id="contenido" className="private-benefits"><div className="content-width">
    {result.state === 'error' ? <p role="alert">{result.error}</p> : <p role="status">{result.state === 'loading' ? 'Consultando recomendaciones vigentes…' : 'El acceso a estas recomendaciones ya no está disponible.'}</p>}
    {result.state !== 'loading' && <button className="button button-dark" onClick={() => {
      if (!activeRef.current || version !== currentSessionVersion()) return
      blockedRef.current = true
      setResult({ state: 'loading', providers: [], error: '' })
      providersChangeRef.current?.([])
      setRevision(value => value + 1)
    }}>Reintentar recomendaciones</button>}
    {folderPicker}
  </div></main>

  return <main id="contenido" className="private-benefits client-recommendations">
    <div className="content-width">
      <header className="client-private-heading"><p className="eyebrow">RECOMENDACIONES RECIBIDAS</p>
      <h1>Recomendaciones locales.</h1>
      <p className="private-lead">Explorá los beneficios que te recomendaron y revisá sus condiciones. Están disponibles mientras el QR con el que los recibiste siga activo.</p>
      </header>
      {folderPicker}
      {selected && <NetworkCanvas key={selected} folderId={selected} onOpenProvider={onOpen} onAccessRevoked={denyMedia} />}
      <div className="search-row">
        <label htmlFor="provider-search">Buscar recomendaciones</label>
        <input id="provider-search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Nombre, categoría o descripción" />
        {categories.length > 0 && <>
          <label htmlFor="provider-category">Categoría</label>
          <select id="provider-category" value={category} onChange={event => setCategory(event.target.value)}>
            <option value="">Todas</option>
            {categories.map(value => <option key={value}>{value}</option>)}
          </select>
        </>}
      </div>
      {shown.length ? <div className="product-provider-grid">
        {shown.map(provider => <article className="product-provider-card client-private-postcard" key={provider.id}>
          <FolderPhoto provider={missingPaths.includes(provider.image_url ?? '') ? { ...provider, image_url: null } : provider} onDenied={denyMedia} onMissing={missingMedia} />
          <div>
            <span>{provider.category || 'Recomendación'} {provider.demo && '· Ejemplo'}</span>
            <h2>{provider.name}</h2>
            <p>{provider.description || 'Conocé los beneficios y condiciones disponibles.'}</p>
            <button className="button button-dark" onClick={() => onOpen(provider.id)}>Ver beneficios</button>
          </div>
        </article>)}
      </div> : <EmptyState title={providers.length ? 'No encontramos coincidencias.' : 'Todavía no hay beneficios disponibles en esta selección.'} description={providers.length ? 'Probá con otra búsqueda o categoría.' : 'Cuando haya beneficios vigentes disponibles, los vas a encontrar acá.'}>{providers.length > 0 && <button className="button button-dark" onClick={() => { setQuery(''); setCategory('') }}>Limpiar filtros</button>}</EmptyState>}
    </div>
  </main>
}

type ProviderDetailProps = {
  folderId: string
  provider: Provider
  onAccessRevoked: () => void
}

export function ProviderDetail({ folderId, provider, onAccessRevoked }: ProviderDetailProps) {
  const [revision, setRevision] = useState(0)
  const [missingImage, setMissingImage] = useState<{ context: string; path: string | null } | null>(null)
  const version = currentSessionVersion()
  const context = `${folderId}/${provider.id}/${version}`
  const key = `${context}/${revision}`
  const [result, setResult] = useState<{ key: string; benefits: Benefit[]; error: string; denied?: boolean }>({ key: '', benefits: [], error: '' })
  const accessRevokedRef = useRef(onAccessRevoked)

  useEffect(() => { accessRevokedRef.current = onAccessRevoked }, [onAccessRevoked])

  useEffect(() => {
    let alive = true
    const controller = new AbortController()
    api<Benefit[]>(`/api/v1/folders/${encodeURIComponent(folderId)}/providers/${encodeURIComponent(provider.id)}/benefits/`, { signal: controller.signal })
      .then(benefits => {
        if (alive && version === currentSessionVersion()) setResult({ key, benefits, error: '' })
      })
      .catch(error => {
        if (!alive || version !== currentSessionVersion()) return
        if (error instanceof ApiError && [401, 403, 404].includes(error.status)) {
          setResult({ key, benefits: [], error: '', denied: true })
          accessRevokedRef.current()
          return
        }
        setResult({ key, benefits: [], error: messageOf(error) })
      })
    return () => { alive = false; controller.abort() }
  }, [folderId, provider.id, key, version])

  const denyMedia = useCallback(() => {
    if (version !== currentSessionVersion()) return
    setResult({ key, benefits: [], error: '', denied: true })
    accessRevokedRef.current()
  }, [version, key])
  const missingMedia = useCallback(() => {
    if (version !== currentSessionVersion()) return
    setMissingImage({ context, path: provider.image_url })
    setRevision(value => value + 1)
  }, [version, provider.image_url, context])

  const loading = result.key !== key
  const benefits = loading ? [] : result.benefits
  const error = loading ? '' : result.error

  if (loading || result.denied || error) return <main id="contenido" className="private-benefits"><div className="content-width">
    {error ? <div role="alert"><p>{error}</p><button onClick={() => setRevision(value => value + 1)}>Reintentar</button></div> : <p role="status">{loading ? 'Consultando beneficios vigentes…' : 'El acceso a esta recomendación ya no está disponible.'}</p>}
  </div></main>

  return <main id="contenido" className="private-benefits">
    <div className="content-width">
      <a className="back-link" href="/recomendaciones">← Volver a recomendaciones</a>
      <div className="provider-detail">
        <PrivatePhoto path={missingImage?.context === context && missingImage.path === provider.image_url ? null : provider.image_url} alt={`Imagen de ${provider.name}`} onDenied={denyMedia} onMissing={missingMedia} />
        <div>
          <p className="eyebrow">{provider.category || 'BENEFICIO LOCAL'}</p>
          <h1>{provider.name}</h1>
          {provider.description && <p>{provider.description}</p>}
          {provider.address && <p><strong>Dirección:</strong> {provider.address}</p>}
          {provider.hours && <p><strong>Horarios:</strong> {provider.hours}</p>}
          {provider.contact && <p><strong>Contacto:</strong> {provider.contact}</p>}
          {safeExternal(provider.website) && <p><a href={safeExternal(provider.website)!} target="_blank" rel="noopener noreferrer">Sitio web del negocio</a></p>}
          <div className="benefit-cards">
            <h2>Beneficios y condiciones</h2>
            {loading && <p role="status">Cargando beneficios…</p>}
            {error && <p className="form-error" role="alert">{error}</p>}
            {!loading && !error && benefits.length === 0 && <p>No hay beneficios vigentes para mostrar ahora.</p>}
            {benefits.map(benefit => <article key={benefit.id}>
              <h3>{benefit.title}</h3>
              {benefit.description && <p>{benefit.description}</p>}
              {benefit.conditions && <p><strong>Condiciones:</strong> {benefit.conditions}</p>}
              {(benefit.valid_from || benefit.valid_until) && <p>Vigencia: {benefit.valid_from ?? 'sin fecha de inicio'} — {benefit.valid_until ?? 'sin fecha de cierre'}</p>}
            </article>)}
          </div>
          <p className="form-help">En el local, escaneá el QR del negocio e ingresá el PIN que te facilite para validar tu visita.</p>
        </div>
      </div>
    </div>
  </main>
}
