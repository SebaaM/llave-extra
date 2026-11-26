import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { invalidatePrivateState, setAccessToken } from '../api'
import { ProviderMetrics } from './ProviderMetrics'

const ENDPOINT = '/api/v1/provider/analytics/visits/'
const report = {
  period: { from: '2026-11-01', to: '2026-11-30', timezone: 'America/Argentina/Ushuaia' },
  direct_visits: 12,
  referred_visits: 7,
  benefits: [{ benefit_id: 'benefit-1', benefit_title: 'Oferta histórica', visits: 5 }],
  other_benefit_visits: 2,
}
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

describe('Resumen de actividad del Prestador', () => {
  it('muestra visitas directas, referidas y el desglose histórico del negocio asignado', async () => {
    render(<ProviderMetrics />)

    expect(await screen.findByRole('heading', { name: 'Actividad de tu negocio' })).toBeTruthy()
    expect(screen.getByText('12')).toBeTruthy()
    expect(screen.getByText('7')).toBeTruthy()
    expect(screen.getByText('Oferta histórica: 5')).toBeTruthy()
    expect(screen.getByText('Otros beneficios: 2')).toBeTruthy()

    const request = fetchStub.mock.calls.find(([input]) =>
      new URL(String(input), window.location.origin).pathname === ENDPOINT,
    )
    expect(request).toBeTruthy()
    expect(new URL(String(request?.[0]), window.location.origin).search).toBe('')
  })

  it.each([403, 404])('retira el resumen si la API responde %i por pérdida de acceso', async status => {
    fetchStub.mockResolvedValueOnce(json({ detail: 'Sin acceso' }, status))

    render(<ProviderMetrics />)

    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'Actividad de tu negocio' })).toBeNull()
    })
  })

  it('explica una falla temporal sin conservar cifras anteriores', async () => {
    fetchStub.mockResolvedValueOnce(json({ detail: 'Error' }, 500))

    render(<ProviderMetrics />)

    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.queryByText('12')).toBeNull()
  })

  it('allows choosing a period and resetting to the server default', async () => {
    fetchStub
      .mockResolvedValueOnce(json(report))
      .mockResolvedValueOnce(json({
        ...report,
        period: { from: '2026-11-05', to: '2026-11-19', timezone: report.period.timezone },
      }))
      .mockResolvedValueOnce(json(report))

    render(<ProviderMetrics />)
    expect(await screen.findByRole('heading', { name: 'Actividad de tu negocio' })).toBeTruthy()
    expect(fetchStub).toHaveBeenCalledTimes(1)

    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-11-05' } })
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-11-19' } })
    expect(fetchStub).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Aplicar período' }))
    await waitFor(() => expect(fetchStub).toHaveBeenCalledTimes(2))
    const selectedRequest = new URL(String(fetchStub.mock.calls[1]?.[0]), window.location.origin)
    expect(selectedRequest.searchParams.get('from')).toBe('2026-11-05')
    expect(selectedRequest.searchParams.get('to')).toBe('2026-11-19')

    fireEvent.click(screen.getByRole('button', { name: 'Restablecer período' }))
    await waitFor(() => expect(fetchStub).toHaveBeenCalledTimes(3))
    expect((screen.getByLabelText('Desde') as HTMLInputElement).value).toBe('')
    expect((screen.getByLabelText('Hasta') as HTMLInputElement).value).toBe('')
    const resetRequest = new URL(String(fetchStub.mock.calls[2]?.[0]), window.location.origin)
    expect(resetRequest.search).toBe('')
  })

  it.each([403, 404])('retira el resumen al perder acceso tras aplicar un período (%i)', async status => {
    fetchStub.mockResolvedValueOnce(json(report)).mockResolvedValueOnce(json({ detail: 'Sin acceso' }, status))

    render(<ProviderMetrics />)
    expect(await screen.findByRole('heading', { name: 'Actividad de tu negocio' })).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-11-05' } })
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-11-19' } })
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar período' }))

    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'Actividad de tu negocio' })).toBeNull()
    })
    expect(fetchStub).toHaveBeenCalledTimes(2)
  })
})
