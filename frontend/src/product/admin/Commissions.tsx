import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { ApiError, currentSessionVersion } from '../api'
import { CommissionCommandFeedback, CommissionList } from '../CommissionList'
import { commissionApi, commissionPath, isDenied, useCommissionCommand, useCommissionRead } from '../commission-data'
import type { CommandControl, Commission, Rule, Rules } from '../commission-data'
import { messageOf } from '../shared'
import { ReferencePicker } from './ReferencePicker'
import { ErrorSummary, FieldError } from './ValidationErrors'
import { emptyErrors, fieldErrorProps, formErrors } from './validation'

type BankDetails = { cbu: string; alias: string | null }

function BankDetailsPanel({ detail }: { detail: Commission }) {
  const request = useRef<AbortController | null>(null)
  const [bank, setBank] = useState<BankDetails | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => () => request.current?.abort(), [])
  const path = `${commissionPath(detail.id)}bank-details/`
  const allowed = detail.actions.includes('bank-details')

  function hide() {
    request.current?.abort()
    request.current = null
    setBank(null)
    setBusy(false)
    setError('')
  }

  async function reveal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (request.current || !allowed) return
    const reason = String(new FormData(event.currentTarget).get('reason') ?? '')
    const version = currentSessionVersion()
    const controller = new AbortController()
    request.current = controller
    const active = () => !controller.signal.aborted && version === currentSessionVersion()
    setError('')
    setBusy(true)
    try {
      const response = await commissionApi<BankDetails>('admin', path, { method: 'POST', body: { reason }, signal: controller.signal })
      if (active()) setBank(response)
    } catch (cause) {
      if (active()) setError(isDenied(cause) ? 'Tu cuenta ya no tiene acceso a los datos bancarios.' : messageOf(cause))
    } finally {
      if (active()) {
        request.current = null
        setBusy(false)
      }
    }
  }

  return <section className="commission-bank">
    <h3>Datos bancarios del Colaborador</h3>
    <p>{detail.bank_configured ? 'Configurados' : 'Pendientes'}</p>
    {detail.bank_changed && <p role="status">Los datos bancarios cambiaron después de la aprobación.</p>}
    {allowed && (bank ? <>
      <dl className="commission-facts"><div><dt>CBU vigente</dt><dd>{bank.cbu}</dd></div>
        {bank.alias && <div><dt>Alias vigente</dt><dd>{bank.alias}</dd></div>}</dl>
      <button type="button" className="button button-dark" onClick={hide}>Ocultar datos bancarios</button>
    </> : <form onSubmit={reveal} className="commission-reveal">
      <label>Motivo de consulta<select required name="reason" defaultValue="" disabled={busy}>
        <option value="">Elegí un motivo</option><option value="prepare">Preparar transferencia</option>
        <option value="verify">Verificar transferencia</option><option value="incident">Revisar incidencia</option>
      </select></label>
      <button className="button button-dark" type="submit" disabled={busy}>{busy ? 'Consultando…' : 'Revelar datos bancarios'}</button>
      {busy && <button className="button button-ghost" type="button" onClick={hide}>Cancelar consulta</button>}
    </form>)}
    {error && <p role="alert">{error}</p>}
  </section>
}

function RuleEditor({ rule, command }: { rule: Rule; command: CommandControl }) {
  const prefix = useId()
  const path = rule.provider_id ? `commission-rules/providers/${encodeURIComponent(rule.provider_id)}/` : 'commission-rules/global/'
  const cause = command.command?.path === path && !command.uncertain && !(command.error instanceof ApiError && command.error.status === 409) ? command.error : null
  const errors = cause ? formErrors(cause, ['rate']) : emptyErrors()
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const rate = String(new FormData(event.currentTarget).get('rate') ?? '').trim()
    command.submit(path, { rate: rate || null, version: rule.version }, 'PUT')
  }
  return <form onSubmit={save} className="commission-form">
    <ErrorSummary errors={errors} />
    <fieldset disabled={command.busy || command.uncertain || (command.error instanceof ApiError && command.error.status === 409)}>
      <div><label>{rule.provider_id ? 'Porcentaje del Prestador' : 'Porcentaje global'}
        <input name="rate" type="number" min="0" max="100" step="0.01" inputMode="decimal" defaultValue={rule.rate ?? ''} {...fieldErrorProps(errors, 'rate', prefix)} />
      </label>
      <FieldError name="rate" prefix={prefix} errors={errors} /></div>
      <p className="commission-muted">{rule.provider_id ? 'Dejá el porcentaje vacío para aplicar la regla global a los casos anteriores.' : 'Sin regla global explícita, las nuevas validaciones usan el 5 % cuando el beneficio no tiene una tasa propia.'}</p>
      <button className="button button-dark" type="submit">{rule.provider_id ? 'Guardar excepción' : 'Guardar regla global'}</button>
    </fieldset>
  </form>
}

function CommissionRules() {
  const [revision, setRevision] = useState(0)
  const [providerId, setProviderId] = useState('')
  const [denied, setDenied] = useState(false)
  const load = useCallback((signal: AbortSignal) => commissionApi<Rules>('admin', 'commission-rules/', { signal }), [])
  const reload = useCallback(() => setRevision(value => value + 1), [])
  const deny = useCallback(() => setDenied(true), [])
  const { data, loading, error } = useCommissionRead(load, revision, deny)
  const command = useCommissionCommand('admin', reload, deny)
  const provider = data?.providers.find(item => item.provider_id === providerId)
  if (denied) return <p role="alert">Tu cuenta ya no tiene acceso a las reglas de comisión.</p>
  return <section className="commission-page">
    <p className="commission-muted">La tasa global se registra en las nuevas validaciones de beneficios que la usan. Las excepciones por Prestador se aplican a casos anteriores sin tasa registrada.</p>
    <CommissionCommandFeedback command={command} />
    {loading && <p role="status">Cargando porcentajes…</p>}
    {error && <><p role="alert">{error}</p><button className="button button-dark" onClick={reload}>Volver a intentar</button></>}
    {!loading && data && <div className="commission-rules">
      <section className="commission-card commission-expanded">
        <h3>Regla global</h3>
        <RuleEditor rule={data.global} key={data.global.version ?? 'global-empty'} command={command} />
      </section>
      <section className="commission-card commission-expanded">
        <h3>Excepción por Prestador</h3>
        {data.providers.length ? <>
          <label>Prestador<select value={providerId} onChange={event => setProviderId(event.target.value)}>
            <option value="">Elegí un prestador</option>{data.providers.map(item => <option key={item.provider_id} value={item.provider_id ?? ''}>{item.provider_name}{item.rate == null ? '' : ` · ${item.rate} %`}</option>)}
          </select></label>
          {provider && <RuleEditor rule={provider} key={`${provider.provider_id}-${provider.version}`} command={command} />}
        </> : <p>No hay prestadores disponibles.</p>}
      </section>
    </div>}
  </section>
}

function CommissionFilters() {
  const [provider, setProvider] = useState('')
  const [collaborator, setCollaborator] = useState('')
  return <details className="commission-more-filters">
    <summary>Filtrar por Prestador o Colaborador</summary>
    <div className="commission-party-filters">
      <div className="commission-filter-field"><span>Prestador</span>
        <ReferencePicker kind="providers" label="Prestador" value={provider} onChange={setProvider} required={false} emptyLabel="Todos los prestadores" />
        <input type="hidden" name="provider" value={provider} />
      </div>
      <div className="commission-filter-field"><span>Colaborador</span>
        <ReferencePicker kind="collaborators" label="Colaborador" value={collaborator} onChange={setCollaborator} required={false} emptyLabel="Todos los colaboradores" />
        <input type="hidden" name="collaborator" value={collaborator} />
      </div>
    </div>
  </details>
}

export function Commissions({ section }: { section: 'commissions' | 'commission-rules' }) {
  if (section === 'commission-rules') return <CommissionRules />
  return <CommissionList scope="admin" adminFilters={<CommissionFilters />}
    adminExtra={detail => <BankDetailsPanel key={`${detail.id}-${detail.version}`} detail={detail} />} />
}
