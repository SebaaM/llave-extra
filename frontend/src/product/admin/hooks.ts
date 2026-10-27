import { useCallback, useEffect, useState } from 'react'
import { currentSessionVersion } from '../api'
import { messageOf } from '../shared'

let dirtyForms = 0
export function checkAdminNavigation() {
  return dirtyForms === 0 || window.confirm('Tenés cambios sin guardar. ¿Querés salir y perderlos?')
}
export function useDirtyGuard(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return
    dirtyForms += 1
    const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', unload)
    return () => { dirtyForms -= 1; window.removeEventListener('beforeunload', unload) }
  }, [dirty])
}
export function useAdminLoad<T>(loader: (signal: AbortSignal) => Promise<T>) {
  const [revision, setRevision] = useState(0)
  const [state, setState] = useState<{ data: T | null; loading: boolean; error: string }>({ data: null, loading: true, error: '' })
  const reload = useCallback(() => setRevision(value => value + 1), [])
  useEffect(() => {
    const controller = new AbortController()
    const version = currentSessionVersion()
    queueMicrotask(() => { if (!controller.signal.aborted && version === currentSessionVersion()) setState({ data: null, loading: true, error: '' }) })
    loader(controller.signal).then(data => {
      if (!controller.signal.aborted && version === currentSessionVersion()) setState({ data, loading: false, error: '' })
    }).catch(error => {
      if (!controller.signal.aborted && version === currentSessionVersion()) setState({ data: null, loading: false, error: messageOf(error) })
    })
    return () => controller.abort()
  }, [revision, loader])
  return { ...state, reload, setState }
}
