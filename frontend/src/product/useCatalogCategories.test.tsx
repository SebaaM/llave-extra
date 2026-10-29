import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setAccessToken } from './api'
import { catalogCategories } from './catalog'
import { useCatalogCategories } from './useCatalogCategories'

const json = (results: string[]) => new Response(JSON.stringify({ results }), { headers: { 'Content-Type': 'application/json' } })
const failure = (status: number) => new Response(JSON.stringify({ detail: 'No disponible' }), { status, headers: { 'Content-Type': 'application/json' } })
const deferred = () => {
  let resolve!: (response: Response) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<Response>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

beforeEach(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' }) })
afterEach(() => {
  cleanup()
  setAccessToken(null)
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  Reflect.deleteProperty(document, 'visibilityState')
})

describe('categorías públicas del catálogo', () => {
  it('consulta anónima sin JWT y conserva valores exactos y señal', async () => {
    setAccessToken('token-sintetico')
    const fetcher = vi.fn().mockResolvedValue(json([' Comida ', 'Comida', 'Paseos']))
    vi.stubGlobal('fetch', fetcher)
    const controller = new AbortController()
    await expect(catalogCategories(controller.signal)).resolves.toEqual({ results: [' Comida ', 'Comida', 'Paseos'] })
    expect(fetcher).toHaveBeenCalledTimes(1)
    const [url, options] = fetcher.mock.calls[0] as [URL, RequestInit]
    expect(url.pathname).toBe('/api/v1/catalog/categories/')
    expect(url.search).toBe('')
    expect(options.method).toBe('GET')
    expect(options.cache).toBe('no-store')
    expect(options.signal).toBe(controller.signal)
    expect(new Headers(options.headers).has('Authorization')).toBe(false)
  })

  it.each([false, null])('no consulta cuando enabled es %s, tampoco al reintentar o recuperar foco', enabled => {
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    const { result } = renderHook(() => useCatalogCategories(enabled))
    expect(result.current).toMatchObject({ categories: [], loading: false, error: '' })
    act(() => { result.current.retry(); window.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange')) })
    expect(fetcher).not.toHaveBeenCalled()
    expect(result.current).toMatchObject({ categories: [], loading: false, error: '' })
  })

  it('limpia al deshabilitar sin restaurar la lista anterior al rehabilitar', async () => {
    const pending = deferred()
    const fetcher = vi.fn().mockResolvedValueOnce(json([' Comida '])).mockReturnValueOnce(pending.promise)
    vi.stubGlobal('fetch', fetcher)
    const { result, rerender } = renderHook(({ enabled }: { enabled: boolean | null }) => useCatalogCategories(enabled), { initialProps: { enabled: null as boolean | null } })
    expect(fetcher).not.toHaveBeenCalled()
    rerender({ enabled: true })
    expect(result.current).toMatchObject({ categories: [], loading: true, error: '' })
    await waitFor(() => expect(result.current.categories).toEqual([' Comida ']))
    const firstSignal = fetcher.mock.calls[0][1].signal as AbortSignal
    rerender({ enabled: false })
    expect(firstSignal.aborted).toBe(true)
    expect(result.current).toMatchObject({ categories: [], loading: false, error: '' })
    expect(fetcher).toHaveBeenCalledTimes(1)
    rerender({ enabled: true })
    expect(result.current).toMatchObject({ categories: [], loading: true, error: '' })
    await act(async () => { pending.resolve(json(['Paseos'])) })
    expect(result.current).toMatchObject({ categories: ['Paseos'], loading: false, error: '' })
  })

  it('vacía al reintentar e ignora respuestas obsoletas aunque fetch no respete aborto', async () => {
    const old = deferred()
    const current = deferred()
    const fetcher = vi.fn().mockResolvedValueOnce(json(['Comida'])).mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise)
    vi.stubGlobal('fetch', fetcher)
    const { result } = renderHook(() => useCatalogCategories(true))
    await waitFor(() => expect(result.current.categories).toEqual(['Comida']))
    act(() => result.current.retry())
    expect(result.current).toMatchObject({ categories: [], loading: true, error: '' })
    act(() => result.current.retry())
    expect((fetcher.mock.calls[1][1].signal as AbortSignal).aborted).toBe(true)
    await act(async () => { current.resolve(json(['Paseos'])) })
    await act(async () => { old.resolve(json(['Vieja'])) })
    expect(result.current).toMatchObject({ categories: ['Paseos'], loading: false, error: '' })
  })

  it.each([404, 500])('muestra error recuperable sin datos viejos ante HTTP %s', async status => {
    const fetcher = vi.fn().mockResolvedValueOnce(json(['Comida'])).mockResolvedValueOnce(failure(status)).mockResolvedValueOnce(json(['Paseos']))
    vi.stubGlobal('fetch', fetcher)
    const { result } = renderHook(() => useCatalogCategories(true))
    await waitFor(() => expect(result.current.categories).toEqual(['Comida']))
    act(() => result.current.retry())
    await waitFor(() => expect(result.current.error).not.toBe(''))
    expect(result.current).toMatchObject({ categories: [], loading: false })
    act(() => result.current.retry())
    expect(result.current).toMatchObject({ categories: [], loading: true, error: '' })
    await waitFor(() => expect(result.current.categories).toEqual(['Paseos']))
    expect(result.current).toMatchObject({ loading: false, error: '' })
  })

  it('limpia un error de red al deshabilitar sin consultar nuevamente', async () => {
    const fetcher = vi.fn().mockRejectedValue(new TypeError('Sin conexión'))
    vi.stubGlobal('fetch', fetcher)
    const { result, rerender } = renderHook(({ enabled }) => useCatalogCategories(enabled), { initialProps: { enabled: true } })
    await waitFor(() => expect(result.current.error).not.toBe(''))
    rerender({ enabled: false })
    expect(result.current).toMatchObject({ categories: [], loading: false, error: '' })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('aborta al deshabilitar e ignora éxito o error tardío del contexto previo', async () => {
    const old = deferred()
    const current = deferred()
    const fetcher = vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise)
    vi.stubGlobal('fetch', fetcher)
    const { result, rerender } = renderHook(({ enabled }) => useCatalogCategories(enabled), { initialProps: { enabled: true } })
    rerender({ enabled: false })
    expect((fetcher.mock.calls[0][1].signal as AbortSignal).aborted).toBe(true)
    await act(async () => { old.resolve(json(['Vieja'])) })
    expect(result.current).toMatchObject({ categories: [], loading: false, error: '' })
    rerender({ enabled: true })
    rerender({ enabled: false })
    await act(async () => { current.reject(new TypeError('Error viejo')) })
    expect(result.current).toMatchObject({ categories: [], loading: false, error: '' })
  })

  it('revalida al recuperar foco o visibilidad y no consulta con el documento oculto', async () => {
    const focused = deferred()
    const visible = deferred()
    const fetcher = vi.fn().mockResolvedValueOnce(json(['Comida'])).mockReturnValueOnce(focused.promise).mockReturnValueOnce(visible.promise)
    vi.stubGlobal('fetch', fetcher)
    const { result } = renderHook(() => useCatalogCategories(true))
    await waitFor(() => expect(result.current.categories).toEqual(['Comida']))
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
    act(() => { window.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange')) })
    expect(fetcher).toHaveBeenCalledTimes(1)
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    act(() => window.dispatchEvent(new Event('focus')))
    expect(result.current).toMatchObject({ categories: [], loading: true, error: '' })
    await act(async () => { focused.resolve(json(['Paseos'])) })
    expect(result.current.categories).toEqual(['Paseos'])
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    expect(result.current).toMatchObject({ categories: [], loading: true, error: '' })
    await act(async () => { visible.resolve(json(['Museos'])) })
    expect(result.current.categories).toEqual(['Museos'])
  })

  it('aborta y retira listeners al desmontar sin publicar respuestas posteriores', async () => {
    const pending = deferred()
    const fetcher = vi.fn().mockReturnValue(pending.promise)
    vi.stubGlobal('fetch', fetcher)
    const removeWindow = vi.spyOn(window, 'removeEventListener')
    const removeDocument = vi.spyOn(document, 'removeEventListener')
    const { result, unmount } = renderHook(() => useCatalogCategories(true))
    const previous = result.current
    unmount()
    expect((fetcher.mock.calls[0][1].signal as AbortSignal).aborted).toBe(true)
    expect(removeWindow).toHaveBeenCalledWith('focus', expect.any(Function))
    expect(removeDocument).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
    act(() => { window.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange')) })
    await act(async () => { pending.resolve(json(['Tardía'])) })
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(result.current).toBe(previous)
  })
})
