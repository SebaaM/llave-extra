import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { setAccessToken } from './api'
import { BenefitDetail, CatalogPage } from './CatalogPages'
import { HomePage } from './HomePage'
import { NetworkCanvas } from './NetworkCanvas'
import ProductApp from './ProductApp'
import userEvent from '@testing-library/user-event'

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
    render(<CatalogPage search="" />)
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
    window.history.replaceState({}, '', '/beneficios')
    vi.stubGlobal('fetch', vi.fn(async (input: URL | RequestInfo) => {
      const url = String(input)
      if (url.endsWith('/catalog/config/')) return json({ enabled: true })
      if (url.endsWith('/catalog/categories/')) return json({ results: ['Gastronomía'] })
      if (!url.includes('/catalog/benefits/')) return json({}, 404)
      requested.push(url)
      const page = Number(new URL(url).searchParams.get('page'))
      return json({ count: 2, previous: page === 1 ? null : 'prev', next: page === 1 ? 'next' : null, results: [{ ...benefit, id: `b${page}`, title: `Propuesta ${page}` }] })
    }))
    render(<ProductApp />)
    await screen.findByText('Propuesta 1')
    fireEvent.click(await screen.findByRole('button', { name: 'Gastronomía' }))
    fireEvent.change(screen.getByLabelText('Buscar beneficio o prestador'), { target: { value: '  Kuar  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }))
    await waitFor(() => expect(requested.some(url => url.includes('search=Kuar') && url.includes('category=Gastronom%C3%ADa'))).toBe(true))
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente →' }))
    await screen.findByText('Propuesta 2')
    expect(requested.at(-1)).toContain('page=2')
    expect(window.location.search).toContain('page=2')
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
    render(<CatalogPage search="" />)
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
    expect(within(board as HTMLElement).getAllByRole('button')).toHaveLength(6)
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
    const node = screen.getByRole('button', { name: /Kuar: Beneficio vigente/ })
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


describe('exploración visual del catálogo', () => {
  it('restaura URL directa e historial y conserva categoría con espacios al reiniciar y limpiar', async () => {
    const requested: URL[] = []
    window.history.replaceState({}, '', '/beneficios?search=puerto&category=+Comida+&page=3')
    vi.stubGlobal('fetch', vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input))
      if (url.pathname.endsWith('/config/')) return json({ enabled: true })
      if (url.pathname.endsWith('/categories/')) return json({ results: [' Comida ', 'Paseos'] })
      if (!url.pathname.includes('/catalog/benefits/')) return json({}, 404)
      requested.push(url)
      return json({ count: 90, next: 'next', previous: 'prev', results: [benefit] })
    }))
    render(<ProductApp />)
    const input = await screen.findByLabelText('Buscar beneficio o prestador') as HTMLInputElement
    await screen.findByText(benefit.title)
    expect(input.value).toBe('puerto')
    expect(requested[0].searchParams.get('category')).toBe(' Comida ')
    expect(requested[0].searchParams.get('page')).toBe('3')
    fireEvent.change(input, { target: { value: '  nuevo  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }))
    await waitFor(() => expect(requested.at(-1)?.searchParams.get('search')).toBe('nuevo'))
    expect(requested.at(-1)?.searchParams.get('page')).toBe('1')
    expect(requested.at(-1)?.searchParams.get('category')).toBe(' Comida ')
    await screen.findByRole('button', { name: 'Paseos' })
    fireEvent.change(screen.getByLabelText('Buscar beneficio o prestador'), { target: { value: 'borrador sin aplicar' } })
    fireEvent.click(screen.getByRole('button', { name: 'Paseos' }))
    await waitFor(() => expect(requested.at(-1)?.searchParams.get('category')).toBe('Paseos'))
    expect((screen.getByLabelText('Buscar beneficio o prestador') as HTMLInputElement).value).toBe('nuevo')
    window.history.back()
    await waitFor(() => expect((screen.getByRole('button', { name: 'Comida' })).getAttribute('aria-pressed')).toBe('true'))
    window.history.forward()
    await waitFor(() => expect((screen.getByRole('button', { name: 'Paseos' })).getAttribute('aria-pressed')).toBe('true'))
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }))
    await waitFor(() => expect(window.location.search).toBe(''))
    expect((screen.getByLabelText('Buscar beneficio o prestador') as HTMLInputElement).value).toBe('')
    expect(requested.at(-1)?.searchParams.get('category')).toBeNull()
    expect(requested.at(-1)?.searchParams.get('page')).toBe('1')
  })

  it('mantiene un filtro retirado visible y recupera categorías sin impedir la búsqueda', async () => {
    let categoryFailure = true
    const requested: URL[] = []
    window.history.replaceState({}, '', '/beneficios?category=Retirada')
    vi.stubGlobal('fetch', vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input))
      if (url.pathname.endsWith('/config/')) return json({ enabled: true })
      if (url.pathname.endsWith('/categories/')) return categoryFailure ? json({}, 503) : json({ results: ['Paseos'] })
      if (!url.pathname.includes('/catalog/benefits/')) return json({}, 404)
      requested.push(url)
      return json({ count: 0, next: null, previous: null, results: [] })
    }))
    render(<ProductApp />)
    await screen.findByText('No encontramos beneficios para esta búsqueda.')
    await screen.findByRole('button', { name: 'Reintentar categorías' })
    expect(screen.getByRole('button', { name: /Quitar categoría: Retirada/ })).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Buscar beneficio o prestador'), { target: { value: 'té' } })
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }))
    await waitFor(() => expect(requested.at(-1)?.searchParams.get('search')).toBe('té'))
    categoryFailure = false
    fireEvent.click(await screen.findByRole('button', { name: 'Reintentar categorías' }))
    await screen.findByRole('button', { name: 'Paseos' })
    expect(screen.getByRole('button', { name: /Retirada.*filtro guardado/ }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: /Quitar categoría: Retirada/ }))
    await waitFor(() => expect(requested.at(-1)?.searchParams.get('category')).toBeNull())
  })

  it.each([true, false])('recupera el 404 de página con catálogo enabled=%s', async enabled => {
    let configs = 0
    vi.stubGlobal('fetch', vi.fn(async (input: URL | RequestInfo) => {
      const url = String(input)
      if (url.endsWith('/config/')) return json({ enabled: ++configs === 1 ? true : enabled })
      if (url.endsWith('/categories/')) return json({ results: [] })
      return json({ detail: 'Página inválida.' }, 404)
    }))
    render(<CatalogPage search="?page=9" />)
    if (enabled) {
      await screen.findByRole('heading', { name: 'Esta página ya no existe.' })
      expect(screen.getByRole('link', { name: 'Volver a la página 1' }).getAttribute('href')).toBe('/beneficios')
      expect(screen.queryByText('El catálogo general no está disponible ahora.')).toBeNull()
    } else await screen.findByText('El catálogo general no está disponible ahora.')
  })

  it('ofrece dirección seleccionable si falla copiar, sin exponer URLs inválidas y retira la ficha al apagarse', async () => {
    let enabled = true
    const writeText = vi.fn().mockRejectedValue(new Error('Sin permiso'))
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    vi.stubGlobal('fetch', vi.fn(async (input: URL | RequestInfo) => String(input).endsWith('/config/')
      ? json({ enabled })
      : json({ ...benefit, provider: { ...provider, address: 'San Martín 123', hours: '10 a 18', website: 'javascript:alert(1)', map_url: 'data:text/html,peligro' } })))
    render(<BenefitDetail id="b1" />)
    await screen.findByRole('heading', { name: benefit.title })
    expect(writeText).not.toHaveBeenCalled()
    expect(screen.getByText('10% de descuento en consumo')).toBeTruthy()
    expect(screen.getByText(/DATO DEMO/)).toBeTruthy()
    expect(screen.getByLabelText('Kuar')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Cómo usarlo' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Dónde encontrarlo' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: /Sitio del prestador|Ver mapa/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Copiar dirección' }))
    await screen.findByText('No pudimos copiar la dirección. Podés seleccionar y copiar el texto.')
    expect(writeText).toHaveBeenCalledWith('San Martín 123')
    expect(screen.getByText('San Martín 123')).toBeTruthy()
    enabled = false
    fireEvent(window, new Event('focus'))
    expect(screen.queryByText('San Martín 123')).toBeNull()
    await screen.findByRole('heading', { name: 'Este beneficio no está disponible.' })
  })
})


it('presenta textos extensos completos y confirma copia con enlaces HTTP seguros', async () => {
  const description = 'Una propuesta para descubrir la ciudad. '.repeat(25)
  const conditions = 'Consultá disponibilidad en el local antes de usar este beneficio. '.repeat(20)
  const writeText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
  vi.stubGlobal('fetch', vi.fn(async (input: URL | RequestInfo) => String(input).endsWith('/config/')
    ? json({ enabled: true })
    : json({ ...benefit, description, conditions, provider: { ...provider, address: 'Avenida de ejemplo 456', website: 'https://ejemplo.test/sitio', map_url: 'https://ejemplo.test/mapa' } })))
  render(<BenefitDetail id="b1" />)
  await screen.findByRole('heading', { name: benefit.title })
  expect(screen.getByText(description.trim())).toBeTruthy()
  expect(screen.getByText(conditions.trim())).toBeTruthy()
  const map = screen.getByRole('link', { name: /Ver mapa del prestador/ })
  expect(map.getAttribute('href')).toBe('https://ejemplo.test/mapa')
  expect(map.getAttribute('rel')).toBe('noopener noreferrer')
  expect(screen.getByRole('link', { name: /Sitio del prestador/ }).getAttribute('href')).toBe('https://ejemplo.test/sitio')
  fireEvent.click(screen.getByRole('button', { name: 'Copiar dirección' }))
  await screen.findByText('Dirección copiada.')
  expect(writeText).toHaveBeenCalledTimes(1)
})


it('conserva el campo y su foco al buscar con Enter y sincroniza URL sin recuperar borradores', async () => {
  const requested: URL[] = []
  const user = userEvent.setup()
  window.history.replaceState({}, '', '/beneficios?search=puerto&category=+Comida+&page=3')
  vi.stubGlobal('fetch', vi.fn(async (input: URL | RequestInfo) => {
    const url = new URL(String(input))
    if (url.pathname.endsWith('/config/')) return json({ enabled: true })
    if (url.pathname.endsWith('/categories/')) return json({ results: [' Comida '] })
    if (!url.pathname.includes('/catalog/benefits/')) return json({}, 404)
    requested.push(url)
    return json({ count: 90, next: 'next', previous: 'prev', results: [benefit] })
  }))
  render(<ProductApp />)
  await screen.findByText(benefit.title)
  const input = screen.getByLabelText('Buscar beneficio o prestador') as HTMLInputElement
  await user.clear(input)
  await user.type(input, '  nuevo  ')
  await user.keyboard('{Enter}')
  await waitFor(() => expect(requested.at(-1)?.searchParams.get('search')).toBe('nuevo'))
  expect(document.activeElement).toBe(input)
  expect(screen.getByLabelText('Buscar beneficio o prestador')).toBe(input)
  expect(input.value).toBe('nuevo')
  expect(requested.at(-1)?.searchParams.get('page')).toBe('1')
  expect(requested.at(-1)?.searchParams.get('category')).toBe(' Comida ')
  await user.type(input, ' borrador')
  window.history.back()
  await waitFor(() => expect(input.value).toBe('puerto'))
  expect(document.activeElement).toBe(input)
  window.history.forward()
  await waitFor(() => expect(input.value).toBe('nuevo'))
  expect(document.activeElement).toBe(input)
  expect(screen.getByLabelText('Buscar beneficio o prestador')).toBe(input)
  await user.clear(input)
  await user.type(input, '  nuevo  ')
  await user.keyboard('{Enter}')
  expect(input.value).toBe('nuevo')
  expect(document.activeElement).toBe(input)
})
