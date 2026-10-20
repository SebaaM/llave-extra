import { useCallback, useEffect, useRef, useState } from 'react'
import { currentSessionVersion } from '../api'
import { messageOf } from '../shared'

export function useCurrent() {
  const mounted = useRef(false)
  const version = useRef(currentSessionVersion())
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  return useCallback(() => mounted.current && version.current === currentSessionVersion(), [])
}

export function useResource<T>(load: (signal: AbortSignal) => Promise<T>) {
  const [state, setState] = useState<{ data: T | null; error: string; loading: boolean; loader: typeof load }>({ data: null, error: '', loading: true, loader: load })
  const [revision, setRevision] = useState(0)
  const reload = useCallback(() => { setState({ data: null, error: '', loading: true, loader: load }); setRevision(value => value + 1) }, [load])
  useEffect(() => {
    const controller = new AbortController()
    const version = currentSessionVersion()
    load(controller.signal).then(data => {
      if (!controller.signal.aborted && version === currentSessionVersion()) setState({ data, error: '', loading: false, loader: load })
    }).catch(error => {
      if (!controller.signal.aborted && version === currentSessionVersion()) setState({ data: null, error: messageOf(error), loading: false, loader: load })
    })
    return () => controller.abort()
  }, [load, revision])
  useEffect(() => {
    const focus = () => reload()
    window.addEventListener('focus', focus)
    return () => window.removeEventListener('focus', focus)
  }, [reload])
  return { ...(state.loader === load ? state : { data: null, error: '', loading: true }), reload }
}
