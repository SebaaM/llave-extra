import { useEffect, useRef, useState } from 'react'
import { ProductLink } from '../navigation'
import { formatCredits, formatPesos, searchable, shopCategories, shopExamples } from './examples'
import type { ShopExample } from './examples'
import { ProductArt } from './ProductArt'
import './shop.css'

const pageSize = 6
const demoNotice = 'Productos, ilustraciones y valores de ejemplo. Las compras y los canjes se habilitarán más adelante.'

function usePageStart(route: string) {
  const main = useRef<HTMLElement>(null)
  useEffect(() => {
    main.current?.scrollIntoView?.({ block: 'start', behavior: 'instant' })
  }, [route])
  return main
}

function DemoNotice() {
  return <div className="shop-demo"><span>VISTA PREVIA</span><p>{demoNotice}</p></div>
}

function Prices({ product }: { product: ShopExample }) {
  return <div className="shop-prices"><strong>{formatPesos(product.price)} <small>ARS</small></strong><span>o {formatCredits(product.credits)}</span></div>
}

function ProductCard({ product }: { product: ShopExample }) {
  return <article className="shop-card">
    <ProductLink href={`/tienda/${product.slug}`} className="shop-art-link" aria-label={`Ver ${product.name}`} style={{ background: product.background }}><ProductArt product={product} /><span className="shop-art-label">DISEÑO 3D · EJEMPLO</span></ProductLink>
    <div className="shop-card-copy"><p className="shop-category">{product.category}</p><h3><ProductLink href={`/tienda/${product.slug}`}>{product.name}</ProductLink></h3><p>{product.description}</p><Prices product={product} /><ProductLink href={`/tienda/${product.slug}`} className="shop-detail-link">Conocer el producto <span aria-hidden="true">↗</span></ProductLink></div>
  </article>
}

export function ShopPage() {
  const main = usePageStart('catalog')
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<string>('Todos')
  const [sort, setSort] = useState('featured')
  const [page, setPage] = useState(1)
  const matching = shopExamples.filter(product => (category === 'Todos' || product.category === category) && searchable(`${product.name} ${product.description} ${product.category}`).includes(searchable(query.trim())))
  if (sort === 'price') matching.sort((a, b) => a.price - b.price)
  if (sort === 'credits') matching.sort((a, b) => a.credits - b.credits)
  const pageCount = Math.max(1, Math.ceil(matching.length / pageSize))
  const visible = matching.slice((page - 1) * pageSize, page * pageSize)
  const reset = () => { setQuery(''); setCategory('Todos'); setSort('featured'); setPage(1) }

  return <main ref={main} id="contenido" className="shop-page">
    <section className="shop-hero"><div className="content-width shop-hero-grid"><div><p className="eyebrow">LA TIENDA DE LLAVE EXTRA</p><h1>Un pedacito del fin <br />del mundo, con vos.</h1><p>Recuerdos que cuentan tu viaje. Descubrí nuestra propuesta de objetos en 3D inspirados en Ushuaia y empezá a elegir tu favorito.</p><a className="button button-orange" href="#catalogo-tienda">Explorar el catálogo <span aria-hidden="true">↘</span></a><div className="shop-hero-tags"><span>Inspiración fueguina</span><span>Diseños en 3D</span></div></div><div className="shop-hero-art" aria-hidden="true"><div className="shop-orbit" /><ProductArt product={shopExamples[0]} /><span className="shop-hero-stamp">UN RECUERDO<br /><strong>MIL HISTORIAS</strong><span>54° S · USHUAIA</span></span><span className="shop-hero-caption">Pingüino del sur · Ilustración de ejemplo</span></div></div></section>
    <div className="content-width"><DemoNotice />
      <section id="catalogo-tienda" className="shop-catalog" aria-labelledby="shop-catalog-title">
        <div className="shop-catalog-heading"><div><p className="eyebrow">RECUERDOS PARA LLEVAR</p><h2 id="shop-catalog-title">Encontrá tu próximo recuerdo.</h2></div><p>Nueve ideas para seguir viajando,<br />incluso cuando vuelvas a casa.</p></div>
        <div className="shop-tools"><label className="shop-search">Buscar un producto<input type="search" value={query} placeholder="Pingüinos, montañas, llaveros…" onChange={event => { setQuery(event.target.value); setPage(1) }} /></label><label>Ordenar por<select value={sort} onChange={event => { setSort(event.target.value); setPage(1) }}><option value="featured">Selección Llave Extra</option><option value="price">Menor precio</option><option value="credits">Menos créditos</option></select></label></div>
        <div className="shop-filter-row"><div className="shop-filters" role="group" aria-label="Categorías de productos">{shopCategories.map(item => <button key={item} aria-pressed={category === item} onClick={() => { setCategory(item); setPage(1) }}>{item}</button>)}</div><p className="shop-result-count" role="status">{matching.length} {matching.length === 1 ? 'producto' : 'productos'} de ejemplo</p></div>
        {visible.length ? <><div className="shop-grid">{visible.map(product => <ProductCard key={product.slug} product={product} />)}</div><nav className="shop-pagination" aria-label="Páginas de productos"><button disabled={page === 1} onClick={() => setPage(value => value - 1)}>← Anterior</button><span aria-live="polite">Página {page} de {pageCount}</span><button disabled={page === pageCount} onClick={() => setPage(value => value + 1)}>Siguiente →</button></nav></> : <div className="shop-empty"><h3>No encontramos ese recuerdo.</h3><p>Probá con otro nombre o explorá todos los productos.</p><button className="button button-dark" onClick={reset}>Ver todos los productos</button></div>}
      </section>
      <section className="shop-story"><span className="shop-story-mark" aria-hidden="true">✳</span><div><p className="eyebrow">TU VIAJE SIGUE SUMANDO</p><h2>Viví Ushuaia. Guardá el recuerdo.</h2><p>Los consumos válidos en los prestadores de la red suman créditos a tu viaje. Más adelante vas a poder usarlos para canjear productos de la tienda.</p><ProductLink href="/beneficios">Explorar los beneficios de la red <span aria-hidden="true">→</span></ProductLink></div></section>
    </div>
  </main>
}

export function ShopDetail({ slug }: { slug: string }) {
  const main = usePageStart(slug)
  const product = shopExamples.find(item => item.slug === slug)
  if (!product) return <main ref={main} id="contenido" className="content-width shop-not-found"><h1>No encontramos ese producto.</h1><p>Podés seguir explorando las propuestas del catálogo.</p><ProductLink href="/tienda" className="button button-dark">Volver a la tienda</ProductLink></main>
  return <main ref={main} id="contenido" className="content-width shop-detail"><ProductLink href="/tienda" className="back-link">← Volver a la tienda</ProductLink><DemoNotice /><div className="shop-detail-grid"><div className="shop-detail-art" style={{ background: product.background }}><ProductArt product={product} /><span>Ilustración de ejemplo · Diseño 3D</span></div><div className="shop-detail-copy"><p className="eyebrow">{product.category} / LLAVE EXTRA</p><h1>{product.name}</h1><p>{product.description}</p><Prices product={product} /><p className="shop-detail-pricing">Valores ilustrativos para esta vista previa.</p><dl><div><dt>Diseño propuesto</dt><dd>Objeto impreso en 3D</dd></div><div><dt>Medidas de ejemplo</dt><dd>{product.dimensions}</dd></div><div><dt>Inspiración</dt><dd>Ushuaia, Tierra del Fuego</dd></div></dl><div className="shop-coming"><strong>Tu próximo recuerdo está tomando forma.</strong><p>La compra y el canje con créditos estarán disponibles en una próxima etapa. Por ahora, podés explorar el catálogo de ejemplo.</p></div><ProductLink href="/tienda" className="shop-detail-link">Seguir explorando <span aria-hidden="true">→</span></ProductLink></div></div></main>
}
