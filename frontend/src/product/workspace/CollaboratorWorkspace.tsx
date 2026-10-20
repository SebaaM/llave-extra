import { useCallback, useState } from 'react'
import { api, ApiError } from '../api'
import { PrivatePhoto } from '../PrivatePhoto'
import { ProductLink } from '../navigation'
import { messageOf } from '../shared'
import { loadCatalog, loadRecommendations, recommendationPath } from './data'
import { useCurrent, useResource } from './hooks'
import { Empty, Feedback, Stats } from './UI'
import { WorkspaceQR } from './WorkspaceQR'

export function CollaboratorWorkspace({ section }: { section: string }) {
  const resource = useResource(loadRecommendations)
  const current = useCurrent()
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState('')
  const [actionError, setActionError] = useState('')
  const [denied, setDenied] = useState(false)
  const deny = useCallback(() => setDenied(true), [])
  async function change(id: string, add: boolean) {
    if (busy) return
    setBusy(id); setNotice(''); setActionError('')
    try {
      await api(recommendationPath(id), { method: add ? 'PUT' : 'DELETE', ...(add ? { body: {} } : {}) })
      if (current()) { setNotice(add ? 'Beneficio agregado a tus recomendaciones.' : 'Beneficio quitado de tus recomendaciones.'); resource.reload() }
    } catch (failure) {
      if (current()) { setActionError(messageOf(failure)); if (failure instanceof ApiError && failure.status === 403) setDenied(true) }
    } finally { if (current()) setBusy('') }
  }
  if (resource.loading) return <p role="status">Cargando tu espacio…</p>
  if (resource.error || denied) return <Empty title="Tu espacio no está disponible" text={resource.error || actionError || 'El acceso de colaborador requiere habilitación administrativa.'}><button className="button button-dark" onClick={() => { setDenied(false); resource.reload() }}>Volver a intentar</button></Empty>
  const recommendations = resource.data?.recommendations ?? []
  const available = recommendations.filter(item => item.available && item.benefit)
  if (section === '/qr') return <WorkspaceQR kind="collaborator" credentialPath="/api/v1/collaborator/qr/" />
  return <>
    <Feedback error={actionError} notice={notice} />
    {section === '' && <><section className="workspace-welcome"><div><span className="workspace-tag">TU MIRADA HACE LA DIFERENCIA</span><h2>Compartí lo mejor<br />de lo nuestro.</h2><p>Elegí experiencias locales para recomendar. Cada beneficio que sumás hace única tu carpeta.</p><ProductLink className="button button-orange" href="/colaborador/catalogo">Explorar beneficios <span aria-hidden="true">↗</span></ProductLink></div><div className="workspace-welcome-symbol" aria-hidden="true">✳</div></section><Stats items={[[ 'Beneficios elegidos', recommendations.length ], ['Disponibles', available.length], ['No disponibles', recommendations.length - available.length]]} /><section className="workspace-panel workspace-next"><div><span className="workspace-badge is-available">Colaborador habilitado</span><h2>Tu selección, en un QR</h2><p>Los clientes acceden a tus recomendaciones escaneando tu QR personal.</p></div><ProductLink className="button button-dark" href="/colaborador/qr">Ver mi QR →</ProductLink></section></>}
    {(section === '' || section === '/recomendaciones') && <><div className="workspace-section-heading"><div><h2>Tu selección local</h2><p>Solo se comparte cada beneficio que elegís. Otras ofertas del negocio no se agregan automáticamente.</p></div><ProductLink href="/colaborador/catalogo" className="button button-ghost">+ Agregar beneficios</ProductLink></div>{!recommendations.length ? <Empty title="Dale tu mirada a la red" text="Explorá el catálogo y agregá los beneficios que quieras recomendar a tus clientes." /> : <div className="workspace-card-grid">{recommendations.map(item => <article className="workspace-panel workspace-benefit" key={item.benefit_id}>{item.available && item.benefit ? <><PrivatePhoto path={item.benefit.image_url} alt={item.benefit.title} /><div className="workspace-card-content"><span className="workspace-badge is-available">Disponible</span><p className="eyebrow">{item.benefit.provider.name}</p><h3>{item.benefit.title}</h3><p>{item.benefit.description}</p>{item.benefit.conditions && <p className="workspace-muted">{item.benefit.conditions}</p>}<button className="button button-ghost" disabled={!!busy} onClick={() => void change(item.benefit_id, false)}>{busy === item.benefit_id ? 'Quitando…' : 'Quitar recomendación'}</button></div></> : <div className="workspace-card-content"><span className="workspace-badge">No disponible</span><h3>Beneficio no disponible</h3><p>Esta selección ya no está vigente o está pendiente de revisión. No se muestra a tus clientes.</p><button className="button button-ghost" disabled={!!busy} onClick={() => void change(item.benefit_id, false)}>Quitar recomendación</button></div>}</article>)}</div>}</>}
    {section === '/catalogo' && <Catalog selected={recommendations.map(item => item.benefit_id)} busy={busy} change={id => void change(id, true)} onDenied={deny} />}
  </>
}

function Catalog({ selected, busy, change, onDenied }: { selected: string[]; busy: string; change: (id: string) => void; onDenied: () => void }) {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [filters, setFilters] = useState({ search: '', category: '', page: 1 })
  const load = useCallback((signal: AbortSignal) => loadCatalog(filters.page, filters.search, filters.category, signal).catch(error => { if (!signal.aborted && error instanceof ApiError && error.status === 403) onDenied(); throw error }), [filters, onDenied])
  const resource = useResource(load)
  return <><div className="workspace-section-heading"><div><h2>Encontrá tu próxima recomendación</h2><p>Agregá beneficios concretos de la red a tu carpeta privada.</p></div></div><form className="workspace-filters" onSubmit={event => { event.preventDefault(); setFilters({ search, category, page: 1 }) }}><label>Buscar beneficio<input value={search} onChange={event => setSearch(event.target.value)} placeholder="Título o negocio" /></label><label>Categoría<input value={category} onChange={event => setCategory(event.target.value)} placeholder="Todas las categorías" /></label><button className="button button-dark">Buscar</button></form>{resource.loading ? <p role="status">Buscando beneficios…</p> : resource.error ? <Empty title="No pudimos cargar el catálogo" text={resource.error}><button className="button button-dark" onClick={resource.reload}>Reintentar</button></Empty> : !resource.data?.results.length ? <Empty title="No encontramos beneficios" text="Probá con otra búsqueda o volvé más tarde para conocer nuevas propuestas." /> : <><p className="workspace-muted">{resource.data.count} beneficios · Página {filters.page}</p><div className="workspace-card-grid">{resource.data.results.map(benefit => <article className="workspace-panel workspace-catalog-card" key={benefit.id}><span className="workspace-tag">{benefit.provider.category || 'RED LOCAL'}</span><p className="workspace-muted">{benefit.provider.name}{benefit.demo ? ' · Demostración' : ''}</p><h3>{benefit.title}</h3><p>{benefit.description}</p>{benefit.conditions && <p className="workspace-muted">{benefit.conditions}</p>}<p className="workspace-muted">Hasta {benefit.valid_until || 'sin fecha de fin'}</p><button className={`button ${selected.includes(benefit.id) ? 'button-ghost' : 'button-dark'}`} disabled={!!busy || selected.includes(benefit.id)} onClick={() => change(benefit.id)}>{selected.includes(benefit.id) ? '✓ Ya está en tu carpeta' : busy === benefit.id ? 'Agregando…' : '+ Agregar a mi carpeta'}</button></article>)}</div><div className="workspace-pagination"><button className="button button-ghost" disabled={!resource.data.previous} onClick={() => setFilters(value => ({ ...value, page: value.page - 1 }))}>← Anterior</button><span>Página {filters.page}</span><button className="button button-ghost" disabled={!resource.data.next} onClick={() => setFilters(value => ({ ...value, page: value.page + 1 }))}>Siguiente →</button></div></>}</>
}
