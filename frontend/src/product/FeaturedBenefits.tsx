import { useId, useState } from 'react'
import { BenefitCard } from './CatalogPages'
import type { PublicBenefit } from './catalog'

export function FeaturedBenefits({ benefits }: { benefits: PublicBenefit[] }) {
  const [selection, setSelection] = useState<{ benefits: PublicBenefit[]; index: number } | null>(null)
  const panel = useId()
  const index = selection?.benefits === benefits ? selection.index : 0
  const current = benefits[index]
  const select = (next: number) => setSelection({ benefits, index: (next + benefits.length) % benefits.length })

  if (!current) return null
  return <div className="client-featured-benefits" role="region" aria-label="Beneficios destacados" aria-roledescription="carrusel">
    <div id={panel} role="group" aria-roledescription="diapositiva" aria-label={`${index + 1} de ${benefits.length}`}>
      <BenefitCard key={current.id} benefit={current} />
    </div>
    <div className="client-featured-controls">
      <button type="button" aria-label="Beneficio anterior" aria-controls={panel} disabled={benefits.length < 2} onClick={() => select(index - 1)}>←</button>
      <p role="status" aria-live="polite" aria-atomic="true" aria-label="Beneficio destacado actual">{index + 1} de {benefits.length}<span className="client-sr-only">: {current.title}</span></p>
      <button type="button" aria-label="Beneficio siguiente" aria-controls={panel} disabled={benefits.length < 2} onClick={() => select(index + 1)}>→</button>
    </div>
    {benefits.length > 1 && <ol className="client-featured-list" aria-label="Elegir beneficio destacado">
      {benefits.map((benefit, position) => <li key={benefit.id}><button type="button" aria-label={`Mostrar beneficio ${position + 1}: ${benefit.title}`} aria-pressed={position === index} aria-controls={panel} onClick={() => select(position)}>{position + 1}</button></li>)}
    </ol>}
  </div>
}
