import { useCallback, useEffect, useMemo, useState } from 'react'
import { ApiError } from './api'
import { catalogBenefits, catalogConfig } from './catalog'
import type { Page, PublicBenefit } from './catalog'
import { messageOf } from './shared'

const pageSize = 24
type Request = { page: number; revision: number }
type State = { request: Request; data: Page<PublicBenefit> | null; error: string }

// Availability belongs to the whole catalogue; a slide's pending page must not
// unmount the network or its categories. Cards still require the current request.
export function useFeaturedCatalog() {
  const [index, setIndex] = useState(0)
  const [count, setCount] = useState(0)
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [revision, setRevision] = useState(0)
  const [state, setState] = useState<State | null>(null)
  const page = Math.floor(index / pageSize) + 1
  const request = useMemo(() => ({ page, revision }), [page, revision])
  const retry = useCallback(() => setRevision(value => value + 1), [])
  useEffect(() => {
    const controller = new AbortController()
    const load = async () => {
      try {
        const config = await catalogConfig(controller.signal)
        if (controller.signal.aborted) return
        setEnabled(config.enabled)
        if (!config.enabled) { setCount(0); setState({ request, data: null, error: '' }); return }
        const data = await catalogBenefits(request.page, '', '', controller.signal, { featured: true, pageSize })
        if (controller.signal.aborted) return
        setCount(data.count)
        setIndex(value => Math.max(0, Math.min(value, data.count - 1)))
        setState({ request, data, error: '' })
      } catch (error) {
        if (controller.signal.aborted) return
        if (error instanceof ApiError && error.status === 404) {
          // A withdrawn final page may become a DRF 404. Recover once through
          // page 1, whose own 404 ends in the unavailable state instead of looping.
          if (request.page > 1) { setIndex(0); return }
          setEnabled(false); setCount(0)
          setState({ request, data: null, error: '' })
        } else setState({ request, data: null, error: messageOf(error) })
      }
    }
    void load()
    return () => controller.abort()
  }, [request])
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible') retry() }
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => { window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh) }
  }, [retry])
  const current = state?.request === request ? state : null
  return {
    enabled, count, index, loading: !current, error: current?.error ?? '', retry,
    benefit: current?.data?.results[index % pageSize],
    select: (next: number) => { if (count > 0) setIndex((next + count) % count) },
  }
}
