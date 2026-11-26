import { useId, useLayoutEffect, useRef } from 'react'
import type { PublicProvider } from './catalog'
import { catalogHref } from './catalog-query'
import { PublicPhoto } from './CatalogPages'
import { ProductLink } from './navigation'
import { usePublicCatalog } from './usePublicCatalog'
import './ui/network-provider-dialog.css'

const summarySize = 3

function closeDialog(element: HTMLDialogElement | null) {
  if (!element?.open) return
  if (typeof element.close === 'function') element.close()
  else element.open = false
}

export function NetworkProviderDialog({ id, provider, onDismiss }: { id: string; provider: PublicProvider; onDismiss: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const title = useRef<HTMLHeadingElement>(null)
  const fromBackdrop = useRef(false)
  const titleId = useId()
  const headingId = useId()
  const { enabled, data, loading, error, retry } = usePublicCatalog(1, '', '', { pageSize: summarySize, providerId: provider.id })
  const unavailable = enabled === false || data?.count === 0
  const business = unavailable ? null : (data?.results[0]?.provider ?? provider)
  const href = catalogHref({ search: '', category: '', page: 1, provider: provider.id })

  useLayoutEffect(() => {
    const element = dialog.current
    if (typeof element?.showModal === 'function') element.showModal()
    else if (element) element.open = true
    title.current?.focus()
    return () => closeDialog(element)
  }, [])

  function dismiss() {
    closeDialog(dialog.current)
    onDismiss()
  }

  return <dialog id={id} ref={dialog} className="network-provider-dialog" aria-modal="true" aria-labelledby={titleId}
    onCancel={event => { event.preventDefault(); dismiss() }}
    onPointerDown={event => { fromBackdrop.current = event.target === event.currentTarget }}
    onClick={event => {
      if (event.target === event.currentTarget && fromBackdrop.current) dismiss()
      fromBackdrop.current = false
    }}>
    <div className="network-provider-dialog-content">
      <button className="network-provider-close" type="button" aria-label="Cerrar ficha" onClick={dismiss}>
        <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
      </button>
      <div className="network-provider-heading">
        {business && <PublicPhoto path={business.image_url} alt="" name={business.name} className="network-provider-photo" />}
        <div>
          <h2 id={titleId} ref={title} tabIndex={-1}>{business?.name ?? 'Ficha del negocio'}</h2>
          {business?.category && <p>{business.category}</p>}
          {business?.demo && <small>Negocio de ejemplo</small>}
        </div>
      </div>
      {business?.description && <p className="network-provider-description">{business.description}</p>}
      {(business?.address || business?.hours) && <dl className="network-provider-details">
        {business.address && <div><dt>Dirección</dt><dd>{business.address}</dd></div>}
        {business.hours && <div><dt>Horario</dt><dd>{business.hours}</dd></div>}
      </dl>}
      <section className="network-provider-summary" aria-labelledby={headingId}>
        <h3 id={headingId}>Beneficios vigentes</h3>
        {loading && <p role="status">Consultando beneficios…</p>}
        {enabled === false && <p role="status">El catálogo general no está disponible ahora.</p>}
        {error && <>
          <p role="alert">No pudimos consultar los beneficios.</p>
          <button className="button button-ghost" type="button" onClick={retry}>Reintentar</button>
        </>}
        {data?.count === 0 && <p role="status">Este negocio no tiene beneficios vigentes en el catálogo.</p>}
        {data && data.count > 0 && <>
          <p className="network-provider-count">{data.count === 1 ? '1 beneficio vigente' : `${data.count} beneficios vigentes`}</p>
          <ul className="network-provider-benefits">
            {data.results.slice(0, summarySize).map(benefit => <li key={benefit.id}>
              <strong>{benefit.title}</strong>{benefit.demo && <small>Ejemplo</small>}
              {benefit.conditions && <p>{benefit.conditions}</p>}
            </li>)}
          </ul>
          <ProductLink className="button button-dark network-provider-more" href={href}>Ver más <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 12h15m-6-6 6 6-6 6" /></svg></ProductLink>
        </>}
      </section>
    </div>
  </dialog>
}
