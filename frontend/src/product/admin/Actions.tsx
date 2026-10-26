import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { ApiError, currentSessionVersion, privateImage } from '../api'
import { messageOf } from '../shared'
import { useDirtyGuard } from './hooks'
import { ReferencePicker } from './ReferencePicker'
import { adminApi, authorizedDownload, makeCommand, permissionLost, sendCommand } from './api'
import type { PendingCommand } from './api'
import type { Row } from './types'
import { Status } from './UI'

type ActionField = { name: string; label: string; type?: 'text' | 'number' | 'password' | 'select'; lookup?: 'users' | 'providers' | 'benefits'; lookupQuery?: string; options?: readonly (readonly [string, string])[]; required?: boolean }
type Action = { name: string; label: string; fields?: readonly ActionField[]; confirm: string }
const reason: ActionField = { name: 'reason', label: 'Motivo', required: true }
const versioned = (name: string, label: string, confirm: string, fields?: readonly ActionField[]): Action => ({ name, label, confirm, fields })
const actions: Record<string, Action[]> = {
  users: [versioned('invite', 'Enviar invitación', 'Se enviará una invitación por email a esta persona.')],
  providers: [
    versioned('assign-user', 'Asignar usuario', 'Este usuario podrá administrar el negocio asignado.', [{ name: 'user_id', label: 'Usuario Prestador', type: 'number', lookup: 'users', lookupQuery: 'role=PROVIDER&is_active=true', required: true }, { name: 'reassign', label: 'Reasignar si tiene otro negocio', type: 'select', options: [['false', 'No'], ['true', 'Sí']] }]),
    versioned('unassign-user', 'Quitar usuario', 'La persona perderá acceso a este negocio.', [{ name: 'user_id', label: 'Usuario asignado', type: 'number', lookup: 'users', required: true }]),
    versioned('set-pin', 'Actualizar PIN', 'El PIN anterior dejará de servir para nuevos consumos.', [{ name: 'pin', label: 'PIN de 6 a 12 dígitos', type: 'password', required: true }]),
    versioned('rotate-qr', 'Renovar QR', 'Los códigos anteriores dejarán de autorizar nuevos consumos.'),
  ],
  collaborators: [
    versioned('enable', 'Habilitar', 'El colaborador podrá compartir su carpeta.'), versioned('disable', 'Deshabilitar', 'El acceso a su carpeta quedará revocado.'),
    versioned('rotate-qr', 'Renovar QR', 'Los códigos de referencia anteriores quedarán revocados.'),
    versioned('add-benefit', 'Agregar beneficio', 'Se agregará este beneficio concreto a la carpeta.', [{ name: 'benefit_id', label: 'Beneficio publicado y vigente', lookup: 'benefits', lookupQuery: 'current=true', required: true }]),
    versioned('remove-benefit', 'Quitar beneficio', 'Este beneficio dejará de estar disponible en la carpeta.', [{ name: 'benefit_id', label: 'Beneficio seleccionado', lookup: 'benefits', required: true }]),
  ],
  consumptions: [versioned('annul', 'Anular consumo', 'Se revertirán los créditos elegibles de este consumo.', [reason])],
  adjustments: [versioned('resolve', 'Resolver ajuste', 'Se registrará una resolución financiera para este ajuste.', [{ name: 'resolution', label: 'Resolución', type: 'select', options: [['REVERSAL', 'Reversión'], ['FUNDED', 'Cubrir saldo'], ['FORGIVEN', 'Condonar']] }, reason])],
  products: [versioned('adjust-stock', 'Ajustar stock', 'La variación se registrará en el historial de stock.', [{ name: 'delta', label: 'Variación positiva o negativa', type: 'number', required: true }, reason])],
  orders: [versioned('prepare', 'Marcar preparado', 'El pedido pasará a preparado.', [reason]), versioned('deliver', 'Registrar entrega', 'El pedido pasará a retirado.', [reason]), versioned('refund', 'Solicitar reintegro', 'Se solicitará el reintegro. Su resultado se confirmará posteriormente.', [reason])],
  cancellations: [versioned('approve', 'Aprobar cancelación', 'La cancelación afectará créditos y stock según el estado del pedido.', [reason]), versioned('reject', 'Rechazar cancelación', 'La solicitud quedará rechazada.', [reason])],
  'payment-operations': [versioned('retry', 'Reintentar operación', 'Se programará un nuevo intento de esta operación.', [reason])],
  'credit-rules': [versioned('remove', 'Eliminar regla', 'Los próximos consumos usarán la regla general; el historial conservará su valor.')],
}
const versions = new Set(['providers', 'collaborators', 'products', 'credit-rules'])
export function RecordActions({ resource, data, onSuccess }: { resource: string; data: Row; onSuccess: () => Promise<void> }) {
  const [owner, setOwner] = useState<string | null>(null)
  const available = (actions[resource] ?? []).filter(action => {
    // Keep the recovery form mounted even when a refresh changes available actions.
    if (owner === action.name) return true
    if (resource === 'consumptions') return data.state === 'VALID'
    if (resource === 'adjustments') return !data.resolved_at
    if (resource === 'orders') return action.name === 'prepare' ? data.state === 'PAID' : action.name === 'deliver' ? data.state === 'READY' : data.mode === 'MONEY' && ['PAID', 'READY', 'PICKED_UP', 'PAYMENT_REVIEW'].includes(String(data.state))
    if (resource === 'cancellations') return data.state === 'OPEN'
    if (resource === 'payment-operations') return data.state === 'BLOCKED'
    return true
  })
  return available.length ? <>{available.map(action => <ActionForm key={`${data.id}:${action.name}`} resource={resource} data={data} action={action} onSuccess={onSuccess} blocked={owner !== null && owner !== action.name} claim={() => setOwner(action.name)} release={() => setOwner(null)} />)}</> : <p>No hay acciones disponibles para el estado actual.</p>
}
function ActionForm({ resource, data, action, onSuccess, blocked, claim, release }: { resource: string; data: Row; action: Action; onSuccess: () => Promise<void>; blocked: boolean; claim: () => void; release: () => void }) {
  const [values, setValues] = useState<Record<string, string>>({})
  const [pending, setPending] = useState<PendingCommand | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState('')
  const [phase, setPhase] = useState<'idle' | 'uncertain' | 'delivery' | 'reload'>('idle')
  useDirtyGuard(phase !== 'idle' || Object.values(values).some(value => value !== ''))
  const refreshDetail = async (session: number) => {
    try {
      await onSuccess()
      if (session !== currentSessionVersion()) return
      setPending(null); setValues({}); setPhase('idle'); setError(''); release()
    } catch (cause) {
      if (session === currentSessionVersion()) setError(`No se pudo actualizar la ficha: ${messageOf(cause)}`)
    }
  }
  const recover = async (abandon: boolean) => {
    if (busy || blocked) return
    if (abandon && !window.confirm('El resultado anterior puede seguir pendiente. Se conservará su clave hasta cargar la ficha actual. ¿Querés dejar de seguir ese intento e iniciar otra operación?')) return
    const session = currentSessionVersion()
    setBusy(true); setError('')
    await refreshDetail(session)
    if (session === currentSessionVersion()) setBusy(false)
  }
  const confirmed = async (delivery: unknown, session: number) => {
    if (delivery === 'PENDING') {
      setPhase('delivery'); setResult('La invitación quedó pendiente de confirmación de envío.')
      return
    }
    setPhase('reload'); setPending(null); setValues({})
    setResult(delivery === 'SENT' ? 'La invitación fue enviada.' : delivery === 'FAILED' ? 'El envío de la invitación falló. Podés enviar otra invitación después de actualizar la ficha.' : 'La operación se registró.')
    await refreshDetail(session)
  }
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy || blocked || phase === 'reload') return
    if (!pending && !window.confirm(`${action.confirm}\n\nRegistro: ${String(data.name ?? data.title ?? data.email ?? data.id)}\n¿Confirmás la acción?`)) return
    const body: Record<string, unknown> = pending ? structuredClone(pending.body) : {}
    if (!pending) {
      if (versions.has(resource)) body.version = data.version
      for (const field of action.fields ?? []) body[field.name] = field.type === 'number' ? Number(values[field.name]) : field.name === 'reassign' ? values[field.name] === 'true' : values[field.name] ?? field.options?.[0]?.[0] ?? ''
    }
    const command = pending ?? makeCommand(`${resource}/${data.id}/${action.name === 'invite' ? 'invite/' : `actions/${action.name}/`}`, body)
    claim(); setPending(command); setPhase('uncertain'); setBusy(true); setError(''); setResult('')
    const version = currentSessionVersion()
    try {
      const response = await sendCommand<Record<string, unknown>>(command)
      if (version !== currentSessionVersion()) return
      await confirmed(response.delivery, version)
    } catch (cause) {
      if (version !== currentSessionVersion()) return
      if (action.name === 'invite' && cause instanceof ApiError && (cause.payload as { delivery?: string } | undefined)?.delivery === 'FAILED') await confirmed('FAILED', version)
      else setError(cause instanceof ApiError && cause.status === 409 ? 'El registro cambió o esta clave ya se usó con otros datos. Recargá la ficha antes de iniciar una operación nueva; si fue un reintento, conservá la carga original.' : messageOf(cause))
    } finally { if (version === currentSessionVersion()) setBusy(false) }
  }
  return <form className="admin-action" onSubmit={submit}><h3>{action.label}</h3><p>{action.confirm}</p><div className="admin-action-fields">{action.fields?.map(field => field.lookup ? <div key={field.name} className="admin-field"><span>{field.label}</span><ReferencePicker label={field.label} kind={field.lookup} query={field.lookupQuery} disabled={phase !== 'idle' || blocked || busy} selectedIds={action.name === 'unassign-user' && Array.isArray(data.user_ids) ? data.user_ids as number[] : action.name === 'remove-benefit' && Array.isArray(data.benefit_ids) ? data.benefit_ids as string[] : undefined} value={values[field.name] ?? ''} onChange={value => setValues(current => ({ ...current, [field.name]: value }))} /></div> : <label key={field.name}>{field.label}{field.type === 'select' ? <select disabled={phase !== 'idle' || blocked || busy} value={values[field.name] ?? field.options?.[0]?.[0]} onChange={event => setValues(current => ({ ...current, [field.name]: event.target.value }))}>{field.options?.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select> : <input disabled={phase !== 'idle' || blocked || busy} type={field.type ?? 'text'} required={field.required} minLength={field.name === 'pin' ? 6 : undefined} maxLength={field.name === 'pin' ? 12 : undefined} pattern={field.name === 'pin' ? '[0-9]{6,12}' : undefined} value={values[field.name] ?? ''} onChange={event => setValues(current => ({ ...current, [field.name]: event.target.value }))} />}</label>)}</div>{error && <Status error>{error}</Status>}{result && <Status>{result}</Status>}
    <div className="admin-actions">{phase === 'reload' ? <button type="button" className="button button-dark" disabled={busy || blocked} onClick={() => void recover(false)}>{busy ? 'Actualizando…' : 'Reintentar actualización de ficha'}</button> : <button className="button button-dark" disabled={busy || blocked}>{busy ? 'Procesando…' : phase === 'delivery' ? 'Consultar estado del envío' : pending ? 'Reintentar operación anterior' : action.label}</button>}{pending && <button type="button" disabled={busy || blocked} className="button button-ghost" onClick={() => void recover(true)}>Iniciar nueva operación</button>}</div>
  </form>
}

export function PrivateQr({ resource, id }: { resource: 'providers' | 'collaborators'; id: string | number }) {
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const request = useRef(0)
  useEffect(() => () => { request.current += 1; if (url) URL.revokeObjectURL(url) }, [url])
  const load = async () => {
    const sequence = ++request.current
    const version = currentSessionVersion()
    setBusy(true); setError('')
    try {
      const response = await adminApi<{ url: string }>(`${resource}/${id}/qr/`)
      const blobUrl = await privateImage(response.url)
      if (sequence !== request.current || version !== currentSessionVersion()) { if (blobUrl) URL.revokeObjectURL(blobUrl); return }
      setUrl(blobUrl)
    } catch (cause) { permissionLost(cause); if (sequence === request.current && version === currentSessionVersion()) setError(messageOf(cause)) }
    finally { if (sequence === request.current && version === currentSessionVersion()) setBusy(false) }
  }
  return <section className="admin-panel"><h2>QR vigente</h2><p>Se consulta con autorización actual. Descargá el código solo cuando lo necesites.</p>{error && <Status error>{error}</Status>}{url && <img className="admin-qr" src={url} alt="Código QR vigente" />}<div className="admin-actions"><button className="button button-dark" onClick={() => void load()} disabled={busy}>{busy ? 'Cargando…' : 'Mostrar QR actual'}</button><button className="button button-ghost" onClick={() => void authorizedDownload(`/api/v1/admin/${resource}/${id}/qr.png`, `qr-${resource}.png`).catch(cause => setError(messageOf(cause)))}>Descargar QR actual</button></div></section>
}
