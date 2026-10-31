import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const user = { id: 804, email: 'viajera@example.test', role: 'TOURIST', email_verified: true }
const provider = { id: 'p1', slug: 'p1', name: 'Negocio retirado', category: 'Categoría retirada', description: 'Descripción retirada', address: '', hours: '', contact: '', map_url: '', website: '', image_url: '/api/v1/folders/a/providers/p1/media/', status: 'PUBLISHED', demo: true }
const companion = { ...provider, id: 'p2', slug: 'p2', name: 'Otra recomendación retirada', image_url: '/api/v1/folders/a/providers/p2/media/' }
const network = (count = 1) => ({ count, next: null, previous: null, presentation: { title: 'Red recibida', layout: 'RADIAL', theme: 'SAND', background: 'BEAGLE', page_size: 12, interval_seconds: 10, city: 'Ushuaia' }, results: [] })
const grants = { folders: [{ collaborator_id: 'a', granted_at: '' }] }
const defaultResponse = (url: string) => {
  if (url.endsWith('/auth/csrf/')) return json({ csrfToken: 'csrf-producto' })
  if (url.endsWith('/auth/refresh/')) return json({ access: 'access-demo' })
  if (url.endsWith('/auth/me/')) return json(user)
  if (url.endsWith('/me/folders/')) return json(grants)
  if (url.endsWith('/me/wallet/')) return json({ balance: 0, redemptions_frozen: false })
  if (url.endsWith('/me/progress/')) return json({ total: 0, target: 5, completed: false })
  if (url.endsWith('/me/consumptions/')) return json([])
  return json({}, 404)
}

beforeEach(() => {
  sessionStorage.clear()
  vi.stubGlobal('navigator', Object.assign(Object.create(navigator), { locks: { request: (_name: string, _options: unknown, callback: () => Promise<unknown>) => callback() } }))
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
  let blob = 0
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:private-${++blob}`)
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

async function mount(path: string, pendingQr = false) {
  window.history.replaceState({}, '', path)
  const api = await import('./api'); api.invalidatePrivateState()
  const intents = await import('./qr-intent'); intents.setReferralToken(pendingQr ? 'synthetic-pending-qr' : null); intents.setConsumptionToken(null)
  const { default: ProductApp } = await import('./ProductApp')
  const view = render(<ProductApp />)
  await screen.findByRole('button', { name: 'Salir' })
  return view
}

function expectNoPrivateContent(container: HTMLElement) {
  for (const value of [provider.name, companion.name, provider.category, provider.description]) expect(screen.queryByText(value)).toBeNull()
  expect(screen.queryByLabelText('Categoría')).toBeNull()
  expect(container.querySelector('img[src^="blob:"]')).toBeNull()
  expect(screen.queryByRole('link', { name: 'Recomendaciones' })).toBeNull()
}

describe('revalidación integrada de recomendaciones privadas', () => {
  it.each([false, true])('descarta estado y petición local de medios al avanzar generación con la misma selección (lectura local terminada: %s)', async completed => {
    let finishRedeem!: (response: Response) => void
    let finishPhoto!: (response: Response) => void
    let finishLocal!: (response: Response) => void
    let refreshed = false
    let providerReads = 0
    let mediaReads = 0
    vi.stubGlobal('fetch', vi.fn((input: URL | RequestInfo) => {
      const url = String(input)
      if (url.endsWith('/referrals/redeem/')) return new Promise<Response>(resolve => { finishRedeem = response => { refreshed = true; resolve(response) } })
      if (url.includes('/folders/a/network/')) return Promise.resolve(json(network(refreshed ? 0 : 2)))
      if (url.endsWith('/folders/a/providers/')) {
        if (++providerReads === 1) return Promise.resolve(json([provider, companion]))
        if (providerReads === 2) return new Promise<Response>(resolve => { finishLocal = resolve })
        return Promise.resolve(json([]))
      }
      if (url.endsWith('/p1/media/')) { mediaReads++; return new Promise<Response>(resolve => { finishPhoto = resolve }) }
      if (url.endsWith('/p2/media/')) { mediaReads++; return Promise.resolve(new Response('foto privada')) }
      return Promise.resolve(defaultResponse(url))
    }))
    const { container } = await mount('/tienda', true)
    await waitFor(() => expect(finishRedeem).toBeTypeOf('function'))
    await act(async () => { window.history.replaceState({}, '', '/recomendaciones'); window.dispatchEvent(new PopStateEvent('popstate')) })
    await screen.findByRole('img', { name: `Imagen de ${companion.name}` })
    await act(async () => finishPhoto(json({}, 404)))
    await waitFor(() => expect(finishLocal).toBeTypeOf('function'))
    if (completed) {
      await act(async () => finishLocal(json([{ ...provider, image_url: null }, companion])))
      await screen.findByRole('heading', { name: provider.name })
      await screen.findByRole('img', { name: `Imagen de ${companion.name}` })
    }
    await act(async () => finishRedeem(json({})))
    await waitFor(() => expect(providerReads).toBe(3))
    await act(async () => {})
    expectNoPrivateContent(container)
    const readsAfterRefresh = mediaReads
    if (!completed) await act(async () => finishLocal(json([provider, companion])))
    expectNoPrivateContent(container)
    expect(mediaReads).toBe(readsAfterRefresh)
    const created = vi.mocked(URL.createObjectURL).mock.results.map(result => result.value)
    for (const blob of created) expect(URL.revokeObjectURL).toHaveBeenCalledWith(blob)
  })

  it.each([0, 5])('aplica el count total al volver visible, sin inferir vacío de resultados parciales (count: %s)', async count => {
    let visibility: DocumentVisibilityState = 'visible'
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility)
    let refreshed = false
    let networkReads = 0
    let folderReads = 0
    let providerReads = 0
    vi.stubGlobal('fetch', vi.fn(async (input: URL | RequestInfo) => {
      const url = String(input)
      if (url.endsWith('/me/folders/')) { folderReads++; return json(grants) }
      if (url.includes('/folders/a/network/')) { networkReads++; return json(network(refreshed ? count : 1)) }
      if (url.endsWith('/folders/a/providers/')) { providerReads++; return json([provider]) }
      if (url.endsWith('/media/')) return new Response('foto privada')
      return defaultResponse(url)
    }))
    const { container } = await mount('/recomendaciones')
    const image = await screen.findByRole('img', { name: `Imagen de ${provider.name}` })
    const blob = image.getAttribute('src')!
    expect(screen.getByRole('link', { name: 'Recomendaciones' })).toBeTruthy()
    const previousReads = networkReads
    await act(async () => { visibility = 'hidden'; document.dispatchEvent(new Event('visibilitychange')) })
    refreshed = true
    await act(async () => { visibility = 'visible'; document.dispatchEvent(new Event('visibilitychange')) })
    await waitFor(() => expect(networkReads).toBeGreaterThan(previousReads))
    await act(async () => {})
    if (count === 0) {
      expectNoPrivateContent(container)
      expect(URL.revokeObjectURL).toHaveBeenCalledWith(blob)
      expect(screen.queryByText('El acceso a estas recomendaciones ya no está disponible.')).toBeNull()
      expect(screen.queryByRole('button', { name: 'Reintentar recomendaciones' })).toBeNull()
    } else {
      expect(screen.getByRole('heading', { name: provider.name })).toBeTruthy()
      expect(screen.getByLabelText('Categoría')).toBeTruthy()
      expect(screen.getByRole('img', { name: `Imagen de ${provider.name}` })).toBe(image)
      expect(screen.getByRole('link', { name: 'Recomendaciones' })).toBeTruthy()
      expect(URL.revokeObjectURL).not.toHaveBeenCalledWith(blob)
    }
    expect(providerReads).toBe(1)
    expect(folderReads).toBe(1)
  })
})
