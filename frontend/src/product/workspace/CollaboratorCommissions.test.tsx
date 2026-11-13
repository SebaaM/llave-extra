import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CollaboratorCommissions } from './CollaboratorCommissions'
import { api } from '../api'

vi.mock('../api', async importOriginal => ({ ...await importOriginal<typeof import('../api')>(), api: vi.fn() }))

afterEach(() => { cleanup(); vi.clearAllMocks() })

const record = {
  id: 'one', created_at: '2026-11-10T12:00:00Z', provider_name: 'Café Austral', benefit_title: 'Desayuno local',
  state: 'TO_PAY', rate: '7.00', approved_amount: '70.00', payment_reported: true,
}

describe('historial de comisiones del Colaborador', () => {
  it('muestra el total pendiente y el estado real de pago informado', async () => {
    vi.mocked(api).mockResolvedValue({ count: 1, next: null, previous: null, pending_total: '70.00', results: [record] })
    render(<CollaboratorCommissions />)
    expect(await screen.findByText('Desayuno local')).toBeTruthy()
    expect(screen.getByText('Pendiente de pago')).toBeTruthy()
    expect(screen.getByText('Informado, pendiente de conciliación')).toBeTruthy()
    expect(screen.getAllByText(/70,00/)).toHaveLength(2)
  })

  it('permite reintentar cuando falla la lectura', async () => {
    vi.mocked(api).mockRejectedValueOnce(new Error('No se pudo cargar')).mockResolvedValueOnce({
      count: 0, next: null, previous: null, pending_total: '0.00', results: [],
    })
    render(<CollaboratorCommissions />)
    expect(await screen.findByRole('alert')).toBeTruthy()
    screen.getByRole('button', { name: 'Volver a intentar' }).click()
    await waitFor(() => expect(screen.getByText('No hay consumos referidos en tu historial.')).toBeTruthy())
  })
})
