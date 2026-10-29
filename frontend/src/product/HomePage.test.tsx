import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HomePage } from './HomePage'
import { defaultSiteSettings } from './useSiteSettings'

const catalog = vi.hoisted(() => ({ enabled: true as boolean | null, data: { results: [{ id: 'b1', title: 'Una pausa local', description: '', conditions: 'Presentar el beneficio antes de pedir.', valid_from: null, valid_until: null, demo: true, image_url: null, provider: { id: 'p1', slug: 'local', name: 'Local de ejemplo', category: 'Café', description: '', address: '', hours: '', contact: '', map_url: '', website: '', demo: true, image_url: null } }] }, loading: false, error: '', retry: vi.fn() }))
vi.mock('./usePublicCatalog', () => ({ usePublicCatalog: () => catalog }))
vi.mock('./useCatalogCategories', () => ({ useCatalogCategories: () => ({ categories: [' Café ', 'Paseos'], error: '', loading: false, retry: vi.fn() }) }))
vi.mock('./NetworkCanvas', () => ({ NetworkCanvas: () => null }))
afterEach(() => { cleanup(); catalog.enabled = true; catalog.data.results = [catalog.data.results[0]].filter(Boolean) })

describe('Inicio', () => {
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
    expect(screen.getAllByText(/Dato demo/).length).toBeGreaterThan(0)
    expect(screen.getAllByText('Presentar el beneficio antes de pedir.').length).toBeGreaterThan(0)
  })
  it.each([false, null])('retira selector y destacado si el catálogo no está vigente: %s', enabled => {
    catalog.enabled = enabled
    render(<HomePage />)
    expect(screen.queryByRole('group', { name: 'Categorías de beneficios' })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Una pausa local' })).toBeNull()
    if (enabled === false) expect(screen.getByRole('link', { name: 'Ingresar con QR' })).toBeTruthy()
  })
  it('retira selector y destacado sin resultados y ofrece QR', () => {
    const previous = catalog.data.results
    catalog.data.results = []
    render(<HomePage />)
    expect(screen.queryByRole('group', { name: 'Categorías de beneficios' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Ingresar con QR' })).toBeTruthy()
    catalog.data.results = previous
  })
})
