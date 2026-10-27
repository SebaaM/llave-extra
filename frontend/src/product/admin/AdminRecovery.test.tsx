import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError, invalidatePrivateState, setAccessToken } from '../api'
import { RecordActions } from './Actions'
import { RecordDetail } from './RecordDetail'
import { RecordForm } from './RecordForm'
import { resources } from './data'
import type { Row } from './types'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const product = resources.find(item => item.key === 'products')!
const productRow = { id: 'p1', version: 'v1', name: 'Recuerdo', active: true, description: '', price_money: '12.50', price_credits: 10, stock: 2, image_url: '/api/v1/admin/products/p1/image/' }
beforeEach(() => { invalidatePrivateState(); setAccessToken('test'); vi.stubGlobal('confirm', vi.fn(() => true)) })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('recuperación administrativa', () => {
  it('no rebasa una edición al actualizar la ficha después de una acción', async () => {
    const calls: RequestInit[] = []
    vi.stubGlobal('fetch', vi.fn(async (_url: unknown, init: RequestInit) => { calls.push(init); return json({ id: 'p1' }) }))
    function Scenario() {
      const [data, setData] = useState<Row>(productRow)
      return <><RecordForm resource={product} data={data} back="/gestion/productos" onSaved={vi.fn()} onReload={async () => ({ ...productRow, version: 'v3', name: 'Nombre de otra persona' })} /><RecordActions resource="products" data={data} onSuccess={async () => { setData({ ...productRow, version: 'v3', name: 'Nombre de otra persona' }) }} /></>
    }
    render(<Scenario />)
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Mi edición' } })
    fireEvent.change(screen.getByLabelText('Variación positiva o negativa'), { target: { value: '1' } })
    fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'Recuento' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ajustar stock' }))
    await screen.findByText(/La ficha cambió mientras editabas/)
    expect((screen.getByLabelText('Nombre') as HTMLInputElement).value).toBe('Mi edición')
    expect((screen.getByRole('button', { name: 'Guardar cambios' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    expect(calls).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Descartar cambios y cargar ficha actual' }))
    await waitFor(() => expect((screen.getByLabelText('Nombre') as HTMLInputElement).value).toBe('Nombre de otra persona'))
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Edición reconciliada' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    await waitFor(() => expect(calls).toHaveLength(2))
    expect(JSON.parse(String(calls[1].body))).toMatchObject({ version: 'v3', name: 'Edición reconciliada' })
  })

  it('permite centavos mediante validación nativa y conserva su texto en el envío', async () => {
    const fetch = vi.fn(async () => json(productRow))
    const onSaved = vi.fn()
    vi.stubGlobal('fetch', fetch)
    render(<RecordForm resource={product} data={productRow} back="/gestion/productos" onSaved={onSaved} />)
    const input = screen.getByLabelText('Precio en pesos') as HTMLInputElement
    expect(input.checkValidity()).toBe(true)
    fireEvent.change(input, { target: { value: '123.45' } })
    expect(input.checkValidity()).toBe(true)
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce())
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce())
    expect(JSON.parse(String((fetch.mock.calls as unknown as Array<[unknown, RequestInit]>)[0][1].body)).price_money).toBe('123.45')
    fireEvent.change(input, { target: { value: '12.345' } })
    expect(input.validity.stepMismatch).toBe(true)
    fireEvent.change(screen.getByLabelText('Precio en créditos'), { target: { value: '1.5' } })
    expect((screen.getByLabelText('Precio en créditos') as HTMLInputElement).validity.stepMismatch).toBe(true)
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    expect(fetch).toHaveBeenCalledOnce()
  })

  it.each(['providers', 'benefits', 'products'])('preserva la eliminación de imagen y la versión ante 409 en %s', async key => {
    const requests: RequestInit[] = []
    vi.stubGlobal('fetch', vi.fn(async (_url: unknown, init: RequestInit) => { requests.push(init); return json({ detail: 'Obsoleto' }, 409) }))
    render(<RecordForm resource={resources.find(item => item.key === key)!} data={{ ...productRow, title: 'Oferta', slug: 'negocio', category: 'Paseos', status: 'PUBLISHED' }} back="/gestion" onSaved={vi.fn()} />)
    fireEvent.click(screen.getByLabelText('Quitar imagen actual'))
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    await screen.findByRole('alert')
    expect(JSON.parse(String(requests[0].body))).toEqual({ version: 'v1', image: null })
    expect((screen.getByLabelText('Quitar imagen actual') as HTMLInputElement).checked).toBe(true)
  })

  it('conserva un comando incierto hasta una recarga exitosa y bloquea otras acciones', async () => {
    const calls: Array<{ key: string | null; body: string }> = []
    vi.stubGlobal('fetch', vi.fn(async (_url: unknown, init: RequestInit) => { if (init.method !== 'POST') return json({ count: 0, results: [], next: null, previous: null }); calls.push({ key: new Headers(init.headers).get('Idempotency-Key'), body: String(init.body) }); throw new TypeError('Tiempo agotado') }))
    const refresh = vi.fn().mockRejectedValueOnce(new ApiError(503, 'GET falló')).mockResolvedValue(undefined)
    const view = render(<RecordActions resource="providers" data={{ id: 'p1', version: 'v1' }} onSuccess={refresh} />)
    fireEvent.click(screen.getByRole('button', { name: 'Renovar QR' }))
    await screen.findByText('No pudimos conectar con el servicio. Revisá tu conexión e intentá de nuevo.')
    expect((screen.getByRole('button', { name: 'Actualizar PIN' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar nueva operación' }))
    await screen.findByText(/GET falló/)
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar operación anterior' }))
    await waitFor(() => expect(calls).toHaveLength(2))
    expect(calls[1]).toEqual(calls[0])
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar nueva operación' }))
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(2))
    view.rerender(<RecordActions resource="providers" data={{ id: 'p1', version: 'v2' }} onSuccess={refresh} />)
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Reintentar operación anterior' })).toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'Renovar QR' }))
    await waitFor(() => expect(calls).toHaveLength(3))
    expect(calls[2].key).not.toBe(calls[0].key)
    expect(JSON.parse(calls[2].body).version).toBe('v2')
  })

  it('recupera solo el GET cuando el efecto ya está confirmado', async () => {
    const fetch = vi.fn(async () => json({ id: 'p1' }))
    vi.stubGlobal('fetch', fetch)
    const refresh = vi.fn().mockRejectedValueOnce(new ApiError(503, 'GET falló')).mockResolvedValue(undefined)
    render(<RecordActions resource="products" data={productRow} onSuccess={refresh} />)
    fireEvent.change(screen.getByLabelText('Variación positiva o negativa'), { target: { value: '1' } })
    fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'Recuento' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ajustar stock' }))
    await screen.findByText(/GET falló/)
    expect(screen.getByText('La operación se registró.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Reintentar operación anterior' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar actualización de ficha' }))
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(2))
    expect(fetch).toHaveBeenCalledOnce()
  })

  it('no permite abandonar el comando mientras el envío está en curso', async () => {
    let finish!: (response: Response) => void
    const fetch = vi.fn(() => new Promise<Response>(resolve => { finish = resolve }))
    vi.stubGlobal('fetch', fetch)
    const refresh = vi.fn().mockResolvedValue(undefined)
    render(<RecordActions resource="users" data={{ id: 1 }} onSuccess={refresh} />)
    fireEvent.click(screen.getByRole('button', { name: 'Enviar invitación' }))
    expect((screen.getByRole('button', { name: 'Iniciar nueva operación' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar nueva operación' }))
    expect(refresh).not.toHaveBeenCalled()
    finish(json({ id: 1, delivery: 'PENDING' }))
    await screen.findByRole('button', { name: 'Consultar estado del envío' })
    expect(fetch).toHaveBeenCalledOnce()
  })

  it.each(['SENT', 'FAILED'])('consulta PENDING → %s con el mismo comando', async delivery => {
    const calls: Array<{ key: string | null; body: string }> = []
    vi.stubGlobal('fetch', vi.fn(async (_url: unknown, init: RequestInit) => { if (init.method !== 'POST') return json({ count: 0, results: [], next: null, previous: null }); calls.push({ key: new Headers(init.headers).get('Idempotency-Key'), body: String(init.body) }); return json({ id: 1, delivery: calls.length === 1 ? 'PENDING' : delivery }, calls.length > 1 && delivery === 'FAILED' ? 503 : 200) }))
    const refresh = vi.fn().mockResolvedValue(undefined)
    render(<RecordActions resource="users" data={{ id: 1 }} onSuccess={refresh} />)
    fireEvent.click(screen.getByRole('button', { name: 'Enviar invitación' }))
    await screen.findByRole('button', { name: 'Consultar estado del envío' })
    expect(refresh).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Consultar estado del envío' }))
    await screen.findByText(delivery === 'SENT' ? 'La invitación fue enviada.' : 'El envío de la invitación falló. Podés enviar otra invitación después de actualizar la ficha.')
    expect(calls[1]).toEqual(calls[0])
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce())
  })

  it('pagina movimientos desde la URL y conserva por separado el retorno al listado', async () => {
    const urls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: unknown) => { urls.push(String(url)); const second = String(url).includes('page=2'); return json({ id: 2, tourist_email: 'cliente@example.test', balance: 12, movements: { count: 21, next: second ? null : '/?page=2', previous: second ? '/?page=1' : null, results: [{ id: second ? 21 : 1, kind: 'EARN', delta: 2, reference: second ? 'ref-21' : 'ref-1' }] } }) }))
    const resource = resources.find(item => item.key === 'wallets')!
    const view = render(<RecordDetail resource={resource} id="2" search="?list_page=4&search=cliente" />)
    await screen.findByText('ref-1')
    expect(screen.getByRole('link', { name: /Volver al listado/ }).getAttribute('href')).toContain('page=4')
    const navigate = vi.fn()
    window.addEventListener('llave:navigate', navigate)
    fireEvent.click(screen.getByRole('button', { name: /Siguiente/ }))
    const next = (navigate.mock.calls[0][0] as CustomEvent<string>).detail
    expect(next).toContain('page=2')
    view.rerender(<RecordDetail resource={resource} id="2" search={next.slice(next.indexOf('?'))} />)
    await screen.findByText('ref-21')
    expect(urls.at(-1)).toContain('/wallets/2/?page=2')
    expect(screen.queryByText('ref-1')).toBeNull()
    expect(screen.queryByText('results')).toBeNull()
    view.rerender(<RecordDetail resource={resource} id="2" search="?list_page=4&search=cliente" />)
    await screen.findByText('ref-1')
    window.removeEventListener('llave:navigate', navigate)
  })

  it('presenta snapshots e historia del pedido con etiquetas de dominio españolas', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ id: 'o1', state: 'REFUNDED', payment_provider: 'disabled', payment_confirmed: true, pickup_snapshot: { name: 'Centro', address: 'Calle 1', hours: '10–18' }, lines: [{ product: 'p1', name: 'Recuerdo', quantity: 1, unit_money: '12.50', unit_credits: 10 }], audit: [{ id: 1, action: 'CHECKOUT', actor_email: null, reason: 'Solicitud', created_at: '2026-10-24T12:00:00Z' }], payment_operations: [{ id: 2, kind: 'RECONCILE', state: 'DONE', attempts: 1 }], cancellations: [] })))
    render(<RecordDetail resource={resources.find(item => item.key === 'orders')!} id="o1" search="" />)
    await screen.findByText('Punto de retiro al comprar')
    for (const label of ['Dirección', 'Horarios', 'Pago confirmado', 'Deshabilitado', 'Precio unitario en pesos', 'Pedido creado', 'Operaciones de pago']) expect(screen.getByText(label)).toBeTruthy()
    expect(screen.getAllByText('Recuerdo')).toHaveLength(1)
    expect(within(screen.getByRole('heading', { name: 'Información' }).closest('section')!).queryByText('unit_money')).toBeNull()
    for (const label of ['pickup_snapshot', 'payment_provider', 'payment_operations', 'unit_money', 'disabled']) expect(screen.queryByText(label)).toBeNull()
  })

  it.each([
    ['consumptions', { rule_snapshot: { source: 'provider', amount: 100, target_visits: 5 } }, ['Regla al acreditar', 'Origen de la regla', 'Por prestador', 'Meta de visitas']],
    ['adjustments', { funded_amount: 10, forgiven_amount: 0, resolved_at: '2026-10-24T12:00:00Z' }, ['Créditos aportados', 'Créditos condonados', 'Motivo de resolución']],
    ['collaborators', { network_title: 'Nuestra red', network_layout: 'ORBIT', network_theme: 'OCEAN', network_background: 'BEAGLE' }, ['Título de la red', 'Órbita', 'Océano', 'Canal Beagle']],
  ] as const)('traduce el detalle de %s', async (key, data, labels) => {
    vi.stubGlobal('fetch', vi.fn(async (url: unknown) => json(String(url).includes('/benefits/?') ? { count: 0, results: [], next: null, previous: null } : { id: 'r1', ...data })))
    render(<RecordDetail resource={resources.find(item => item.key === key)!} id="r1" search="" />)
    for (const label of labels) expect(await screen.findByText(label)).toBeTruthy()
  })
})
