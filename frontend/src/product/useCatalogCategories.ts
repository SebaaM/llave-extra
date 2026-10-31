import { useCallback, useEffect, useMemo, useState } from 'react'
import { catalogCategories } from './catalog'
import { messageOf } from './shared'

type RequestContext = { enabled: boolean | null; revision: number }
type CategoriesState = { request: RequestContext; categories: string[]; error: string }

export function useCatalogCategories(enabled: boolean | null) {
  const [revision, setRevision] = useState(0)
  // Una nueva identidad también distingue true → false → true sin reutilizar datos.
  const request = useMemo(() => ({ enabled, revision }), [enabled, revision])
  const [state, setState] = useState<CategoriesState | null>(null)
  const retry = useCallback(() => setRevision(value => value + 1), [])

  useEffect(() => {
    if (request.enabled !== true) return
    const controller = new AbortController()
    void catalogCategories(controller.signal).then(data => {
      if (!controller.signal.aborted) setState({ request, categories: data.results, error: '' })
    }).catch(error => {
      if (!controller.signal.aborted) setState({ request, categories: [], error: messageOf(error) })
    })
    return () => controller.abort()
  }, [request])

  useEffect(() => {
    if (enabled !== true) return
    const refresh = () => { if (document.visibilityState === 'visible') retry() }
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener('focus', refresh)
    return () => {
      document.removeEventListener('visibilitychange', refresh)
      window.removeEventListener('focus', refresh)
    }
  }, [enabled, retry])

  if (enabled !== true) return { categories: [], loading: false, error: '', retry }
  if (state?.request !== request) return { categories: [], loading: true, error: '', retry }
  return { categories: state.categories, loading: false, error: state.error, retry }
}
