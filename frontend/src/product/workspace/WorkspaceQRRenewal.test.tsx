import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { invalidatePrivateState, setAccessToken } from '../api'
import { WorkspaceQR } from './WorkspaceQR'

const path = '/api/v1/collaborator/qr/'
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const credential = (version = 'v1') => json({ version, url: `${window.location.origin}/referencia#token=synthetic-${version}` })
const originalLocks = Object.getOwnPropertyDescriptor(navigator, 'locks')
type Handler = (url: string, init?: RequestInit) => Response | Promise<Response> | undefined
function mount(handler?: Handler) {
  const calls: { url: string; init?: RequestInit }[] = []
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input)).pathname
    calls.push({ url, init })
    return handler?.(url, init) ?? (url.endsWith('/auth/csrf/') ? json({ csrfToken: 'csrf' }) : url === path ? credential() : new Response(new Blob(['png'], { type: 'image/png' })))
  }))
  return { ...render(<WorkspaceQR kind="collaborator" credentialPath={path} />), calls }
}
async function confirmRenewal() {
  fireEvent.click(await screen.findByRole('button', { name: 'Renovar QR' }))
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar renovación' }))
}
beforeEach(() => {
  invalidatePrivateState(); setAccessToken('test')
  Object.defineProperty(navigator, 'locks', { configurable: true, value: { request: (_name: string, _options: unknown, callback: () => Promise<unknown>) => callback() } })
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:qr')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); if (originalLocks) Object.defineProperty(navigator, 'locks', originalLocks); else Reflect.deleteProperty(navigator, 'locks') })

describe('renovación explícita del QR propio', () => {
  it('consulta sin renovar y permite cancelar la confirmación', async () => {
    const { calls } = mount()
    await screen.findByRole('img')
    fireEvent.click(screen.getByRole('button', { name: 'Volver a consultar' }))
    await screen.findByRole('img')
    fireEvent.click(screen.getByRole('button', { name: 'Renovar QR' }))
    expect(screen.getByRole('group', { name: '¿Renovar tu QR?' }).textContent).toContain('material impreso')
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('group', { name: '¿Renovar tu QR?' })).toBeNull()
    expect(calls.every(call => (call.init?.method ?? 'GET') === 'GET')).toBe(true)
  })

  it('oculta el anterior, evita doble envío y obtiene GET/PNG nuevos después de éxito', async () => {
    let finish!: (response: Response) => void
    let renewed = false
    const { calls } = mount((url, init) => {
      if (init?.method === 'POST') return new Promise(resolve => { finish = resolve })
      if (url === path) return credential(renewed ? 'v2' : 'v1')
    })
    await screen.findByRole('img')
    fireEvent.click(screen.getByRole('button', { name: 'Renovar QR' }))
    const confirm = screen.getByRole('button', { name: 'Confirmar renovación' })
    fireEvent.click(confirm); fireEvent.click(confirm)
    await waitFor(() => expect(finish).toBeTypeOf('function'))
    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Copiar enlace' })).toBeNull()
    expect(screen.queryByRole('link', { name: /Descargar/ })).toBeNull()
    fireEvent(window, new Event('focus'))
    renewed = true
    await act(async () => finish(json({ id: 'receipt', status: 'renewed', version: 'v2' })))
    await screen.findByRole('img')
    const posts = calls.filter(call => call.init?.method === 'POST')
    expect(posts).toHaveLength(1)
    expect(posts[0].url).toBe(`${path}renew/`)
    expect(posts[0].init?.body).toBe('{"version":"v1"}')
    expect(new Headers(posts[0].init?.headers).get('Idempotency-Key')).toBeTruthy()
    expect(calls.filter(call => call.url === '/api/v1/collaborator/qr.png')).toHaveLength(2)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:qr')
  })

  it('conserva clave/cuerpo ante timeout y foco, y recupera el replay', async () => {
    let posts = 0
    const { calls } = mount((_url, init) => {
      if (init?.method === 'POST') {
        if (++posts === 1) return Promise.reject(new TypeError('timeout'))
        return json({ id: 'receipt', status: 'renewed', version: 'v2' })
      }
    })
    await confirmRenewal()
    await screen.findByRole('button', { name: 'Reintentar renovación anterior' })
    const before = calls.length
    fireEvent(window, new Event('focus'))
    expect(screen.queryByRole('button', { name: 'Volver a consultar' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Renovar QR' })).toBeNull()
    expect(screen.queryByRole('img')).toBeNull()
    expect(calls).toHaveLength(before)
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar renovación anterior' }))
    await screen.findByRole('img')
    const sent = calls.filter(call => call.init?.method === 'POST')
    expect(sent).toHaveLength(2)
    expect(sent[0].init?.body).toBe(sent[1].init?.body)
    expect(new Headers(sent[0].init?.headers).get('Idempotency-Key')).toBe(new Headers(sent[1].init?.headers).get('Idempotency-Key'))
  })

  it('recupera lectura fallida después del éxito sin otro POST', async () => {
    let renewed = false
    let failed = false
    const { calls } = mount((url, init) => {
      if (init?.method === 'POST') { renewed = true; return json({ status: 'renewed', version: 'v2' }) }
      if (url === path && renewed && !failed) { failed = true; return json({ detail: 'Lectura fallida' }, 503) }
    })
    await confirmRenewal()
    await screen.findByRole('alert')
    expect(screen.queryByRole('button', { name: 'Renovar QR' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Volver a consultar' }))
    await screen.findByRole('img')
    expect(calls.filter(call => call.init?.method === 'POST')).toHaveLength(1)
  })

  it('exige versión vigente después de 409 antes de permitir otra renovación', async () => {
    mount((_url, init) => init?.method === 'POST' ? json({ detail: 'Versión obsoleta' }, 409) : undefined)
    await confirmRenewal()
    await screen.findByRole('alert')
    expect(screen.queryByRole('button', { name: 'Renovar QR' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Reintentar renovación anterior' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Volver a consultar' }))
    await screen.findByRole('button', { name: 'Renovar QR' })
  })

  it.each([401, 403])('bloquea QR y acciones después de %i', async status => {
    mount((url, init) => init?.method === 'POST' || url.endsWith('/auth/refresh/') ? json({ detail: 'Acceso revocado' }, status) : undefined)
    await confirmRenewal()
    await screen.findByText(/El acceso a este QR ya no está habilitado/)
    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Renovar QR' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Reintentar renovación anterior' })).toBeNull()
  })

  it.each(['ruta', 'cuenta'])('descarta una respuesta tardía al cambiar %s', async change => {
    let finish!: (response: Response) => void
    const view = mount((_url, init) => init?.method === 'POST' ? new Promise(resolve => { finish = resolve }) : undefined)
    await confirmRenewal()
    await waitFor(() => expect(finish).toBeTypeOf('function'))
    if (change === 'cuenta') {
      invalidatePrivateState(); setAccessToken('account-b')
      view.rerender(<WorkspaceQR kind="collaborator" credentialPath={path} />)
      await screen.findByRole('img')
    } else view.unmount()
    const reads = view.calls.filter(call => call.url === path).length
    await act(async () => finish(json({ status: 'renewed', version: 'v2' })))
    expect(view.calls.filter(call => call.url === path)).toHaveLength(reads)
    if (change === 'ruta') expect(screen.queryByRole('img')).toBeNull()
  })
})
