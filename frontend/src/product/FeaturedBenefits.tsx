import { useId } from 'react'
import type { ReactNode } from 'react'
import { BenefitCard } from './CatalogPages'
import type { PublicBenefit } from './catalog'

export function FeaturedBenefits({ benefit, index, count, onSelect, children }: { benefit?: PublicBenefit; index: number; count: number; onSelect: (index: number) => void; children?: ReactNode }) {
  const panel = useId()
  return <div className="client-featured-benefits" role="region" aria-label="Beneficios destacados" aria-roledescription="carrusel">
    <div id={panel} role="group" aria-roledescription="diapositiva" aria-label={count ? `${index + 1} de ${count}` : 'Propuestas destacadas'}>
      {children}
      {benefit && <BenefitCard key={benefit.id} benefit={benefit} />}
    </div>
    {count > 0 && <div className="client-featured-controls">
      <button type="button" aria-label="Beneficio anterior" aria-controls={panel} disabled={count < 2} onClick={() => onSelect(index - 1)}>←</button>
      <p role="status" aria-live="polite" aria-atomic="true" aria-label="Beneficio destacado actual">{index + 1} de {count}{benefit && <span className="client-sr-only">: {benefit.title}</span>}</p>
      <button type="button" aria-label="Beneficio siguiente" aria-controls={panel} disabled={count < 2} onClick={() => onSelect(index + 1)}>→</button>
    </div>}
    {count > 1 && count <= 6 && <ol className="client-featured-list" aria-label="Elegir beneficio destacado">
      {Array.from({ length: count }, (_, position) => <li key={position}><button type="button" aria-label={`Mostrar beneficio ${position + 1}`} aria-pressed={position === index} aria-controls={panel} onClick={() => onSelect(position)}>{position + 1}</button></li>)}
    </ol>}
  </div>
}
