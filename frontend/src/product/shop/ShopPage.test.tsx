import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { ApiError } from '../api'
import { ShopDetail, ShopPage } from './ShopPage'

const { mockApi } = vi.hoisted(() => ({ mockApi: vi.fn() }))
vi.mock('../api', async importOriginal => ({ ...await importOriginal<typeof import('../api')>(), api: mockApi }))
const id = '550e8400-e29b-41d4-a716-446655440000'
const product = { id, name: 'Faro austral', description: 'Un recuerdo', category: { id: 'cat-1', name: 'Recuerdos' }, stock: 0, price_money: null, price_credits: 250, image_url: null }
const catalog = { categories: [{ id: 'cat-1', name: 'Recuerdos' }, { id: 'cat-2', name: 'Otra categoría' }], pickup: { name: 'Punto', address: 'Calle 1', hours: 'Lunes' } }
const page = (results = [product], count = 1, next: string | null = null, previous: string | null = null) => ({ results, count, next, previous })

beforeEach(() => {
  mockApi.mockReset()
  mockApi.mockImplementation((path: string) => Promise.resolve(path === '/api/v1/shop/catalog/' ? catalog : page()))
})
afterEach(() => cleanup())

describe('catálogo real de tienda', () => {
  it('presenta productos y categorías del servidor, precios disponibles y retiro sin operaciones de compra', async () => {
    render(<ShopPage />)
    const card = await screen.findByRole('article')
    expect(within(card).getByRole('heading', { name: 'Faro austral' })).toBeTruthy()
    expect(within(card).getByText('Sin stock')).toBeTruthy()
    expect(within(card).getByText('250 créditos')).toBeTruthy()
    expect(within(card).getByLabelText('Imagen no disponible')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Otra categoría' })).toBeTruthy()
    expect(screen.getByText('Punto · Calle 1')).toBeTruthy()
    expect(screen.getByText(/La compra y el canje con créditos todavía no están habilitados/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /comprar|canjear|carrito/i })).toBeNull()
    expect(mockApi.mock.calls.every(([path]) => path.startsWith('/api/v1/shop/'))).toBe(true)
  })

  it('envía filtros, orden y página al servidor y vuelve a la primera página al cambiar un filtro', async () => {
    mockApi.mockImplementation((path: string) => Promise.resolve(path === '/api/v1/shop/catalog/' ? catalog : page([product], 8, 'next')))
    render(<ShopPage />)
    await screen.findByRole('article')
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente →' }))
    await waitFor(() => expect(mockApi.mock.calls.some(([path]) => path.includes('page=2'))).toBe(true))
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar un producto' }), { target: { value: 'faro' } })
    fireEvent.click(screen.getByRole('button', { name: 'Recuerdos' }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Ordenar por' }), { target: { value: '-price_credits' } })
    await waitFor(() => expect(mockApi.mock.calls.some(([path]) => path.includes('page=1') && path.includes('search=faro') && path.includes('category=cat-1') && path.includes('ordering=-price_credits'))).toBe(true))
  })

  it('recupera una página que dejó de existir y permite reintentar errores', async () => {
    let removed = false
    mockApi.mockImplementation((path: string) => {
      if (path === '/api/v1/shop/catalog/') return Promise.resolve(catalog)
      if (path.includes('page=2') && removed) return Promise.reject(new ApiError(404, 'No existe'))
      if (path.includes('page=2')) return Promise.resolve(page([product], 7, null, 'previous'))
      return Promise.resolve(page([product], removed ? 1 : 7, removed ? null : 'next'))
    })
    render(<ShopPage />)
    await screen.findByRole('article')
    removed = true
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente →' }))
    await screen.findByText('Página 1 de 1')
    expect(mockApi.mock.calls.some(([path]) => path.includes('page=2'))).toBe(true)
  })

  it('distingue error temporal, detalle real y enlaces históricos', async () => {
    mockApi.mockRejectedValueOnce(new Error('red'))
    const view = render(<ShopDetail slug={id} />)
    expect(await screen.findByRole('heading', { name: 'No pudimos cargar el producto.' })).toBeTruthy()
    mockApi.mockResolvedValueOnce(product)
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByRole('heading', { name: 'Faro austral' })).toBeTruthy()
    expect(screen.getByText('Sin stock')).toBeTruthy()
    view.rerender(<ShopDetail slug="faro-del-beagle" />)
    expect(await screen.findByRole('heading', { name: 'No encontramos ese producto.' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Volver a la tienda' }).getAttribute('href')).toBe('/tienda')
  })
})
