import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HomePage } from './HomePage'
import { defaultSiteSettings } from './useSiteSettings'

const catalog = vi.hoisted(() => ({ enabled: true as boolean | null, data: { results: [{ id: 'b1', title: 'Una pausa local', description: '', conditions: 'Presentar el beneficio antes de pedir.', valid_from: null, valid_until: null, demo: true, image_url: null, provider: { id: 'p1', slug: 'local', name: 'Local de ejemplo', category: 'Café', description: '', address: '', hours: '', contact: '', map_url: '', website: '', demo: true, image_url: null } }] }, loading: false, error: '', retry: vi.fn() }))
vi.mock('./usePublicCatalog', () => ({ usePublicCatalog: () => catalog }))
vi.mock('./useCatalogCategories', () => ({ useCatalogCategories: () => ({ categories: [' Café ', 'Paseos'], error: '', loading: false, retry: vi.fn() }) }))
vi.mock('./NetworkCanvas', () => ({ NetworkCanvas: () => <section aria-label="Red">Red de negocios</section> }))
const firstBenefit = catalog.data.results[0]
afterEach(() => { cleanup(); catalog.enabled = true; catalog.loading = false; catalog.data.results = [firstBenefit] })

describe('Inicio', () => {
  it('mantiene el orden Hero, Red, Recorrido, Próxima parada, Mapa y Pasaporte sin secciones extra', () => {
    render(<HomePage />)
    expect(Array.from(screen.getByRole('main').children).map(section => section.getAttribute('aria-label'))).toEqual(['Inicio', 'Red', 'En tu recorrido', 'Próxima parada', 'Mapa', 'Pasaporte'])
  })
  it('recorre beneficios con controles manuales y limpia la selección durante recarga y desactivación', () => {
    catalog.data.results = [firstBenefit, { ...firstBenefit, id: 'b2', title: 'Un paseo por el canal' }]
    const { rerender } = render(<HomePage />)
    fireEvent.click(screen.getByRole('button', { name: 'Beneficio siguiente' }))
    expect(screen.getByRole('heading', { name: 'Un paseo por el canal' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: firstBenefit.title })).toBeNull()
    expect(screen.getByRole('status', { name: 'Beneficio destacado actual' }).textContent).toContain('2 de 2')
    catalog.loading = true
    rerender(<HomePage />)
    expect(screen.queryByRole('region', { name: 'Beneficios destacados' })).toBeNull()
    catalog.loading = false
    rerender(<HomePage />)
    expect(screen.getByRole('heading', { name: firstBenefit.title })).toBeTruthy()
    catalog.enabled = false
    rerender(<HomePage />)
    expect(screen.queryByRole('region', { name: 'Beneficios destacados' })).toBeNull()
  })
  it('explica visitas con o sin recomendaciones y evita lenguaje técnico', () => {
    const { container } = render(<HomePage />)
    expect(container.textContent).not.toMatch(/colaborador|prestador|carpeta|servidor|referencia técnica/i)
    expect(screen.getByText(/Podés usar beneficios sin recibir recomendaciones/)).toBeTruthy()
  })
  it('abre el catálogo con la categoría exacta, incluso sus espacios', () => {
    const navigate = vi.fn()
    window.addEventListener('llave:navigate', navigate)
    render(<HomePage />)
    fireEvent.click(screen.getByRole('button', { name: 'Café' }))
    const event = navigate.mock.calls[0][0] as CustomEvent<string>
    expect(new URL(event.detail, window.location.origin).searchParams.get('category')).toBe(' Café ')
    window.removeEventListener('llave:navigate', navigate)
  })
  it('presenta la postal demo, condiciones y datos configurables', () => {
    render(<HomePage settings={{ ...defaultSiteSettings, home_title: 'Tu portada configurada', home_description: 'Un recorrido a tu ritmo.' }} />)
    expect(screen.getByRole('heading', { name: 'Una pausa local' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Tu portada configurada' })).toBeTruthy()
    expect(screen.getByText('Un recorrido a tu ritmo.')).toBeTruthy()
    expect(screen.getAllByText(/Ejemplo/).length).toBeGreaterThan(0)
    expect(screen.getAllByText('Presentar el beneficio antes de pedir.').length).toBeGreaterThan(0)
  })
  it.each([false, null])('retira selector y destacado si el catálogo no está vigente: %s', enabled => {
    catalog.enabled = enabled
    render(<HomePage />)
    expect(screen.queryByRole('group', { name: 'Categorías de beneficios' })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Una pausa local' })).toBeNull()
    if (enabled === false) expect(screen.getByRole('link', { name: 'Ingresar con QR' })).toBeTruthy()
  })
  it('conserva categorías completas aunque la página de beneficios esté vacía y ofrece QR', () => {
    const previous = catalog.data.results
    catalog.data.results = []
    render(<HomePage />)
    expect(screen.getByRole('group', { name: 'Categorías de beneficios' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Ingresar con QR' })).toBeTruthy()
    catalog.data.results = previous
  })
})
