import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setAccessToken } from './api'
import { NetworkCanvas } from './NetworkCanvas'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const provider = { id: '49643f2a-ca4d-43b2-a0ba-68885fa2c582', slug: 'el-puerto', name: 'El Puerto', category: 'Gastronomía', description: 'Cocina junto a la bahía.', address: 'Av. Maipú 200', hours: 'Desde las 12', contact: '', map_url: '', website: '', demo: false, image_url: null }
const item = { provider, benefit_id: 'b1', benefit_title: 'Oferta anterior' }
const presentation = { title: 'La red Llave Extra', layout: 'RADIAL', theme: 'SAND', background: 'BEAGLE', page_size: 12, interval_seconds: 10, city: 'Ushuaia' }
const network = { count: 1, next: null, previous: null, results: [item], presentation }
const benefits = { count: 5, next: 'next', previous: null, results: ['Café con vista', 'Almuerzo en la bahía', 'Menú regional'].map((title, index) => ({ id: `b${index + 1}`, title, description: '', conditions: 'Consumo en el local.', valid_from: null, valid_until: null, demo: index === 1, image_url: null, provider })) }

beforeEach(() => { window.history.replaceState({}, '', '/'); setAccessToken('sesion-privada') })
afterEach(() => { cleanup(); setAccessToken(null); vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('ficha pública de la red', () => {
  it('carga tres beneficios vigentes por ID, no envía credenciales y navega solo desde Ver más', async () => {
    const user = userEvent.setup()
    const dispatch = vi.spyOn(window, 'dispatchEvent')
    const navigations = () => dispatch.mock.calls.map(([event]) => event).filter(event => event instanceof CustomEvent && event.type === 'llave:navigate') as CustomEvent<string>[]
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async input => {
      const url = new URL(String(input))
      if (url.pathname === '/api/v1/catalog/network/') return json(network)
      if (url.pathname === '/api/v1/catalog/config/') return json({ enabled: true })
      if (url.pathname === '/api/v1/catalog/benefits/') return json(benefits)
      return json({}, 404)
    })
    vi.stubGlobal('fetch', fetcher)
    render(<NetworkCanvas />)
    const trigger = await screen.findByRole('button', { name: 'El Puerto: Oferta anterior' })
    expect(trigger.getAttribute('aria-haspopup')).toBe('dialog')
    expect(fetcher).toHaveBeenCalledTimes(1)
    await user.click(trigger)
    const dialog = within(screen.getByRole('dialog', { name: 'El Puerto' }))
    expect(dialog.getByText(provider.description)).toBeTruthy()
    expect(dialog.getByText(provider.address)).toBeTruthy()
    expect(dialog.getByText(provider.hours)).toBeTruthy()
    expect(dialog.getByText(provider.category)).toBeTruthy()
    expect(await dialog.findByText('Café con vista')).toBeTruthy()
    expect(dialog.getAllByRole('listitem')).toHaveLength(3)
    expect(dialog.getByText('5 beneficios vigentes')).toBeTruthy()
    expect(dialog.queryByText('Oferta anterior')).toBeNull()
    expect(dialog.getByText('Ejemplo')).toBeTruthy()
    const fetched = fetcher.mock.calls.map(([input, init]) => ({ url: new URL(String(input)), headers: new Headers(init?.headers) }))
    expect(fetched.every(({ url, headers }) => url.pathname.startsWith('/api/v1/catalog/') && !headers.has('Authorization'))).toBe(true)
    expect(Object.fromEntries(fetched[2].url.searchParams)).toEqual({ page: '1', page_size: '3', provider: provider.id })
    expect(navigations()).toHaveLength(0)
    await user.click(dialog.getByRole('link', { name: 'Ver más' }))
    expect(navigations().map(event => event.detail)).toEqual([`/beneficios?provider=${provider.id}`])
  })

  it('cierra con Escape, cancela la petición y no restaura títulos tardíos', async () => {
    let finish!: (value: Response) => void
    let signal: AbortSignal | null | undefined
    vi.stubGlobal('fetch', vi.fn((input: URL | RequestInfo, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/catalog/config/')) return Promise.resolve(json({ enabled: true }))
      if (url.includes('/catalog/benefits/')) { signal = init?.signal; return new Promise<Response>(resolve => { finish = resolve }) }
      return Promise.resolve(json(network))
    }))
    render(<NetworkCanvas />)
    const trigger = await screen.findByRole('button', { name: 'El Puerto: Oferta anterior' })
    fireEvent.click(trigger)
    const dialog = screen.getByRole('dialog')
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
    fireEvent(dialog, new Event('cancel', { cancelable: true }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(trigger)
    expect(signal?.aborted).toBe(true)
    await act(async () => finish(json(benefits)))
    expect(screen.queryByText('Café con vista')).toBeNull()
  })

  it.each([404, 503])('no inventa resultados cuando el catálogo responde %s', async status => {
    vi.stubGlobal('fetch', vi.fn(async (input: URL | RequestInfo) => {
      const url = String(input)
      if (url.includes('/catalog/config/')) return json({ enabled: true })
      if (url.includes('/catalog/benefits/')) return json({}, status)
      return json(network)
    }))
    render(<NetworkCanvas />)
    fireEvent.click(await screen.findByRole('button', { name: 'El Puerto: Oferta anterior' }))
    const dialog = within(screen.getByRole('dialog'))
    await dialog.findByText(status === 404 ? 'El catálogo general no está disponible ahora.' : 'No pudimos consultar los beneficios.')
    expect(dialog.queryByText('Oferta anterior')).toBeNull()
    expect(dialog.queryByRole('link', { name: 'Ver más' })).toBeNull()
    expect(Boolean(dialog.queryByRole('button', { name: 'Reintentar' }))).toBe(status === 503)
  })
})
