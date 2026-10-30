import { useId, useState } from 'react'

const steps = [
  { title: 'Explorá beneficios', text: 'Elegí entre los beneficios disponibles sin crear una cuenta. Si recibiste un QR de recomendaciones, también podés descubrir lo que te compartieron.' },
  { title: 'Visitá un negocio', text: 'Acercate al negocio que elegiste y revisá las condiciones de su beneficio. No necesitás haber recibido recomendaciones.' },
  { title: 'Sumá tu sello', text: 'Usá el QR y el PIN del negocio para registrar tu primera visita que cumpla las condiciones. Necesitás una cuenta con email verificado. Cada negocio puede sumar una sola visita a tu pasaporte.' },
  { title: 'Seguí tu viaje', text: 'Consultá tus sellos, tu meta actual y tus créditos en Mi viaje. Usar créditos no borra tus visitas.' },
]

export function HowItWorks() {
  const [selected, setSelected] = useState(0)
  const panel = useId()
  return <section id="como-funciona" className="how-it-works client-how-it-works" aria-label="En tu recorrido"><div className="content-width">
    <p className="eyebrow">EN TU RECORRIDO</p><h2>Tu próxima parada, paso a paso.</h2>
    <div className="client-journey-steps" role="group" aria-label="Pasos de tu recorrido">
      {steps.map((step, index) => <button type="button" key={step.title} aria-pressed={selected === index} aria-controls={panel} onClick={() => setSelected(index)}><span aria-hidden="true">0{index + 1}</span>{step.title}</button>)}
    </div>
    <div id={panel} className="client-step-explanation" aria-live="polite"><h3>{steps[selected].title}</h3><p>{steps[selected].text}</p></div>
    <div className="qr-explainer"><div><span className="qr-step-icon" aria-hidden="true">⌑</span><p className="eyebrow">IDEAS PARA VISITAR</p><h3>QR de recomendaciones</h3><p>Es opcional: abre los beneficios que te compartieron. No registra una visita.</p></div><span className="qr-divider" aria-hidden="true">→</span><div><span className="qr-step-icon" aria-hidden="true">▦</span><p className="eyebrow">EN EL LOCAL</p><h3>QR y PIN del negocio</h3><p>Permiten registrar una visita que cumpla las condiciones, con o sin recomendaciones recibidas.</p></div></div>
  </div></section>
}
