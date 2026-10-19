import { useEffect, useState } from 'react'
import { ApiError } from './api'
import { ButtonLink } from './Layout'
import { ProductLink } from './navigation'
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
  return <article className="catalog-card"><PublicPhoto path={benefit.image_url ?? benefit.provider.image_url} alt={`Imagen de ${benefit.provider.name}`} name={benefit.provider.name} /><div className="catalog-card-copy"><span>{benefit.provider.category || 'Beneficio local'} {benefit.demo && '· Dato demo'}</span><h3>{benefit.title}</h3><p>{benefit.provider.name}</p>{benefit.conditions && <p className="catalog-card-conditions">{benefit.conditions}</p>}<ProductLink className="catalog-card-link" href={`/beneficios/${benefit.id}`}>Ver beneficio y condiciones <span aria-hidden="true">↗</span></ProductLink></div></article>
}

export function CatalogPage() {
  const [page, setPage] = useState(1)
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [categoryQuery, setCategoryQuery] = useState('')
  const { enabled, data, loading, error, retry } = usePublicCatalog(page, search, category)
  return <main id="contenido" className="catalog-page"><div className="content-width"><p className="eyebrow">LLAVE EXTRA · USHUAIA</p><h1>Beneficios para vivir más la ciudad.</h1><p className="catalog-intro">Explorá las propuestas publicadas y vigentes de la red. Consultá las condiciones de cada una antes de visitar el local.</p><form className="catalog-filters" onSubmit={event => { event.preventDefault(); setPage(1); setSearch(query.trim()); setCategory(categoryQuery.trim()) }}><label htmlFor="catalog-search">Buscar beneficio o prestador</label><div><input id="catalog-search" value={query} onChange={event => setQuery(event.target.value)} placeholder="¿Qué te gustaría descubrir?" /><button className="button button-dark">Buscar</button></div><label htmlFor="catalog-category">Categoría exacta</label><input id="catalog-category" value={categoryQuery} onChange={event => setCategoryQuery(event.target.value)} placeholder="Todas las categorías" /></form><CatalogState enabled={enabled} loading={loading} error={error} retry={retry} />{enabled && data && <>{data.results.length ? <div className="catalog-grid">{data.results.map(item => <BenefitCard key={item.id} benefit={item} />)}</div> : <div className="catalog-state"><h2>No encontramos beneficios para esta búsqueda.</h2><p>Probá con otros términos o revisá todas las categorías.</p></div>}<div className="catalog-pagination"><button disabled={!data.previous} onClick={() => setPage(value => Math.max(1, value - 1))}>← Anterior</button><span>Página {page} · {data.count} beneficios</span><button disabled={!data.next} onClick={() => setPage(value => value + 1)}>Siguiente →</button></div></>}</div></main>
}

export function BenefitDetail({ id }: { id: string }) {
  const [state, setState] = useState<{ key: string; benefit: PublicBenefit | null; disabled: boolean; error: string }>({ key: '', benefit: null, disabled: false, error: '' })
  const [revision, setRevision] = useState(0)
  const key = `${id}:${revision}`
  useEffect(() => {
    const controller = new AbortController()
    void catalogConfig(controller.signal).then(async config => {
      if (!config.enabled) { if (!controller.signal.aborted) setState({ key, benefit: null, disabled: true, error: '' }); return }
      const benefit = await catalogBenefit(id, controller.signal)
      if (!controller.signal.aborted) setState({ key, benefit, disabled: false, error: '' })
    }).catch(error => {
      if (controller.signal.aborted) return
      setState({ key, benefit: null, disabled: error instanceof ApiError && error.status === 404, error: error instanceof ApiError && error.status === 404 ? '' : messageOf(error) })
    })
    return () => controller.abort()
  }, [id, revision, key])
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible') setRevision(value => value + 1) }
    window.addEventListener('focus', refresh); document.addEventListener('visibilitychange', refresh)
    return () => { window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh) }
  }, [])
  const current = state.key === key ? state : { benefit: null, disabled: false, error: '' }
  const benefit = current.benefit
  return <main id="contenido" className="catalog-page"><div className="content-width"><ProductLink className="back-link" href="/beneficios">← Volver a beneficios</ProductLink>{state.key !== key && <p role="status">Consultando beneficio…</p>}{current.disabled && <div className="catalog-state"><h1>Este beneficio no está disponible.</h1><p>El catálogo puede estar pausado o la propuesta ya no estar vigente.</p><ButtonLink href="/referencia">Tengo un QR</ButtonLink></div>}{current.error && <div role="alert" className="catalog-state"><h1>No pudimos cargar el beneficio.</h1><p>{current.error}</p><button className="button button-orange" onClick={() => setRevision(value => value + 1)}>Volver a intentar</button></div>}{benefit && <div className="catalog-detail"><PublicPhoto path={benefit.image_url ?? benefit.provider.image_url} alt={`Imagen de ${benefit.provider.name}`} name={benefit.provider.name} /><div><p className="eyebrow">{benefit.provider.category || 'BENEFICIO LOCAL'} {benefit.demo && '· DATO DEMO'}</p><h1>{benefit.title}</h1><h2>{benefit.provider.name}</h2>{benefit.description && <p>{benefit.description}</p>}{benefit.conditions && <div className="catalog-conditions"><strong>Condiciones</strong><p>{benefit.conditions}</p></div>}{(benefit.valid_from || benefit.valid_until) && <p>Vigencia: {calendarDate(benefit.valid_from) ?? 'sin inicio definido'} — {calendarDate(benefit.valid_until) ?? 'sin cierre definido'}</p>}{benefit.provider.address && <p><strong>Dirección:</strong> {benefit.provider.address}</p>}{benefit.provider.hours && <p><strong>Horarios:</strong> {benefit.provider.hours}</p>}{benefit.provider.contact && <p><strong>Contacto:</strong> {benefit.provider.contact}</p>}{safeExternal(benefit.provider.website) && <p><a href={safeExternal(benefit.provider.website)!} target="_blank" rel="noopener noreferrer">Sitio del prestador ↗</a></p>}{safeExternal(benefit.provider.map_url) && <p><a href={safeExternal(benefit.provider.map_url)!} target="_blank" rel="noopener noreferrer">Ver mapa del prestador ↗</a></p>}<p className="form-help">Para acreditar una visita, escaneá en el local el QR del prestador e ingresá su PIN. La validación requiere cuenta y email verificado.</p></div></div>}</div></main>
}
