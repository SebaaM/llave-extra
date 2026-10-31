import { useCallback, useEffect, useMemo, useState } from 'react'
import { ApiError } from './api'
import { catalogBenefits, catalogConfig } from './catalog'
import type { Page, PublicBenefit } from './catalog'
import { messageOf } from './shared'

type CatalogRequest = { page: number; search: string; category: string; revision: number }
type CatalogState = { request: CatalogRequest; enabled: boolean | null; data: Page<PublicBenefit> | null; error: string }

export function usePublicCatalog(page = 1, search = '', category = '') {
  const [state, setState] = useState<CatalogState | null>(null)
  const [revision, setRevision] = useState(0)
  const request = useMemo(() => ({ page, search, category, revision }), [page, search, category, revision])
  const retry = useCallback(() => setRevision(value => value + 1), [])
  useEffect(() => {
    const controller = new AbortController()
    const save = (enabled: boolean | null, data: Page<PublicBenefit> | null, error = '') => {
      if (!controller.signal.aborted) setState({ request, enabled, data, error })
    }
    const load = async () => {
      try {
        const config = await catalogConfig(controller.signal)
        if (controller.signal.aborted) return
        if (!config.enabled) { save(false, null); return }
        try {
          const data = await catalogBenefits(request.page, request.search, request.category, controller.signal)
          save(true, data)
        } catch (error) {
          if (controller.signal.aborted) return
          if (!(error instanceof ApiError) || error.status !== 404) throw error
          if (request.page === 1) { save(false, null); return }
          // DRF también responde 404 cuando la página dejó de existir.
          const current = await catalogConfig(controller.signal)
          save(current.enabled, null, current.enabled ? 'Esta página ya no existe.' : '')
        }
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) save(false, null)
        else save(null, null, messageOf(error))
      }
    }
    void load()
    return () => controller.abort()
  }, [request])
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible') retry() }
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener('focus', refresh)
    return () => { document.removeEventListener('visibilitychange', refresh); window.removeEventListener('focus', refresh) }
  }, [retry])
  const current = state?.request === request ? state : { enabled: null, data: null, error: '' }
  return { enabled: current.enabled, data: current.data, error: current.error, loading: state?.request !== request, retry }
}
