import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { invalidatePrivateState, setAccessToken } from '../api'
import type { User } from '../api'
import { PrivateQr, RecordActions } from './Actions'
import { AdminWorkspace } from './AdminWorkspace'
import { RecordDetail } from './RecordDetail'
import { RecordForm } from './RecordForm'
import { ResourceList } from './ResourceList'
import { Settings } from './Settings'
import { resources } from './data'

const resource = (key: string) => resources.find(item => item.key === key)!
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const page = (results: unknown[] = []) => ({ count: results.length, results, next: null, previous: null })
const product = { id: 'p1', name: 'Recuerdo', version: 'v1', active: true, price_money: '12.50', price_credits: 10, description: '', image_url: '/api/v1/admin/products/p1/image/' }
const catalog = { version: 'v1', enabled: true, network_title: 'Red local', network_layout: 'ORBIT', network_theme: 'SAND', network_background: 'HARBOR', network_page_size: 12, network_interval_seconds: 10 }
const admin = { id: 1, email: 'admin@example.test', role: 'ADMIN', is_active: true, is_staff: true, is_superuser: true, email_verified: true } as User
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done }); return { resolve, promise } }
beforeEach(() => { invalidatePrivateState(); setAccessToken('synthetic'); vi.stubGlobal('confirm', vi.fn(() => true)) })
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('correcciones finales del panel', () => {
  it.each(['providers', 'collaborators'] as const)('muestra PNG autorizado de %s sin tratar el enlace de acceso como API', async kind => {
    const calls: string[] = []
    const create = vi.fn((blob: Blob) => { expect(blob.type).toBe('image/png'); return 'blob:authorized-qr' })
    const revoke = vi.fn()
    vi.stubGlobal('URL', class extends URL { static createObjectURL = create; static revokeObjectURL = revoke })
    vi.stubGlobal('fetch', vi.fn(async (url: unknown) => { calls.push(String(url)); return String(url).endsWith('qr.png') ? new Response(new Uint8Array([137, 80, 78, 71]), { headers: { 'Content-Type': 'image/png' } }) : json({ url: `http://localhost/${kind === 'providers' ? 'consumo' : 'referencia'}#token=synthetic` }) }))
    const view = render(<PrivateQr resource={kind} id="r1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar QR actual' }))
    expect((await screen.findByAltText('Código QR vigente')).getAttribute('src')).toBe('blob:authorized-qr')
    expect(calls.map(url => new URL(url).pathname)).toEqual([`/api/v1/admin/${kind}/r1/qr.png`])
    expect(create.mock.calls[0][0].type).toBe('image/png')
    view.unmount()
    expect(revoke).toHaveBeenCalledWith('blob:authorized-qr')
  })

  it('revoca el blob tardío de QR después de cambiar sesión', async () => {
    const pending = deferred<Response>()
    const revoke = vi.fn()
    vi.stubGlobal('URL', class extends URL { static createObjectURL = vi.fn(() => 'blob:late'); static revokeObjectURL = revoke })
    vi.stubGlobal('fetch', vi.fn(() => pending.promise))
    render(<PrivateQr resource="providers" id="r1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar QR actual' }))
    invalidatePrivateState()
    await act(async () => { pending.resolve(new Response(new Blob(['synthetic'], { type: 'image/png' }))) })
    expect(screen.queryByAltText('Código QR vigente')).toBeNull()
  })

  it('asocia varios errores del registro a sus controles y conserva los valores', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ name: ['Ingresá un nombre válido.'], price_credits: ['El valor supera el máximo permitido.'], non_field_errors: ['No se guardó el registro.'], secret: 'oculto' }, 400)))
    render(<RecordForm resource={resource('products')} data={product} back="/gestion/productos" onSaved={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Mi nombre' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    await screen.findByText('Ingresá un nombre válido.')
    for (const label of ['Nombre', 'Precio en créditos']) {
      const input = screen.getByLabelText(label)
      expect(input.getAttribute('aria-invalid')).toBe('true')
      expect(document.getElementById(input.getAttribute('aria-describedby')!)?.textContent).toBeTruthy()
    }
    expect(screen.getByRole('alert').textContent).toContain('No se guardó el registro.')
    expect((screen.getByLabelText('Nombre') as HTMLInputElement).value).toBe('Mi nombre')
    expect(screen.queryByText('oculto')).toBeNull()
  })

  it('muestra errores por campo de configuración y acciones', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url: unknown, init: RequestInit) => init.method === 'PATCH' ? json({ network_page_size: ['Usá entre 10 y 15.'], network_interval_seconds: ['Usá entre 8 y 60.'] }, 400) : json(catalog)))
    const view = render(<Settings search="?tab=catalogo" />)
    fireEvent.change(await screen.findByLabelText('Prestadores por página (10–15)'), { target: { value: '99' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar este grupo' }))
    await screen.findByText('Usá entre 10 y 15.')
    expect(screen.getByLabelText('Intervalo de la red (8–60 segundos)').getAttribute('aria-invalid')).toBe('true')
    view.unmount()
    vi.stubGlobal('fetch', vi.fn(async () => json({ delta: ['La variación no puede ser cero.'], reason: ['Completá el motivo.'] }, 400)))
    render(<RecordActions resource="products" data={product} onSuccess={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Variación positiva o negativa'), { target: { value: '0' } })
    fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'motivo' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ajustar stock' }))
    await screen.findByText('La variación no puede ser cero.')
    expect(screen.getByLabelText('Motivo').getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByLabelText('Variación positiva o negativa').getAttribute('aria-describedby')).toBeTruthy()
  })

  it('bloquea campos, archivo y eliminación de imagen durante el guardado del registro', async () => {
    const pending = deferred<Response>()
    vi.stubGlobal('fetch', vi.fn(() => pending.promise))
    render(<RecordForm resource={resource('products')} data={product} back="/gestion/productos" onSaved={vi.fn()} />)
    const file = screen.getByLabelText('Imagen') as HTMLInputElement
    await userEvent.upload(file, new File(['synthetic'], 'image.png', { type: 'image/png' }))
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    for (const input of document.querySelectorAll('form input, form select, form textarea')) expect((input as HTMLInputElement).disabled || input.closest('fieldset')?.disabled).toBe(true)
    await userEvent.type(screen.getByLabelText('Nombre'), 'B')
    expect((screen.getByLabelText('Nombre') as HTMLInputElement).value).toBe('Recuerdo')
    await act(async () => { pending.resolve(json({ ...product, version: 'v2' })) })
    expect((screen.getByLabelText('Imagen') as HTMLInputElement).disabled || screen.getByLabelText('Imagen').closest('fieldset')?.disabled).toBeFalsy()
  })

  it('bloquea select, checkbox, texto y recarga durante el guardado de configuración', async () => {
    const pending = deferred<Response>()
    const fetch = vi.fn(async (_url: unknown, init: RequestInit) => init.method === 'PATCH' ? pending.promise : json(catalog))
    vi.stubGlobal('fetch', fetch)
    render(<Settings search="?tab=catalogo" />)
    fireEvent.change(await screen.findByLabelText('Título de la red'), { target: { value: 'Red nueva' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar este grupo' }))
    for (const input of document.querySelectorAll('form input, form select, form textarea')) expect((input as HTMLInputElement).disabled || input.closest('fieldset')?.disabled).toBe(true)
    const reload = screen.getByRole('button', { name: 'Descartar cambios y cargar versión actual' }) as HTMLButtonElement
    expect(reload.disabled).toBe(true)
    fireEvent.click(reload)
    expect(fetch).toHaveBeenCalledTimes(2)
    await act(async () => { pending.resolve(json({ ...catalog, version: 'v2', network_title: 'Red nueva' })) })
    await screen.findByText('Configuración guardada.')
  })

  it('sincroniza filtros de la misma ruta al retroceder y avanzar en la URL', async () => {
    const calls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: unknown) => { calls.push(String(url)); return json(page()) }))
    const earlier = '?state=PAID&customer=7&created_from=2026-01-01&created_to=2026-02-01'
    const later = '?state=READY&customer=8&created_from=2026-03-01&created_to=2026-04-01'
    const view = render(<ResourceList resource={resource('orders')} search={earlier} />)
    for (const search of [later, earlier, later]) {
      view.rerender(<ResourceList resource={resource('orders')} search={search} />)
      const params = new URLSearchParams(search)
      expect((screen.getByLabelText('Estado') as HTMLSelectElement).value).toBe(params.get('state'))
      expect((screen.getByLabelText('ID del Cliente') as HTMLInputElement).value).toBe(params.get('customer'))
      expect((screen.getByLabelText('Desde') as HTMLInputElement).value).toBe(params.get('created_from'))
      expect((screen.getByLabelText('Hasta') as HTMLInputElement).value).toBe(params.get('created_to'))
      await waitFor(() => expect(calls.at(-1)).toContain(search.slice(1)))
    }
  })

  it('elimina una regla sin pedir la ficha borrada y ofrece retorno con filtros', async () => {
    const calls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: unknown, init: RequestInit) => { calls.push(`${init.method ?? 'GET'} ${String(url)}`); return json(init.method === 'POST' ? { id: 5, removed: true } : { id: 5, version: 'v1', provider_name: 'Negocio', reward: 100 }) }))
    render(<RecordDetail resource={resource('credit-rules')} id="5" search="?provider=p1&page=2" />)
    fireEvent.click(await screen.findByRole('button', { name: 'Eliminar regla' }))
    await screen.findByText('El registro fue eliminado.')
    expect(calls).toHaveLength(2)
    expect(screen.queryByRole('button', { name: 'Reintentar actualización de ficha' })).toBeNull()
    expect(screen.getByRole('link', { name: /Volver al listado/ }).getAttribute('href')).toBe('/gestion/reglas-creditos?provider=p1&page=2')
  })

  it('cancelar edición confirma el descarte y cierra solo al aceptar', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(product)))
    render(<RecordDetail resource={resource('products')} id="p1" search="" />)
    fireEvent.click(await screen.findByRole('button', { name: 'Editar' }))
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Edición sin guardar' } })
    vi.mocked(window.confirm).mockReturnValueOnce(false)
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect((screen.getByLabelText('Nombre') as HTMLInputElement).value).toBe('Edición sin guardar')
    vi.mocked(window.confirm).mockReturnValueOnce(true)
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByLabelText('Nombre')).toBeNull()
    expect(window.confirm).toHaveBeenCalledTimes(2)
  })

  it('informa el error de recarga manual, conserva la ficha y permite reintentar', async () => {
    const pending = deferred<Response>()
    let count = 0
    vi.stubGlobal('fetch', vi.fn(async () => ++count === 1 ? json(product) : count === 2 ? pending.promise : json({ ...product, name: 'Actualizado' })))
    render(<RecordDetail resource={resource('products')} id="p1" search="" />)
    const reload = await screen.findByRole('button', { name: 'Actualizar ficha' })
    fireEvent.click(reload)
    expect((screen.getByRole('button', { name: 'Actualizando ficha…' }) as HTMLButtonElement).disabled).toBe(true)
    await act(async () => { pending.resolve(json({ detail: 'Servicio no disponible' }, 503)) })
    await screen.findByText(/No se pudo actualizar la ficha/)
    expect(screen.getByRole('heading', { name: 'Recuerdo' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar actualización de ficha' }))
    await screen.findByRole('heading', { name: 'Actualizado' })
  })

  it('abre la administración avanzada mediante navegación de documento', () => {
    render(<AdminWorkspace user={admin} path="/gestion/cuenta" search="" />)
    const link = screen.getByRole('link', { name: 'Administración avanzada' })
    expect(link.getAttribute('href')).toBe('/admin/')
    expect(link.getAttribute('data-product-link')).toBeNull()
  })

  it('identifica y enlaza el pedido desde la cancelación', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ id: 'c1', order: 'order1', state: 'OPEN', customer_email: 'cliente@example.test', reason: 'Solicitud' })))
    render(<RecordDetail resource={resource('cancellations')} id="c1" search="" />)
    const link = await screen.findByRole('link', { name: 'order1' })
    expect(link.getAttribute('href')).toBe('/gestion/pedidos/order1')
    expect(within(link.closest('div')!).getByText('Pedido')).toBeTruthy()
  })

  it('mantiene actividad de ambos orígenes con igual recurso e ID al refrescar', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const rows = [{ id: 1, source: 'admin', resource: 'orders', action: 'orders.prepare', reason: 'Administración' }, { id: 1, source: 'order', resource: 'orders', action: 'PREPARED', reason: 'Dominio' }]
    vi.stubGlobal('fetch', vi.fn(async () => json(page(rows))))
    const view = render(<AdminWorkspace user={admin} path="/gestion/actividad" search="" />)
    await screen.findByText('Administración')
    expect(screen.getByText('Dominio')).toBeTruthy()
    rows.reverse()
    view.rerender(<AdminWorkspace user={admin} path="/gestion/actividad" search="?page=1" />)
    await waitFor(() => expect(screen.getAllByRole('row')).toHaveLength(3))
    expect(error.mock.calls.some(call => call.some(value => String(value).includes('same key')))).toBe(false)
  })
})
