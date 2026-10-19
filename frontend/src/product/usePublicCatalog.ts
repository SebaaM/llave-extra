import { useCallback, useEffect, useState } from 'react'
import { ApiError } from './api'
import { catalogBenefits, catalogConfig } from './catalog'
import type { Page, PublicBenefit } from './catalog'
import { messageOf } from './shared'

export function usePublicCatalog(page = 1, search = '', category = '') {
  const [state, setState] = useState<{ key: string; enabled: boolean | null; data: Page<PublicBenefit> | null; error: string }>({ key: '', enabled: null, data: null, error: '' })
  const [revision, setRevision] = useState(0)
  const key = JSON.stringify([page, search, category, revision])
  const retry = useCallback(() => setRevision(value => value + 1), [])
  useEffect(() => {
    const controller = new AbortController()
    void catalogConfig(controller.signal).then(async config => {
      if (controller.signal.aborted) return
      if (!config.enabled) { setState({ key, enabled: false, data: null, error: '' }); return }
      const data = await catalogBenefits(page, search, category, controller.signal)
      if (!controller.signal.aborted) setState({ key, enabled: true, data, error: '' })
    }).catch(error => {
      if (controller.signal.aborted) return
      if (error instanceof ApiError && error.status === 404) setState({ key, enabled: false, data: null, error: '' })
      else setState({ key, enabled: null, data: null, error: messageOf(error) })
    })
    return () => controller.abort()
  }, [page, search, category, key])
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible') retry() }
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener('focus', refresh)
    return () => { document.removeEventListener('visibilitychange', refresh); window.removeEventListener('focus', refresh) }
  }, [retry])
  return { ...(state.key === key ? state : { enabled: null, data: null, error: '' }), loading: state.key !== key, retry }
}
