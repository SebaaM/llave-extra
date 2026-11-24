import { useEffect, useRef, useState } from 'react'
import { api, ApiError } from '../api'
import { ProductLink } from '../navigation'
import { ProductArt } from './ProductArt'
import { shopExamples } from './examples'
import './shop.css'

type Category = { id: string; name: string }
type Product = { id: string; name: string; description: string; category: Category | null; stock: number; price_money: string | null; price_credits: number | null; image_url: string | null }
type Page = { count: number; next: string | null; previous: string | null; results: Product[] }
type Catalog = { categories: Category[]; pickup: { name: string; address: string; hours: string } | null }
const pageSize = 6
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function usePageStart(route: string) {
  const main = useRef<HTMLElement>(null)
  useEffect(() => { main.current?.scrollIntoView?.({ block: 'start', behavior: 'instant' }) }, [route])
  return main
}

function Notice() {
  return <div className="shop-demo"><span>PRÓXIMAMENTE</span><p>La compra y el canje con créditos todavía no están habilitados. Por ahora podés explorar los productos.</p></div>
}

function Prices({ product }: { product: Product }) {
  const pesos = product.price_money === null ? null : new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(Number(product.price_money))
  const credits = product.price_credits === null ? null : `${product.price_credits.toLocaleString('es-AR')} créditos`
  return <div className="shop-prices">
    {pesos ? <strong>{pesos} <small>ARS</small></strong> : credits && <strong>{credits}</strong>}
    {pesos && credits && <span>o {credits}</span>}
  </div>
}

function ProductPhoto({ product }: { product: Product }) {
  const [failed, setFailed] = useState(false)
  // Solo se aceptan imágenes públicas de este producto; nunca una URL arbitraria.
  const image = `/api/v1/shop/products/${product.id}/media/`
  const showImage = product.image_url === image && !failed
  return <div className="shop-product-photo">{showImage ? <img src={image} alt={product.name} onError={() => setFailed(true)} /> : <span aria-label="Imagen no disponible">✳</span>}</div>
}

function ProductCard({ product }: { product: Product }) {
  return <article className="shop-card">
    <div className="shop-card-media">
      <ProductLink href={`/tienda/${product.id}`} className="shop-art-link" aria-label={`Ver ${product.name}`}><ProductPhoto product={product} /></ProductLink>
      {product.stock === 0 && <span className="shop-stock-label">Sin stock</span>}
    </div>
    <div className="shop-card-copy">
      <p className="shop-category">{product.category?.name ?? 'Tienda'}</p>
      <h3><ProductLink href={`/tienda/${product.id}`}>{product.name}</ProductLink></h3>
      {product.description && <p className="shop-card-description">{product.description}</p>}
      <Prices product={product} />
      <ProductLink href={`/tienda/${product.id}`} className="shop-detail-link">Conocer el producto <span aria-hidden="true">↗</span></ProductLink>
    </div>
  </article>
}

function catalogUrl(page: number, search: string, category: string, ordering: string) {
  const params = new URLSearchParams({ page: String(page), page_size: String(pageSize), ordering })
  if (search.trim()) params.set('search', search.trim())
  if (category) params.set('category', category)
  return `/api/v1/shop/products/?${params}`
}

export function ShopPage() {
  const main = usePageStart('catalog')
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const [sort, setSort] = useState('name')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<Page | null>(null)
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [metadataError, setMetadataError] = useState(false)
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    api<Catalog>('/api/v1/shop/catalog/', { auth: false, signal: controller.signal }).then(value => { setCatalog(value); setMetadataError(false) }).catch(() => { if (!controller.signal.aborted) setMetadataError(true) })
    return () => controller.abort()
  }, [retry])

  useEffect(() => {
    const controller = new AbortController()
    const load = async () => {
      setLoading(true); setError(false); setData(null)
      try {
        let result: Page
        try { result = await api<Page>(catalogUrl(page, query, category, sort), { auth: false, signal: controller.signal }) }
        catch (cause) {
          if (!(cause instanceof ApiError) || cause.status !== 404 || page === 1) throw cause
          const first = await api<Page>(catalogUrl(1, query, category, sort), { auth: false, signal: controller.signal })
          const last = Math.max(1, Math.ceil(first.count / pageSize))
          if (last !== page) { setPage(last); return }
          result = first
        }
        if (!controller.signal.aborted) setData(result)
      } catch { if (!controller.signal.aborted) setError(true) }
      finally { if (!controller.signal.aborted) setLoading(false) }
    }
    void load()
    return () => controller.abort()
  }, [page, query, category, sort, retry])

  const reset = () => { setQuery(''); setCategory(''); setSort('name'); setPage(1) }
  const pageCount = Math.max(1, Math.ceil((data?.count ?? 0) / pageSize))
  return <main ref={main} id="contenido" className="shop-page">
    <section className="shop-hero"><div className="content-width shop-hero-grid"><div><p className="eyebrow">LA TIENDA DE LLAVE EXTRA</p><h1>Un pedacito del fin del mundo, con vos.</h1><p>Recuerdos que cuentan tu viaje. Descubrí nuestra propuesta de objetos en 3D inspirados en Ushuaia y empezá a elegir tu favorito.</p><a className="button button-orange" href="#catalogo-tienda">Explorar el catálogo <span aria-hidden="true">↘</span></a><div className="shop-hero-tags"><span>Inspiración fueguina</span><span>Diseños en 3D</span></div></div><div className="shop-hero-art" aria-hidden="true"><div className="shop-orbit" /><ProductArt product={shopExamples[0]} /><span className="shop-hero-stamp">UN RECUERDO<br /><strong>MIL HISTORIAS</strong><span>54° S · USHUAIA</span></span><span className="shop-hero-caption">Ilustración decorativa</span></div></div></section>
    <div className="content-width"><Notice />
      <section id="catalogo-tienda" className="shop-catalog" aria-labelledby="shop-catalog-title">
        <div className="shop-catalog-heading"><div><p className="eyebrow">RECUERDOS PARA LLEVAR</p><h2 id="shop-catalog-title">Encontrá tu próximo recuerdo.</h2></div></div>
        <div className="shop-tools"><label className="shop-search">Buscar un producto<input type="search" value={query} placeholder="Buscar por nombre o descripción" onChange={event => { setQuery(event.target.value); setPage(1) }} /></label><label>Ordenar por<select value={sort} onChange={event => { setSort(event.target.value); setPage(1) }}><option value="name">Nombre A–Z</option><option value="-name">Nombre Z–A</option><option value="price_money">Menor precio</option><option value="-price_money">Mayor precio</option><option value="price_credits">Menos créditos</option><option value="-price_credits">Más créditos</option></select></label></div>
        <div className="shop-filter-row"><div className="shop-filters" role="group" aria-label="Categorías de productos"><button aria-pressed={!category} onClick={() => { setCategory(''); setPage(1) }}>Todos</button>{catalog?.categories.map(item => <button key={item.id} aria-pressed={category === item.id} onClick={() => { setCategory(item.id); setPage(1) }}>{item.name}</button>)}</div>{data && <p className="shop-result-count" role="status">{data.count} {data.count === 1 ? 'producto' : 'productos'}</p>}</div>
        {metadataError && <p role="alert">No pudimos cargar las categorías y el retiro. <button onClick={() => setRetry(value => value + 1)}>Reintentar</button></p>}
        {loading && <p role="status">Cargando productos…</p>}
        {error && <div className="shop-empty" role="alert"><h3>No pudimos cargar los productos.</h3><p>Revisá tu conexión y volvé a intentar.</p><button className="button button-dark" onClick={() => setRetry(value => value + 1)}>Reintentar</button></div>}
        {data && (data.results.length ? <><div className="shop-grid">{data.results.map(product => <ProductCard key={product.id} product={product} />)}</div><nav className="shop-pagination" aria-label="Páginas de productos"><button disabled={!data.previous} onClick={() => setPage(value => value - 1)}>← Anterior</button><span aria-live="polite">Página {page} de {pageCount}</span><button disabled={!data.next} onClick={() => setPage(value => value + 1)}>Siguiente →</button></nav></> : <div className="shop-empty"><h3>No encontramos productos.</h3><p>Probá con otra búsqueda o explorá el catálogo completo.</p><button className="button button-dark" onClick={reset}>Ver todos los productos</button></div>)}
        {catalog?.pickup && <section className="shop-pickup"><h3>Retiro</h3><p>{catalog.pickup.name} · {catalog.pickup.address}</p><p>{catalog.pickup.hours}</p></section>}
      </section>
      <section className="shop-story"><span className="shop-story-mark" aria-hidden="true">✳</span><div><p className="eyebrow">TU VIAJE SIGUE SUMANDO</p><h2>Viví Ushuaia. Guardá el recuerdo.</h2><p>Los consumos válidos en los prestadores de la red suman créditos a tu viaje. Más adelante vas a poder usarlos para canjear productos de la tienda.</p><ProductLink href="/beneficios">Explorar los beneficios de la red <span aria-hidden="true">→</span></ProductLink></div></section>
    </div>
  </main>
}

export function ShopDetail({ slug }: { slug: string }) {
  const main = usePageStart(slug)
  const [result, setResult] = useState<{ slug: string; retry: number; product: Product | null; error: boolean } | null>(null)
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    if (!uuid.test(slug)) return () => controller.abort()
    api<Product>(`/api/v1/shop/products/${encodeURIComponent(slug)}/`, { auth: false, signal: controller.signal })
      .then(product => { if (!controller.signal.aborted) setResult({ slug, retry, product, error: false }) })
      .catch(cause => { if (!controller.signal.aborted) setResult({ slug, retry, product: null, error: !(cause instanceof ApiError && cause.status === 404) }) })
    return () => controller.abort()
  }, [slug, retry])
  const current = result?.slug === slug && result.retry === retry ? result : null
  if (uuid.test(slug) && !current) return <main ref={main} id="contenido" className="content-width shop-not-found"><p role="status">Cargando producto…</p></main>
  if (current?.error) return <main ref={main} id="contenido" className="content-width shop-not-found"><h1>No pudimos cargar el producto.</h1><button className="button button-dark" onClick={() => setRetry(value => value + 1)}>Reintentar</button> <ProductLink href="/tienda">Volver a la tienda</ProductLink></main>
  const product = current?.product
  if (!product) return <main ref={main} id="contenido" className="content-width shop-not-found"><h1>No encontramos ese producto.</h1><p>Es posible que ya no esté disponible. Podés seguir explorando el catálogo.</p><ProductLink href="/tienda" className="button button-dark">Volver a la tienda</ProductLink></main>
  return <main ref={main} id="contenido" className="content-width shop-detail">
    <ProductLink href="/tienda" className="back-link">← Volver a la tienda</ProductLink>
    <div className="shop-detail-grid">
      <div className="shop-detail-art"><ProductPhoto key={product.id} product={product} /></div>
      <div className="shop-detail-copy">
        <p className="eyebrow">{product.category?.name ?? 'TIENDA'} / LLAVE EXTRA</p>
        <h1>{product.name}</h1>
        {product.description && <p>{product.description}</p>}
        {product.stock === 0 && <p className="shop-out-of-stock">Sin stock</p>}
        <Prices product={product} />
        <div className="shop-coming"><strong>La compra y el canje todavía no están habilitados.</strong><p>Por ahora podés seguir explorando el catálogo.</p></div>
      </div>
    </div>
  </main>
}
