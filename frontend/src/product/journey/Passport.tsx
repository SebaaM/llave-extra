import type { Consumption } from '../api'

export function Passport({ history }: { history: Consumption[] }) {
  return <ul className="client-passport" aria-label="Visitas registradas">{history.map(item => {
    const valid = item.state === 'VALID'
    const annulled = item.state === 'ANNULLED'
    const status = valid ? 'Visita verificada' : annulled ? 'Visita anulada' : 'Estado de visita no disponible'
    const hasName = Boolean(item.provider_name?.trim())
    const date = new Date(item.created_at)
    const hasDate = Number.isFinite(date.getTime())

    return <li key={item.id} className={`client-visit ${valid ? 'client-visit-valid' : annulled ? 'client-visit-annulled' : 'client-visit-unknown'}`}>
      <span className="client-visit-mark" aria-hidden="true">{valid ? '✳' : annulled ? '⊘' : '?'}</span>
      <div className="client-visit-details">
        <h3>{hasName ? item.provider_name : status}</h3>
        {hasName && <p className="client-visit-status">{status}</p>}
        <p>{hasDate ? <time dateTime={item.created_at}>{date.toLocaleDateString('es-AR', { dateStyle: 'long' })}</time> : 'Fecha no disponible'}</p>
        {annulled && <p>Esta visita ya no forma parte de tu progreso.</p>}
      </div>
      <p className="client-visit-award">{item.award > 0 ? `${item.award.toLocaleString('es-AR')} créditos ${valid ? 'acreditados' : 'al registrar la visita'}` : 'Sin créditos acreditados'}</p>
    </li>
  })}</ul>
}
