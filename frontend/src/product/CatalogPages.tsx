import { useEffect, useMemo, useState } from 'react'
import { ApiError } from './api'
import { ButtonLink } from './Layout'
import { ProductLink } from './navigation'
import { navigate } from './navigate'
import { catalogHref, readCatalogQuery } from './catalog-query'
import { useCatalogCategories } from './useCatalogCategories'
import { CategoryChips } from './ui/CategoryChips'
import { EmptyState } from './ui/EmptyState'
import { CardSkeleton } from './ui/CardSkeleton'
import { calendarDate, catalogBenefit, catalogConfig, publicImage, safeExternal } from './catalog'
import type { PublicBenefit } from './catalog'
import { usePublicCatalog } from './usePublicCatalog'
import { messageOf } from './shared'

export function PublicPhoto({ path, alt, name, className = '' }: { path: string | null; alt: string; name: string; className?: string }) {
  const [image, setImage] = useState<{ path: string; url: string } | null>(null)
  useEffect(() => {
    if (!path) return
    const controller = new AbortController()
    let created: string | null = null
    void publicImage(path, controller.signal).then(url => {
      created = url
      if (controller.signal.aborted) URL.revokeObjectURL(url)
      else setImage({ path, url })
    }).catch(() => { if (!controller.signal.aborted) setImage(null) })
    return () => { controller.abort(); if (created) URL.revokeObjectURL(created) }
  }, [path])
  return <div className={`catalog-photo ${className}`}>{image?.path === path ? <img src={image.url} alt={alt} /> : <span aria-label={name}>{name.slice(0, 2).toLocaleUpperCase()}</span>}</div>
}

export function CatalogState({ enabled, loading, error, retry }: { enabled: boolean | null; loading: boolean; error: string; retry: () => void }) {
  if (loading) return <p className="catalog-state" role="status">Consultando beneficios vigentes…</p>
  if (enabled === false) return <div className="catalog-state"><h2>El catálogo general no está disponible ahora.</h2><p>Si tenés el QR de un colaborador, podés entrar a sus recomendaciones privadas.</p><ButtonLink href="/referencia">Ingresar con QR</ButtonLink></div>
  if (error) return <div className="catalog-state" role="alert"><h2>No pudimos cargar los beneficios.</h2><p>{error}</p><button className="button button-orange" onClick={retry}>Volver a intentar</button></div>
  return null
}

export function BenefitCard({ benefit }: { benefit: PublicBenefit }) {
  return <article className="catalog-card client-benefit-card">
    <PublicPhoto path={benefit.image_url ?? benefit.provider.image_url} alt={`Imagen de ${benefit.provider.name}`} name={benefit.provider.name} />
    <div className="catalog-card-copy">
      <span>{benefit.provider.category || 'Beneficio local'} {benefit.demo && '· Dato demo'}</span>
      <h3>{benefit.title}</h3><p className="client-benefit-provider">{benefit.provider.name}</p>
      {benefit.conditions && <p className="catalog-card-conditions">{benefit.conditions}</p>}
      <ProductLink className="catalog-card-link" href={`/beneficios/${benefit.id}`}>Ver beneficio y condiciones <span aria-hidden="true">↗</span></ProductLink>
    </div>
  </article>
}

export function CatalogPage({ search }: { search: string }) {
  const query = readCatalogQuery(search)
  const { enabled, data, loading, error, retry } = usePublicCatalog(query.page, query.search, query.category)
  const categories = useCatalogCategories(enabled)
  const apply = (changes: Partial<typeof query>) => navigate(catalogHref({ ...query, ...changes }))
  const hasFilters = Boolean(query.search || query.category)
  const missingPage = enabled === true && Boolean(error) && query.page > 1
  return <main id="contenido" className="catalog-page client-catalog-page"><div className="content-width">
    <p className="eyebrow">LLAVE EXTRA · USHUAIA</p><h1>Beneficios para vivir más la ciudad.</h1>
    <p className="catalog-intro">Explorá las propuestas publicadas y vigentes de la red. Consultá las condiciones de cada una antes de visitar el local.</p>
    <form className="client-catalog-search" onSubmit={event => {
      event.preventDefault()
      const value = new FormData(event.currentTarget).get('search')
      apply({ search: String(value ?? '').trim(), page: 1 })
    }}>
      <label htmlFor="catalog-search">Buscar beneficio o prestador</label>
      <div><input key={search} id="catalog-search" name="search" defaultValue={query.search} placeholder="¿Qué te gustaría descubrir?" type="search" /><button className="button button-dark">Buscar</button></div>
    </form>
    <CategoryChips categories={categories.categories} value={query.category} onChange={category => apply({ category, page: 1 })} />
    {categories.loading && <p className="form-help" role="status">Consultando categorías…</p>}
    {categories.error && <div className="client-category-error" role="status"><p>No pudimos cargar las categorías. Podés seguir buscando beneficios.</p><button type="button" onClick={categories.retry}>Reintentar categorías</button></div>}
    {hasFilters && <div className="client-active-filters" role="group" aria-label="Filtros activos">
      {query.search && <button type="button" aria-label={`Quitar búsqueda: ${query.search}`} onClick={() => apply({ search: '', page: 1 })}>Búsqueda: {query.search} ×</button>}
      {query.category && <button type="button" aria-label={`Quitar categoría: ${query.category}`} onClick={() => apply({ category: '', page: 1 })}>Categoría: {query.category} ×</button>}
      <button type="button" onClick={() => apply({ search: '', category: '', page: 1 })}>Limpiar filtros</button>
    </div>}
    {loading ? <CardSkeleton count={3} /> : missingPage ? <EmptyState title="Esta página ya no existe." description="La lista de beneficios pudo cambiar. Volvé al inicio de los resultados para continuar."><ButtonLink href={catalogHref({ ...query, page: 1 })}>Volver a la página 1</ButtonLink></EmptyState> : <CatalogState enabled={enabled} loading={false} error={error} retry={retry} />}
    {enabled && data && <>
      {data.results.length ? <div className="catalog-grid">{data.results.map(item => <BenefitCard key={item.id} benefit={item} />)}</div> : <EmptyState title="No encontramos beneficios para esta búsqueda." description="Probá con otros términos o revisá todas las categorías.">{hasFilters && <button className="button button-dark" onClick={() => apply({ search: '', category: '', page: 1 })}>Ver todos los beneficios</button>}</EmptyState>}
      <nav className="catalog-pagination" aria-label="Páginas de beneficios">
        <button disabled={!data.previous || query.page === 1} onClick={() => apply({ page: query.page - 1 })}>← Anterior</button>
        <span aria-live="polite">Página {query.page} · {data.count} beneficios</span>
        <button disabled={!data.next} onClick={() => apply({ page: query.page + 1 })}>Siguiente →</button>
      </nav>
    </>}
  </div></main>
}

function CopyAddress({ address }: { address: string }) {
  const [result, setResult] = useState('')
  const [copying, setCopying] = useState(false)
  const copy = async () => {
    if (copying) return
    setCopying(true)
    setResult('')
    try {
      await navigator.clipboard.writeText(address)
      setResult('Dirección copiada.')
    } catch {
      setResult('No pudimos copiar la dirección. Podés seleccionar y copiar el texto.')
    } finally { setCopying(false) }
  }
  return <div className="client-copy-address"><p className="client-address">{address}</p><button type="button" disabled={copying} onClick={() => void copy()}>{copying ? 'Copiando…' : 'Copiar dirección'}</button><p role="status" aria-live="polite">{result}</p></div>
}

export function BenefitDetail({ id }: { id: string }) {
  const [state, setState] = useState<{ key: object | null; benefit: PublicBenefit | null; disabled: boolean; error: string }>({ key: null, benefit: null, disabled: false, error: '' })
  const [revision, setRevision] = useState(0)
  const key = useMemo(() => ({ id, revision }), [id, revision])
  useEffect(() => {
    const controller = new AbortController()
    void catalogConfig(controller.signal).then(async config => {
      if (controller.signal.aborted) return
      if (!config.enabled) { setState({ key, benefit: null, disabled: true, error: '' }); return }
      const benefit = await catalogBenefit(id, controller.signal)
      if (!controller.signal.aborted) setState({ key, benefit, disabled: false, error: '' })
    }).catch(error => {
      if (controller.signal.aborted) return
      setState({ key, benefit: null, disabled: error instanceof ApiError && error.status === 404, error: error instanceof ApiError && error.status === 404 ? '' : messageOf(error) })
    })
    return () => controller.abort()
  }, [id, key])
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible') setRevision(value => value + 1) }
    window.addEventListener('focus', refresh); document.addEventListener('visibilitychange', refresh)
    return () => { window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh) }
  }, [])
  const current = state.key === key ? state : { benefit: null, disabled: false, error: '' }
  const benefit = current.benefit
  return <main id="contenido" className="catalog-page client-catalog-page"><div className="content-width">
    <ProductLink className="back-link" href="/beneficios">← Volver a beneficios</ProductLink>
    {state.key !== key && <p role="status">Consultando beneficio…</p>}
    {current.disabled && <div className="catalog-state"><h1>Este beneficio no está disponible.</h1><p>El catálogo puede estar pausado o la propuesta ya no estar vigente.</p><ButtonLink href="/referencia">Tengo un QR</ButtonLink></div>}
    {current.error && <div role="alert" className="catalog-state"><h1>No pudimos cargar el beneficio.</h1><p>{current.error}</p><button className="button button-orange" onClick={() => setRevision(value => value + 1)}>Volver a intentar</button></div>}
    {benefit && <article className="client-benefit-detail">
      <div className="client-detail-main">
        <PublicPhoto path={benefit.image_url ?? benefit.provider.image_url} alt={`Imagen de ${benefit.provider.name}`} name={benefit.provider.name} className="client-detail-photo" />
        <div><p className="eyebrow">{benefit.provider.category || 'BENEFICIO LOCAL'} {benefit.demo && '· DATO DEMO'}</p>
          <h1>{benefit.title}</h1><p className="client-detail-provider">{benefit.provider.name}</p>
          <section aria-labelledby="benefit-offer"><h2 id="benefit-offer">Qué obtenés</h2>
            {benefit.description && <p>{benefit.description}</p>}
            {benefit.conditions && <div className="catalog-conditions"><strong>Condiciones</strong><p>{benefit.conditions}</p></div>}
            {(benefit.valid_from || benefit.valid_until) && <p>Vigencia: {calendarDate(benefit.valid_from) ?? 'sin inicio definido'} — {calendarDate(benefit.valid_until) ?? 'sin cierre definido'}</p>}
          </section>
        </div>
      </div>
      <div className="client-detail-sections">
        <section aria-labelledby="benefit-use"><span className="client-detail-number" aria-hidden="true">01</span><h2 id="benefit-use">Cómo usarlo</h2>
          <p>Consultá las condiciones de esta propuesta antes de visitar el local.</p>
          <p>Para acreditar una visita, escaneá en el local el QR del prestador e ingresá su PIN. La validación requiere cuenta y email verificado.</p>
        </section>
        <section aria-labelledby="benefit-location"><span className="client-detail-number" aria-hidden="true">02</span><h2 id="benefit-location">Dónde encontrarlo</h2>
          <p><strong>{benefit.provider.name}</strong></p>
          {benefit.provider.address ? <CopyAddress address={benefit.provider.address} /> : <p>La dirección no fue informada.</p>}
          {benefit.provider.hours && <p><strong>Horarios:</strong> {benefit.provider.hours}</p>}
          {benefit.provider.contact && <p><strong>Contacto:</strong> {benefit.provider.contact}</p>}
          <div className="client-location-links">
            {safeExternal(benefit.provider.map_url) && <a href={safeExternal(benefit.provider.map_url)!} target="_blank" rel="noopener noreferrer">Ver mapa del prestador ↗</a>}
            {safeExternal(benefit.provider.website) && <a href={safeExternal(benefit.provider.website)!} target="_blank" rel="noopener noreferrer">Sitio del prestador ↗</a>}
          </div>
        </section>
      </div>
    </article>}
  </div></main>
}
