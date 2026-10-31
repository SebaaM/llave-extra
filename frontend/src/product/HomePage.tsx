import { ButtonLink } from './Layout'
import { CatalogState } from './CatalogPages'
import { FeaturedBenefits } from './FeaturedBenefits'
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
  return <main id="contenido" className="product-home">
    <section className="home-hero" aria-label="Inicio">
      <div className="content-width home-hero-grid">
        <div className="home-hero-copy">
          <p className="eyebrow">{settings.site_name.toUpperCase()} · DESCUBRÍ USHUAIA</p>
          <h1>{settings.home_title}</h1><p>{settings.home_description}</p>
          <div className="product-hero-actions"><ButtonLink href="/beneficios">Explorar beneficios ↗</ButtonLink><ButtonLink href="/referencia" tone="white">Tengo un QR</ButtonLink></div>
        </div>
        <div className="home-hero-feature client-home-postcard">
          <span>BENEFICIOS PARA TU PRÓXIMA VISITA</span>
          <CatalogState enabled={enabled} loading={loading} error={error} retry={retry} />
          {enabled && !loading && !error && data && <FeaturedBenefits benefits={data.results} />}
          {enabled && !loading && !error && data?.results.length === 0 && <EmptyState title="Pronto habrá beneficios para explorar." description="Si recibiste un QR de recomendaciones, podés abrir los beneficios que te compartieron."><ButtonLink href="/referencia">Ingresar con QR</ButtonLink></EmptyState>}
        </div>
      </div>
    </section>
    {enabled && <NetworkCanvas />}
    <HowItWorks />
    <section className="content-width client-home-categories" aria-label="Próxima parada">
      <p className="eyebrow">PRÓXIMA PARADA</p><h2>¿Qué te gustaría descubrir?</h2>
      {enabled ? <>
        <CategoryChips categories={categories.categories} value="" onChange={category => navigate(catalogHref({ category, search: '', page: 1 }))} />
        {categories.loading && <p role="status">Consultando categorías…</p>}
        {categories.error && <div role="status"><p>No pudimos cargar las categorías.</p><button type="button" onClick={categories.retry}>Reintentar categorías</button></div>}
      </> : <p>Las categorías estarán disponibles cuando puedas explorar el catálogo.</p>}
    </section>
    <section className="home-explore content-width" aria-label="Mapa">
      <div><p className="eyebrow">LA CIUDAD EN TU VIAJE</p><h2>Ushuaia, una parada a la vez.</h2><p>Explorá la ciudad y encontrá ideas para tu próxima visita. Podés usar beneficios sin recibir recomendaciones.</p><ButtonLink href="/beneficios">Ver catálogo completo ↗</ButtonLink></div>
      <div className="home-map"><iframe title="Mapa de Ushuaia" src="https://www.openstreetmap.org/export/embed.html?bbox=-68.36%2C-54.84%2C-68.25%2C-54.77&layer=mapnik" loading="lazy" referrerPolicy="no-referrer" /><p>Mapa general de Ushuaia © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>. No indica la ubicación de los negocios.</p></div>
    </section>
    <section className="trip-intro" aria-label="Pasaporte">
      <div className="trip-passport client-passport-preview" aria-hidden="true"><span>MI VIAJE</span><strong>LE</strong><small>USHUAIA · ARGENTINA</small></div>
      <div><p className="eyebrow">TU PASAPORTE, A TU RITMO</p><h2>Un viaje que deja huella.</h2><p>En Mi viaje encontrás tus visitas verificadas, tu meta actual y los créditos disponibles. Usar créditos no borra tus visitas.</p><TripSummary wallet={trip?.wallet ?? null} progress={trip?.progress ?? null} /></div>
    </section>
  </main>
}
