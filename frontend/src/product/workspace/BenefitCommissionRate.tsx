import { useCallback, useId, useState } from 'react'
import { ApiError } from '../api'
import { CommissionCommandFeedback } from '../CommissionList'
import { commissionApi, useCommissionCommand, useCommissionRead } from '../commission-data'
import { messageOf } from '../shared'

type BenefitRate = { rate: number | null; version: string | null; global_rate: string }

export function BenefitCommissionRate({ path, title, onDenied }: {
  path: string
  title: string
  onDenied: () => void
}) {
  const id = useId()
  const [revision, setRevision] = useState(0)
  const [draft, setDraft] = useState<{ version: string | null; value: string } | null>(null)
  const reload = useCallback(() => setRevision(value => value + 1), [])
  const load = useCallback((signal: AbortSignal) => commissionApi<BenefitRate>('provider', path, { signal }), [path])
  const { data, loading, error } = useCommissionRead(load, revision, onDenied)
  const command = useCommissionCommand('provider', reload, onDenied)
  const rate = draft && data && draft.version === data.version ? draft.value : String(data?.rate ?? '')
  return <section className="workspace-panel commission-card">
    <h3>Comisión de {title}</h3>
    <p>El porcentaje es el mismo para todos los colaboradores. Los cambios se aplican a nuevas validaciones.</p>
    <CommissionCommandFeedback command={command} />
    {command.error && !command.uncertain && !(command.error instanceof ApiError && command.error.status === 409)
      ? <p role="alert">{messageOf(command.error)}</p> : null}
    {loading && <p role="status">Cargando la comisión…</p>}
    {error && <><p role="alert">{error}</p><button className="button button-ghost" onClick={reload}>Volver a intentar</button></>}
    {!loading && data && <form onSubmit={event => {
      event.preventDefault()
      command.submit(path, { rate: rate || null, version: data.version }, 'PUT')
    }}>
      <label htmlFor={id}>Porcentaje de comisión</label>
      <div className="workspace-actions">
        <select id={id} value={rate} disabled={command.busy || command.uncertain}
          onChange={event => setDraft({ version: data.version, value: event.target.value })}>
          <option value="">Usar tasa global ({Number(data.global_rate).toLocaleString('es-AR')} %)</option>
          {[3, 7, 10].map(option => <option key={option} value={option}>{option} %</option>)}
        </select>
        <button className="button button-dark"
          disabled={command.busy || command.uncertain || rate === String(data.rate ?? '')}>Guardar porcentaje</button>
      </div>
    </form>}
  </section>
}
