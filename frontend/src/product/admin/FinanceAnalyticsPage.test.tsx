import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { invalidatePrivateState, setAccessToken } from '../api'
import { FinanceAnalyticsPage } from './FinanceAnalyticsPage'

type Metric<T> = { status: 'available'; value: T } | { status: 'unavailable'; value: null }
type FinanceReport = {
  period: { from: string; to: string; timezone: string }
  valid_visits: { direct: Metric<number>; referred: Metric<number> }
  credits: {
    earn: Metric<number>
    reversal: Metric<number>
    redeem: Metric<number>
    refund: Metric<number>
    adjustment: Metric<number>
  }
  shop: {
    credit_redemptions: Metric<number>
    confirmed_ars: Metric<string>
    refunded_ars: Metric<string>
    undated_confirmations_count: Metric<number>
  }
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
})

function report(overrides: Partial<FinanceReport> = {}): FinanceReport {
  return {
    period: { from: '2026-11-01', to: '2026-11-30', timezone: 'America/Argentina/Ushuaia' },
    valid_visits: {
      direct: { status: 'available', value: 1 },
      referred: { status: 'available', value: 2 },
    },
    credits: {
      earn: { status: 'available', value: 55 },
      reversal: { status: 'available', value: -35 },
      redeem: { status: 'available', value: -120 },
      refund: { status: 'available', value: 50 },
      adjustment: { status: 'available', value: 15 },
    },
    shop: {
      credit_redemptions: { status: 'available', value: 3 },
      confirmed_ars: { status: 'available', value: '420.75' },
      refunded_ars: { status: 'available', value: '250.25' },
      undated_confirmations_count: { status: 'available', value: 1 },
    },
    ...overrides,
  }
}

beforeEach(() => {
  invalidatePrivateState()
  setAccessToken('finance-test')
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('FinanceAnalyticsPage', () => {
  it('distingue visitas, créditos y montos expresados en ARS', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => { void input; return json(report()) })
    vi.stubGlobal('fetch', fetcher)

    render(<FinanceAnalyticsPage search="?from=2026-11-01&to=2026-11-30" />)

    const visits = await screen.findByRole('region', { name: 'Visitas' })
    expect(within(visits).getByText('1 visita')).toBeTruthy()
    expect(within(visits).getByText('2 visitas')).toBeTruthy()

    const credits = screen.getByRole('region', { name: 'Movimientos de créditos' })
    expect(within(credits).getByText('+55 créditos')).toBeTruthy()
    expect(within(credits).getByText('-35 créditos')).toBeTruthy()
    expect(within(credits).getByText('-120 créditos')).toBeTruthy()
    expect(within(credits).getByText('+50 créditos')).toBeTruthy()
    expect(within(credits).getByText('+15 créditos')).toBeTruthy()

    const shop = screen.getByRole('region', { name: 'Señales de tienda' })
    expect(within(shop).getByText('3 pedidos')).toBeTruthy()
    expect(within(shop).getByText('ARS 420,75')).toBeTruthy()
    expect(within(shop).getByText('ARS 250,25')).toBeTruthy()
    expect(within(shop).getByText('1 confirmación')).toBeTruthy()

    const requestUrl = new URL(String(fetcher.mock.calls[0][0]), window.location.origin)
    expect(requestUrl.pathname).toBe('/api/v1/admin/analytics/finance/')
    expect(requestUrl.searchParams.get('from')).toBe('2026-11-01')
    expect(requestUrl.searchParams.get('to')).toBe('2026-11-30')
  })

  it('presenta un origen no verificable como no disponible y no como cero', async () => {
    const payload = report({
      valid_visits: {
        direct: { status: 'unavailable', value: null },
        referred: { status: 'available', value: 0 },
      },
      credits: {
        earn: { status: 'unavailable', value: null },
        reversal: { status: 'available', value: 0 },
        redeem: { status: 'available', value: 0 },
        refund: { status: 'available', value: 0 },
        adjustment: { status: 'available', value: 0 },
      },
      shop: {
        credit_redemptions: { status: 'available', value: 0 },
        confirmed_ars: { status: 'unavailable', value: null },
        refunded_ars: { status: 'available', value: '0.00' },
        undated_confirmations_count: { status: 'available', value: 0 },
      },
    })
    vi.stubGlobal('fetch', vi.fn(async () => json(payload)))

    render(<FinanceAnalyticsPage search="" />)

    const visits = await screen.findByRole('region', { name: 'Visitas' })
    const credits = screen.getByRole('region', { name: 'Movimientos de créditos' })
    const shop = screen.getByRole('region', { name: 'Señales de tienda' })
    expect(within(visits).getByText('No disponible')).toBeTruthy()
    expect(within(credits).getByText('No disponible')).toBeTruthy()
    expect(within(shop).getByText('No disponible')).toBeTruthy()
    expect(within(shop).getByText('ARS 0,00')).toBeTruthy()
  })

  it('aplica y restablece el período mediante la navegación de actividad', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(report())))
    const navigate = vi.fn()
    window.addEventListener('llave:navigate', navigate)

    render(<FinanceAnalyticsPage search="" />)
    await screen.findByRole('region', { name: 'Visitas' })

    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-11-05' } })
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-11-20' } })
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar período' }))
    expect(navigate).toHaveBeenCalledWith(expect.objectContaining({
      detail: '/gestion/analitica/actividad?from=2026-11-05&to=2026-11-20',
    }))

    fireEvent.click(screen.getByRole('button', { name: 'Restablecer período' }))
    expect(navigate).toHaveBeenLastCalledWith(expect.objectContaining({
      detail: '/gestion/analitica/actividad',
    }))
    window.removeEventListener('llave:navigate', navigate)
  })

  it('restaura el período A al volver desde B y aplica el período restaurado', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(report())))
    const navigate = vi.fn()
    window.addEventListener('llave:navigate', navigate)

    try {
      const { rerender } = render(<FinanceAnalyticsPage search="?from=2026-11-01&to=2026-11-30" />)
      await screen.findByRole('region', { name: 'Visitas' })

      fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-11-05' } })
      fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-11-20' } })
      fireEvent.click(screen.getByRole('button', { name: 'Aplicar período' }))
      expect(navigate).toHaveBeenLastCalledWith(expect.objectContaining({
        detail: '/gestion/analitica/actividad?from=2026-11-05&to=2026-11-20',
      }))

      rerender(<FinanceAnalyticsPage search="?from=2026-11-05&to=2026-11-20" />)
      rerender(<FinanceAnalyticsPage search="?from=2026-11-01&to=2026-11-30" />)

      expect((screen.getByLabelText('Desde') as HTMLInputElement).value).toBe('2026-11-01')
      expect((screen.getByLabelText('Hasta') as HTMLInputElement).value).toBe('2026-11-30')
      fireEvent.click(screen.getByRole('button', { name: 'Aplicar período' }))
      expect(navigate).toHaveBeenLastCalledWith(expect.objectContaining({
        detail: '/gestion/analitica/actividad?from=2026-11-01&to=2026-11-30',
      }))
    } finally {
      window.removeEventListener('llave:navigate', navigate)
    }
  })
  it('explica qué fecha delimita los movimientos, pedidos y eventos monetarios', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(report())))
    render(<FinanceAnalyticsPage search="" />)

    const credits = await screen.findByRole('region', { name: 'Movimientos de créditos' })
    const shop = screen.getByRole('region', { name: 'Señales de tienda' })
    expect(credits.textContent).toContain('fecha del movimiento en la billetera')
    expect(shop.textContent).toContain('fecha de creación del pedido')
    expect(shop.textContent).toContain('primer evento auditado y autorizado de pago o reintegro')
    expect(shop.textContent).toContain('no por la creación del pedido')
    expect(shop.textContent).toContain('todo el historial')
  })
  it('oculta el informe si la sesión administrativa se revoca', async () => {
    const fetcher = vi.fn(async () => json({ detail: 'Sesión revocada' }, 403))
    vi.stubGlobal('fetch', fetcher)

    render(<FinanceAnalyticsPage search="?from=2026-11-01&to=2026-11-30" />)

    expect((await screen.findByRole('alert')).textContent).toContain('La sesión administrativa ya no está disponible.')
    expect(screen.queryByText('ARS 420,75')).toBeNull()
  })
})
