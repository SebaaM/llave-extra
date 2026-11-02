import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { invalidatePrivateState, setAccessToken } from '../api'
import { resources } from './data'
import { RecordDetail } from './RecordDetail'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const resource = resources.find(item => item.key === 'collaborators')!
const record = (id: string) => ({ id, user_email: `test-${id}@example.test`, version: 'v1', enabled: true })
const auxiliary = (input: RequestInfo | URL) => String(input).includes('?') ? json({ count: 0, next: null, previous: null, results: [] }) : null
beforeEach(() => { invalidatePrivateState(); setAccessToken('test') })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it.each([[0, 0], [7, 3]])('muestra las cifras históricas %i/%i en la ficha autorizada', async (linked, visits) => {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => auxiliary(input) ?? (String(input).endsWith('/summary/') ? json({ collaborator_id: 'one', linked_clients: linked, valid_attributed_consumptions: visits }) : json(record('one')))))
  render(<RecordDetail resource={resource} id="one" search="" />)
  await screen.findByText('Clientes que ingresaron por QR')
  expect(screen.getByText('Visitas válidas atribuidas')).toBeTruthy()
  expect(Array.from(screen.getByRole('region', { name: 'Ingresos y visitas' }).querySelectorAll('dd'), item => item.textContent)).toEqual([String(linked), String(visits)])
})

it('muestra carga, error y reintento independiente del resumen', async () => {
  let finish!: (response: Response) => void
  let summaries = 0
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    if (String(input).endsWith('/summary/')) return ++summaries === 1 ? new Promise<Response>(resolve => { finish = resolve }) : json({ collaborator_id: 'one', linked_clients: 9, valid_attributed_consumptions: 4 })
    return auxiliary(input) ?? json(record('one'))
  }))
  render(<RecordDetail resource={resource} id="one" search="" />)
  await screen.findByRole('region', { name: 'Ingresos y visitas' })
  expect(screen.getByText('Cargando resumen…')).toBeTruthy()
  await act(async () => finish(json({ detail: 'No disponible' }, 503)))
  await screen.findByRole('button', { name: 'Reintentar resumen' })
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar resumen' }))
  await screen.findByText('Clientes que ingresaron por QR')
  expect(summaries).toBe(2)
})

it('descarta el resumen tardío de otra ficha y carga solo después del detalle', async () => {
  let finish!: (response: Response) => void
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.endsWith('/one/summary/')) return new Promise<Response>(resolve => { finish = resolve })
    if (url.endsWith('/two/summary/')) return json({ collaborator_id: 'two', linked_clients: 2, valid_attributed_consumptions: 1 })
    return auxiliary(input) ?? json(record(url.endsWith('/two/') ? 'two' : 'one'))
  }))
  const view = render(<RecordDetail resource={resource} id="one" search="" />)
  await screen.findByText('Cargando resumen…')
  view.rerender(<RecordDetail resource={resource} id="two" search="" />)
  await screen.findByText('Clientes que ingresaron por QR')
  await act(async () => finish(json({ collaborator_id: 'one', linked_clients: 999, valid_attributed_consumptions: 999 })))
  expect(screen.queryByText('999')).toBeNull()
})

it('no consulta resumen cuando el detalle no está autorizado', async () => {
  const fetcher = vi.fn(async () => json({ detail: 'Sin permiso' }, 403))
  vi.stubGlobal('fetch', fetcher)
  render(<RecordDetail resource={resource} id="one" search="" />)
  await screen.findByRole('alert')
  expect(fetcher.mock.calls).toHaveLength(1)
  expect(screen.queryByText('Clientes que ingresaron por QR')).toBeNull()
})

it('rechaza un resumen cuyo colaborador no coincide con la ficha', async () => {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => auxiliary(input) ?? (String(input).endsWith('/summary/') ? json({ collaborator_id: 'other', linked_clients: 999, valid_attributed_consumptions: 999 }) : json(record('one')))))
  render(<RecordDetail resource={resource} id="one" search="" />)
  await screen.findByRole('button', { name: 'Reintentar resumen' })
  expect(screen.getByRole('alert')).toBeTruthy()
  expect(screen.queryByText('Clientes que ingresaron por QR')).toBeNull()
  expect(screen.queryByText('999')).toBeNull()
})

it('no repuebla el resumen al cambiar la cuenta con la misma ficha', async () => {
  let finish!: (response: Response) => void
  let accountB = false
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    if (String(input).endsWith('/summary/')) return new Promise<Response>(resolve => { finish = resolve })
    return accountB ? json({ detail: 'Ficha no autorizada' }, 403) : auxiliary(input) ?? json(record('one'))
  }))
  const view = render(<RecordDetail resource={resource} id="one" search="" />)
  await screen.findByText('Cargando resumen…')
  accountB = true; invalidatePrivateState(); setAccessToken('account-b')
  view.rerender(<RecordDetail resource={resource} id="one" search="" />)
  await screen.findByRole('alert')
  await act(async () => finish(json({ collaborator_id: 'one', linked_clients: 999, valid_attributed_consumptions: 999 })))
  expect(screen.queryByRole('region', { name: 'Ingresos y visitas' })).toBeNull()
})
