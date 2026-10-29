import { useId, useState } from 'react'

const steps = [
  { title: 'Explorá beneficios', text: 'El catálogo abierto te deja revisar propuestas publicadas y vigentes sin crear una cuenta.' },
  { title: 'Descubrí recomendaciones', text: 'El QR de un Colaborador habilitado abre su selección privada. No acredita una visita por sí solo.' },
  { title: 'Validá tu visita', text: 'En el local, el QR y PIN del Prestador permiten solicitar la acreditación de tu primera visita elegible, con o sin referencia previa. Necesitás una cuenta con email verificado.' },
  { title: 'Seguí tu viaje', text: 'En Mi viaje encontrás visitas verificadas, progreso y créditos disponibles. Usar créditos no borra tus visitas.' },
]

export function HowItWorks() {
  const [selected, setSelected] = useState(0)
  const panel = useId()
  return <section id="como-funciona" className="how-it-works client-how-it-works"><div className="content-width">
    <p className="eyebrow">EN TU RECORRIDO</p><h2>Tu próxima parada, paso a paso.</h2>
    <div className="client-journey-steps" role="group" aria-label="Pasos de tu recorrido">
      {steps.map((step, index) => <button type="button" key={step.title} aria-pressed={selected === index} aria-controls={panel} onClick={() => setSelected(index)}><span aria-hidden="true">0{index + 1}</span>{step.title}</button>)}
    </div>
    <div id={panel} className="client-step-explanation" aria-live="polite"><h3>{steps[selected].title}</h3><p>{steps[selected].text}</p></div>
    <div className="qr-explainer"><div><span className="qr-step-icon" aria-hidden="true">⌑</span><p className="eyebrow">RECOMENDACIONES</p><h3>QR del colaborador</h3><p>Abre una carpeta privada. No acredita una visita por sí solo.</p></div><span className="qr-divider" aria-hidden="true">→</span><div><span className="qr-step-icon" aria-hidden="true">▦</span><p className="eyebrow">CONSUMO</p><h3>QR y PIN del prestador</h3><p>Permiten validar el consumo en el local, con o sin referencia previa de colaborador.</p></div></div>
  </div></section>
}
