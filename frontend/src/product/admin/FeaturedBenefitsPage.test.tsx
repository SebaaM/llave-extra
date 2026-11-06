import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { invalidatePrivateState, setAccessToken } from '../api'
import { AdminWorkspace } from './AdminWorkspace'

const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } })
beforeEach(() => { invalidatePrivateState(); setAccessToken('admin-test') })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
it('gestiona hasta cinco destacados desde su propia sección, incluso fuera de la página actual', async () => {
  const user = { id: 1, email: 'admin@example.test', role: 'ADMIN' as const, email_verified: true }
  const offers = Array.from({ length: 6 }, (_, index) => ({
    id: `b${index}`, title: `Oferta ${index}`, provider_name: 'Bahía Local', version: 'v1',
    featured: index < 5, status: index === 5 ? 'DRAFT' : 'PUBLISHED',
  }))
  const changes: unknown[] = []
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), window.location.origin)
    if (init?.method === 'PATCH') {
      const body = JSON.parse(String(init.body))
      changes.push(body)
      const row = offers.find(offer => url.pathname.endsWith(`/${offer.id}/`))!
      Object.assign(row, { featured: body.featured, version: 'v2' })
      return json(row)
    }
    const selected = url.searchParams.get('featured') === 'true'
    const results = selected ? offers.filter(offer => offer.featured) : offers.slice(5)
    return json({ count: selected ? results.length : offers.length, previous: null, next: null, results })
  }))
  render(<AdminWorkspace user={user} path="/gestion/beneficios-destacados" search="?search=Oferta+5" />)
  expect(screen.getByRole('link', { name: 'Beneficios destacados' }).getAttribute('aria-current')).toBe('page')
  await screen.findByRole('heading', { name: '5 de 5 seleccionados' })
  expect(screen.getByText('Borrador')).toBeTruthy()
  expect((screen.getByRole('button', { name: 'Destacar Oferta 5' }) as HTMLButtonElement).disabled).toBe(true)

  fireEvent.click(screen.getByRole('button', { name: 'Quitar Oferta 0 de destacados' }))
  await screen.findByRole('heading', { name: '4 de 5 seleccionados' })
  fireEvent.click(screen.getByRole('button', { name: 'Destacar Oferta 5' }))
  await screen.findByRole('button', { name: 'Quitar Oferta 5 de destacados' })
  expect(changes).toEqual([{ featured: false, version: 'v1' }, { featured: true, version: 'v1' }])
  expect(screen.getByRole('heading', { name: '5 de 5 seleccionados' })).toBeTruthy()
})
