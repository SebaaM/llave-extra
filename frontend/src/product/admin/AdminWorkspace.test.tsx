import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { invalidatePrivateState, setAccessToken } from '../api'
import { RecordActions } from './Actions'
import { resources } from './data'
import { RecordForm } from './RecordForm'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const nativeLocks = Object.getOwnPropertyDescriptor(navigator, 'locks')
beforeEach(() => {
  cleanup(); invalidatePrivateState(); setAccessToken('admin-test'); vi.stubGlobal('confirm', vi.fn(() => true))
  Object.defineProperty(navigator, 'locks', { configurable: true, value: { request: (_name: string, _options: unknown, callback: () => Promise<unknown>) => Promise.resolve(callback()) } })
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); if (nativeLocks) Object.defineProperty(navigator, 'locks', nativeLocks); else Reflect.deleteProperty(navigator, 'locks') })

describe('gestión administrativa', () => {
  it('conserva el texto del formulario ante una versión obsoleta', async () => {
    const user = resources.find(item => item.key === 'users')!
    const onSaved = vi.fn()
    vi.stubGlobal('fetch', vi.fn(async () => json({ detail: 'Versión obsoleta' }, 409)))
    render(<RecordForm resource={user} data={{ id: 7, version: 'v1', email: 'cliente@example.test', first_name: 'Ana', last_name: 'Sur', is_active: true }} back="/gestion/usuarios" onSaved={onSaved} />)
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Ana María' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    await screen.findByRole('alert')
    expect((screen.getByLabelText('Nombre') as HTMLInputElement).value).toBe('Ana María')
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('reintenta un comando incierto con la misma clave y carga', async () => {
    const requests: Array<{ key: string | null; body: string }> = []
    vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ key: new Headers(init?.headers).get('Idempotency-Key'), body: String(init?.body) })
      return requests.length === 1 ? json({ detail: 'El servicio no está disponible' }, 503) : json({ id: 'consumo-1', state: 'ANNULLED', adjustment_id: null })
    }))
    render(<RecordActions resource="consumptions" data={{ id: 'consumo-1', state: 'VALID' }} onSuccess={async () => undefined} />)
    fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'Duplicado confirmado' } })
    fireEvent.click(screen.getByRole('button', { name: 'Anular consumo' }))
    await screen.findByRole('alert')
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar operación anterior' }))
    await screen.findByText('La operación se registró.')
    expect(requests).toHaveLength(2)
    expect(requests[0].key).toBeTruthy()
    expect(requests[1]).toEqual(requests[0])
  })

  it('elige prestador por nombre al crear un beneficio y envía su identificador real', async () => {
    let sent: Record<string, unknown> | null = null
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/admin/providers/?')) return json({ count: 1, next: null, previous: null, results: [{ id: 'prestador-uno', name: 'Bahía Local', category: 'Paseos' }] })
      if (url.endsWith('/admin/benefits/') && init?.method === 'POST') { sent = JSON.parse(String(init.body)); return json({ id: 'beneficio-uno', ...sent }, 201) }
      return json({}, 404)
    }))
    render(<RecordForm resource={resources.find(item => item.key === 'benefits')!} data={null} back="/gestion/beneficios" onSaved={vi.fn()} />)
    await screen.findByRole('option', { name: 'Bahía Local · Paseos' })
    fireEvent.change(screen.getByLabelText('Prestador'), { target: { value: 'prestador-uno' } })
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Visita guiada' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    await waitFor(() => expect(sent).not.toBeNull())
    expect(sent).toMatchObject({ provider: 'prestador-uno', title: 'Visita guiada' })
  })

  it('lleva al Administrador al panel y no consulta las APIs del Cliente', async () => {
    const calls: string[] = []
    window.history.replaceState({}, '', '/espacio')
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      calls.push(url)
      if (url.endsWith('/auth/csrf/')) return json({ csrfToken: 'csrf' })
      if (url.endsWith('/auth/refresh/')) return json({ access: 'access' })
      if (url.endsWith('/auth/me/')) return json({ id: 1, email: 'admin@example.test', role: 'ADMIN', email_verified: true })
      if (url.endsWith('/site-settings/')) return json({ site_name: 'Llave Extra', home_title: 'Portada', home_description: 'Desc', footer_text: 'Pie', contact_email: '', whatsapp_url: '', instagram_url: '' })
      if (url.endsWith('/admin/dashboard/')) return json({ counts: { active_users: 1, published_providers: 0, current_benefits: 0, enabled_collaborators: 0 }, queues: { draft_providers: 0, draft_benefits: 0, orders_to_prepare: 0, orders_to_deliver: 0, open_cancellations: 0, payment_reviews: 0, pending_refunds: 0, unresolved_adjustments: 0, out_of_stock_products: 0 }, settings: { catalog_enabled: true, pickup_enabled: false, pickup_configured: false, base_reward: 0, target_visits: 5, payment_provider: 'disabled' }, recent_activity: [], refreshed_at: '2026-10-25T00:00:00Z' })
      return json({}, 404)
    }))
    const { default: ProductApp } = await import('../ProductApp')
    render(<ProductApp />)
    await screen.findByRole('heading', { name: 'Lo que necesita tu atención.' })
    expect(window.location.pathname).toBe('/gestion')
    expect(calls.some(url => url.includes('/me/folders/') || url.includes('/me/wallet/') || url.includes('/me/progress/'))).toBe(false)
  })

  it('cierra el panel cuando el servidor revoca el permiso', async () => {
    window.history.replaceState({}, '', '/gestion/usuarios')
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/auth/csrf/')) return json({ csrfToken: 'csrf' })
      if (url.endsWith('/auth/refresh/')) return json({ access: 'access' })
      if (url.endsWith('/auth/me/')) return json({ id: 1, email: 'admin@example.test', role: 'ADMIN', email_verified: true })
      if (url.endsWith('/site-settings/')) return json({ site_name: 'Llave Extra', home_title: 'Portada', home_description: 'Desc', footer_text: 'Pie', contact_email: '', whatsapp_url: '', instagram_url: '' })
      if (url.includes('/admin/users/')) return json({ detail: 'Acceso revocado' }, 403)
      return json({}, 404)
    }))
    const { default: ProductApp } = await import('../ProductApp')
    render(<ProductApp />)
    await waitFor(() => expect(window.location.pathname).toBe('/ingresar'))
    expect(screen.queryByRole('navigation', { name: 'Panel de administración' })).toBeNull()
  })

  it('protege una edición ante navegación interna y foco de ventana', async () => {
    window.history.replaceState({}, '', '/gestion/usuarios/7')
    vi.stubGlobal('confirm', vi.fn(() => false))
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/auth/me/')) return json({ id: 1, email: 'admin@example.test', role: 'ADMIN', email_verified: true })
      if (url.endsWith('/site-settings/')) return json({ site_name: 'Llave Extra', home_title: 'Portada', home_description: 'Desc', footer_text: 'Pie', contact_email: '', whatsapp_url: '', instagram_url: '' })
      if (url.endsWith('/admin/users/7/')) return json({ id: 7, email: 'cliente@example.test', first_name: 'Ana', last_name: 'Sur', role: 'TOURIST', is_active: true, email_verified: true, version: 'v1' })
      return json({}, 404)
    }))
    const { default: ProductApp } = await import('../ProductApp')
    render(<ProductApp />)
    await screen.findByRole('button', { name: 'Editar' })
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }))
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Ana María' } })
    fireEvent(window, new Event('focus'))
    expect((screen.getByLabelText('Nombre') as HTMLInputElement).value).toBe('Ana María')
    fireEvent.click(screen.getByRole('link', { name: /Prestadores/ }))
    expect(window.location.pathname).toBe('/gestion/usuarios/7')
    expect((screen.getByLabelText('Nombre') as HTMLInputElement).value).toBe('Ana María')
    vi.stubGlobal('confirm', vi.fn(() => true))
    fireEvent.click(screen.getByRole('link', { name: /Prestadores/ }))
    expect(window.location.pathname).toBe('/gestion/prestadores')
    expect(window.confirm).toHaveBeenCalledTimes(1)
  })

  it('muestra textos y contactos configurados en la portada pública', async () => {
    window.history.replaceState({}, '', '/')
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/site-settings/')) return json({ site_name: 'Red Austral', home_title: 'Explorá Ushuaia', home_description: 'Experiencias locales para tu viaje.', footer_text: 'Contactanos para sumarte.', contact_email: 'hola@example.test', whatsapp_url: '', instagram_url: '' })
      if (url.endsWith('/catalog/config/')) return json({ enabled: false })
      if (url.endsWith('/auth/refresh/')) return json({ detail: 'Sin sesión' }, 401)
      return json({}, 404)
    }))
    const { default: ProductApp } = await import('../ProductApp')
    render(<ProductApp />)
    await screen.findByRole('heading', { name: 'Explorá Ushuaia' })
    expect(screen.getByText('Experiencias locales para tu viaje.')).toBeTruthy()
    expect(screen.getByText('Contactanos para sumarte.')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'hola@example.test' }).getAttribute('href')).toBe('mailto:hola@example.test')
  })
})
