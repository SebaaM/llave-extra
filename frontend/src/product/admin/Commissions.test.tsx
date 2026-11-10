import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, api, invalidatePrivateState } from '../api'
import type { Commission } from '../commission-data'
import { ReferredConsumptions } from '../workspace/ReferredConsumptions'
import { Commissions } from './Commissions'

vi.mock('../api', async importOriginal => ({
  ...await importOriginal<typeof import('../api')>(),
  api: vi.fn(),
}))
const mockApi = vi.mocked(api)

const row: Commission = {
  id: 'f9ac8701-00df-4898-b11d-09d562397f68', created_at: '2026-11-10T13:00:00Z',
  tourist_name: 'Ana Cliente', provider_id: 'negocio', provider_name: 'Comercio Sur',
  collaborator_id: 'colaborador', collaborator_name: 'Luz Colaboradora', benefit_title: 'Café con descuento',
  state: 'AWAITING_PROVIDER', next_step: 'Esperar declaración del Prestador', version: 'versión-1',
  declaration: null, approval: null, payment_approvals: [], payment: null, incident: false, current_rate: '5.00',
  events: [{ kind: 'validated', label: 'Validación por QR y PIN', created_at: '2026-11-10T13:00:00Z', actor: 'Ana Cliente', reason: null }],
  actions: ['declare'],
}
const adminList = '/api/v1/admin/commissions/'
const providerList = '/api/v1/provider/commissions/'
const page = { count: 2, next: '?page=2', previous: null, results: [row] }

function lookups(path: string) {
  if (path.startsWith('/api/v1/admin/providers/?')) return { results: [{ id: 'negocio', name: 'Comercio Sur' }] }
  if (path === '/api/v1/admin/providers/negocio/') return { id: 'negocio', name: 'Comercio Sur' }
  if (path.startsWith('/api/v1/admin/collaborators/?')) return { results: [{ id: 'colaborador', user_email: 'luz@example.test' }] }
  if (path === '/api/v1/admin/collaborators/colaborador/') return { id: 'colaborador', user_email: 'luz@example.test' }
  throw new Error(`Ruta inesperada: ${path}`)
}

afterEach(() => {
  cleanup()
  invalidatePrivateState()
  mockApi.mockReset()
})

describe('Comisiones', () => {
  it('muestra el estado cerrado, expande con teclado y consulta páginas con los filtros vigentes', async () => {
    mockApi.mockImplementation(async path => {
      if (path.startsWith(`${adminList}?`)) return page
      if (path === `${adminList}${row.id}/`) return {
        ...row,
        events: [...row.events,
          { id: '41', kind: 'approved', label: 'Comisión aprobada', created_at: '2026-11-10T14:00:00Z', actor: 'Administración', base_amount: '800.00', rate: '25.00', amount: '200.00' },
          { id: '43', basis_id: '41', kind: 'reported', label: 'Transferencia informada', created_at: '2026-11-10T15:00:00Z', actor: 'Prestador', reference: 'REF-9', date: '2026-11-10', amount: '200.00' },
          { id: '44', kind: 'reconciled', label: 'Pago confirmado', created_at: '2026-11-10T16:00:00Z', actor: 'Administración', receipt_checked: true, receipt_confirmed: true },
        ],
      }
      return lookups(path)
    })
    const user = userEvent.setup()
    render(<Commissions section="commissions" />)

    const toggle = await screen.findByRole('button', { name: /Café con descuento/ })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(within(toggle).getByText('Falta verificación del Prestador')).toBeTruthy()
    expect(within(toggle).getByText('Esperar declaración del Prestador')).toBeTruthy()
    expect(screen.queryByText('Validación por QR y PIN')).toBeNull()

    toggle.focus()
    await user.keyboard('{Enter}')
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(await screen.findByText('Validación por QR y PIN')).toBeTruthy()
    expect(screen.getByText('Porcentaje 25.00 %')).toBeTruthy()
    expect(screen.getByText('Referencia REF-9')).toBeTruthy()
    expect(screen.getByText(/Aprobación del/)).toBeTruthy()
    expect(screen.getByText('Comprobante cotejado')).toBeTruthy()
    expect(screen.getByText('Recepción confirmada')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Declarar consumo' })).toBeNull()
    await user.keyboard(' ')
    expect(toggle.getAttribute('aria-expanded')).toBe('false')

    await user.selectOptions(screen.getByLabelText('Estado'), 'TO_PAY')
    await user.click(screen.getByText('Filtrar por Prestador o Colaborador'))
    await user.selectOptions(screen.getByLabelText('Prestador', { selector: 'select' }), await screen.findByRole('option', { name: /Comercio Sur/ }))
    await user.selectOptions(screen.getByLabelText('Colaborador', { selector: 'select' }), await screen.findByRole('option', { name: 'luz@example.test' }))
    await user.click(screen.getByRole('button', { name: 'Filtrar' }))
    await waitFor(() => expect(mockApi).toHaveBeenCalledWith(`${adminList}?state=TO_PAY&provider=negocio&collaborator=colaborador&page=1`, expect.any(Object)))
    await user.click(await screen.findByRole('button', { name: 'Siguiente' }))
    await waitFor(() => expect(mockApi).toHaveBeenCalledWith(`${adminList}?state=TO_PAY&provider=negocio&collaborator=colaborador&page=2`, expect.any(Object)))
  })

  it('mantiene ruta, cuerpo y clave del intento incierto al declarar como Prestador', async () => {
    const path = `${providerList}${row.id}/actions/declare/`
    let attempts = 0
    mockApi.mockImplementation(async url => {
      if (url.startsWith(`${providerList}?`)) return page
      if (url === `${providerList}${row.id}/`) return { ...row, events: [], actions: ['approve', 'declare', 'bank-details'], bank_configured: true }
      if (url === path) {
        if (++attempts === 1) throw new TypeError('Network failure')
        return { id: row.id, state: 'NO_COMMISSION' }
      }
      throw new Error(`Ruta inesperada: ${url}`)
    })
    const user = userEvent.setup()
    render(<ReferredConsumptions />)
    await user.click(await screen.findByRole('button', { name: /Café con descuento/ }))
    expect(screen.queryByText('Ana Cliente')).toBeNull()
    expect(screen.queryByText('Datos bancarios del Colaborador')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Aprobar comisión' })).toBeNull()
    await user.selectOptions(await screen.findByLabelText('Resultado del consumo'), 'NOT_CONSUMED')
    await user.click(screen.getByRole('button', { name: 'Declarar consumo' }))
    const retry = await screen.findByRole('button', { name: 'Reintentar el envío' })
    expect((screen.getByRole('button', { name: 'Declarar consumo' }) as HTMLButtonElement).closest('fieldset')?.disabled).toBe(true)
    await user.click(retry)
    expect(await screen.findByText('Cambios guardados.')).toBeTruthy()
    const calls = mockApi.mock.calls.filter(([url]) => url === path)
    expect(calls).toHaveLength(2)
    expect(calls[0]).toEqual([path, { method: 'POST', body: { version: row.version, outcome: 'NOT_CONSUMED', amount: null }, idempotencyKey: expect.any(String) }])
    expect(calls[1]).toEqual(calls[0])
  })


  it.each([
    { state: 'TO_PAY', candidates: [], selection: null, amount: '350.00' },
    { state: 'ANNULLED', candidates: ['41'], selection: null, amount: '200.00' },
    { state: 'ANNULLED', candidates: ['41', '42'], selection: '41', amount: '200.00' },
  ] as const)('informa la transferencia en $state con candidatos $candidates', async ({ state, candidates, selection, amount }) => {
    const approval = { base_amount: '7000.00', rate: '5.00', amount: '350.00', created_at: '2026-11-09T12:00:00Z' }
    const detail = {
      ...row, state, approval, actions: ['report-payment'],
      payment: selection ? { approval_id: '40', date: '2026-11-07', reference: 'ANTERIOR-40', amount: '100.00', created_at: '2026-11-07T12:00:00Z' } : null,
      payment_approvals: candidates.map((id, index) => index ? { ...approval, id } : { ...approval, id, amount: '200.00', created_at: '2026-11-08T12:00:00Z' }),
    }
    const paymentPath = `${providerList}${row.id}/actions/report-payment/`
    mockApi.mockImplementation(async path => {
      if (path.startsWith(`${providerList}?`)) return { ...page, results: [detail] }
      if (path === `${providerList}${row.id}/`) return detail
      if (path === paymentPath) return { id: row.id, state }
      throw new Error(`Ruta inesperada: ${path}`)
    })
    const user = userEvent.setup()
    render(<ReferredConsumptions />)
    await user.click(await screen.findByRole('button', { name: /Café con descuento/ }))
    const date = await screen.findByLabelText('Fecha de transferencia')
    const amountInput = screen.getByLabelText('Importe transferido (ARS)') as HTMLInputElement
    const approvalInput = screen.queryByLabelText('Aprobación de la transferencia') as HTMLSelectElement | null
    fireEvent.change(date, { target: { value: '2026-11-09' } })
    await user.type(screen.getByLabelText('Referencia de transferencia'), 'COMPROBANTE-123')
    if (selection && approvalInput) {
      expect(approvalInput.required).toBe(true)
      expect(within(approvalInput).getByRole('option', { name: /200,00/ })).toBeTruthy()
      expect(within(approvalInput).getByRole('option', { name: /350,00/ })).toBeTruthy()
      await user.type(amountInput, amount)
      await user.click(screen.getByRole('button', { name: 'Informar transferencia' }))
      expect(mockApi.mock.calls.some(([path]) => path === paymentPath)).toBe(false)
      await user.selectOptions(approvalInput, selection)
    } else {
      expect(selection).toBeNull()
      expect(approvalInput).toBeNull()
      expect(amountInput.value).toBe(amount)
    }
    await user.click(screen.getByRole('button', { name: 'Informar transferencia' }))
    await waitFor(() => expect(mockApi).toHaveBeenCalledWith(paymentPath, {
      method: 'POST', idempotencyKey: expect.any(String),
      body: { version: row.version, date: '2026-11-09', reference: 'COMPROBANTE-123', amount: amountInput.value, ...(selection ? { approval_id: selection } : {}) },
    }))
  })

  it('revela los datos bancarios al pedirlos y los borra al cerrar la ficha', async () => {
    const detail = { ...row, state: 'TO_PAY', bank_configured: true, bank_changed: true, actions: ['bank-details'] }
    const revealPath = `${adminList}${row.id}/bank-details/`
    mockApi.mockImplementation(async path => {
      if (path.startsWith(`${adminList}?`)) return { ...page, results: [detail] }
      if (path === `${adminList}${row.id}/`) return detail
      if (path === revealPath) return { cbu: '0000000000000000000001', alias: 'cuenta.alias' }
      return lookups(path)
    })
    const user = userEvent.setup()
    render(<Commissions section="commissions" />)
    const toggle = await screen.findByRole('button', { name: /Café con descuento/ })
    await user.click(toggle)
    expect(await screen.findByText('Los datos bancarios cambiaron después de la aprobación.')).toBeTruthy()
    expect(mockApi.mock.calls.some(([path]) => path === revealPath)).toBe(false)
    await user.selectOptions(screen.getByLabelText('Motivo de consulta'), 'verify')
    await user.click(screen.getByRole('button', { name: 'Revelar datos bancarios' }))
    expect(await screen.findByText('0000000000000000000001')).toBeTruthy()
    expect(mockApi).toHaveBeenCalledWith(revealPath, { method: 'POST', body: { reason: 'verify' }, signal: expect.any(AbortSignal) })
    await user.click(toggle)
    expect(screen.queryByText('0000000000000000000001')).toBeNull()
    await user.click(toggle)
    expect(await screen.findByRole('button', { name: 'Revelar datos bancarios' })).toBeTruthy()
    expect(screen.queryByText('cuenta.alias')).toBeNull()
  })


  it('descarta una revelación bancaria que llega después de cambiar de sesión', async () => {
    const detail = { ...row, state: 'TO_PAY', bank_configured: true, actions: ['bank-details'] }
    const revealPath = `${adminList}${row.id}/bank-details/`
    let release: (details: { cbu: string; alias: string }) => void = () => {}
    const delayedBank = new Promise<{ cbu: string; alias: string }>(resolve => { release = resolve })
    mockApi.mockImplementation(async path => {
      if (path.startsWith(`${adminList}?`)) return { ...page, results: [detail] }
      if (path === `${adminList}${row.id}/`) return detail
      if (path === revealPath) return delayedBank
      return lookups(path)
    })
    const user = userEvent.setup()
    render(<Commissions section="commissions" />)
    await user.click(await screen.findByRole('button', { name: /Café con descuento/ }))
    await user.selectOptions(await screen.findByLabelText('Motivo de consulta'), 'verify')
    await user.click(screen.getByRole('button', { name: 'Revelar datos bancarios' }))
    await screen.findByRole('button', { name: 'Cancelar consulta' })

    await act(async () => {
      invalidatePrivateState()
      release({ cbu: '0000000000000000000001', alias: 'cuenta.alias' })
    })
    expect(screen.queryByText('0000000000000000000001')).toBeNull()
    expect(screen.queryByText('cuenta.alias')).toBeNull()
  })

  it('muestra un error por campo y exige recargar la versión tras un conflicto', async () => {
    const rulesPath = '/api/v1/admin/commission-rules/'
    const globalPath = `${rulesPath}global/`
    let requests = 0
    let commands = 0
    mockApi.mockImplementation(async path => {
      if (path === rulesPath) return { global: { rate: '5.00', version: `v${++requests}`, provider_id: null, provider_name: null }, providers: [] }
      if (path === globalPath) {
        if (++commands === 1) throw new ApiError(400, 'Inválido', { rate: ['Verificá el porcentaje.'] })
        if (commands === 2) throw new ApiError(409, 'Cambió')
        return {}
      }
      throw new Error(`Ruta inesperada: ${path}`)
    })
    render(<Commissions section="commission-rules" />)
    const save = await screen.findByRole('button', { name: 'Guardar regla global' })
    fireEvent.click(save)
    expect(await screen.findByText('Verificá el porcentaje.')).toBeTruthy()
    expect(screen.getByLabelText('Porcentaje global').getAttribute('aria-invalid')).toBe('true')
    fireEvent.click(save)
    fireEvent.click(await screen.findByRole('button', { name: 'Actualizar datos' }))
    const input = await screen.findByLabelText('Porcentaje global')
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar regla global' }))
    expect(await screen.findByText('Cambios guardados.')).toBeTruthy()
    const last = mockApi.mock.calls.filter(([path]) => path === globalPath).at(-1)?.[1]
    expect(last).toMatchObject({ method: 'PUT', body: { version: 'v2', rate: null } })
  })
})
