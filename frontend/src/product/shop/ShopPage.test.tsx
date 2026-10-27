import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { ShopDetail, ShopPage } from './ShopPage'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('catálogo visual de tienda', () => {
  it('muestra ejemplos, valores y segunda página sin llamar a API ni comprar', () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    render(<ShopPage />)
    expect(screen.getByText(/Productos, ilustraciones y valores de ejemplo/)).toBeTruthy()
    expect(screen.getAllByRole('article')).toHaveLength(6)
    expect(screen.getByText('Página 1 de 2')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente →' }))
    expect(screen.getByText('Página 2 de 2')).toBeTruthy()
    expect(screen.getAllByRole('article')).toHaveLength(3)
    expect(screen.getByRole('heading', { name: 'Pingüino nieve' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Pingüino del sur' })).toBeNull()
    expect((screen.getByRole('button', { name: 'Siguiente →' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: '← Anterior' }))
    expect(screen.getByRole('heading', { name: 'Pingüino del sur' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /comprar|canjear|carrito/i })).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('restaura la primera página al filtrar y combina categoría con búsqueda sin acentos', () => {
    render(<ShopPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente →' }))
    fireEvent.click(screen.getByRole('button', { name: 'Recuerdos' }))
    expect(screen.getByText('Página 1 de 1')).toBeTruthy()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar un producto' }), { target: { value: ' PINGUINO ' } })
    expect(screen.getAllByRole('article')).toHaveLength(2)
    expect(screen.getByRole('status').textContent).toBe('2 productos de ejemplo')
    fireEvent.click(screen.getByRole('button', { name: 'Para tu casa' }))
    expect(screen.queryAllByRole('article')).toHaveLength(0)
    expect(screen.getByRole('heading', { name: 'No encontramos ese recuerdo.' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Ver todos los productos' }))
    expect(screen.getAllByRole('article')).toHaveLength(6)
    expect(screen.getByRole('status').textContent).toBe('9 productos de ejemplo')
  })

  it.each(['Menor precio', 'Menos créditos'])('ordena por %s y conserva enlaces de detalle', label => {
    render(<ShopPage />)
    fireEvent.change(screen.getByRole('combobox', { name: 'Ordenar por' }), { target: { value: label === 'Menor precio' ? 'price' : 'credits' } })
    const first = screen.getAllByRole('article')[0]
    expect(within(first).getByRole('heading', { name: 'Llavero fin del mundo' })).toBeTruthy()
    expect(within(first).getByRole('link', { name: /Conocer el producto/ }).getAttribute('href')).toBe('/tienda/llavero-fin-del-mundo')
  })

  it('ofrece detalle ilustrativo y una salida para una URL inexistente sin transacciones', () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const view = render(<ShopDetail slug="faro-del-beagle" />)
    expect(screen.getByRole('heading', { name: 'Faro del Beagle' })).toBeTruthy()
    expect(screen.getByText('14 × 6 × 6 cm')).toBeTruthy()
    expect(screen.getByText(/La compra y el canje con créditos estarán disponibles/)).toBeTruthy()
    expect(screen.getByRole('img', { name: /Ilustración de ejemplo/ })).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
    view.rerender(<ShopDetail slug="producto-inexistente" />)
    expect(screen.getByRole('heading', { name: 'No encontramos ese producto.' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Volver a la tienda' }).getAttribute('href')).toBe('/tienda')
    expect(fetch).not.toHaveBeenCalled()
  })
})
