import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { usePublicCatalog } from './usePublicCatalog'

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })
const empty = { count: 0, next: null, previous: null, results: [] }
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('vigencia del catálogo público', () => {
  it.each([true, false])('reconsulta la configuración tras 404 de página y conserva enabled=%s', async enabled => {
    let configs = 0
    vi.stubGlobal('fetch', vi.fn(async (input: URL | RequestInfo) => String(input).endsWith('/config/')
      ? json({ enabled: ++configs === 1 ? true : enabled })
      : json({ detail: 'Página inválida.' }, 404)))
    const { result } = renderHook(() => usePublicCatalog(4))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(configs).toBe(2)
    expect(result.current.enabled).toBe(enabled)
    expect(result.current.data).toBeNull()
    expect(Boolean(result.current.error)).toBe(enabled)
  })
  it('retira datos en recarga y descarta respuestas antiguas incluso al volver al filtro original', async () => {
    let finish!: (value: Response) => void
    let initial = true
    const signals: AbortSignal[] = []
    vi.stubGlobal('fetch', vi.fn((input: URL | RequestInfo, init?: RequestInit) => {
      if (String(input).endsWith('/config/')) return Promise.resolve(json({ enabled: true }))
      signals.push(init?.signal as AbortSignal)
      if (initial) { initial = false; return new Promise<Response>(resolve => { finish = resolve }) }
      return Promise.resolve(json(empty))
    }))
    const { result, rerender } = renderHook(({ page }) => usePublicCatalog(page), { initialProps: { page: 1 } })
    await waitFor(() => expect(signals).toHaveLength(1))
    rerender({ page: 2 })
    await waitFor(() => expect(result.current.data).toEqual(empty))
    rerender({ page: 1 })
    expect(result.current.data).toBeNull()
    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.data).toEqual(empty))
    await act(async () => finish(json({ ...empty, count: 99 })))
    expect(result.current.data?.count).toBe(0)
    expect(signals[0].aborted).toBe(true)
    act(() => window.dispatchEvent(new Event('focus')))
    expect(result.current.data).toBeNull()
    await waitFor(() => expect(result.current.data).toEqual(empty))
  })
})
