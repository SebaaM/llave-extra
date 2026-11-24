import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { invalidatePrivateState, setAccessToken } from '../api'
import { RecordActions } from './Actions'
import { resources } from './data'
import { RecordForm } from './RecordForm'
import { ResourceList } from './ResourceList'
import { ReferencePicker } from './ReferencePicker'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const nativeLocks = Object.getOwnPropertyDescriptor(navigator, 'locks')
beforeEach(() => {
  invalidatePrivateState(); setAccessToken('admin-test'); vi.stubGlobal('confirm', vi.fn(() => true))
  Object.defineProperty(navigator, 'locks', { configurable: true, value: { request: (_name: string, _options: unknown, callback: () => Promise<unknown>) => Promise.resolve(callback()) } })
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); if (nativeLocks) Object.defineProperty(navigator, 'locks', nativeLocks); else Reflect.deleteProperty(navigator, 'locks') })

describe('administración de tienda', () => {
  it('no reemplaza una búsqueda reciente con una respuesta anterior', async () => {
    let resolveFirst!: (value: Response) => void
    const first = new Promise<Response>(resolve => { resolveFirst = resolve })
    const fetch = vi.fn().mockReturnValueOnce(first).mockResolvedValueOnce(json({ count: 1, next: null, previous: null, results: [{ id: '2', name: 'Nueva', active: true }] }))
    vi.stubGlobal('fetch', fetch)
    render(<ReferencePicker kind="product-categories" label="Categoría" value="" onChange={vi.fn()} required={false} />)
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
    fireEvent.change(screen.getByLabelText('Buscar categoría'), { target: { value: 'nueva' } })
    fireEvent.click(screen.getByRole('button', { name: 'Buscando…' }))
    await screen.findByRole('option', { name: 'Nueva' })
    await act(async () => resolveFirst(json({ count: 1, next: null, previous: null, results: [{ id: '1', name: 'Anterior', active: true }] })))
    expect(screen.queryByRole('option', { name: 'Anterior' })).toBeNull()
    expect(screen.getByRole('option', { name: 'Nueva' })).toBeTruthy()
  })
  it('invierte el orden inicial de nombre, vuelve a la primera página y ofrece todas las categorías', async () => {
    const nav = vi.fn()
    window.addEventListener('llave:navigate', nav)
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes('/settings/shop/')) return json({ low_stock_threshold: 5 })
      if (String(input).includes('/product-categories/')) return json({ count: 0, next: null, previous: null, results: [] })
      return json({ count: 41, next: null, previous: 'previous', results: [{ id: 'p1', name: 'Objeto', active: true, stock: 3, category_name: null, price_money: '10.00', price_credits: null }] })
    }))
    try {
      render(<ResourceList resource={resources.find(item => item.key === 'products')!} search="?page=3&active=true" />)
      expect(screen.getByRole('option', { name: 'Todas las categorías' }).getAttribute('value')).toBe('')
      await screen.findByText('Objeto')
      fireEvent.click(screen.getByRole('button', { name: /Nombre/ }))
      expect(nav).toHaveBeenCalledOnce()
      const url = new URL((nav.mock.calls[0][0] as CustomEvent<string>).detail, 'http://localhost')
      expect(url.searchParams.get('ordering')).toBe('-name')
      expect(url.searchParams.has('page')).toBe(false)
      expect(url.searchParams.get('active')).toBe('true')
    } finally { window.removeEventListener('llave:navigate', nav) }
  })
  it('permite quitar una categoría y envía la versión vigente', async () => {
    let sent: unknown = null
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes('/admin/product-categories/')) return json({ count: 1, next: null, previous: null, results: [{ id: 'cat-1', name: 'Recuerdos', active: true }] })
      sent = JSON.parse(String(init?.body)); return json({ id: 'p1', version: 'v2', name: 'Objeto', category: null, price_credits: 10 })
    }))
    render(<RecordForm resource={resources.find(item => item.key === 'products')!} data={{ id: 'p1', version: 'v1', name: 'Objeto', category: 'cat-1', active: false, price_credits: 10 }} back="/gestion/productos" onSaved={vi.fn()} />)
    await screen.findByRole('option', { name: 'Recuerdos' })
    fireEvent.change(screen.getByLabelText('Categoría'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    await waitFor(() => expect(sent).toMatchObject({ version: 'v1', category: null }))
  })

  it('calcula una salida y reintenta el mismo ajuste con la clave original', async () => {
    const requests: Array<{ key: string | null; body: string }> = []
    vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ key: new Headers(init?.headers).get('Idempotency-Key'), body: String(init?.body) })
      return requests.length === 1 ? json({ detail: 'No disponible' }, 503) : json({})
    }))
    render(<RecordActions resource="products" data={{ id: 'p1', name: 'Objeto', stock: 5, version: 'v1' }} onSuccess={async () => undefined} />)
    fireEvent.change(screen.getByLabelText('Movimiento'), { target: { value: 'out' } })
    fireEvent.change(screen.getByLabelText('Cantidad'), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'Corrección' } })
    expect(screen.getByText(/Resultado previsto: 3/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Ajustar stock' }))
    await screen.findByRole('alert')
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar operación anterior' }))
    await waitFor(() => expect(requests).toHaveLength(2))
    expect(JSON.parse(requests[0].body)).toMatchObject({ version: 'v1', delta: -2, reason: 'Corrección' })
    expect(requests[1]).toEqual(requests[0])
  })

  it('confirma la desactivación mostrando los productos afectados', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ id: 'cat-1', name: 'Recuerdos', active: false, published_products_count: 3, version: 'v2' })))
    render(<RecordForm resource={resources.find(item => item.key === 'product-categories')!} data={{ id: 'cat-1', name: 'Recuerdos', active: true, published_products_count: 3, version: 'v1' }} back="/gestion/categorias-tienda" onSaved={vi.fn()} />)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Activa' }))
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('3 productos publicados'))
  })
})
