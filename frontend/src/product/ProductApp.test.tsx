import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { StrictMode } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

const json = (body: unknown, status = 200) => new Response(body === null ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const setUrl = (path: string, hash = '') => window.history.replaceState({}, '', `${path}${hash}`)
const tourist = { id: 804, email: 'viajera@example.test', role: 'TOURIST', email_verified: true }
const emptyNetwork = { count: 0, next: null, previous: null, presentation: { title: 'Red local', layout: 'RADIAL', theme: 'SAND', background: 'BEAGLE', page_size: 12, interval_seconds: 10, city: 'Ushuaia' }, results: [] }
const nativeLocks = Object.getOwnPropertyDescriptor(navigator, 'locks')

beforeEach(() => {
  cleanup()
  sessionStorage.clear()
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: { request: (_name: string, _options: unknown, callback: () => Promise<unknown>) => Promise.resolve(callback()) },
  })
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  if (nativeLocks) Object.defineProperty(navigator, 'locks', nativeLocks)
  else Reflect.deleteProperty(navigator, 'locks')
})

async function prepareApp(path: string, fragment = '') {
  setUrl(path, fragment)
  const intents = await import('./qr-intent')
  intents.setReferralToken(path === '/referencia' ? new URLSearchParams(fragment.slice(1)).get('token') : null)
  intents.setConsumptionToken(path === '/consumo' ? new URLSearchParams(fragment.slice(1)).get('token') : null)
  const apiClient = await import('./api')
  apiClient.invalidatePrivateState()
  const fragmentToken = new URLSearchParams(fragment.slice(1)).get('token')
  intents.setVerifyToken(path === '/verificar-email' ? fragmentToken : null)
  intents.setResetToken(path === '/restablecer-clave' ? fragmentToken : null)
  if (fragmentToken) window.history.replaceState(window.history.state, '', `${path}${window.location.search}`)
  const { default: ProductApp } = await import('./ProductApp')
  return ProductApp
}

describe('recorridos F2 del Cliente', () => {
  it.each([false, true])('no restaura proveedores retirados al remontar recomendaciones durante GET demorado (revalidación terminada: %s)', async completed => {
    let finishMedia!: (response: Response) => void
    let finishRevalidation!: (response: Response) => void
    let finishReturn!: (response: Response) => void
    let lists = 0
    const removed = { id: 'p1', slug: 'p1', name: 'Proveedor retirado', category: 'Categoría retirada', description: 'Descripción retirada', address: '', hours: '', contact: '', map_url: '', website: '', image_url: '/api/v1/folders/a/providers/p1/media/', status: 'ACTIVE', demo: true }
    const current = { ...removed, id: 'p2', name: 'Proveedor vigente', category: 'Paseos', description: 'Descripción vigente', image_url: null }
    vi.stubGlobal('fetch', vi.fn((input: URL | RequestInfo) => {
      const url = String(input)
      if (url.endsWith('/auth/csrf/')) return Promise.resolve(json({ csrfToken: 'csrf-producto' }))
      if (url.endsWith('/auth/refresh/')) return Promise.resolve(json({ access: 'access-demo' }))
      if (url.endsWith('/auth/me/')) return Promise.resolve(json(tourist))
      if (url.endsWith('/me/folders/')) return Promise.resolve(json({ folders: [{ collaborator_id: 'a', granted_at: '' }] }))
      if (url.endsWith('/me/wallet/')) return Promise.resolve(json({ balance: 5, redemptions_frozen: false }))
      if (url.endsWith('/me/progress/')) return Promise.resolve(json({ total: 1, target: 5, completed: false }))
      if (url.endsWith('/me/consumptions/')) return Promise.resolve(json([]))
      if (url.includes('/network/')) return Promise.resolve(json(emptyNetwork))
      if (url.endsWith('/media/')) return new Promise<Response>(resolve => { finishMedia = resolve })
      if (url.endsWith('/folders/a/providers/')) {
        lists += 1
        if (lists === 1) return Promise.resolve(json([removed, current]))
        if (lists === 2) return new Promise<Response>(resolve => { finishRevalidation = resolve })
        return new Promise<Response>(resolve => { finishReturn = resolve })
      }
      return Promise.resolve(json({}, 404))
    }))
    const ProductApp = await prepareApp('/recomendaciones')
    render(<ProductApp />)
    await screen.findByRole('heading', { name: removed.name })
    await waitFor(() => expect(finishMedia).toBeTypeOf('function'))
    await act(async () => finishMedia(json({}, 404)))
    await waitFor(() => expect(finishRevalidation).toBeTypeOf('function'))
    if (completed) {
      await act(async () => finishRevalidation(json([current])))
      await screen.findByRole('heading', { name: current.name })
      expect(screen.queryByText(removed.name)).toBeNull()
    }
    await act(async () => { setUrl('/mi-viaje'); window.dispatchEvent(new PopStateEvent('popstate')) })
    await act(async () => { setUrl('/recomendaciones'); window.dispatchEvent(new PopStateEvent('popstate')) })
    await waitFor(() => expect(finishReturn).toBeTypeOf('function'))
    expect(screen.queryByText(removed.name)).toBeNull()
    expect(screen.queryByText(removed.description)).toBeNull()
    expect(screen.queryByText(removed.category)).toBeNull()
    if (!completed) await act(async () => finishRevalidation(json([removed])))
    expect(screen.queryByText(removed.name)).toBeNull()
    await act(async () => finishReturn(json([current])))
    await screen.findByRole('heading', { name: current.name })
    expect(screen.queryByText(removed.name)).toBeNull()
  })

  it('recupera por reintento privado después de denegación y recuperación 200 del padre en la misma carpeta', async () => {
    let lists = 0
    let folderReads = 0
    let finishRetry!: (response: Response) => void
    const removed = { id: 'p1', slug: 'p1', name: 'Local anterior', category: 'Café anterior', description: 'Datos anteriores', address: '', hours: '', contact: '', map_url: '', website: '', image_url: '/api/v1/folders/a/providers/p1/media/', status: 'ACTIVE', demo: true }
    const current = { ...removed, id: 'p2', name: 'Local recuperado', category: 'Paseos', description: 'Datos vigentes', image_url: null }
    vi.stubGlobal('fetch', vi.fn((input: URL | RequestInfo) => {
      const url = String(input)
      if (url.endsWith('/auth/csrf/')) return Promise.resolve(json({ csrfToken: 'csrf-producto' }))
      if (url.endsWith('/auth/refresh/')) return Promise.resolve(json({ access: 'access-demo' }))
      if (url.endsWith('/auth/me/')) return Promise.resolve(json(tourist))
      if (url.endsWith('/me/folders/')) { folderReads += 1; return Promise.resolve(json({ folders: [{ collaborator_id: 'a', granted_at: '' }, { collaborator_id: 'b', granted_at: '' }] })) }
      if (url.endsWith('/me/wallet/')) return Promise.resolve(json({ balance: 5, redemptions_frozen: false }))
      if (url.endsWith('/me/progress/')) return Promise.resolve(json({ total: 1, target: 5, completed: false }))
      if (url.endsWith('/me/consumptions/')) return Promise.resolve(json([]))
      if (url.includes('/network/')) return Promise.resolve(json(emptyNetwork))
      if (url.endsWith('/media/')) return Promise.resolve(json({}, 403))
      if (url.endsWith('/folders/a/providers/')) {
        lists += 1
        if (lists < 3) return Promise.resolve(json(lists === 1 ? [removed, current] : [current]))
        return new Promise<Response>(resolve => { finishRetry = resolve })
      }
      return Promise.resolve(json({}, 404))
    }))
    const ProductApp = await prepareApp('/recomendaciones')
    render(<ProductApp />)
    await screen.findByText('El acceso a estas recomendaciones ya no está disponible.')
    await waitFor(() => expect(lists).toBe(2))
    expect(folderReads).toBe(2)
    expect(screen.getByLabelText('Carpeta')).toBeTruthy()
    expect(screen.queryByText(removed.name)).toBeNull()
    expect(screen.queryByText(current.name)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar recomendaciones' }))
    await waitFor(() => expect(finishRetry).toBeTypeOf('function'))
    expect(screen.queryByText(removed.name)).toBeNull()
    await act(async () => finishRetry(json([current])))
    await screen.findByRole('heading', { name: current.name })
    expect(screen.queryByText(removed.name)).toBeNull()
    expect(lists).toBe(3)
  })

  it('mantiene el último detalle elegido cuando el anterior responde tarde', async () => {
    let finishFirst!: (response: Response) => void
    const providers = ['Primera elección', 'Última elección'].map((name, index) => ({
      id: `p${index + 1}`, slug: `p${index + 1}`, name, category: 'Café', description: '', address: '', hours: '', contact: '', map_url: '', website: '', image_url: null, status: 'ACTIVE', demo: true,
    }))
    const calls: string[] = []
    vi.stubGlobal('fetch', vi.fn((input: URL | RequestInfo) => {
      const url = String(input); calls.push(url)
      if (url.endsWith('/auth/csrf/')) return Promise.resolve(json({ csrfToken: 'csrf-producto' }))
      if (url.endsWith('/auth/refresh/')) return Promise.resolve(json({ access: 'access-demo' }))
      if (url.endsWith('/auth/me/')) return Promise.resolve(json(tourist))
      if (url.endsWith('/me/folders/')) return Promise.resolve(json({ folders: [{ collaborator_id: 'a', granted_at: '' }] }))
      if (url.endsWith('/me/wallet/')) return Promise.resolve(json({ balance: 5, redemptions_frozen: false }))
      if (url.endsWith('/me/progress/')) return Promise.resolve(json({ total: 1, target: 5, completed: false }))
      if (url.endsWith('/me/consumptions/')) return Promise.resolve(json([]))
      if (url.includes('/network/')) return Promise.resolve(json(emptyNetwork))
      if (url.endsWith('/folders/a/providers/')) return Promise.resolve(json(providers))
      if (url.endsWith('/providers/p1/')) return new Promise<Response>(resolve => { finishFirst = resolve })
      if (url.endsWith('/providers/p2/')) return Promise.resolve(json(providers[1]))
      if (url.endsWith('/providers/p2/benefits/')) return Promise.resolve(json([]))
      return Promise.resolve(json({}, 404))
    }))
    const ProductApp = await prepareApp('/recomendaciones')
    render(<ProductApp />)
    await screen.findByRole('heading', { name: 'Primera elección' })
    fireEvent.click(screen.getAllByRole('button', { name: 'Ver beneficios' })[0])
    await waitFor(() => expect(finishFirst).toBeTypeOf('function'))
    fireEvent.click(screen.getAllByRole('button', { name: 'Ver beneficios' })[1])
    await screen.findByRole('heading', { level: 1, name: 'Última elección' })
    await act(async () => finishFirst(json(providers[0])))
    await waitFor(() => expect(screen.queryByRole('heading', { level: 1, name: 'Primera elección' })).toBeNull())
    expect(calls.some(url => url.endsWith('/providers/p1/benefits/'))).toBe(false)
    expect(calls.some(url => url.includes('/catalog/providers/'))).toBe(false)
  })

  it.each([false, true])('abre la tienda pública sin consultar saldo ni operaciones (sesión: %s)', async signedIn => {
    const calls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (input: URL | RequestInfo) => {
      const url = String(input)
      calls.push(url)
      if (url.endsWith('/auth/csrf/')) return json({ csrfToken: 'csrf-producto' })
      if (url.endsWith('/auth/refresh/')) return signedIn ? json({ access: 'access-demo' }) : json({}, 401)
      if (url.endsWith('/auth/me/')) return json(tourist)
      if (url.endsWith('/me/folders/')) return json({ folders: [] })
      return json({}, 404)
    }))
    const ProductApp = await prepareApp('/tienda')
    render(<ProductApp />)
    expect(screen.getByRole('heading', { name: /Un pedacito del fin/ })).toBeTruthy()
    if (signedIn) await screen.findByText(tourist.email)
    else await waitFor(() => expect(calls.some(url => url.endsWith('/auth/refresh/'))).toBe(true))
    expect(calls.filter(url => /\/shop\/|\/me\/(wallet|progress|consumptions)\//.test(url))).toEqual([])
    fireEvent.click(screen.getByRole('link', { name: 'Ver Faro del Beagle' }))
    await screen.findByRole('heading', { name: 'Faro del Beagle' })
    expect(window.location.pathname).toBe('/tienda/faro-del-beagle')
    fireEvent.click(screen.getByRole('button', { name: 'Ampliar ilustración' }))
    expect(screen.getByRole('button', { name: 'Reducir ilustración' }).getAttribute('aria-expanded')).toBe('true')
    expect(calls.filter(url => /\/shop\/|\/me\/(wallet|progress|consumptions)\//.test(url))).toEqual([])
  })

  it('anuncia el contenido de Cuenta después de navegar desde el menú con teclado', async () => {
    const keyboard = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn(async (input: URL | RequestInfo) => {
      const url = String(input)
      if (url.endsWith('/auth/csrf/')) return json({ csrfToken: 'csrf-producto' })
      if (url.endsWith('/auth/refresh/')) return json({ access: 'access-demo' })
      if (url.endsWith('/auth/me/')) return json(tourist)
      if (url.endsWith('/me/folders/')) return json({ folders: [] })
      return json({}, 404)
    }))
    const ProductApp = await prepareApp('/tienda')
    render(<ProductApp />)
    await screen.findByText(tourist.email)
    const titlesAtFocus: Array<string | null | undefined> = []
    const listener = (event: FocusEvent) => {
      if ((event.target as HTMLElement).tagName === 'H1') {
        titlesAtFocus.push((event.target as HTMLElement).textContent)
      }
    }
    document.addEventListener('focusin', listener)
    try {
      screen.getByText('Menú').focus()
      await keyboard.keyboard('{Enter}')
      await keyboard.tab()
      await keyboard.tab()
      await keyboard.keyboard('{Enter}')
      expect(window.location.pathname).toBe('/perfil')
      expect(screen.getByRole('heading', { name: tourist.email })).toBeTruthy()
      expect(document.activeElement).toBe(screen.getByRole('heading', { name: tourist.email }))
      expect(titlesAtFocus).toEqual([tourist.email])
    } finally { document.removeEventListener('focusin', listener) }
  })
  it('vacía el estado de A al entrar con B y antes de esperar el logout remoto', async () => {
    let accountB = false
    let finishLogin!: (response: Response) => void
    let finishLogout!: (response: Response) => void
    const calls: string[] = []
    vi.stubGlobal('fetch', vi.fn((input: URL | RequestInfo) => {
      const url = String(input)
      calls.push(url)
      if (url.endsWith('/auth/csrf/')) return Promise.resolve(json({ csrfToken: 'csrf-producto' }))
      if (url.endsWith('/auth/refresh/')) return Promise.resolve(json({ access: 'access-a' }))
      if (url.endsWith('/auth/me/')) return Promise.resolve(json(accountB
        ? { ...tourist, id: 805, email: 'b@example.test' }
        : { ...tourist, id: 804, email: 'a@example.test' }))
      if (url.endsWith('/auth/login/')) {
        accountB = true
        return new Promise<Response>(resolve => { finishLogin = resolve })
      }
      if (url.endsWith('/auth/logout/')) return new Promise<Response>(resolve => { finishLogout = resolve })
      if (url.endsWith('/me/folders/')) return Promise.resolve(json({ folders: accountB ? [] : [{ collaborator_id: 'folder-a-private', granted_at: '2026-10-18T00:00:00Z' }] }))
      if (url.endsWith('/me/wallet/')) return Promise.resolve(json({ balance: accountB ? 22 : 777, redemptions_frozen: false }))
      if (url.endsWith('/me/progress/')) return Promise.resolve(json({ total: accountB ? 0 : 2, target: 5, completed: false }))
      if (url.endsWith('/me/consumptions/')) return Promise.resolve(json([]))
      if (/\/folders\/[^/]+\/network\/\?page=1$/.test(url)) return Promise.resolve(json(emptyNetwork))
      if (url.endsWith('/folders/folder-a-private/providers/')) return Promise.resolve(json([{
        id: 'provider-a', slug: 'provider-a', name: 'Prestador privado de A', category: 'Café', description: 'Solo A',
        address: 'Dirección A', hours: '', contact: '', map_url: '', website: '', image_url: null, status: 'ACTIVE', demo: false,
      }]))
      if (url.endsWith('/auth/logout/')) return new Promise<Response>(resolve => { finishLogout = resolve })
      return Promise.resolve(json({}, 404))
    }))

    const ProductApp = await prepareApp('/recomendaciones')
    render(<ProductApp />)
    await waitFor(() => expect(calls.some(url => url.endsWith('/folders/folder-a-private/providers/'))).toBe(true), { timeout: 5000 })
    await screen.findByRole('heading', { name: 'Prestador privado de A' }, { timeout: 5000 })
    expect(screen.getByRole('navigation', { name: 'Tu viaje' })).toBeTruthy()

    const tripCallsBeforeHome = calls.filter(url => /\/me\/(wallet|progress|consumptions)\//.test(url)).length
    setUrl('/')
    window.dispatchEvent(new PopStateEvent('popstate'))
    const summaryA = await screen.findByRole('region', { name: 'Resumen de Mi viaje' })
    await waitFor(() => expect(within(summaryA).getByText('777')).toBeTruthy())
    expect(calls.filter(url => /\/me\/(wallet|progress|consumptions)\//.test(url))).toHaveLength(tripCallsBeforeHome)

    setUrl('/ingresar')
    window.dispatchEvent(new PopStateEvent('popstate'))
    await screen.findByRole('heading', { name: 'Qué bueno verte' })
    expect(screen.queryByRole('navigation', { name: 'Tu viaje' })).toBeNull()
    const qr = await import('./qr-intent')
    qr.setConsumptionToken('qr-de-prueba')
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'b@example.test' } })
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'Clave-segura-987!' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ingresar' }))
    await waitFor(() => expect(finishLogin).toBeTypeOf('function'))
    expect(screen.queryByText('a@example.test')).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Prestador privado de A' })).toBeNull()
    finishLogin(json({ access: 'access-b' }))
    await screen.findByLabelText('Lo descubrí por mi cuenta')
    expect(screen.queryByRole('navigation', { name: 'Tu viaje' })).toBeNull()
    expect(screen.queryByText('Carpeta · folder-a')).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Prestador privado de A' })).toBeNull()

    setUrl('/')
    window.dispatchEvent(new PopStateEvent('popstate'))
    const summaryB = await screen.findByRole('region', { name: 'Resumen de Mi viaje' })
    await waitFor(() => expect(within(summaryB).getByText('22')).toBeTruthy())
    expect(within(summaryB).queryByText('777')).toBeNull()

    setUrl('/mi-viaje')
    window.dispatchEvent(new PopStateEvent('popstate'))
    await screen.findByRole('heading', { name: 'Tu pasaporte local.' })
    await waitFor(() => expect(screen.queryByText('777')).toBeNull())
    expect(screen.getByRole('navigation', { name: 'Tu viaje' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Salir' }))
    expect(screen.queryByText('777')).toBeNull()
    expect(screen.queryByText('b@example.test')).toBeNull()
    expect(screen.queryByRole('navigation', { name: 'Tu viaje' })).toBeNull()
    await waitFor(() => expect(calls.some(url => url.endsWith('/auth/logout/'))).toBe(true))
    expect(finishLogout).toBeTypeOf('function')
    finishLogout(json(null, 204))
  })

  it('retira los sellos de A y descarta su historial tardío después de entrar con B', async () => {
    let accountB = false
    let historyReadsA = 0
    let finishHistoryA!: (response: Response) => void
    const visitA = { id: 'visit-a', provider_id: 'p-a', provider_name: 'Comercio de la cuenta A', collaborator_id: null, award: 777, state: 'VALID', created_at: '2026-10-18T12:00:00Z' }
    const visitB = { ...visitA, id: 'visit-b', provider_id: 'p-b', provider_name: 'Comercio de la cuenta B', award: 22 }
    vi.stubGlobal('fetch', vi.fn((input: URL | RequestInfo) => {
      const url = String(input)
      if (url.endsWith('/auth/csrf/')) return Promise.resolve(json({ csrfToken: 'csrf-producto' }))
      if (url.endsWith('/auth/refresh/')) return Promise.resolve(json({ access: 'access-a' }))
      if (url.endsWith('/auth/me/')) return Promise.resolve(json(accountB ? { ...tourist, id: 805, email: 'b@example.test' } : tourist))
      if (url.endsWith('/auth/login/')) { accountB = true; return Promise.resolve(json({ access: 'access-b' })) }
      if (url.endsWith('/me/folders/')) return Promise.resolve(json({ folders: [] }))
      if (url.endsWith('/me/wallet/')) return Promise.resolve(json({ balance: accountB ? 22 : 777, redemptions_frozen: false }))
      if (url.endsWith('/me/progress/')) return Promise.resolve(json({ total: accountB ? 1 : 2, target: 5, completed: false }))
      if (url.endsWith('/me/consumptions/')) {
        if (accountB) return Promise.resolve(json([visitB]))
        historyReadsA += 1
        if (historyReadsA === 1) return Promise.resolve(json([visitA]))
        return new Promise<Response>(resolve => { finishHistoryA = resolve })
      }
      return Promise.resolve(json({}, 404))
    }))
    const ProductApp = await prepareApp('/mi-viaje')
    render(<ProductApp />)
    await screen.findByRole('heading', { name: visitA.provider_name })
    fireEvent.click(screen.getByRole('button', { name: 'Historial' }))
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar' }))
    await waitFor(() => expect(finishHistoryA).toBeTypeOf('function'))
    await act(async () => { setUrl('/ingresar'); window.dispatchEvent(new PopStateEvent('popstate')) })
    await screen.findByRole('heading', { name: 'Qué bueno verte' })
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'b@example.test' } })
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'Clave-segura-987!' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ingresar' }))
    await screen.findByRole('heading', { name: visitB.provider_name })
    expect(screen.queryByText(visitA.provider_name)).toBeNull()
    expect(screen.queryByText('777')).toBeNull()
    expect(screen.getByRole('button', { name: 'Pasaporte' }).getAttribute('aria-pressed')).toBe('true')
    await act(async () => finishHistoryA(json([{ ...visitA, provider_name: 'Respuesta tardía privada de A' }])))
    fireEvent.click(screen.getByRole('button', { name: 'Historial' }))
    expect(screen.getByRole('heading', { name: visitB.provider_name })).toBeTruthy()
    expect(screen.queryByText('Respuesta tardía privada de A')).toBeNull()
    expect(screen.queryByText(visitA.provider_name)).toBeNull()
    expect(screen.queryByText('777')).toBeNull()
  })

  it('envía una sola verificación de email con un token de un solo uso bajo StrictMode', async () => {
    const calls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (input: URL | RequestInfo) => {
      const url = String(input); calls.push(url)
      if (url.endsWith('/auth/csrf/')) return json({ csrfToken: 'csrf-producto' })
      if (url.endsWith('/auth/refresh/')) return json({ detail: 'Sin sesión' }, 401)
      if (url.endsWith('/auth/verify-email/')) return json({ detail: 'Email verificado' })
      return json({ detail: 'No encontrado' }, 404)
    }))
    const ProductApp = await prepareApp('/verificar-email', '#token=token-unico-de-prueba')
    render(<StrictMode><ProductApp /></StrictMode>)
    await screen.findByRole('status')
    expect(calls.filter(url => url.endsWith('/auth/verify-email/'))).toHaveLength(1)
  })

  it('conserva el QR privado durante el paso a registro y crea solo una cuenta TOURIST', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    vi.stubGlobal('fetch', vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = String(input); calls.push({ url, init })
      if (url.endsWith('/auth/csrf/')) return json({ csrfToken: 'csrf-producto' })
      if (url.endsWith('/auth/refresh/')) return json({ detail: 'Sin sesión' }, 401)
      if (url.endsWith('/auth/register/')) return json({ id: 45, email: 'viajera@example.test', role: 'TOURIST' }, 201)
      return json({ detail: 'No encontrado' }, 404)
    }))
    const ProductApp = await prepareApp('/referencia', '#token=qr-privado-de-prueba')
    expect(window.location.hash).toBe('')
    render(<ProductApp />)
    await screen.findByRole('heading', { name: 'Una referencia abre nuevas puertas.' })
    fireEvent.click(screen.getByRole('link', { name: 'Crear cuenta con este QR' }))
    await screen.findByRole('heading', { name: 'Creá tu cuenta' })
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'viajera@example.test' } })
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'Clave-segura-987!' } })
    fireEvent.click(screen.getByRole('button', { name: 'Crear mi cuenta' }))
    await screen.findByText(/Cuenta creada para viajera@example.test/)
    const submission = calls.find(call => call.url.endsWith('/auth/register/'))
    expect(JSON.parse(String(submission?.init?.body))).toEqual({ email: 'viajera@example.test', password: 'Clave-segura-987!', referral_token: 'qr-privado-de-prueba' })
    expect(JSON.parse(String(submission?.init?.body))).not.toHaveProperty('role')
    expect(new Headers(submission?.init?.headers).get('X-CSRFToken')).toBe('csrf-producto')
    expect(window.location.pathname).toBe('/ingresar')
  })

  it('explica el requisito de Web Locks al enviar login sin hacer solicitudes', async () => {
    Reflect.deleteProperty(navigator, 'locks')
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const ProductApp = await prepareApp('/ingresar')
    render(<ProductApp />)
    await screen.findByRole('heading', { name: 'Qué bueno verte' })
    expect(screen.queryByRole('navigation', { name: 'Tu viaje' })).toBeNull()

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'viajera@example.test' } })
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'Clave-segura-987!' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ingresar' }))

    expect((await screen.findByRole('alert')).textContent).toMatch(/navegador actualizado en una conexión segura/)
    expect(fetch.mock.calls.every(([url]) => String(url).endsWith('/site-settings/'))).toBe(true)
  })

  it('oculta la carpeta si el servidor ya revocó el acceso y no consulta prestadores', async () => {
    const calls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (input: URL | RequestInfo) => {
      const url = String(input); calls.push(url)
      if (url.endsWith('/auth/csrf/')) return json({ csrfToken: 'csrf-producto' })
      if (url.endsWith('/auth/refresh/')) return json({ access: 'access-demo' })
      if (url.endsWith('/auth/me/')) return json(tourist)
      if (url.endsWith('/me/folders/')) return json({ folders: [] })
      if (url.endsWith('/me/wallet/')) return json({ balance: 0, redemptions_frozen: false })
      if (url.endsWith('/me/progress/')) return json({ total: 0, target: 0, completed: false })
      if (url.endsWith('/me/consumptions/')) return json([])
      return json({ detail: 'No encontrado' }, 404)
    }))
    const ProductApp = await prepareApp('/recomendaciones')
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 320 })
    render(<ProductApp />)
    await screen.findByRole('heading', { name: 'Tu primera carpeta empieza con un QR.' })
    await waitFor(() => expect(document.title).toBe('Tu primera carpeta empieza con un QR. · Llave Extra'))
    const navigation = screen.getByRole('navigation', { name: 'Tu viaje' })
    expect(within(navigation).getByRole('link', { name: 'Mi viaje' })).toBeTruthy()
    expect(within(navigation).getByRole('link', { name: 'Beneficios' })).toBeTruthy()
    expect(screen.queryByText('Carpeta privada de prueba')).toBeNull()
    expect(calls.some(url => /\/folders\/[^/]+\/providers\/$/.test(url))).toBe(false)
  })

  it('descarta la lista tardía de otra carpeta y retira la ficha completa si se revoca', async () => {
    let finishFolderA!: (response: Response) => void
    const calls: string[] = []
    const providerA = {
      id: 'provider-a', slug: 'provider-a', name: 'Prestador de carpeta A', category: 'Café', description: 'Detalle A',
      address: 'Dirección A privada', hours: '', contact: 'Contacto A privado', map_url: '', website: '', image_url: null, status: 'ACTIVE', demo: false,
    }
    const providerB = {
      id: 'provider-b', slug: 'provider-b', name: 'Prestador de carpeta B', category: 'Café', description: 'Detalle B',
      address: 'Dirección B privada', hours: '', contact: 'Contacto B privado', map_url: '', website: '', image_url: null, status: 'ACTIVE', demo: false,
    }
    vi.stubGlobal('fetch', vi.fn((input: URL | RequestInfo) => {
      const url = String(input)
      calls.push(url)
      if (url.endsWith('/auth/csrf/')) return Promise.resolve(json({ csrfToken: 'csrf-producto' }))
      if (url.endsWith('/auth/refresh/')) return Promise.resolve(json({ access: 'access-demo' }))
      if (url.endsWith('/auth/me/')) return Promise.resolve(json(tourist))
      if (url.endsWith('/me/folders/')) return Promise.resolve(json({ folders: [
        { collaborator_id: 'folder-a', granted_at: '2026-10-18T00:00:00Z' },
        { collaborator_id: 'folder-b', granted_at: '2026-10-18T00:00:00Z' },
      ] }))
      if (url.endsWith('/me/wallet/')) return Promise.resolve(json({ balance: 0, redemptions_frozen: false }))
      if (url.endsWith('/me/progress/')) return Promise.resolve(json({ total: 0, target: 5, completed: false }))
      if (url.endsWith('/me/consumptions/')) return Promise.resolve(json([]))
      if (/\/folders\/[^/]+\/network\/\?page=1$/.test(url)) return Promise.resolve(json(emptyNetwork))
      if (url.endsWith('/folders/folder-a/providers/')) return new Promise<Response>(resolve => { finishFolderA = resolve })
      if (url.endsWith('/folders/folder-b/providers/')) return Promise.resolve(json([providerB]))
      if (url.endsWith('/folders/folder-b/providers/provider-b/')) return Promise.resolve(json(providerB))
      if (url.endsWith('/folders/folder-b/providers/provider-b/benefits/')) return Promise.resolve(json({ detail: 'Acceso revocado' }, 403))
      return Promise.resolve(json({}, 404))
    }))

    const ProductApp = await prepareApp('/recomendaciones')
    render(<ProductApp />)
    await waitFor(() => expect(calls.some(url => url.endsWith('/folders/folder-a/providers/'))).toBe(true))
    fireEvent.change(screen.getByLabelText('Carpeta'), { target: { value: 'folder-b' } })
    await screen.findByRole('heading', { name: 'Prestador de carpeta B' })
    finishFolderA(json([providerA]))
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Prestador de carpeta A' })).toBeNull())

    fireEvent.click(screen.getByRole('button', { name: 'Ver beneficios' }))
    await waitFor(() => expect(calls.some(url => url.endsWith('/providers/provider-b/benefits/'))).toBe(true))
    await waitFor(() => expect(screen.queryByText('Dirección B privada')).toBeNull())
    expect(screen.queryByText('Contacto B privado')).toBeNull()
    expect(screen.queryByRole('heading', { level: 1, name: 'Prestador de carpeta B' })).toBeNull()
  })

  it('conserva la confirmación de consumo cuando falla la lectura posterior de Mi viaje', async () => {
    let confirmed = false
    let posts = 0
    let finishFolders!: (response: Response) => void
    const folderList = { folders: [{ collaborator_id: 'folder-a', granted_at: '' }] }
    vi.stubGlobal('fetch', vi.fn(async (input: URL | RequestInfo) => {
      const url = String(input)
      if (url.endsWith('/auth/csrf/')) return json({ csrfToken: 'csrf-producto' })
      if (url.endsWith('/auth/refresh/')) return json({ access: 'access-demo' })
      if (url.endsWith('/auth/me/')) return json(tourist)
      if (url.endsWith('/me/folders/')) return confirmed ? new Promise<Response>(resolve => { finishFolders = resolve }) : json(folderList)
      if (url.endsWith('/me/wallet/')) return confirmed ? json({}, 503) : json({ balance: 10, redemptions_frozen: false })
      if (url.endsWith('/me/progress/')) return json({ total: 0, target: 5, completed: false })
      if (url.endsWith('/me/consumptions/')) return json([])
      if (url.endsWith('/consumptions/')) {
        confirmed = true; posts += 1
        return json({ id: 'visit', provider_id: 'provider', collaborator_id: null, award: 7, balance: 17, state: 'VALID', created_at: '2026-10-28T12:00:00Z' }, 201)
      }
      return json({}, 404)
    }))
    const ProductApp = await prepareApp('/consumo', '#token=synthetic-provider-qr')
    render(<ProductApp />)
    fireEvent.change(await screen.findByLabelText('PIN del prestador'), { target: { value: '000123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Validar visita' }))
    await screen.findByRole('heading', { name: 'Visita verificada' })
    await waitFor(() => expect(finishFolders).toBeTypeOf('function'))
    await act(async () => finishFolders(json(folderList)))
    await screen.findByText(/El resultado del consumo ya fue confirmado/)
    expect(screen.getByText('7 créditos acreditados')).toBeTruthy()
    expect(screen.getByText('17 créditos')).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'No pudimos cargar esta información.' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Validar visita' })).toBeNull()
    expect(posts).toBe(1)
  })

  it('descarta el POST de A al ingresar B sin recargar ni publicar el resultado viejo', async () => {
    let accountB = false
    let finishPost!: (response: Response) => void
    let tripReadsB = 0
    vi.stubGlobal('fetch', vi.fn((input: URL | RequestInfo) => {
      const url = String(input)
      if (url.endsWith('/auth/csrf/')) return Promise.resolve(json({ csrfToken: 'csrf-producto' }))
      if (url.endsWith('/auth/refresh/')) return Promise.resolve(json({ access: 'access-a' }))
      if (url.endsWith('/auth/me/')) return Promise.resolve(json(accountB ? { ...tourist, id: 805, email: 'b@example.test' } : tourist))
      if (url.endsWith('/auth/login/')) { accountB = true; return Promise.resolve(json({ access: 'access-b' })) }
      if (url.endsWith('/me/folders/')) return Promise.resolve(json({ folders: [] }))
      if (url.endsWith('/me/wallet/')) { if (accountB) tripReadsB += 1; return Promise.resolve(json({ balance: accountB ? 22 : 777, redemptions_frozen: false })) }
      if (url.endsWith('/me/progress/')) return Promise.resolve(json({ total: 0, target: 5, completed: false }))
      if (url.endsWith('/me/consumptions/')) return Promise.resolve(json([]))
      if (url.endsWith('/consumptions/')) return new Promise<Response>(resolve => { finishPost = resolve })
      return Promise.resolve(json({}, 404))
    }))
    const ProductApp = await prepareApp('/consumo', '#token=synthetic-account-a-qr')
    render(<ProductApp />)
    fireEvent.change(await screen.findByLabelText('PIN del prestador'), { target: { value: '000123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Validar visita' }))
    await waitFor(() => expect(finishPost).toBeTypeOf('function'))
    await act(async () => { setUrl('/ingresar'); window.dispatchEvent(new PopStateEvent('popstate')) })
    fireEvent.change(await screen.findByLabelText('Email'), { target: { value: 'b@example.test' } })
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'Clave-segura-987!' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ingresar' }))
    await screen.findByLabelText('Lo descubrí por mi cuenta')
    await waitFor(() => expect(tripReadsB).toBeGreaterThan(0))
    const readsBeforeLatePost = tripReadsB
    await act(async () => finishPost(json({ id: 'late-a', provider_id: 'provider', collaborator_id: null, award: 777, balance: 1554, state: 'VALID', created_at: '' }, 201)))
    expect(screen.queryByRole('heading', { name: 'Visita verificada' })).toBeNull()
    expect(screen.queryByText(/1554|1.554/)).toBeNull()
    expect((screen.getByLabelText('PIN del prestador') as HTMLInputElement).value).toBe('')
    expect(tripReadsB).toBe(readsBeforeLatePost)
  })

  it.each(['503', 'timeout'])('reintenta la validación tras %s con su clave y cuerpo originales y actualiza Mi viaje desde la API', async failure => {
    const consumptionCalls: Array<{ url: string; init?: RequestInit }> = []
    vi.stubGlobal('fetch', vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/auth/csrf/')) return json({ csrfToken: 'csrf-producto' })
      if (url.endsWith('/auth/refresh/')) return json({ access: 'access-demo' })
      if (url.endsWith('/auth/me/')) return json(tourist)
      if (url.endsWith('/me/folders/')) return json({ folders: [{ collaborator_id: 'folder-a', granted_at: '2026-10-18T00:00:00Z' }, { collaborator_id: 'folder-b', granted_at: '2026-10-18T00:00:00Z' }] })
      if (url.endsWith('/me/wallet/')) return json({ balance: 450, redemptions_frozen: false })
      if (url.endsWith('/me/progress/')) return json({ total: 1, target: 6, completed: false })
      if (url.endsWith('/me/consumptions/')) return json([{ id: 'visit-1', provider_id: 'provider-1', collaborator_id: 'folder-a', award: 450, state: 'VALID', created_at: '2026-10-18T12:00:00Z' }])
      if (url.endsWith('/consumptions/')) {
        consumptionCalls.push({ url, init })
        if (consumptionCalls.length === 1) {
          if (failure === 'timeout') throw new DOMException('Timeout sintético del transporte', 'TimeoutError')
          return json({ detail: 'Servicio no disponible' }, 503)
        }
        return json({ id: 'visit-1', provider_id: 'provider-1', collaborator_id: 'folder-a', award: 450, balance: 450, state: 'VALID', created_at: '2026-10-18T12:00:00Z' }, 201)
      }
      return json({ detail: 'No encontrado' }, 404)
    }))
    const ProductApp = await prepareApp('/consumo', '#token=qr-consumo-prueba')
    render(<ProductApp />)
    await screen.findByLabelText('PIN del prestador')
    fireEvent.click(screen.getByLabelText('Por una recomendación privada'))
    fireEvent.change(screen.getByLabelText('PIN del prestador'), { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: 'Validar visita' }))
    await screen.findByRole('alert')
    fireEvent.click(screen.getByRole('button', { name: 'Validar visita' }))
    await screen.findByRole('heading', { name: 'Visita verificada' })
    expect(consumptionCalls).toHaveLength(2)
    const keys = consumptionCalls.map(call => new Headers(call.init?.headers).get('Idempotency-Key'))
    expect(keys[0]).toBeTruthy()
    expect(keys[1]).toBe(keys[0])
    expect(consumptionCalls[1].init?.body).toBe(consumptionCalls[0].init?.body)
    expect(JSON.parse(String(consumptionCalls[0].init?.body))).toEqual({ folder_id: 'folder-a', qr_token: 'qr-consumo-prueba', pin: '123456' })
    setUrl('/mi-viaje')
    window.dispatchEvent(new PopStateEvent('popstate'))
    await waitFor(() => expect(window.location.pathname).toBe('/mi-viaje'))
    await screen.findByRole('heading', { name: 'Tu pasaporte local.' })
    expect(screen.getByText('450')).toBeTruthy()
    expect(screen.getByText((_content, element) => element?.tagName === 'SMALL' && element.textContent?.includes('/ 6') === true)).toBeTruthy()
    expect(screen.getByText('Visita verificada')).toBeTruthy()
  })

  it('acredita en modo directo sin carpeta y muestra historial con colaborador nulo', async () => {
    let body: Record<string, unknown> | null = null
    vi.stubGlobal('fetch', vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/auth/csrf/')) return json({ csrfToken: 'csrf-producto' })
      if (url.endsWith('/auth/refresh/')) return json({ access: 'access-demo' })
      if (url.endsWith('/auth/me/')) return json(tourist)
      if (url.endsWith('/me/folders/')) return json({ folders: [] })
      if (url.endsWith('/me/wallet/')) return json({ balance: 450, redemptions_frozen: false })
      if (url.endsWith('/me/progress/')) return json({ total: 1, target: 6, completed: false })
      if (url.endsWith('/me/consumptions/')) return json([{ id: 'visit-direct', provider_id: 'provider-1', collaborator_id: null, award: 450, state: 'VALID', created_at: '2026-10-18T12:00:00Z' }])
      if (url.endsWith('/consumptions/')) { body = JSON.parse(String(init?.body)); return json({ id: 'visit-direct', provider_id: 'provider-1', collaborator_id: null, award: 450, balance: 450, state: 'VALID', created_at: '2026-10-18T12:00:00Z' }, 201) }
      return json({ detail: 'No encontrado' }, 404)
    }))
    const ProductApp = await prepareApp('/consumo', '#token=qr-directo-prueba')
    render(<ProductApp />)
    await screen.findByLabelText('PIN del prestador')
    expect(screen.getByLabelText('Lo descubrí por mi cuenta')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('PIN del prestador'), { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: 'Validar visita' }))
    await screen.findByRole('heading', { name: 'Visita verificada' })
    expect(body).toEqual({ qr_token: 'qr-directo-prueba', pin: '123456' })
    setUrl('/mi-viaje')
    window.dispatchEvent(new PopStateEvent('popstate'))
    await screen.findByText('Visita verificada')
  })
})
