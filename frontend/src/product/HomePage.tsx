import { ButtonLink } from './Layout'
import { BenefitCard, CatalogState } from './CatalogPages'
import { usePublicCatalog } from './usePublicCatalog'
import { NetworkCanvas } from './NetworkCanvas'
import type { SiteSettings } from './admin/types'
import { defaultSiteSettings } from './useSiteSettings'
import type { Progress, Wallet } from './api'
import { HowItWorks } from './HowItWorks'
import { TripSummary } from './journey/TripSummary'
import { useCatalogCategories } from './useCatalogCategories'
import { CategoryChips } from './ui/CategoryChips'
import { EmptyState } from './ui/EmptyState'
import { catalogHref } from './catalog-query'
import { navigate } from './navigate'

export function HomePage({ settings = defaultSiteSettings, trip }: { settings?: SiteSettings; trip?: { wallet: Wallet; progress: Progress } }) {
  const { enabled, data, loading, error, retry } = usePublicCatalog()
  const categories = useCatalogCategories(enabled)
  const featured = data?.results.find(item => item.image_url) ?? data?.results[0]
  return <main id="contenido" className="product-home">
    <section className="home-hero"><div className="content-width home-hero-grid"><div className="home-hero-copy"><p className="eyebrow">{settings.site_name.toUpperCase()} · PROGRAMA ACTIVO EN USHUAIA</p><h1>{settings.home_title}</h1><p>{settings.home_description}</p>{enabled && featured?.conditions && <p className="home-hero-offer"><strong>{featured.provider.name} {featured.demo && '· Dato demo'}</strong><span>{featured.conditions}</span></p>}<div className="product-hero-actions"><ButtonLink href="/beneficios">Explorar beneficios ↗</ButtonLink><ButtonLink href="/referencia" tone="white">Tengo un QR</ButtonLink></div></div><div className="home-hero-feature client-home-postcard"><span>BENEFICIO DESTACADO · INFORMACIÓN VIGENTE</span><CatalogState enabled={enabled} loading={loading} error={error} retry={retry} />{enabled && featured && <BenefitCard benefit={featured} />}{enabled && data?.results.length === 0 && <EmptyState title="Pronto habrá beneficios publicados para explorar." description="Si tenés el QR de un Colaborador, podés consultar su selección privada."><ButtonLink href="/referencia">Ingresar con QR</ButtonLink></EmptyState>}</div></div></section>
    {enabled && featured && <section className="content-width client-home-categories"><p className="eyebrow">ELEGÍ TU PRÓXIMA PARADA</p><h2>¿Qué te gustaría descubrir?</h2><CategoryChips categories={categories.categories} value="" onChange={category => navigate(catalogHref({ category, search: '', page: 1 }))} />{categories.loading && <p role="status">Consultando categorías…</p>}{categories.error && <div role="status"><p>No pudimos cargar las categorías.</p><button type="button" onClick={categories.retry}>Reintentar categorías</button></div>}</section>}
    <section className="product-value-strip" aria-label="Lo que ofrece Llave Extra"><span>Beneficios vigentes</span><i aria-hidden="true">✳</i><span>Visitas que suman</span><i aria-hidden="true">✳</i><span>Créditos para canjear</span></section>
    {enabled && <NetworkCanvas />}
    <section className="home-explore content-width"><div><p className="eyebrow">LA CIUDAD EN TU VIAJE</p><h2>Explorá la red. Elegí tu próxima visita.</h2><p>El catálogo general muestra propuestas publicadas. Cada colaborador puede acercarte además sus recomendaciones privadas mediante su QR.</p><ButtonLink href="/beneficios">Ver catálogo completo ↗</ButtonLink></div><div className="home-map"><iframe title="Mapa de Ushuaia" src="https://www.openstreetmap.org/export/embed.html?bbox=-68.36%2C-54.84%2C-68.25%2C-54.77&layer=mapnik" loading="lazy" referrerPolicy="no-referrer" /><p>Mapa de Ushuaia © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>. Los nodos de la red son una representación visual, sin coordenadas de comercios.</p></div></section>
    <HowItWorks />
    <section className="trip-intro"><div className="trip-passport" aria-hidden="true"><span>MI VIAJE</span><strong>✳</strong><small>USHUAIA · ARGENTINA</small></div><div><p className="eyebrow">TU PASAPORTE, A TU RITMO</p><h2>Un viaje que deja huella.</h2><p>En Mi viaje encontrás tus visitas verificadas, el progreso hacia la meta vigente y los créditos disponibles. Usar créditos no borra tus visitas.</p><TripSummary wallet={trip?.wallet ?? null} progress={trip?.progress ?? null} /></div></section>
    <section className="product-final-cta"><p className="eyebrow">LLAVE EXTRA · USHUAIA</p><h2>Empezá a descubrir.</h2><p>Explorá el catálogo y creá tu cuenta cuando quieras guardar tu recorrido.</p><ButtonLink href="/registro" tone="white">Crear mi cuenta ↗</ButtonLink></section>
  </main>
}
