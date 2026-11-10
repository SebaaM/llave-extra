import { useCallback, useEffect, useRef, useState } from 'react'
import { api, ApiError, currentSessionVersion } from './api'
import { adminApi } from './admin/api'
import { messageOf } from './shared'
import { useCurrent } from './workspace/hooks'

export const stateLabels = {
  AWAITING_PROVIDER: 'Falta verificación del Prestador',
  TO_PAY: 'A pagar comisión',
  COMPLETED: 'Completado',
  NO_COMMISSION: 'Sin comisión',
  ANNULLED: 'Anulado',
  HISTORICAL: 'Histórico',
  DEMO: 'Demostración',
}

export type CommissionScope = 'admin' | 'provider'
export type CommissionEvent = {
  id?: string | null
  basis_id?: string | null
  kind: string
  label: string
  created_at: string
  actor: string | null
  reason: string | null
  outcome?: 'CONSUMED' | 'NOT_CONSUMED' | null
  amount?: string | null
  base_amount?: string | null
  rate?: string | null
  reference?: string | null
  date?: string | null
  receipt_checked?: boolean | null
  receipt_confirmed?: boolean | null
}
type Approval = { base_amount: string; rate: string; amount: string; created_at: string }
export type Commission = {
  id: string
  created_at: string
  tourist_name?: string | null
  provider_id: string
  provider_name: string
  collaborator_id: string
  collaborator_name: string
  benefit_title: string | null
  state: keyof typeof stateLabels
  next_step: string | null
  version: string
  declaration: { outcome: 'CONSUMED' | 'NOT_CONSUMED'; amount: string | null; created_at: string } | null
  approval: Approval | null
  payment_approvals: (Approval & { id: string })[]
  payment: { approval_id: string; date: string; reference: string; amount: string; created_at: string } | null
  events: CommissionEvent[]
  actions: string[]
  incident: boolean
  current_rate: string | null
  bank_configured?: boolean
  bank_changed?: boolean
}
export type Rule = { provider_id: string | null; provider_name: string | null; rate: string | null; version: string | null }
export type Rules = { global: Rule; providers: Rule[] }
export type CommissionPage = { count: number; next: string | null; previous: string | null; results: Commission[] }

export function commissionApi<T>(scope: CommissionScope, path: string, options?: Parameters<typeof api>[1]) {
  return scope === 'admin' ? adminApi<T>(path, options) : api<T>(`/api/v1/provider/${path}`, options)
}

export function commissionPath(id: string) {
  return `commissions/${encodeURIComponent(id)}/`
}

export const pesos = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' })
const dateTime = new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short' })
export function localDateTime(value: string) {
  const timestamp = new Date(value)
  return Number.isNaN(timestamp.valueOf()) ? value : dateTime.format(timestamp)
}

export function useCommissionRead<T>(load: (signal: AbortSignal) => Promise<T>, revision: number, onDenied: () => void) {
  const [result, setResult] = useState<{ load: typeof load; revision: number; data: T | null; error: string } | null>(null)
  useEffect(() => {
    const version = currentSessionVersion()
    const controller = new AbortController()
    const active = () => version === currentSessionVersion() && !controller.signal.aborted
    load(controller.signal).then(data => {
      if (active()) setResult({ load, revision, data, error: '' })
    }).catch(cause => {
      if (!active()) return
      if (isDenied(cause)) onDenied()
      setResult({ load, revision, data: null, error: messageOf(cause) })
    })
    return () => controller.abort()
  }, [load, revision, onDenied])
  return {
    data: result?.load === load ? result.data : null,
    error: result?.load === load && result.revision === revision ? result.error : '',
    loading: result?.load !== load || result.revision !== revision,
  }
}

export function isDenied(cause: unknown) {
  return cause instanceof ApiError && (cause.status === 401 || cause.status === 403)
}

type CommandBody = Record<string, string | boolean | null>
type Command = { path: string; body: CommandBody; key: string; method: 'POST' | 'PUT' }
type InFlight = { version: number; command: Command; request?: Promise<void> }
type CommandState = { command: Command | null; busy: boolean; uncertain: boolean; error: unknown; notice: string }

const pendingByScope = new Map<CommissionScope, InFlight>()
const emptyCommand: CommandState = { command: null, busy: false, uncertain: false, error: null, notice: '' }

function pendingFor(scope: CommissionScope) {
  const version = currentSessionVersion()
  for (const [role, attempt] of pendingByScope) {
    if (attempt.version !== version) pendingByScope.delete(role)
  }
  return pendingByScope.get(scope)
}

export function useCommissionCommand(scope: CommissionScope, onSaved: () => void, onDenied: () => void) {
  const current = useCurrent()
  const [state, setState] = useState<CommandState>(() => {
    const attempt = pendingFor(scope)
    return attempt ? { ...emptyCommand, command: attempt.command, busy: !!attempt.request, uncertain: true } : emptyCommand
  })
  const stateRef = useRef(state)
  const set = useCallback((next: CommandState) => { stateRef.current = next; setState(next) }, [])

  const send = useCallback(async (attempt: InFlight) => {
    if (!current() || attempt.version !== currentSessionVersion() || attempt.request) return
    const { command } = attempt
    set({ ...emptyCommand, command, busy: true })
    attempt.request = commissionApi(scope, command.path, { method: command.method, body: command.body, idempotencyKey: command.key })
      .then(() => {
        if (pendingByScope.get(scope) === attempt) pendingByScope.delete(scope)
        if (!current()) return
        set({ ...emptyCommand, notice: 'Cambios guardados.' })
        onSaved()
      })
      .catch(cause => {
        const uncertain = !(cause instanceof ApiError) || cause.status >= 500 || cause.status === 408 || cause.status === 429
        if (!uncertain && pendingByScope.get(scope) === attempt) pendingByScope.delete(scope)
        if (!current()) return
        set({ ...emptyCommand, command, uncertain, error: cause })
        if (isDenied(cause)) onDenied()
      })
      .finally(() => { delete attempt.request })
    await attempt.request
  }, [scope, current, set, onSaved, onDenied])

  useEffect(() => {
    const attempt = pendingFor(scope)
    if (!attempt?.request) return
    let active = true
    void attempt.request.then(() => {
      if (!active || !current()) return
      const pending = pendingFor(scope)
      set(pending ? { ...emptyCommand, command: pending.command, uncertain: true } : emptyCommand)
      if (!pending) onSaved()
    })
    return () => { active = false }
  }, [scope, current, onSaved, set])

  return {
    ...state,
    submit(path: string, body: CommandBody, method: Command['method'] = 'POST') {
      if (!current() || pendingFor(scope) || stateRef.current.busy) return
      const attempt = { version: currentSessionVersion(), command: { path, body: { ...body }, key: crypto.randomUUID(), method } }
      pendingByScope.set(scope, attempt)
      void send(attempt)
    },
    retry() {
      const attempt = pendingFor(scope)
      if (attempt) void send(attempt)
    },
    reset() {
      if (pendingFor(scope)) return
      set(emptyCommand)
      onSaved()
    },
  }
}

export type CommandControl = ReturnType<typeof useCommissionCommand>
