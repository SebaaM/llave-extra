import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StrictMode } from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

const json = (body: unknown, status = 200) => new Response(body === null ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const setUrl = (path: string, hash = '') => window.history.replaceState({}, '', `${path}${hash}`)
const tourist = { id: 804, email: 'viajera@example.test', role: 'TOURIST', email_verified: true }

beforeEach(() => { cleanup(); sessionStorage.clear() })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

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
