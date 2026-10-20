import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StrictMode } from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

const json = (body: unknown, status = 200) => new Response(body === null ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const setUrl = (path: string, hash = '') => window.history.replaceState({}, '', `${path}${hash}`)
const tourist = { id: 804, email: 'viajera@example.test', role: 'TOURIST', email_verified: true }
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
      if (url.endsWith('/folders/folder-a-private/providers/')) return Promise.resolve(json([{
        id: 'provider-a', slug: 'provider-a', name: 'Prestador privado de A', category: 'Café', description: 'Solo A',
        address: 'Dirección A', hours: '', contact: '', map_url: '', website: '', image_url: null, status: 'ACTIVE', demo: false,
      }]))
      if (url.endsWith('/auth/logout/')) return new Promise<Response>(resolve => { finishLogout = resolve })
      return Promise.resolve(json({}, 404))
    }))

    const ProductApp = await prepareApp('/beneficios')
    render(<ProductApp />)
    await screen.findByRole('heading', { name: 'Prestador privado de A' })

    setUrl('/ingresar')
    window.dispatchEvent(new PopStateEvent('popstate'))
    await screen.findByRole('heading', { name: 'Qué bueno verte' })
    const qr = await import('./qr-intent')
    qr.setConsumptionToken('qr-de-prueba')
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'b@example.test' } })
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'Clave-segura-987!' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ingresar' }))
    await waitFor(() => expect(finishLogin).toBeTypeOf('function'))
    expect(screen.queryByText('a@example.test')).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Prestador privado de A' })).toBeNull()
    finishLogin(json({ access: 'access-b' }))
    await screen.findByText('Validá el QR de un colaborador antes de registrar un consumo.')
    expect(screen.queryByText('Carpeta · folder-a')).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Prestador privado de A' })).toBeNull()

    setUrl('/mi-viaje')
    window.dispatchEvent(new PopStateEvent('popstate'))
    await screen.findByRole('heading', { name: 'Tu pasaporte local.' })
    await waitFor(() => expect(screen.queryByText('777')).toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'Salir' }))
    expect(screen.queryByText('777')).toBeNull()
    expect(screen.queryByText('b@example.test')).toBeNull()
    await waitFor(() => expect(calls.some(url => url.endsWith('/auth/logout/'))).toBe(true))
    expect(finishLogout).toBeTypeOf('function')
    finishLogout(json(null, 204))
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

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'viajera@example.test' } })
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'Clave-segura-987!' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ingresar' }))

    expect((await screen.findByRole('alert')).textContent).toMatch(/navegador actualizado en una conexión segura/)
    expect(fetch).not.toHaveBeenCalled()
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
    const ProductApp = await prepareApp('/beneficios')
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 320 })
    render(<ProductApp />)
    await screen.findByRole('heading', { name: 'Tu primera carpeta empieza con un QR.' })
    await waitFor(() => expect(document.title).toBe('Tu primera carpeta empieza con un QR. · Llave Extra'))
    const navigation = screen.getByRole('navigation', { name: 'Navegación principal' })
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
      if (url.endsWith('/folders/folder-a/providers/')) return new Promise<Response>(resolve => { finishFolderA = resolve })
      if (url.endsWith('/folders/folder-b/providers/')) return Promise.resolve(json([providerB]))
      if (url.endsWith('/folders/folder-b/providers/provider-b/')) return Promise.resolve(json(providerB))
      if (url.endsWith('/folders/folder-b/providers/provider-b/benefits/')) return Promise.resolve(json({ detail: 'Acceso revocado' }, 403))
      return Promise.resolve(json({}, 404))
    }))

    const ProductApp = await prepareApp('/beneficios')
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

  it('reintenta la misma validación con su clave idempotente y actualiza Mi viaje desde la API', async () => {
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
        return consumptionCalls.length === 1 ? json({ detail: 'Servicio no disponible' }, 503) : json({ id: 'visit-1', provider_id: 'provider-1', collaborator_id: 'folder-a', award: 450, balance: 450, state: 'VALID', created_at: '2026-10-18T12:00:00Z' }, 201)
      }
      return json({ detail: 'No encontrado' }, 404)
    }))
    const ProductApp = await prepareApp('/consumo', '#token=qr-consumo-prueba')
    render(<ProductApp />)
    await screen.findByLabelText('PIN del prestador')
    fireEvent.change(screen.getByLabelText('PIN del prestador'), { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: 'Validar visita' }))
    await screen.findByRole('alert')
    fireEvent.click(screen.getByRole('button', { name: 'Validar visita' }))
    await screen.findByText('Visita enviada para validación.')
    expect(consumptionCalls).toHaveLength(2)
    const keys = consumptionCalls.map(call => new Headers(call.init?.headers).get('Idempotency-Key'))
    expect(keys[0]).toBeTruthy()
    expect(keys[1]).toBe(keys[0])
    expect(JSON.parse(String(consumptionCalls[0].init?.body))).toEqual({ folder_id: 'folder-a', qr_token: 'qr-consumo-prueba', pin: '123456' })
    setUrl('/mi-viaje')
    window.dispatchEvent(new PopStateEvent('popstate'))
    await waitFor(() => expect(window.location.pathname).toBe('/mi-viaje'))
    await screen.findByRole('heading', { name: 'Tu pasaporte local.' })
    expect(screen.getByText('450')).toBeTruthy()
    expect(screen.getByText((_content, element) => element?.tagName === 'SMALL' && element.textContent?.includes('/ 6') === true)).toBeTruthy()
    expect(screen.getByText('Visita verificada')).toBeTruthy()
  })
})
