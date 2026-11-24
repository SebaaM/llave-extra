import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HomePage } from './HomePage'
import type { PublicBenefit } from './catalog'

vi.mock('./NetworkCanvas', () => ({ NetworkCanvas: () => <section aria-label="Red">Red</section> }))
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })
const offer = (index: number): PublicBenefit => ({ id: `b${index}`, title: `Destacado ${index}`, description: '', conditions: '', valid_from: null, valid_until: null, demo: false, image_url: null, provider: { id: 'p1', slug: 'local', name: 'Local', category: 'Café', description: '', address: '', hours: '', contact: '', map_url: '', website: '', demo: false, image_url: null } })
const offers = Array.from({ length: 27 }, (_, i) => offer(i + 1))
const page = (items: PublicBenefit[], number = 1) => ({ count: items.length, results: items.slice((number - 1) * 24, number * 24), next: number * 24 < items.length ? 'next' : null, previous: number > 1 ? 'prev' : null })
function api(handler: (url: URL, init?: RequestInit) => Response | Promise<Response>) {
  const calls: URL[] = []
  vi.stubGlobal('fetch', vi.fn((input: URL | RequestInfo, init?: RequestInit) => {
    const url = new URL(String(input)); calls.push(url)
    if (url.pathname.endsWith('/config/')) return Promise.resolve(json({ enabled: true }))
    if (url.pathname.endsWith('/categories/')) return Promise.resolve(json({ results: ['Café'] }))
    return Promise.resolve(handler(url, init))
  }))
  return calls
}
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('hero público conectado a destacados', () => {
  it('consulta featured, recorre todas las páginas, conserva controles y no reinicia red ni categorías', async () => {
    let finish!: (value: Response) => void
    const calls = api(url => {
      if (url.searchParams.get('featured') !== 'true') return json(page([{ ...offer(0), title: 'Oferta común' }]))
      if (url.searchParams.get('page') === '2') return new Promise<Response>(resolve => { finish = resolve })
      return json(page(offers))
    })
    render(<HomePage />)
    await screen.findByRole('heading', { name: 'Destacado 1' })
    expect(screen.queryByText('Oferta común')).toBeNull()
    expect(calls.find(url => url.pathname.includes('/benefits/'))?.searchParams.get('page_size')).toBe('24')
    const network = screen.getByRole('region', { name: 'Red' })
    const categories = screen.getByRole('group', { name: 'Categorías de beneficios' })
    const previous = screen.getByRole('button', { name: 'Beneficio anterior' })
    previous.focus(); fireEvent.click(previous)
    await waitFor(() => expect(finish).toBeTypeOf('function'))
    expect(screen.queryByRole('article')).toBeNull()
    expect(screen.getByRole('button', { name: 'Beneficio anterior' })).toBe(previous)
    expect(document.activeElement).toBe(previous)
    expect(screen.getByRole('region', { name: 'Red' })).toBe(network)
    expect(screen.getByRole('group', { name: 'Categorías de beneficios' })).toBe(categories)
    await act(async () => finish(json(page(offers, 2))))
    await screen.findByRole('heading', { name: 'Destacado 27' })
    expect(screen.getByRole('status', { name: 'Beneficio destacado actual' }).textContent).toContain('27 de 27')
    expect(screen.queryByRole('list', { name: 'Elegir beneficio destacado' })).toBeNull()
    fireEvent.click(previous); await screen.findByRole('heading', { name: 'Destacado 26' })
    fireEvent.click(previous); await screen.findByRole('heading', { name: 'Destacado 25' })
    fireEvent.click(previous); await screen.findByRole('heading', { name: 'Destacado 24' })
    expect(calls.filter(url => url.pathname.endsWith('/categories/'))).toHaveLength(1)
    expect(calls.filter(url => url.pathname.includes('/benefits/')).map(url => url.searchParams.get('page'))).toEqual(['1', '2', '1'])
  })

  it('descarta una página tardía y retira las tarjetas al revocarse el catálogo', async () => {
    let finish!: (value: Response) => void
    let signal!: AbortSignal
    let enabled = true
    const calls: URL[] = []
    vi.stubGlobal('fetch', vi.fn((input: URL | RequestInfo, init?: RequestInit) => {
      const url = new URL(String(input)); calls.push(url)
      if (url.pathname.endsWith('/config/')) return Promise.resolve(json({ enabled }))
      if (url.pathname.endsWith('/categories/')) return Promise.resolve(json({ results: [] }))
      if (url.searchParams.get('page') === '2') { signal = init?.signal as AbortSignal; return new Promise<Response>(resolve => { finish = resolve }) }
      return Promise.resolve(json(page(offers)))
    }))
    render(<HomePage />)
    await screen.findByRole('heading', { name: 'Destacado 1' })
    fireEvent.click(screen.getByRole('button', { name: 'Beneficio anterior' }))
    await waitFor(() => expect(finish).toBeTypeOf('function'))
    fireEvent.click(screen.getByRole('button', { name: 'Beneficio siguiente' }))
    await screen.findByRole('heading', { name: 'Destacado 1' })
    expect(signal.aborted).toBe(true)
    await act(async () => finish(json(page(offers, 2))))
    expect(screen.queryByText('Destacado 27')).toBeNull()
    enabled = false
    fireEvent(window, new Event('focus'))
    expect(screen.queryByRole('article')).toBeNull()
    await screen.findByText('El catálogo general no está disponible ahora.')
    expect(screen.queryByRole('article')).toBeNull()
    expect(calls.every(url => !url.pathname.includes('/me/'))).toBe(true)
  })

  it.each(['404', 'reducción'])('recupera una página retirada por %s sin bucles ni tarjetas viejas', async mode => {
    let items = offers
    let removed = false
    const calls = api(url => url.searchParams.get('page') === '2' && removed && mode === '404'
      ? json({}, 404) : json(page(items, Number(url.searchParams.get('page')))))
    render(<HomePage />)
    await screen.findByRole('heading', { name: 'Destacado 1' })
    fireEvent.click(screen.getByRole('button', { name: 'Beneficio anterior' }))
    await screen.findByRole('heading', { name: 'Destacado 27' })
    removed = true; items = mode === '404' ? [offer(1)] : offers.slice(0, 25)
    fireEvent(window, new Event('focus'))
    expect(screen.queryByText('Destacado 27')).toBeNull()
    await screen.findByRole('heading', { name: mode === '404' ? 'Destacado 1' : 'Destacado 25' })
    expect(calls.filter(url => url.pathname.includes('/benefits/')).length).toBeLessThanOrEqual(4)
  })

  it('no hereda ofertas comunes si no hay destacados y permite reintentar errores', async () => {
    let failed = true
    api(url => url.searchParams.get('featured') === 'true'
      ? failed ? json({}, 503) : json(page([]))
      : json(page([{ ...offer(0), title: 'Oferta común' }])))
    render(<HomePage />)
    await screen.findByRole('alert')
    failed = false
    fireEvent.click(screen.getByRole('button', { name: 'Volver a intentar' }))
    await screen.findByText('Pronto habrá nuevas ideas para tu visita.')
    expect(screen.queryByRole('article')).toBeNull()
    expect(screen.getByRole('link', { name: 'Ver todos los beneficios' }).getAttribute('href')).toBe('/beneficios')
  })

  it('termina la recuperación si también se retira la primera página', async () => {
    let removed = false
    const calls = api(url => removed ? json({}, 404) : json(page(offers, Number(url.searchParams.get('page')))))
    render(<HomePage />)
    await screen.findByRole('heading', { name: 'Destacado 1' })
    fireEvent.click(screen.getByRole('button', { name: 'Beneficio anterior' }))
    await screen.findByRole('heading', { name: 'Destacado 27' })
    removed = true
    fireEvent(window, new Event('focus'))
    expect(screen.queryByRole('article')).toBeNull()
    await screen.findByText('El catálogo general no está disponible ahora.')
    expect(calls.filter(url => url.pathname.includes('/benefits/')).map(url => url.searchParams.get('page'))).toEqual(['1', '2', '2', '1'])
    expect(screen.queryByRole('button', { name: 'Beneficio siguiente' })).toBeNull()
  })
})
