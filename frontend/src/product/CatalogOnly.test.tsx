import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const tourist = { id: 804, email: 'cliente@example.test', role: 'TOURIST', email_verified: true }
const nativeLocks = Object.getOwnPropertyDescriptor(navigator, 'locks')
beforeEach(() => {
  sessionStorage.clear()
  Object.defineProperty(navigator, 'locks', { configurable: true, value: { request: (_name: string, _options: unknown, callback: () => Promise<unknown>) => Promise.resolve(callback()) } })
})
afterEach(() => {
  cleanup(); vi.unstubAllGlobals()
  if (nativeLocks) Object.defineProperty(navigator, 'locks', nativeLocks)
  else Reflect.deleteProperty(navigator, 'locks')
})

async function mount(path: string, signedIn: boolean, granted: boolean) {
  window.history.replaceState({}, '', path)
  const client = await import('./api'); client.invalidatePrivateState()
  const intents = await import('./qr-intent'); intents.setReferralToken(null); intents.setConsumptionToken(null)
  const fetcher = vi.fn(async (input: URL | RequestInfo) => {
    const url = String(input)
    if (url.endsWith('/auth/csrf/')) return json({ csrfToken: 'csrf-test' })
    if (url.endsWith('/auth/refresh/')) return json(signedIn ? { access: 'access-test' } : { detail: 'Sin sesión' }, signedIn ? 200 : 401)
    if (url.endsWith('/auth/me/')) return json(tourist)
    if (url.endsWith('/me/folders/')) return json({ folders: granted ? [{ collaborator_id: 'private-folder', granted_at: '' }] : [] })
    if (url.endsWith('/me/wallet/')) return json({ balance: 0 })
    if (url.endsWith('/me/progress/')) return json({ total: 0, target: 5 })
    if (url.endsWith('/me/consumptions/')) return json([])
    if (url.includes('/catalog/benefits/categories/')) return json({ enabled: true, results: [] })
    if (url.includes('/catalog/benefits/')) return json({ enabled: true, count: 0, next: null, previous: null, results: [] })
    return json({}, 404)
  })
  vi.stubGlobal('fetch', fetcher)
  const { default: ProductApp } = await import('./ProductApp')
  render(<ProductApp />)
  return fetcher
}

describe('catálogo único del Cliente', () => {
  it.each([
    ['/recomendaciones', false, false], ['/recomendaciones/', false, false],
    ['/recomendaciones', true, false], ['/recomendaciones/', true, true],
    ['/recomendaciones///?origen=anterior', true, true],
  ] as const)('lleva %s al catálogo sin gate ni consultas privadas (sesión: %s, acceso: %s)', async (path, signedIn, granted) => {
    const fetcher = await mount(path, signedIn, granted)
    await waitFor(() => expect(window.location.pathname).toBe('/beneficios'))
    await screen.findByRole('heading', { name: 'Beneficios para vivir más la ciudad.' })
    await waitFor(() => expect(fetcher.mock.calls.some(([url]) => String(url).includes('/auth/refresh/'))).toBe(true))
    if (signedIn) await screen.findByRole('button', { name: 'Salir' })
    expect(screen.queryByRole('heading', { name: 'Ingresá para continuar' })).toBeNull()
    expect(document.querySelector('a[href="/recomendaciones"]')).toBeNull()
    expect(fetcher.mock.calls.some(([url]) => /\/folders\/[^/]+\/(providers|network)\//.test(String(url)))).toBe(false)
  })

  it.each([false, true])('omite toda precarga privada de tienda, incluso con grants (%s)', async granted => {
    const fetcher = await mount('/tienda', true, granted)
    await screen.findByRole('button', { name: 'Salir' })
    await act(async () => {})
    expect(fetcher.mock.calls.some(([url]) => /\/(me\/(folders|wallet|progress|consumptions)|folders)\//.test(String(url)))).toBe(false)
    expect(screen.queryByRole('link', { name: 'Recomendaciones' })).toBeNull()
  })
})
