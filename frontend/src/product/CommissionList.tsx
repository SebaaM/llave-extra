import { useCallback, useId, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { ApiError } from './api'
import { ErrorSummary, FieldError } from './admin/ValidationErrors'
import { emptyErrors, fieldErrorProps, formErrors } from './admin/validation'
import { commissionApi, commissionPath, localDateTime, pesos, stateLabels, useCommissionCommand, useCommissionRead } from './commission-data'
import type { CommandControl, Commission, CommissionEvent, CommissionPage, CommissionScope } from './commission-data'
import './commissions.css'

const actionForms = {
  declare: { label: 'Declarar consumo', fields: ['outcome', 'amount'] },
  'report-payment': { label: 'Informar transferencia', fields: ['date', 'reference', 'amount'] },
  'request-correction': { label: 'Pedir corrección', fields: ['reason'] },
  approve: { label: 'Aprobar comisión', fields: ['amount', 'reason'] },
  'complete-no-commission': { label: 'Cerrar sin comisión', fields: ['reason'] },
  reconcile: { label: 'Confirmar pago', fields: ['receipt_checked', 'receipt_confirmed'] },
  reopen: { label: 'Devolver a revisión', fields: ['reason'] },
  'reject-report': { label: 'Rechazar informe de pago', fields: ['reason'] },
  'open-incident': { label: 'Abrir incidencia', fields: ['reason'] },
  'close-incident': { label: 'Cerrar incidencia', fields: ['reason'] },
} as const
type Action = keyof typeof actionForms
const providerActions = new Set(['declare', 'report-payment'])
const fieldLabels: Record<string, string> = {
  outcome: 'Resultado del consumo',
  approval_id: 'Aprobación de la transferencia',
  date: 'Fecha de transferencia',
  reference: 'Referencia de transferencia',
  reason: 'Motivo',
  receipt_checked: 'Cotejé el comprobante externo.',
  receipt_confirmed: 'Confirmé la recepción con el Colaborador.',
}

export function CommissionCommandFeedback({ command }: { command: CommandControl }) {
  if (command.uncertain || command.busy) return <div className="commission-feedback">
    <p role="status">{command.busy ? 'Guardando cambios…' : 'No pudimos confirmar el resultado. Reintentá el mismo envío antes de iniciar otra acción.'}</p>
    {command.uncertain && !command.busy && <button type="button" className="button button-dark" onClick={command.retry}>Reintentar el envío</button>}
  </div>
  if (command.error instanceof ApiError && command.error.status === 409) return <div className="commission-feedback">
    <p role="alert">Los datos cambiaron o el envío ya se registró. Actualizá la ficha para verificar su estado.</p>
    <button type="button" className="button button-dark" onClick={command.reset}>Actualizar datos</button>
  </div>
  return command.notice ? <p role="status">{command.notice}</p> : null
}

function CommissionAction({ detail, action, command }: { detail: Commission; action: Action; command: CommandControl }) {
  const prefix = useId()
  const [outcome, setOutcome] = useState('')
  const { label, fields: baseFields } = actionForms[action]
  const lateApprovals = action === 'report-payment' && detail.state === 'ANNULLED' ? detail.payment_approvals : []
  const needsApproval = lateApprovals.length > 1
  const paymentApproval = needsApproval ? null : lateApprovals[0] ?? detail.approval
  const fields = needsApproval ? ['approval_id', ...baseFields] : baseFields
  const path = `${commissionPath(detail.id)}actions/${action}/`
  const cause = command.command?.path === path && !command.uncertain && !(command.error instanceof ApiError && command.error.status === 409) ? command.error : null
  const errors = cause ? formErrors(cause, fields) : emptyErrors()
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const body: Record<string, string | boolean | null> = { version: detail.version }
    for (const name of fields) {
      if (name === 'receipt_checked' || name === 'receipt_confirmed') body[name] = data.has(name)
      else if (name === 'amount' && outcome === 'NOT_CONSUMED') body[name] = null
      else body[name] = String(data.get(name) ?? '').trim()
    }
    command.submit(path, body)
  }
  return <form className="commission-form" onSubmit={submit}>
    <ErrorSummary errors={errors} />
    {action === 'report-payment' && <p>Informá una transferencia que ya hiciste al Colaborador por fuera de Llave Extra.</p>}
    {action === 'reject-report' && <p>Usá esta acción si verificaste que la transferencia informada no se realizó.</p>}
    {action === 'reopen' && <p>Confirmá que todavía no se efectuó la transferencia.</p>}
    <fieldset disabled={command.busy || command.uncertain || (command.error instanceof ApiError && command.error.status === 409)}>
      {fields.map(name => {
        const props = fieldErrorProps(errors, name, prefix)
        const amountLabel = action === 'declare' ? 'Importe aproximado (ARS)' : action === 'approve' ? 'Base aprobada (ARS)' : 'Importe transferido (ARS)'
        return <div key={name}><label className={name.startsWith('receipt_') ? 'commission-check' : undefined}>
          {name.startsWith('receipt_') ? <><input type="checkbox" name={name} required {...props} />{fieldLabels[name]}</> : <>
            {name === 'amount' ? amountLabel : fieldLabels[name]}
            {name === 'approval_id' ? <select name={name} defaultValue="" required {...props}>
              <option value="">Elegí la aprobación que originó la transferencia</option>
              {lateApprovals.map(approval => <option key={approval.id} value={approval.id}>
                {localDateTime(approval.created_at)} · {pesos.format(Number(approval.amount))}
              </option>)}
            </select> : name === 'outcome' ? <select name={name} value={outcome} onChange={event => setOutcome(event.target.value)} required {...props}>
              <option value="">Elegí un resultado</option><option value="CONSUMED">Se concretó</option><option value="NOT_CONSUMED">No consumió</option>
            </select> : name === 'reason' ? <textarea name={name} required={action !== 'approve'} rows={2} {...props} />
              : name === 'amount' ? <input name={name} inputMode="decimal" type="number" step="0.01" min="0" disabled={outcome === 'NOT_CONSUMED'} required={outcome !== 'NOT_CONSUMED'} key={outcome}
                defaultValue={action === 'approve' ? detail.declaration?.amount ?? '' : action === 'report-payment' ? paymentApproval?.amount ?? '' : ''} {...props} />
                : <input name={name} type={name === 'date' ? 'date' : 'text'} required {...props} />}
          </>}
        </label><FieldError name={name} prefix={prefix} errors={errors} /></div>
      })}
      {action === 'approve' && <p className="commission-muted">Si cambiás la base declarada, indicá el motivo.</p>}
      <button type="submit" className="button button-dark">{label}</button>
    </fieldset>
  </form>
}

function PaymentDate({ value }: { value: string }) {
  return <time dateTime={value}>{value.split('-').reverse().join('/')}</time>
}

function EventFacts({ event, approval }: { event: CommissionEvent; approval?: CommissionEvent }) {
  return <div className="commission-event-facts">
    {event.outcome && <span>{event.outcome === 'CONSUMED' ? 'Se concretó' : 'No consumió'}</span>}
    {event.base_amount != null && <span>Base {pesos.format(Number(event.base_amount))}</span>}
    {event.rate != null && <span>Porcentaje {event.rate} %</span>}
    {event.amount != null && <span>Importe {pesos.format(Number(event.amount))}</span>}
    {event.date && <span>Transferencia del <PaymentDate value={event.date} /></span>}
    {event.reference && <span>Referencia {event.reference}</span>}
    {approval?.rate != null && <span>Aprobación del {localDateTime(approval.created_at)}</span>}
    {event.receipt_checked && <span>Comprobante cotejado</span>}
    {event.receipt_confirmed && <span>Recepción confirmada</span>}
  </div>
}

function CommissionDetail({ detail, scope, command, adminExtra, loading }: {
  detail: Commission; scope: CommissionScope; command: CommandControl; loading: boolean; adminExtra?: (detail: Commission) => ReactNode
}) {
  const [selected, setSelected] = useState<Action | ''>('')
  const actions = detail.actions.filter((action): action is Action =>
    Object.hasOwn(actionForms, action) && (scope === 'provider') === providerActions.has(action))
  const action = actions.includes(selected as Action) ? selected as Action : actions.length === 1 ? actions[0] : ''
  const events = [...detail.events].sort((first, second) => first.created_at.localeCompare(second.created_at))
  const eventsById = new Map(events.flatMap(event => event.id ? [[event.id, event] as const] : []))
  const paymentApproval = detail.payment ? eventsById.get(detail.payment.approval_id) : undefined
  return <>
    <dl className="commission-facts">
      <div><dt>Declaración</dt><dd>{detail.declaration ? (detail.declaration.outcome === 'CONSUMED' ? 'Se concretó' : 'No consumió') : 'Pendiente'}</dd></div>
      {detail.declaration?.amount != null && <div><dt>Importe declarado</dt><dd>{pesos.format(Number(detail.declaration.amount))}</dd></div>}
      {detail.approval && <div><dt>Base aprobada</dt><dd>{pesos.format(Number(detail.approval.base_amount))}</dd></div>}
      <div><dt>{detail.approval ? 'Porcentaje aplicado' : 'Porcentaje vigente'}</dt><dd>{detail.approval ? `${detail.approval.rate} %` : detail.current_rate == null ? 'Sin configurar' : `${detail.current_rate} %`}</dd></div>
      {detail.approval && <div><dt>Comisión aprobada</dt><dd>{pesos.format(Number(detail.approval.amount))}</dd></div>}
      {detail.payment && <>
        <div><dt>Fecha de transferencia</dt><dd><PaymentDate value={detail.payment.date} /></dd></div>
        <div><dt>Referencia</dt><dd>{detail.payment.reference}</dd></div>
        <div><dt>Importe informado</dt><dd>{pesos.format(Number(detail.payment.amount))}</dd></div>
        {paymentApproval && <div><dt>Aprobación de la transferencia</dt><dd>{localDateTime(paymentApproval.created_at)}</dd></div>}
      </>}
    </dl>
    {scope === 'admin' && !loading && adminExtra?.(detail)}
    <section className="commission-history">
      <h3>Historial del consumo</h3>
      {events.length ? <ol>{events.map((event, index) => <li key={event.id ?? `${event.created_at}-${event.kind}-${index}`}>
        <strong>{event.label}</strong>
        <span><time dateTime={event.created_at}>{localDateTime(event.created_at)}</time>{event.actor ? ` · ${event.actor}` : ''}</span>
        <EventFacts event={event} approval={event.basis_id ? eventsById.get(event.basis_id) : undefined} />
        {event.reason && <p>{event.reason}</p>}
      </li>)}</ol> : <p>El historial de esta ficha está vacío.</p>}
    </section>
    {!loading && actions.length > 0 && <section className="commission-actions">
      <h3>{scope === 'admin' ? 'Acciones disponibles' : 'Qué podés hacer'}</h3>
      {actions.length > 1 && <label>Acción<select value={action} onChange={event => setSelected(event.target.value as Action | '')} disabled={command.busy || command.uncertain}>
        <option value="">Elegí una acción</option>{actions.map(name => <option key={name} value={name}>{actionForms[name].label}</option>)}
      </select></label>}
      {action && <CommissionAction key={`${detail.version}-${action}`} detail={detail} action={action} command={command} />}
    </section>}
  </>
}

function ExpandedCommission({ scope, row, command, revision, onDenied, adminExtra }: {
  scope: CommissionScope; row: Commission; command: CommandControl; revision: number; onDenied: () => void; adminExtra?: (detail: Commission) => ReactNode
}) {
  const [retry, setRetry] = useState(0)
  const load = useCallback((signal: AbortSignal) => commissionApi<Commission>(scope, commissionPath(row.id), { signal }), [scope, row.id])
  const { data, error, loading } = useCommissionRead(load, revision + retry, onDenied)
  return <div className="commission-expanded">
    {loading && <p role="status">Cargando ficha…</p>}
    {error && <><p role="alert">{error}</p><button type="button" className="button button-dark" onClick={() => setRetry(value => value + 1)}>Volver a cargar la ficha</button></>}
    {data && <CommissionDetail detail={data} scope={scope} command={command} loading={loading} adminExtra={adminExtra} />}
  </div>
}

export function CommissionList({ scope, adminFilters, adminExtra }: {
  scope: CommissionScope
  adminFilters?: ReactNode
  adminExtra?: (detail: Commission) => ReactNode
}) {
  const [view, setView] = useState({ filters: '', page: 1 })
  const [expanded, setExpanded] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)
  const [denied, setDenied] = useState(false)
  const reload = useCallback(() => setRevision(value => value + 1), [])
  const deny = useCallback(() => setDenied(true), [])
  const load = useCallback((signal: AbortSignal) => {
    const params = new URLSearchParams(view.filters)
    params.set('page', String(view.page))
    return commissionApi<CommissionPage>(scope, `commissions/?${params}`, { signal })
  }, [scope, view])
  const { data, loading, error } = useCommissionRead(load, revision, deny)
  const command = useCommissionCommand(scope, reload, deny)
  function filter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const params = new URLSearchParams()
    for (const [name, raw] of new FormData(event.currentTarget)) {
      const value = String(raw).trim()
      if (value) params.set(name, value)
    }
    setExpanded(null)
    setView({ filters: params.toString(), page: 1 })
  }
  function goTo(page: number) {
    setExpanded(null)
    setView(current => ({ ...current, page }))
  }
  if (denied) return <p role="alert">El acceso a estos consumos ya no está habilitado.</p>
  return <section className="commission-page">
    <form className="commission-filters" onSubmit={filter}>
      <label>Estado<select name="state"><option value="">Todos los estados</option>
        {Object.entries(stateLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select></label>
      <button type="submit" className="button button-dark">Filtrar</button>
      {scope === 'admin' && adminFilters}
    </form>
    <CommissionCommandFeedback command={command} />
    {loading && <p role="status">Cargando consumos…</p>}
    {error && <><p role="alert">{error}</p><button className="button button-dark" onClick={reload}>Volver a intentar</button>{view.page > 1 && <button className="button button-ghost" onClick={() => goTo(1)}>Volver a la primera página</button>}</>}
    {data && <>
      {data.results.length === 0 ? <p>No hay consumos referidos para estos filtros.</p> : <div className="commission-list">{data.results.map(row => {
        const open = expanded === row.id
        const panelId = `commission-${row.id}`
        return <article className="commission-card" key={row.id}>
          <h2><button className="commission-summary" id={`${panelId}-toggle`} type="button" aria-expanded={open} aria-controls={panelId} onClick={() => setExpanded(open ? null : row.id)}>
            <span className="commission-identification"><strong>{row.benefit_title || 'Beneficio no registrado'}</strong>
              <span>Validado el <time dateTime={row.created_at}>{localDateTime(row.created_at)}</time></span>
              <span className="commission-folio">Folio {row.id}</span></span>
            <span className="commission-parties"><span>Colaborador <strong>{row.collaborator_name}</strong></span>
              {scope === 'admin' && <><span>Prestador <strong>{row.provider_name}</strong></span><span>Cliente <strong>{row.tourist_name || 'Sin nombre'}</strong></span></>}
            </span>
            <span className="commission-summary-state"><strong className={`commission-state state-${row.state.toLowerCase()}`}>{stateLabels[row.state]}{row.state === 'COMPLETED' && (!row.approval || Number(row.approval.amount) === 0) ? ' · Sin comisión' : ''}</strong>
              {row.next_step && <span>{row.next_step}</span>}
              {row.incident && <span className="commission-incident">Incidencia abierta</span>}</span>
            <span aria-hidden="true" className="commission-chevron">⌄</span>
          </button></h2>
          <div id={panelId} role="region" aria-labelledby={`${panelId}-toggle`} hidden={!open}>
            {open && <ExpandedCommission scope={scope} row={row} command={command} revision={revision} onDenied={deny} adminExtra={adminExtra} />}
          </div>
        </article>
      })}</div>}
      <nav aria-label="Paginación de consumos" className="commission-pagination">
        <span>Página {view.page} · {data.count} {data.count === 1 ? 'consumo' : 'consumos'}</span>
        <button type="button" className="button button-ghost" disabled={loading || !data.previous} onClick={() => goTo(view.page - 1)}>Anterior</button>
        <button type="button" className="button button-ghost" disabled={loading || !data.next} onClick={() => goTo(view.page + 1)}>Siguiente</button>
      </nav>
    </>}
  </section>
}
