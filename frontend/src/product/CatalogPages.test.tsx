import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { setAccessToken } from './api'
import { BenefitDetail, CatalogPage } from './CatalogPages'
import { HomePage } from './HomePage'
import { NetworkCanvas } from './NetworkCanvas'

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })
const provider = { id: 'p1', slug: 'kuar', name: 'Kuar', category: 'Gastronomía', description: '', address: '', hours: '', contact: '', map_url: '', website: '', demo: true, image_url: null }
const benefit = { id: 'b1', title: 'Beneficio informado en fuente pública', description: '', conditions: '10% de descuento en consumo', valid_from: null, valid_until: null, demo: true, image_url: null, provider }
const presentation = { title: 'La red de Ushuaia', layout: 'RADIAL', theme: 'SAND', background: 'BEAGLE', page_size: 12, interval_seconds: 10, city: 'Ushuaia' }

beforeEach(() => {
  window.history.replaceState({}, '', '/')
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
  setAccessToken('token-que-no-debe-salir')
})
afterEach(() => { cleanup(); setAccessToken(null); vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('catálogo público', () => {
  it('muestra la condición real en la portada y no envía JWT en las consultas públicas', async () => {
    const requests: Array<{ url: string; headers: Headers }> = []
    vi.stubGlobal('fetch', vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = String(input)
      requests.push({ url, headers: new Headers(init?.headers) })
      if (url.endsWith('/catalog/config/')) return json({ enabled: true })
      if (url.includes('/catalog/benefits/')) return json({ count: 1, next: null, previous: null, results: [benefit] })
      if (url.includes('/catalog/network/')) return json({ count: 0, next: null, previous: null, presentation, results: [] })
      return json({ detail: 'No encontrado' }, 404)
    }))
    render(<HomePage />)
    expect((await screen.findAllByText('10% de descuento en consumo')).length).toBeGreaterThanOrEqual(2)
    expect(screen.getAllByText(/Dato demo/).length).toBeGreaterThanOrEqual(2)
    expect(screen.getByRole('link', { name: /Explorar beneficios/ })).toBeTruthy()
    expect(requests.filter(item => item.url.includes('/catalog/')).every(item => !item.headers.has('Authorization'))).toBe(true)
  })

  it('retira las ofertas cuando el administrador apaga el catálogo al volver a la pestaña', async () => {
    let enabled = true
    vi.stubGlobal('fetch', vi.fn(async (input: URL | RequestInfo) => {
      const url = String(input)
      if (url.endsWith('/catalog/config/')) return json({ enabled })
      if (url.includes('/catalog/benefits/')) return json({ count: 1, next: null, previous: null, results: [benefit] })
      return json({ detail: 'No encontrado' }, 404)
    }))
    render(<CatalogPage />)
    await screen.findByText('10% de descuento en consumo')
    enabled = false
    fireEvent(window, new Event('focus'))
    await screen.findByText('El catálogo general no está disponible ahora.')
    expect(screen.queryByText('10% de descuento en consumo')).toBeNull()
  })

  it('abre el detalle público con condiciones, fechas calendario y enlaces seguros', async () => {
    const calls: Array<{ url: string; headers: Headers }> = []
    vi.stubGlobal('fetch', vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = String(input); calls.push({ url, headers: new Headers(init?.headers) })
      if (url.endsWith('/catalog/config/')) return json({ enabled: true })
      if (url.endsWith('/catalog/benefits/b1/')) return json({ ...benefit, valid_until: '2026-10-19', provider: { ...provider, website: 'javascript:alert(1)' } })
      return json({ detail: 'No encontrado' }, 404)
    }))
    render(<BenefitDetail id="b1" />)
    await screen.findByRole('heading', { name: benefit.title })
    expect(screen.getByText('10% de descuento en consumo')).toBeTruthy()
    expect(screen.getByText(/19 de octubre de 2026/)).toBeTruthy()
    expect(screen.getByText(/DATO DEMO/)).toBeTruthy()
    expect(screen.queryByRole('link', { name: /Sitio del prestador/ })).toBeNull()
    expect(calls.every(item => !item.headers.has('Authorization'))).toBe(true)
  })

  it('busca en todo el catálogo, filtra por categoría y pagina según el servidor', async () => {
    const requested: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (input: URL | RequestInfo) => {
      const url = String(input)
      if (url.endsWith('/catalog/config/')) return json({ enabled: true })
      requested.push(url)
      const page = Number(new URL(url).searchParams.get('page'))
      return json({ count: 2, previous: page === 1 ? null : 'prev', next: page === 1 ? 'next' : null, results: [{ ...benefit, id: `b${page}`, title: `Propuesta ${page}` }] })
    }))
    render(<CatalogPage />)
    await screen.findByText('Propuesta 1')
    fireEvent.change(screen.getByLabelText('Buscar beneficio o prestador'), { target: { value: 'Kuar' } })
    fireEvent.change(screen.getByLabelText('Categoría exacta'), { target: { value: 'Gastronomía' } })
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }))
    await waitFor(() => expect(requested.some(url => url.includes('search=Kuar') && url.includes('category=Gastronom%C3%ADa'))).toBe(true))
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente →' }))
    await screen.findByText('Propuesta 2')
    expect(requested.at(-1)).toContain('page=2')
    expect(screen.getByText('Página 2 · 2 beneficios')).toBeTruthy()
  })

  it('muestra error recuperable y vacío real sin ofertas inventadas', async () => {
    let failing = true
    vi.stubGlobal('fetch', vi.fn(async (input: URL | RequestInfo) => {
      const url = String(input)
      if (url.endsWith('/catalog/config/')) return json({ enabled: true })
      if (failing) return json({ detail: 'Servicio temporalmente fuera de línea' }, 503)
      return json({ count: 0, next: null, previous: null, results: [] })
    }))
    render(<CatalogPage />)
    await screen.findByRole('alert')
    failing = false
    fireEvent.click(screen.getByRole('button', { name: 'Volver a intentar' }))
    await screen.findByText('No encontramos beneficios para esta búsqueda.')
    expect(screen.queryByRole('link', { name: /Ver beneficio y condiciones/ })).toBeNull()
  })

  it('mantiene 12 slots y el mismo tablero al pasar a la última página incompleta', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: URL | RequestInfo) => {
      const page = Number(new URL(String(input)).searchParams.get('page'))
      const count = page === 3 ? 6 : 12
      return json({ count: 30, previous: page === 1 ? null : 'prev', next: page === 3 ? null : 'next', presentation, results: Array.from({ length: count }, (_, index) => ({ provider: { ...provider, id: `p${page}-${index}`, name: `Local ${page}-${index}` }, benefit_id: `b${page}-${index}`, benefit_title: 'Beneficio vigente' })) })
    }))
    const { container } = render(<NetworkCanvas />)
    await screen.findByText('Local 1-0')
    const board = container.querySelector('.network-board')
    fireEvent.click(screen.getByRole('button', { name: 'Página siguiente' }))
    await screen.findByText('Local 2-0')
    fireEvent.click(screen.getByRole('button', { name: 'Página siguiente' }))
    await screen.findByText('Local 3-0')
    expect(container.querySelector('.network-board')).toBe(board)
    expect(container.querySelectorAll('.network-slot')).toHaveLength(12)
    expect(within(board as HTMLElement).getAllByRole('link')).toHaveLength(6)
    await waitFor(() => expect(screen.getByText('Página 3 de 3 · 30 prestadores')).toBeTruthy())
  })

  it('distribuye ocho prestadores en ocho posiciones alrededor del centro', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ count: 8, previous: null, next: null, presentation, results: Array.from({ length: 8 }, (_, index) => ({ provider: { ...provider, id: `p${index}`, name: `Local ${index}` }, benefit_id: `b${index}`, benefit_title: 'Beneficio vigente' })) })))
    const { container } = render(<NetworkCanvas />)
    await screen.findByText('Local 0')
    const slots = Array.from(container.querySelectorAll<HTMLElement>('.network-slot'))
    expect(slots).toHaveLength(8)
    expect(new Set(slots.map(slot => slot.style.left)).size).toBeGreaterThan(3)
    expect(new Set(slots.map(slot => slot.style.top)).size).toBeGreaterThan(3)
  })

  it('conserva foto, presentación y tablero mientras carga otra página', async () => {
    let finish!: (response: Response) => void
    const harbor = { ...presentation, background: 'HARBOR', title: 'Puerto de Ushuaia' }
    vi.stubGlobal('fetch', vi.fn((input: URL | RequestInfo) => {
      const page = Number(new URL(String(input)).searchParams.get('page'))
      if (page === 2) return new Promise<Response>(resolve => { finish = resolve })
      return Promise.resolve(json({ count: 24, previous: null, next: 'next', presentation: harbor, results: [{ provider: { ...provider, name: 'Local 1' }, benefit_id: 'b1', benefit_title: 'Vigente' }] }))
    }))
    const { container } = render(<NetworkCanvas />)
    await screen.findByText('Local 1')
    const board = container.querySelector('.network-board')
    const scene = container.querySelector<HTMLElement>('.network-scene')!
    expect(scene.style.backgroundImage).toContain('ushuaia-harbor.jpg')
    fireEvent.click(screen.getByRole('button', { name: 'Página siguiente' }))
    await waitFor(() => expect(finish).toBeTypeOf('function'))
    expect(container.querySelector('.network-board')).toBe(board)
    expect(scene.style.backgroundImage).toContain('ushuaia-harbor.jpg')
    expect(screen.getByRole('heading', { name: 'Puerto de Ushuaia' })).toBeTruthy()
    await act(async () => finish(json({ count: 24, previous: 'prev', next: null, presentation: harbor, results: [{ provider: { ...provider, name: 'Local 2' }, benefit_id: 'b2', benefit_title: 'Vigente' }] })))
    await screen.findByText('Local 2')
  })

  it('avanza automáticamente y suspende el temporizador con pausa, hover, foco, pestaña oculta y movimiento reducido', async () => {
    const originalTimeout = window.setTimeout.bind(window)
    const originalClear = window.clearTimeout.bind(window)
    const scheduled: Array<() => void> = []
    const cleared: number[] = []
    vi.spyOn(window, 'setTimeout').mockImplementation(((handler: TimerHandler, delay?: number, ...args: unknown[]) => {
      if (delay === 10000) { scheduled.push(handler as () => void); return 987 }
      return originalTimeout(handler, delay, ...args)
    }) as typeof window.setTimeout)
    vi.spyOn(window, 'clearTimeout').mockImplementation((id?: number) => { if (id === 987) cleared.push(id); else originalClear(id) })
    let motionChange: (() => void) | undefined
    let reduced = false
    vi.stubGlobal('matchMedia', vi.fn(() => ({ get matches() { return reduced }, addEventListener: (_: string, callback: () => void) => { motionChange = callback }, removeEventListener: vi.fn() })))
    vi.stubGlobal('fetch', vi.fn(async (input: URL | RequestInfo) => {
      const page = Number(new URL(String(input)).searchParams.get('page'))
      return json({ count: 24, previous: page === 1 ? null : 'prev', next: page === 1 ? 'next' : null, presentation, results: [{ provider: { ...provider, id: `p${page}`, name: `Local ${page}` }, benefit_id: `b${page}`, benefit_title: 'Beneficio vigente' }] })
    }))
    const { container } = render(<NetworkCanvas />)
    await screen.findByText('Local 1')
    await waitFor(() => expect(scheduled).toHaveLength(1))
    const section = container.querySelector('.network-section') as HTMLElement
    fireEvent.mouseEnter(section)
    expect(cleared).toHaveLength(1)
    fireEvent.mouseLeave(section)
    expect(scheduled).toHaveLength(2)
    fireEvent.focus(section)
    expect(cleared).toHaveLength(2)
    fireEvent.blur(section, { relatedTarget: document.body })
    expect(scheduled).toHaveLength(3)
    fireEvent.click(screen.getByRole('button', { name: 'Pausar' }))
    expect(cleared).toHaveLength(3)
    fireEvent.click(screen.getByRole('button', { name: 'Reanudar' }))
    expect(scheduled).toHaveLength(4)
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
    fireEvent(document, new Event('visibilitychange'))
    expect(cleared).toHaveLength(4)
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    fireEvent(document, new Event('visibilitychange'))
    await waitFor(() => expect(scheduled.length).toBeGreaterThan(4))
    reduced = true
    act(() => motionChange?.())
    expect(cleared.length).toBeGreaterThan(4)
    reduced = false
    act(() => motionChange?.())
    const timer = scheduled.at(-1)!
    act(() => timer())
    await screen.findByText('Local 2')
  })

  it.each(['hover después del foco', 'foco después del hover'])('mantiene la pausa mientras hover y foco se solapan (%s)', async order => {
    const originalTimeout = window.setTimeout.bind(window)
    const originalClear = window.clearTimeout.bind(window)
    const scheduled: Array<() => void> = []
    vi.spyOn(window, 'setTimeout').mockImplementation(((handler: TimerHandler, delay?: number, ...args: unknown[]) => {
      if (delay === 10000) { scheduled.push(handler as () => void); return 654 }
      return originalTimeout(handler, delay, ...args)
    }) as typeof window.setTimeout)
    vi.spyOn(window, 'clearTimeout').mockImplementation((id?: number) => { if (id === 654) return; originalClear(id) })
    vi.stubGlobal('fetch', vi.fn(async () => json({ count: 24, previous: null, next: 'next', presentation, results: [{ provider, benefit_id: 'b1', benefit_title: 'Beneficio vigente' }] })))
    const { container } = render(<NetworkCanvas />)
    await screen.findByText('Kuar')
    await waitFor(() => expect(scheduled).toHaveLength(1))
    const section = container.querySelector('.network-section') as HTMLElement
    const node = screen.getByRole('link', { name: /Kuar: Beneficio vigente/ })
    if (order === 'hover después del foco') {
      node.focus()
      fireEvent.focus(node)
      fireEvent.mouseEnter(section)
    } else {
      fireEvent.mouseEnter(section)
      node.focus()
      fireEvent.focus(node)
    }
    expect(document.activeElement).toBe(node)
    expect(scheduled).toHaveLength(1)

    if (order === 'hover después del foco') {
      fireEvent.mouseLeave(section)
      expect(document.activeElement).toBe(node)
      expect(scheduled).toHaveLength(1)
      fireEvent.blur(node, { relatedTarget: document.body })
    } else {
      fireEvent.blur(node, { relatedTarget: document.body })
      expect(scheduled).toHaveLength(1)
      fireEvent.mouseLeave(section)
    }
    await waitFor(() => expect(scheduled).toHaveLength(2))
  })
})
