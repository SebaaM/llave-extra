import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ApiError, api, currentSessionVersion } from './api'
import type { User } from './api'
import { messageOf } from './shared'
import { referralToken, setReferralToken } from './qr-intent'
import { clearQrHint, readQrHint, writeQrHint } from './qr-context'
import type { QrContext, SelectionPage } from './qr-context'

const empty = (owner: number | null, revision: number): QrContext => ({ owner, version: currentSessionVersion(), revision, status: 'none', collaborator: null, page: null, pageNumber: 1, error: '', missing: [] })
const denied = 'Esta recomendación ya no está disponible. Volvé a abrir un QR vigente.'

export function useQrContext(user: User | null, path: string) {
  const [state, setState] = useState<QrContext>(() => empty(null, 0))
  const stateRef = useRef(state)
  const accountId = user?.role === 'TOURIST' ? user.id : null
  const hasAccount = !!user
  const owner = useRef(accountId)
  useLayoutEffect(() => { owner.current = accountId }, [accountId])
  const request = useRef(0)
  const controller = useRef<AbortController | null>(null)
  const flight = useRef<{ key: string; promise: Promise<void> } | null>(null)
  const initialized = useRef('')
  const intent = useRef(referralToken)
  const [draftToken, setDraftToken] = useState(referralToken ?? '')
  const publish = useCallback((next: QrContext) => { stateRef.current = next; setState(next) }, [])
  const cancel = useCallback(() => { request.current += 1; controller.current?.abort(); flight.current = null }, [])
  const clear = useCallback((keepIntent = false) => {
    cancel(); clearQrHint()
    publish(empty(owner.current, stateRef.current.revision + 1))
    if (!keepIntent) { intent.current = null; setReferralToken(null, false); setDraftToken('') }
  }, [cancel, publish])
  const block = useCallback(() => {
    cancel(); clearQrHint()
    publish({ ...stateRef.current, revision: stateRef.current.revision + 1, status: 'blocked', page: null, error: denied, missing: [] })
  }, [cancel, publish])

  const load = useCallback((id: string, pageNumber = 1, missing = stateRef.current.missing): Promise<void> => {
    const account = owner.current, version = currentSessionVersion()
    if (account === null) return Promise.resolve()
    const key = `page:${account}:${version}:${id}:${pageNumber}`
    if (flight.current?.key === key) return flight.current.promise
    cancel()
    const sequence = request.current
    const abort = new AbortController(); controller.current = abort
    const current = () => !abort.signal.aborted && sequence === request.current && account === owner.current && version === currentSessionVersion()
    const previous = stateRef.current
    publish({ ...previous, owner: account, version, revision: previous.revision + 1, status: 'loading', collaborator: { id, name: previous.collaborator?.id === id ? previous.collaborator.name : '' }, page: null, pageNumber, error: '', missing })
    const promise = api<SelectionPage>(`/api/v1/folders/${encodeURIComponent(id)}/benefits/?page=${pageNumber}&page_size=24`, { signal: abort.signal }).then(result => {
      if (!current()) return
      if (result.collaborator?.id !== id || !Array.isArray(result.results) || !Number.isSafeInteger(result.count) || result.count < 0) throw new Error('La selección recibida no es válida.')
      const collaborator = { id, name: result.collaborator.name?.trim() || 'tu guía local' }
      writeQrHint(account, id)
      publish({ ...stateRef.current, status: 'ready', collaborator, page: { ...result, collaborator }, error: '' })
    }).catch(error => {
      if (!current()) return
      clearQrHint()
      const revoked = error instanceof ApiError && [401, 403, 404].includes(error.status)
      publish({ ...stateRef.current, status: revoked ? 'blocked' : 'error', page: null, error: revoked ? denied : messageOf(error) })
    }).finally(() => { if (current()) flight.current = null })
    flight.current = { key, promise }
    return promise
  }, [cancel, publish])

  const redeem = useCallback((token = intent.current ?? ''): Promise<void> => {
    const account = owner.current, version = currentSessionVersion()
    if (!token.trim() || account === null) return Promise.resolve()
    const key = `redeem:${account}:${version}:${token}`
    if (flight.current?.key === key) return flight.current.promise
    cancel(); clearQrHint()
    intent.current = token; setReferralToken(token, false); setDraftToken(token)
    const sequence = request.current
    const abort = new AbortController(); controller.current = abort
    const current = () => !abort.signal.aborted && sequence === request.current && account === owner.current && version === currentSessionVersion() && intent.current === token
    publish({ ...empty(account, stateRef.current.revision + 1), status: 'loading' })
    const promise = api<{ collaborator_id: string; collaborator_name: string; granted_at: string }>('/api/v1/referrals/redeem/', { method: 'POST', body: { token }, signal: abort.signal }).then(async result => {
      if (!current()) return
      if (!/^[a-zA-Z0-9-]{1,100}$/.test(result.collaborator_id)) throw new Error('El QR recibido no es válido.')
      intent.current = null; setReferralToken(null, false); setDraftToken('')
      // El vínculo no prueba la selección: esta lectura autoritativa también restaura la pista.
      await load(result.collaborator_id)
    }).catch(error => {
      if (!current()) return
      publish({ ...stateRef.current, status: error instanceof ApiError && [401, 403, 404].includes(error.status) ? 'blocked' : 'error', page: null, error: messageOf(error) })
    }).finally(() => { if (current()) flight.current = null })
    flight.current = { key, promise }
    return promise
  }, [cancel, publish, load])

  const changeToken = useCallback((value: string) => {
    cancel(); clearQrHint(); intent.current = value || null
    setReferralToken(value || null, false); setDraftToken(value)
    publish({ ...empty(owner.current, stateRef.current.revision + 1), status: value ? 'pending' : 'none' })
    window.dispatchEvent(new Event('llave:qr-context-changed'))
  }, [cancel, publish])

  useEffect(() => {
    const incoming = () => {
      if (!referralToken) return
      changeToken(referralToken)
      if (owner.current !== null) void redeem(referralToken)
    }
    window.addEventListener('llave:referral-intent', incoming)
    return () => { window.removeEventListener('llave:referral-intent', incoming); cancel() }
  }, [changeToken, redeem, cancel])

  const version = currentSessionVersion()
  useEffect(() => {
    const account = owner.current
    if (account === null) {
      if (hasAccount) { clearQrHint(); cancel(); intent.current = null; setReferralToken(null, false) }
      return
    }
    const identity = `${account}:${version}`
    const relevant = path === '/referencia' || path === '/consumo'
    if (initialized.current !== identity) {
      initialized.current = identity
      cancel()
      if (intent.current) { void redeem(); return }
      const hinted = readQrHint(account)
      if (hinted) {
        publish({ ...empty(account, stateRef.current.revision + 1), status: 'pending', collaborator: { id: hinted, name: '' } })
        if (relevant) void load(hinted)
      } else publish(empty(account, stateRef.current.revision + 1))
      return
    }
    const candidate = stateRef.current.collaborator
    if (relevant && candidate && !flight.current) void load(candidate.id, path === '/referencia' ? stateRef.current.pageNumber : 1)
  }, [accountId, hasAccount, version, path, cancel, publish, redeem, load])

  useEffect(() => {
    const revalidate = () => {
      if (document.visibilityState === 'hidden' || !['/referencia', '/consumo'].includes(path)) return
      const candidate = stateRef.current.collaborator
      if (candidate && !flight.current) void load(candidate.id, stateRef.current.pageNumber)
    }
    window.addEventListener('focus', revalidate); document.addEventListener('visibilitychange', revalidate)
    return () => { window.removeEventListener('focus', revalidate); document.removeEventListener('visibilitychange', revalidate) }
  }, [path, load])

  const missingMedia = useCallback((media: string) => {
    const current = stateRef.current
    if (!current.collaborator || current.status !== 'ready' || current.missing.includes(media)) return
    void load(current.collaborator.id, current.pageNumber, [...current.missing, media])
  }, [load])
  const retry = useCallback(() => {
    if (intent.current) void redeem()
    else if (stateRef.current.collaborator) void load(stateRef.current.collaborator.id, stateRef.current.pageNumber)
  }, [redeem, load])
  const hasPendingIntent = useCallback(() => !!intent.current, [])

  const visible = state.owner === accountId && state.version === version ? state : { ...empty(accountId, state.revision), status: 'pending' as const }
  const guardedBlock = useCallback(() => {
    if (stateRef.current.revision === state.revision && state.owner === owner.current && state.version === currentSessionVersion()) block()
  }, [block, state.revision, state.owner, state.version])
  const guardedMissing = useCallback((media: string) => {
    if (stateRef.current.revision === state.revision && state.owner === owner.current && state.version === currentSessionVersion()) missingMedia(media)
  }, [missingMedia, state.revision, state.owner, state.version])
  return { state: visible, draftToken, hasPendingIntent, changeToken, redeem, clear, block: guardedBlock, retry, loadPage: (page: number) => { const id = stateRef.current.collaborator?.id; if (id) void load(id, page) }, missingMedia: guardedMissing }
}

export type QrCoordinator = ReturnType<typeof useQrContext>
