import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, api, currentSessionVersion } from './api'
import type { ConsumptionResult } from './api'
import { consumptionToken, setConsumptionToken } from './qr-intent'
import { messageOf } from './shared'

type Body = { qr_token: string; pin: string; folder_id?: string; benefit_id?: string }
type VisitState = { pending: { body: Body; key: string } | null; correction: Body | null; result: ConsumptionResult | null; busy: boolean; uncertain: boolean; hadUncertainty: boolean; attempted: boolean; errorStatus: number | null; benefitError: boolean; error: string }
const empty = (): VisitState => ({ pending: null, correction: null, result: null, busy: false, uncertain: false, hadUncertainty: false, attempted: false, errorStatus: null, benefitError: false, error: '' })

// Vive con ProductApp: cambiar de ruta/QR no pierde un POST incierto dentro de la SPA.
export function useVisitCommand() {
  const [state, setState] = useState<VisitState>(empty)
  const snapshot = useRef(state)
  const generation = useRef(0)
  const mounted = useRef(true)
  const publish = useCallback((next: VisitState) => { snapshot.current = next; if (mounted.current) setState(next) }, [])
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; generation.current += 1 } }, [])
  const reset = useCallback(() => { generation.current += 1; publish(empty()) }, [publish])
  const newIntent = useCallback(() => {
    const current = snapshot.current
    if (!current.busy && !current.hadUncertainty) reset()
  }, [reset])
  const correct = useCallback(() => {
    const current = snapshot.current
    if (current.pending && !current.busy && !current.hadUncertainty && current.errorStatus === 400 && !current.benefitError) {
      generation.current += 1
      publish({ ...empty(), attempted: true, correction: { ...current.pending.body } })
    }
  }, [publish])
  const reselect = useCallback(() => {
    const current = snapshot.current
    if (current.pending && !current.busy && !current.hadUncertainty && current.benefitError) {
      generation.current += 1
      publish({ ...empty(), attempted: true })
    }
  }, [publish])
  const submit = useCallback(async (body: Body): Promise<{ completed: boolean; denied: boolean }> => {
    if (snapshot.current.busy || snapshot.current.result) return { completed: false, denied: false }
    const version = currentSessionVersion(), request = generation.current
    const correction = snapshot.current.correction
    // Corregir PIN conserva el negocio, la referencia y el beneficio autorizado.
    const pending = snapshot.current.pending ?? { body: correction ? { ...correction, pin: body.pin } : { ...body }, key: crypto.randomUUID() }
    publish({ ...snapshot.current, pending, attempted: true, busy: true, error: '' })
    const current = () => mounted.current && version === currentSessionVersion() && request === generation.current
    try {
      const path = pending.body.benefit_id ? '/api/v2/consumptions/' : '/api/v1/consumptions/'
      const result = await api<ConsumptionResult>(path, { method: 'POST', body: pending.body, idempotencyKey: pending.key })
      if (!current()) return { completed: false, denied: false }
      if (consumptionToken === pending.body.qr_token) setConsumptionToken(null)
      publish({ ...empty(), result })
      return { completed: true, denied: false }
    } catch (error) {
      if (!current()) return { completed: false, denied: false }
      const uncertain = !(error instanceof ApiError) || error.status >= 500 || [408, 429].includes(error.status)
      const payload = error instanceof ApiError ? error.payload : null
      const benefitError = error instanceof ApiError && error.status === 400 && !!payload && typeof payload === 'object' && 'benefit_id' in payload
      publish({ ...snapshot.current, busy: false, uncertain, hadUncertainty: snapshot.current.hadUncertainty || uncertain, errorStatus: error instanceof ApiError ? error.status : null, benefitError, error: messageOf(error) })
      return { completed: false, denied: !!pending.body.folder_id && error instanceof ApiError && [403, 404].includes(error.status) }
    }
  }, [publish])
  return { ...state, submit, reset, newIntent, correct, reselect }
}
export type VisitCommand = ReturnType<typeof useVisitCommand>
