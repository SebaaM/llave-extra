import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConsumePage } from './ConsumptionPage'
import { QrPage } from './ReferencePage'
import { api, ApiError, invalidatePrivateState } from './api'
import { referralToken, setConsumptionToken, setReferralToken } from './qr-intent'

vi.mock('./api', async importOriginal => ({ ...await importOriginal<typeof import('./api')>(), api: vi.fn() }))
const request = vi.mocked(api)
const result = { id: 'visit', provider_id: 'provider', collaborator_id: null, award: 450, balance: 1700, state: 'VALID', created_at: '2026-10-28T12:00:00Z' }
const folders = [{ collaborator_id: 'folder-a', granted_at: '' }, { collaborator_id: 'folder-b', granted_at: '' }]
const submit = () => fireEvent.submit(screen.getByLabelText('PIN del negocio').closest('form')!)
function setup() { const onComplete = vi.fn(); render(<ConsumePage folders={folders} onComplete={onComplete} />); return onComplete }

beforeEach(() => { request.mockReset(); setConsumptionToken('synthetic-qr'); setReferralToken(null) })
afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('validación de visitas', () => {
  it('ofrece enlaces de recomendaciones solo con disponibilidad autorizada también después de recibir el QR', async () => {
    setReferralToken('synthetic-reference')
    request.mockResolvedValue({})
    const props = { signedIn: true, canRedeem: true, folders, onRedeemed: vi.fn() }
    const { rerender, container } = render(<QrPage {...props} />)
    expect(container.textContent).not.toMatch(/prestador|colaborador|carpeta|servidor/i)
    expect(screen.queryByRole('link', { name: /Ver recomendaciones recibidas/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Abrir recomendaciones' }))
    await screen.findByText('Las recomendaciones se vincularon a tu cuenta.')
    expect(screen.queryByRole('link', { name: /Explorar recomendaciones/ })).toBeNull()
    rerender(<QrPage {...props} checkingRecommendations />)
    expect(screen.getByText('Estamos comprobando los beneficios disponibles.')).toBeTruthy()
    rerender(<QrPage {...props} hasRecommendations />)
    expect(screen.getByRole('link', { name: /Explorar recomendaciones/ })).toBeTruthy()
    expect(screen.getByRole('link', { name: /Ver recomendaciones recibidas/ })).toBeTruthy()
  })

  it('sin QR pide escanear sin permitir un comando', () => {
    setConsumptionToken(null); setup()
    expect(screen.getByRole('heading', { name: 'Falta el QR del negocio' })).toBeTruthy()
    expect(screen.queryByLabelText('PIN del negocio')).toBeNull()
    expect(request).not.toHaveBeenCalled()
  })

  it('bloquea dos submits síncronos y congela los controles hasta la confirmación autoritativa', async () => {
    let resolve!: (value: unknown) => void
    request.mockImplementation(() => new Promise(done => { resolve = done }))
    const complete = setup()
    fireEvent.click(screen.getByLabelText('Por una recomendación privada'))
    fireEvent.change(screen.getByLabelText('PIN del negocio'), { target: { value: '000123' } })
    const form = screen.getByLabelText('PIN del negocio').closest('form')!
    act(() => { fireEvent.submit(form); fireEvent.submit(form) })
    expect(request).toHaveBeenCalledTimes(1)
    for (const control of form.querySelectorAll<HTMLInputElement>('input, select, button')) expect(control.disabled).toBe(true)
    expect(screen.queryByText('Visita verificada')).toBeNull()
    expect(complete).not.toHaveBeenCalled()
    expect(request.mock.calls[0][1]?.body).toEqual({ qr_token: 'synthetic-qr', pin: '000123', folder_id: 'folder-a' })
    await act(async () => resolve(result))
    expect(screen.getByRole('heading', { name: 'Visita verificada' })).toBeTruthy()
    expect(screen.getByText('450 créditos acreditados')).toBeTruthy()
    expect(screen.getByText('1.700 créditos')).toBeTruthy()
    expect(complete).toHaveBeenCalledOnce()
  })

  it('conserva cuerpo y clave tras timeout; cambiar el comando rota la clave y no degrada referencia denegada', async () => {
    request.mockRejectedValueOnce(new DOMException('Tiempo de espera agotado', 'TimeoutError'))
      .mockRejectedValueOnce(new ApiError(403, 'Referencia revocada', { detail: 'Referencia revocada' }))
      .mockRejectedValueOnce(new ApiError(409, 'Ya registraste esta visita', { detail: 'Ya registraste esta visita' }))
    setup()
    fireEvent.click(screen.getByLabelText('Por una recomendación privada'))
    fireEvent.change(screen.getByLabelText('PIN del negocio'), { target: { value: '000123' } })
    submit(); await screen.findByRole('alert')
    const first = request.mock.calls[0][1]
    submit(); await screen.findByText('Referencia revocada')
    expect(request.mock.calls[1][1]).toEqual(first)
    expect(request).toHaveBeenCalledTimes(2)
    expect((request.mock.calls[1][1]?.body as { folder_id: string }).folder_id).toBe('folder-a')
    fireEvent.click(screen.getByLabelText('Lo descubrí por mi cuenta'))
    submit(); await screen.findByText('Ya registraste esta visita')
    expect(request.mock.calls[2][1]?.idempotencyKey).not.toBe(first?.idempotencyKey)
    expect(request.mock.calls[2][1]?.body).toEqual({ qr_token: 'synthetic-qr', pin: '000123' })
    expect(screen.queryByText('Visita verificada')).toBeNull()
  })

  it('pega doce dígitos con ceros iniciales y bloquea PIN inválido incluso en submit programático', async () => {
    request.mockResolvedValue(result)
    setup()
    const keyboard = userEvent.setup()
    const pin = screen.getByLabelText('PIN del negocio')
    fireEvent.change(pin, { target: { value: '123' } }); submit()
    expect(request).not.toHaveBeenCalled()
    await keyboard.clear(pin); await keyboard.click(pin); await keyboard.paste('000123456789')
    expect((pin as HTMLInputElement).value).toBe('000123456789')
    submit(); await screen.findByRole('heading', { name: 'Visita verificada' })
    expect((request.mock.calls[0][1]?.body as { pin: string }).pin).toBe('000123456789')
  })

  it.each([{ ...result, award: 0 }, { ...result, state: 'ANNULLED' }, { ...result, state: 'PENDING' }])('diferencia resultado sin premio o sin VALID: $state / $award', async value => {
    request.mockResolvedValue(value); setup()
    fireEvent.change(screen.getByLabelText('PIN del negocio'), { target: { value: '000123' } })
    submit(); await screen.findByRole('status')
    if (value.state === 'VALID') {
      expect(screen.getByText('0 créditos acreditados')).toBeTruthy()
      expect(screen.getByRole('heading', { name: 'Visita verificada' })).toBeTruthy()
    } else {
      expect(screen.queryByText('Visita verificada')).toBeNull()
      expect(screen.queryByText(/créditos acreditados/)).toBeNull()
      expect(document.querySelector('.client-result-stamp')).toBeNull()
      expect(screen.getByText(value.state === 'ANNULLED' ? 'Visita anulada' : 'Estado recibido: PENDING')).toBeTruthy()
    }
  })

  it.each(['pin', 'qr', 'folder'] as const)('rota la clave cuando cambia %s después de una respuesta incierta', async field => {
    request.mockRejectedValue(new DOMException('Timeout', 'TimeoutError'))
    setup()
    fireEvent.click(screen.getByLabelText('Por una recomendación privada'))
    fireEvent.change(screen.getByLabelText('PIN del negocio'), { target: { value: '000123' } })
    submit(); await screen.findByRole('alert')
    const original = request.mock.calls[0][1]
    if (field === 'pin') fireEvent.change(screen.getByLabelText('PIN del negocio'), { target: { value: '000124' } })
    if (field === 'qr') setConsumptionToken('new-synthetic-qr')
    if (field === 'folder') fireEvent.change(screen.getByLabelText('Recomendaciones recibidas'), { target: { value: 'folder-b' } })
    submit(); await screen.findByRole('alert')
    expect(request.mock.calls[1][1]?.idempotencyKey).not.toBe(original?.idempotencyKey)
    expect(request.mock.calls[1][1]?.body).not.toEqual(original?.body)
  })

  it.each([false, true])('descarta POST tardío tras cambio de sesión o desmontaje (desmontar: %s)', async unmount => {
    let resolve!: (value: unknown) => void
    request.mockImplementation(() => new Promise(done => { resolve = done }))
    const complete = setup()
    fireEvent.change(screen.getByLabelText('PIN del negocio'), { target: { value: '000123' } })
    submit()
    if (unmount) cleanup()
    else invalidatePrivateState()
    setConsumptionToken('another-session-qr')
    await act(async () => resolve(result))
    expect(complete).not.toHaveBeenCalled()
    expect(screen.queryByText('Visita verificada')).toBeNull()
    const intent = await import('./qr-intent')
    expect(intent.consumptionToken).toBe('another-session-qr')
  })

  it('la referencia se conserva durante ingreso y se elimina solo al confirmarla sin acreditar visitas', async () => {
    setReferralToken('synthetic-reference')
    const done = vi.fn()
    const view = render(<QrPage signedIn={false} canRedeem folders={[]} onRedeemed={done} />)
    expect(referralToken).toBe('synthetic-reference')
    expect(screen.getByRole('link', { name: 'Ya tengo cuenta' }).getAttribute('href')).toBe('/ingresar')
    view.rerender(<QrPage signedIn canRedeem folders={[]} onRedeemed={done} />)
    request.mockResolvedValue({})
    fireEvent.click(screen.getByRole('button', { name: 'Abrir recomendaciones' }))
    await screen.findByText('Las recomendaciones se vincularon a tu cuenta.')
    expect(referralToken).toBeNull()
    expect(screen.getByText('Este QR abre recomendaciones; no acredita visitas ni créditos.')).toBeTruthy()
    expect(request).toHaveBeenCalledWith('/api/v1/referrals/redeem/', { method: 'POST', body: { token: 'synthetic-reference' } })
    expect(done).toHaveBeenCalledOnce()
  })

  it('conserva referencia rechazada y descarta una redención tardía al cambiar sesión', async () => {
    setReferralToken('synthetic-reference')
    request.mockRejectedValueOnce(new ApiError(403, 'Referencia revocada', { detail: 'Referencia revocada' }))
    const done = vi.fn()
    render(<QrPage signedIn canRedeem folders={[]} onRedeemed={done} />)
    const form = screen.getByLabelText('Código de recomendaciones').closest('form')!
    fireEvent.submit(form); await screen.findByRole('alert')
    expect(referralToken).toBe('synthetic-reference')
    let resolve!: (value: unknown) => void
    request.mockImplementation(() => new Promise(finish => { resolve = finish }))
    act(() => { fireEvent.submit(form); fireEvent.submit(form) })
    expect(request).toHaveBeenCalledTimes(2)
    expect((screen.getByLabelText('Código de recomendaciones') as HTMLInputElement).disabled).toBe(true)
    invalidatePrivateState(); setReferralToken('another-session-reference')
    await act(async () => resolve({}))
    expect(referralToken).toBe('another-session-reference')
    expect(done).not.toHaveBeenCalled()
    expect(screen.queryByText('Las recomendaciones se vincularon a tu cuenta.')).toBeNull()
  })
})
