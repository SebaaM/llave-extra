import { useEffect, useRef, useState } from 'react'
import { ApiError, api, privateImage } from './api'
import type { Benefit, Folder, Provider } from './api'
import { messageOf } from './shared'

type FolderPageProps = {
  folders: Folder[]
  selected: string
  select: (value: string) => void
  providers: Provider[]
  onOpen: (id: string) => void
}

export function FolderPage({ folders, selected, select, providers, onOpen }: FolderPageProps) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const categories = [...new Set(providers.map(provider => provider.category).filter(Boolean))].sort()
  const shown = providers.filter(provider => {
    const matchesCategory = !category || provider.category === category
    const searchable = `${provider.name} ${provider.category} ${provider.description}`.toLocaleLowerCase()
    return matchesCategory && searchable.includes(query.toLocaleLowerCase())
  })

  return <main id="contenido" className="private-benefits">
    <div className="content-width">
      <p className="eyebrow">BENEFICIOS PARA VOS</p>
      <h1>Recomendaciones locales.</h1>
      <p className="private-lead">Explorá la selección disponible en tus carpetas y revisá las condiciones de cada beneficio.</p>
      {folders.length > 1 && <label className="folder-picker">
        Carpeta
        <select value={selected} onChange={event => select(event.target.value)}>
          {folders.map(folder => <option key={folder.collaborator_id} value={folder.collaborator_id}>Carpeta · {folder.collaborator_id.slice(0, 8)}</option>)}
        </select>
      </label>}
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
        {shown.map(provider => <article className="product-provider-card" key={provider.id}>
          <PrivatePhoto path={provider.image_url} alt={`Imagen de ${provider.name}`} />
          <div>
            <span>{provider.category || 'Recomendación'}</span>
            <h2>{provider.name}</h2>
            <p>{provider.description || 'Conocé los beneficios y condiciones disponibles.'}</p>
            <button className="button button-dark" onClick={() => onOpen(provider.id)}>Ver beneficios</button>
          </div>
        </article>)}
      </div> : <div className="product-empty">
        <span aria-hidden="true">✳</span>
        <h2>{providers.length ? 'No encontramos coincidencias.' : 'Todavía no hay recomendaciones en esta carpeta.'}</h2>
        <p>{providers.length ? 'Probá con otra búsqueda.' : 'Cuando haya beneficios vigentes disponibles, los vas a encontrar acá.'}</p>
      </div>}
    </div>
  </main>
}

export function PrivatePhoto({ path, alt }: { path: string | null; alt: string }) {
  const [image, setImage] = useState<{ path: string | null; url: string } | null>(null)

  useEffect(() => {
    let alive = true
    let created: string | null = null
    privateImage(path).then(value => {
      if (!value) return
      if (!alive) {
        URL.revokeObjectURL(value)
        return
      }
      created = value
      setImage({ path, url: value })
    }).catch(() => {
      if (alive) setImage(null)
    })

    return () => {
      alive = false
      if (created) URL.revokeObjectURL(created)
    }
  }, [path])

  const url = image?.path === path ? image.url : null
  return <div className="product-provider-image">
    {url ? <img src={url} alt={alt} /> : <span aria-hidden="true">✳</span>}
  </div>
}

type ProviderDetailProps = {
  folderId: string
  provider: Provider
  onAccessRevoked: () => void
}

export function ProviderDetail({ folderId, provider, onAccessRevoked }: ProviderDetailProps) {
  const key = `${folderId}/${provider.id}`
  const [result, setResult] = useState<{ key: string; benefits: Benefit[]; error: string }>({ key: '', benefits: [], error: '' })
  const accessRevokedRef = useRef(onAccessRevoked)

  useEffect(() => { accessRevokedRef.current = onAccessRevoked }, [onAccessRevoked])

  useEffect(() => {
    let alive = true
    api<Benefit[]>(`/api/v1/folders/${folderId}/providers/${provider.id}/benefits/`)
      .then(benefits => {
        if (alive) setResult({ key, benefits, error: '' })
      })
      .catch(error => {
        if (!alive) return
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
          setResult({ key, benefits: [], error: '' })
          accessRevokedRef.current()
          return
        }
        setResult({ key, benefits: [], error: messageOf(error) })
      })
    return () => { alive = false }
  }, [folderId, provider.id, key])

  const loading = result.key !== key
  const benefits = loading ? [] : result.benefits
  const error = loading ? '' : result.error

  return <main id="contenido" className="private-benefits">
    <div className="content-width">
      <a className="back-link" href="/beneficios">← Volver a recomendaciones</a>
      <div className="provider-detail">
        <PrivatePhoto path={provider.image_url} alt={`Imagen de ${provider.name}`} />
        <div>
          <p className="eyebrow">{provider.category || 'BENEFICIO LOCAL'}</p>
          <h1>{provider.name}</h1>
          {provider.description && <p>{provider.description}</p>}
          {provider.address && <p><strong>Dirección:</strong> {provider.address}</p>}
          {provider.hours && <p><strong>Horarios:</strong> {provider.hours}</p>}
          {provider.contact && <p><strong>Contacto:</strong> {provider.contact}</p>}
          {provider.website && <p><a href={provider.website} rel="noreferrer">Sitio web del prestador</a></p>}
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
          <p className="form-help">En el local, escaneá el QR del prestador e ingresá el PIN que te facilite para validar tu visita.</p>
        </div>
      </div>
    </div>
  </main>
}
