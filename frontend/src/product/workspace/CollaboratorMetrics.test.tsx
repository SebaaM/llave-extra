import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { invalidatePrivateState, setAccessToken } from '../api'
import { CollaboratorMetrics } from './CollaboratorMetrics'

const ENDPOINT = '/api/v1/collaborator/analytics/visits/'
const report = {
  period: { from: '2026-11-01', to: '2026-11-30', timezone: 'America/Argentina/Ushuaia' },
  linked_clients: { status: 'available', value: 8 },
  valid_attributed_visits: 19,
  businesses: {
    count: 1,
    page: 1,
    page_size: 25,
    results: [{ provider_id: 'provider-visible', provider_name: 'Negocio publicado', visits: 12 }],
  },
  other_business_visits: 7,
}
const pagedReport = (page: number, count = 26) => ({
  ...report,
  businesses: { ...report.businesses, page, count },
})
const queryAt = (index: number) => new URL(String(fetchStub.mock.calls[index][0]), window.location.origin).searchParams
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
})
const fetchStub = vi.fn<(input: URL | RequestInfo, init?: RequestInit) => Promise<Response>>()

beforeEach(() => {
  cleanup()
  invalidatePrivateState()
  setAccessToken('account-a')
  fetchStub.mockReset().mockResolvedValue(json(report))
  vi.stubGlobal('fetch', fetchStub)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  invalidatePrivateState()
})

describe('Resumen de la red del Colaborador', () => {
  it('separa visitas propias de las comisiones y oculta negocios que ya no están disponibles', async () => {
    render(<CollaboratorMetrics />)

    expect(await screen.findByRole('heading', { name: 'Resultados de tu red' })).toBeTruthy()
    expect(screen.getByText('19')).toBeTruthy()
    expect(screen.getByText('Negocio publicado')).toBeTruthy()
    expect(screen.getByText('Visitas válidas atribuidas')).toBeTruthy()
    expect(screen.getByText('Visitas en otros negocios')).toBeTruthy()
    expect(screen.queryByText('Negocio retirado')).toBeNull()
    expect(screen.queryByText(/\$/)).toBeNull()

    const commissionLink = screen.getByRole('link', { name: 'Mis comisiones →' })
    expect(commissionLink.getAttribute('href')).toBe('/colaborador/comisiones')
    const paths = fetchStub.mock.calls.map(([input]) => new URL(String(input), window.location.origin).pathname)
    expect(paths).toEqual([ENDPOINT])
  })

  it('no convierte un origen incierto de clientes vinculados en cero', async () => {
    fetchStub.mockResolvedValueOnce(json({
      ...report,
      linked_clients: { status: 'unavailable', value: null },
    }))

    render(<CollaboratorMetrics />)

    expect(await screen.findByText('No disponible para este período')).toBeTruthy()
    expect(screen.queryByText('Clientes vinculados: 0')).toBeNull()
  })

  it('no muestra una respuesta tardía de la sesión anterior al recuperar una página invalidada', async () => {
    let resolveLatePage: ((response: Response) => void) | undefined
    const latePage = new Promise<Response>(resolve => { resolveLatePage = resolve })
    fetchStub
      .mockResolvedValueOnce(json(pagedReport(1)))
      .mockResolvedValueOnce(json(pagedReport(1)))
      .mockReturnValueOnce(latePage)
      .mockResolvedValueOnce(json({ detail: 'La página solicitada no existe.' }, 400))
      .mockResolvedValueOnce(json({
        ...report,
        businesses: {
          ...report.businesses,
          results: [{ provider_id: 'provider-account-b', provider_name: 'Negocio de la sesión actual', visits: 2 }],
        },
      }))

    render(<CollaboratorMetrics />)
    expect(await screen.findByText('Página 1 de 2')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-11-05' } })
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-11-19' } })
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar período' }))
    await waitFor(() => expect(fetchStub).toHaveBeenCalledTimes(2))

    fireEvent.click(screen.getByRole('button', { name: 'Siguiente →' }))
    await waitFor(() => expect(fetchStub).toHaveBeenCalledTimes(3))
    act(() => {
      invalidatePrivateState()
      setAccessToken('account-b')
    })
    resolveLatePage?.(json({
      ...pagedReport(2),
      businesses: {
        ...pagedReport(2).businesses,
        results: [{ provider_id: 'provider-account-a', provider_name: 'Negocio de la sesión anterior', visits: 1 }],
      },
    }))
    await act(async () => { await latePage })
    expect(screen.queryByText('Negocio de la sesión anterior')).toBeNull()

    await act(async () => {
      fireEvent(window, new Event('focus'))
    })
    expect((await screen.findByRole('alert')).textContent).toContain('La página solicitada no existe.')
    fireEvent.click(screen.getByRole('button', { name: 'Volver a la página 1' }))
    await waitFor(() => expect(fetchStub).toHaveBeenCalledTimes(5))

    expect(queryAt(4).get('from')).toBe('2026-11-05')
    expect(queryAt(4).get('to')).toBe('2026-11-19')
    expect(new Headers(fetchStub.mock.calls[4][1]?.headers).get('Authorization')).toBe('Bearer account-b')
    expect(await screen.findByText('Negocio de la sesión actual')).toBeTruthy()
    expect(screen.queryByText('Negocio de la sesión anterior')).toBeNull()
  })
  it('retira el resumen si se revoca el acceso durante una recarga', async () => {
    fetchStub.mockResolvedValueOnce(json(report)).mockResolvedValueOnce(json({ detail: 'Sin acceso' }, 403))
    render(<CollaboratorMetrics />)
    expect(await screen.findByRole('heading', { name: 'Resultados de tu red' })).toBeTruthy()

    await act(async () => {
      fireEvent(window, new Event('focus'))
    })

    await waitFor(() => {
      expect(screen.getByText('El resumen de tu red no está disponible ahora.')).toBeTruthy()
    })
    expect(screen.queryByText('19')).toBeNull()
    expect(screen.queryByText('Negocio publicado')).toBeNull()
    expect(screen.getByRole('link', { name: 'Mis comisiones →' })).toBeTruthy()
  })
  it('aplica el período elegido desde la primera página y permite volver al período predeterminado', async () => {
    fetchStub
      .mockResolvedValueOnce(json(pagedReport(1)))
      .mockResolvedValueOnce(json(pagedReport(2)))
      .mockResolvedValueOnce(json(pagedReport(1)))
      .mockResolvedValueOnce(json(report))

    render(<CollaboratorMetrics />)
    expect(await screen.findByText('Página 1 de 2')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Siguiente →' }))
    await waitFor(() => expect(fetchStub).toHaveBeenCalledTimes(2))
    expect(queryAt(1).get('page')).toBe('2')

    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-11-03' } })
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-11-17' } })
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar período' }))

    await waitFor(() => expect(fetchStub).toHaveBeenCalledTimes(3))
    expect(queryAt(2).get('from')).toBe('2026-11-03')
    expect(queryAt(2).get('to')).toBe('2026-11-17')
    expect(queryAt(2).has('page')).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: 'Restablecer período' }))
    await waitFor(() => expect(fetchStub).toHaveBeenCalledTimes(4))
    expect((screen.getByLabelText('Desde') as HTMLInputElement).value).toBe('')
    expect((screen.getByLabelText('Hasta') as HTMLInputElement).value).toBe('')
    expect(queryAt(3).size).toBe(0)
  })

  it('permite salir de una página invalidada sin perder el período elegido', async () => {
    fetchStub
      .mockResolvedValueOnce(json(pagedReport(1)))
      .mockResolvedValueOnce(json(pagedReport(1)))
      .mockResolvedValueOnce(json(pagedReport(2)))
      .mockResolvedValueOnce(json({ detail: 'La página solicitada no existe.' }, 400))
      .mockResolvedValueOnce(json(pagedReport(1)))

    render(<CollaboratorMetrics />)
    expect(await screen.findByText('Página 1 de 2')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-11-04' } })
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-11-18' } })
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar período' }))
    await waitFor(() => expect(fetchStub).toHaveBeenCalledTimes(2))

    fireEvent.click(screen.getByRole('button', { name: 'Siguiente →' }))
    await waitFor(() => expect(fetchStub).toHaveBeenCalledTimes(3))
    await act(async () => {
      fireEvent(window, new Event('focus'))
    })

    expect((await screen.findByRole('alert')).textContent).toContain('La página solicitada no existe.')
    fireEvent.click(screen.getByRole('button', { name: 'Volver a la página 1' }))

    await waitFor(() => expect(fetchStub).toHaveBeenCalledTimes(5))
    expect(queryAt(4).get('from')).toBe('2026-11-04')
    expect(queryAt(4).get('to')).toBe('2026-11-18')
    expect(queryAt(4).has('page')).toBe(false)
    expect(await screen.findByText('Negocio publicado')).toBeTruthy()
  })

})