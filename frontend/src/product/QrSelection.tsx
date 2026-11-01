import { useCallback, useEffect, useRef } from 'react'
import type { QrCoordinator } from './useQrContext'
import { privateSelectionMedia, selectionPageNumber } from './qr-context'
import { PrivatePhoto } from './PrivatePhoto'
import { ProductLink } from './navigation'

function SelectionPhoto({ path, name, coordinator }: { path: string | null; name: string; coordinator: QrCoordinator }) {
  const { missingMedia } = coordinator
  const missing = useCallback(() => { if (path) missingMedia(path) }, [path, missingMedia])
  return <PrivatePhoto path={path} alt={name} onDenied={coordinator.block} onMissing={missing} />
}

export function QrSelection({ coordinator }: { coordinator: QrCoordinator }) {
  const { state } = coordinator
  const { collaborator, page } = state
  const ready = state.status === 'ready' && collaborator && page
  const previous = collaborator && page ? selectionPageNumber(page.previous, collaborator.id) : null
  const next = collaborator && page ? selectionPageNumber(page.next, collaborator.id) : null
  const content = useRef<HTMLElement>(null)
  const pageFocus = useRef(false)
  useEffect(() => {
    if (!pageFocus.current || state.status === 'loading') return
    pageFocus.current = false
    const heading = content.current?.querySelector('h1')
    if (heading) { heading.tabIndex = -1; heading.focus() }
  }, [state.status, state.revision])
  return <main id="contenido" ref={content} className="private-benefits content-width client-qr-selection">
    {ready ? <>
      <p className="eyebrow">IDEAS PARA TU VISITA</p><h1>Recomendaciones de {collaborator.name}</h1>
      <p>Esta selección se actualiza con los beneficios que elige quien te recomendó. Revisá las condiciones antes de visitar cada negocio.</p>
      {page.results.length ? <div className="product-provider-grid" key={state.revision}>{page.results.map(benefit => {
        const media = privateSelectionMedia(benefit.image_url, collaborator.id, benefit.provider.id, benefit.id) ?? privateSelectionMedia(benefit.provider.image_url, collaborator.id, benefit.provider.id)
        return <article className="product-provider-card" key={benefit.id}>
          <SelectionPhoto path={media && !state.missing.includes(media) ? media : null} name={`Imagen de ${benefit.provider.name}`} coordinator={coordinator} />
          <div><p className="eyebrow">{benefit.provider.name}</p><h2>{benefit.title}</h2>
            {benefit.description && <p>{benefit.description}</p>}{benefit.conditions && <p><strong>Condiciones:</strong> {benefit.conditions}</p>}
            {benefit.provider.address && <p><strong>Dirección:</strong> {benefit.provider.address}</p>}
            <p className="form-help">En el negocio, escaneá su QR e ingresá el PIN para validar tu visita.</p>
          </div>
        </article>
      })}</div> : <p role="status">Por ahora no hay beneficios disponibles en esta selección.</p>}
      <nav className="catalog-pagination" aria-label="Páginas de recomendaciones">
        <button disabled={previous === null} onClick={() => { if (previous !== null) { pageFocus.current = true; coordinator.loadPage(previous) } }}>← Anterior</button>
        <span aria-live="polite">Página {state.pageNumber} · {page.count} beneficios</span>
        <button disabled={next === null} onClick={() => { if (next !== null) { pageFocus.current = true; coordinator.loadPage(next) } }}>Siguiente →</button>
      </nav>
    </> : <><h1>{state.status === 'loading' || state.status === 'pending' ? 'Consultando tu selección…' : 'No pudimos mostrar esta selección.'}</h1>
      {state.error ? <p role="alert">{state.error}</p> : <p role="status">Comprobando los beneficios vigentes…</p>}
      {state.status !== 'loading' && <button className="button button-dark" onClick={coordinator.retry}>Reintentar selección</button>}
    </>}
    <ProductLink className="inline-link" href="/beneficios">Explorar el catálogo general →</ProductLink>
  </main>
}
