import { useCallback, useEffect, useId, useRef } from 'react'
import type { NetworkItem } from './catalog'
import { PublicPhoto } from './CatalogPages'
import { PrivatePhoto } from './PrivatePhoto'
import { ProductLink } from './navigation'

export function NetworkPreview({ item, folderId, onOpenProvider, onClose, onDenied, onMissing }: {
  item: NetworkItem; folderId?: string; onOpenProvider?: (id: string) => void; onClose: () => void
  onDenied?: () => void; onMissing?: (path: string) => void
}) {
  const titleId = useId()
  const heading = useRef<HTMLHeadingElement>(null)
  const path = item.provider.image_url
  const missingMedia = useCallback(() => { if (path) onMissing?.(path) }, [path, onMissing])
  useEffect(() => { heading.current?.focus() }, [item.provider.id])
  return <section className="client-network-preview" aria-label={`Vista previa de ${item.provider.name}`} aria-describedby={titleId}>
    {folderId
      ? <PrivatePhoto path={path} alt={`Imagen de ${item.provider.name}`} onDenied={onDenied} onMissing={missingMedia} />
      : <PublicPhoto path={item.provider.image_url} alt={`Imagen de ${item.provider.name}`} name={item.provider.name} />}
    <div className="client-network-preview-copy">
      <p className="eyebrow">{item.provider.category || 'BENEFICIO LOCAL'}{item.provider.demo && ' · DATO DEMO'}</p>
      <h3 ref={heading} tabIndex={-1} id={titleId}>{item.provider.name}</h3>
      <p>{item.benefit_title}</p>
      <div className="client-network-preview-actions">
        {folderId
          ? <button className="button button-dark" disabled={!onOpenProvider} onClick={() => onOpenProvider?.(item.provider.id)}>Ver beneficios de este prestador</button>
          : <ProductLink className="button button-dark" href={`/beneficios/${encodeURIComponent(item.benefit_id)}`}>Ver beneficio y condiciones</ProductLink>}
        <button onClick={onClose}>Cerrar vista previa</button>
      </div>
    </div>
  </section>
}
