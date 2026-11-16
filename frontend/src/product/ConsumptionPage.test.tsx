import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConsumePage } from './ConsumptionPage'
import { api, ApiError, invalidatePrivateState } from './api'
import { setConsumptionToken } from './qr-intent'
import type { QrContext } from './qr-context'
import { useVisitCommand } from './useVisitCommand'

vi.mock('./api', async importOriginal => ({ ...await importOriginal<typeof import('./api')>(), api: (path: string, options?: Parameters<typeof api>[1]) =>
  (path.endsWith('/options/') ? optionsRequest : request)(path, options) }))
const request = vi.fn<typeof api>()
const optionsRequest = vi.fn<typeof api>()
const result = { id: 'visit', provider_id: 'provider', collaborator_id: null, award: 450, balance: 1700, state: 'VALID', created_at: '2026-10-28T12:00:00Z' }
const direct: QrContext = { owner: 1, version: 1, revision: 1, status: 'none', collaborator: null, page: null, pageNumber: 1, error: '', missing: [] }
const referred: QrContext = { ...direct, status: 'ready', collaborator: { id: 'folder-a', name: 'Ana' } }
const submit = () => fireEvent.submit(screen.getByLabelText('PIN del negocio').closest('form')!)
function setup(context = direct) {
  const onComplete = vi.fn(), onReferenceDenied = vi.fn(), onDirect = vi.fn()
  const props = { context, onComplete, onReferenceDenied, onDirect }
  const view = render(<ConsumePage {...props} />)
  return { ...view, props, onComplete, onReferenceDenied }
}
beforeEach(() => {
  request.mockReset(); optionsRequest.mockReset().mockResolvedValue({ benefits: [{ id: 'benefit-a', title: 'Oferta de prueba' }] })
  setConsumptionToken('synthetic-qr')
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('validación de visitas desde el contexto actual', () => {
  it('sin QR exige escanear el negocio y no envía un comando', () => {
    setConsumptionToken(null); setup()
    expect(screen.getByRole('heading', { name: 'Falta el QR del negocio' })).toBeTruthy()
    expect(screen.queryByLabelText('PIN del negocio')).toBeNull()
    expect(request).not.toHaveBeenCalled()
  })
  it.each([direct, referred])('congela dos submits síncronos con QR+PIN y referencia explícita: $status', async context => {
    let resolve!: (value: unknown) => void
    request.mockImplementation(() => new Promise(done => { resolve = done }))
    const { onComplete } = setup(context)
    if (context.collaborator) await screen.findByText('Oferta de prueba')
    fireEvent.change(screen.getByLabelText('PIN del negocio'), { target: { value: '000123' } })
    act(() => { submit(); submit() })
    expect(request).toHaveBeenCalledTimes(1)
    expect(request.mock.calls[0][1]?.body).toEqual({ qr_token: 'synthetic-qr', pin: '000123', ...(context.collaborator ? { folder_id: context.collaborator.id, benefit_id: 'benefit-a' } : {}) })
    for (const control of document.querySelectorAll<HTMLInputElement>('form input, form button')) expect(control.disabled).toBe(true)
    expect(onComplete).not.toHaveBeenCalled()
    await act(async () => resolve(result))
    expect(screen.getByRole('heading', { name: 'Visita verificada' })).toBeTruthy()
    expect(screen.getByText('450 créditos acreditados')).toBeTruthy()
    expect(screen.getByText('1.700 créditos')).toBeTruthy()
    expect(onComplete).toHaveBeenCalledOnce()
  })
  it('conserva cuerpo y clave después de timeout aun si cambia el QR o el contexto', async () => {
    request.mockRejectedValueOnce(new DOMException('Tiempo agotado', 'TimeoutError')).mockResolvedValueOnce(result)
    const view = setup(referred)
    await screen.findByText('Oferta de prueba')
    fireEvent.change(screen.getByLabelText('PIN del negocio'), { target: { value: '000123' } })
    submit(); await screen.findByRole('alert')
    const first = request.mock.calls[0][1]
    expect((screen.getByLabelText('PIN del negocio') as HTMLInputElement).disabled).toBe(true)
    setConsumptionToken('new-business-qr')
    view.rerender(<ConsumePage {...view.props} context={{ ...referred, collaborator: { id: 'folder-b', name: 'B' } }} />)
    submit(); await screen.findByRole('heading', { name: 'Visita verificada' })
    expect(request.mock.calls[1][1]).toEqual(first)
    expect(screen.queryByRole('button', { name: 'Continuar sin esta recomendación' })).toBeNull()
  })
  it('una referencia rechazada conserva el cuerpo y bloquea cualquier paso a directo', async () => {
    request.mockRejectedValue(new ApiError(403, 'Referencia revocada'))
    const view = setup(referred)
    await screen.findByText('Oferta de prueba')
    fireEvent.change(screen.getByLabelText('PIN del negocio'), { target: { value: '000123' } })
    submit(); await screen.findByRole('alert')
    expect(view.onReferenceDenied).toHaveBeenCalledOnce()
    expect(screen.queryByRole('button', { name: 'Continuar sin esta recomendación' })).toBeNull()
    view.rerender(<ConsumePage {...view.props} context={{ ...referred, status: 'blocked', error: 'QR no disponible' }} />)
    submit()
    expect(request).toHaveBeenCalledTimes(1)
    expect((screen.getByRole('button', { name: 'Validar visita' }) as HTMLButtonElement).disabled).toBe(true)
  })
  it('permite corregir un PIN rechazado con400 por acción explícita, sin cambiar la referencia', async () => {
    request.mockRejectedValueOnce(new ApiError(400, 'QR o PIN inválido')).mockResolvedValueOnce(result)
    setup(referred)
    await screen.findByText('Oferta de prueba')
    fireEvent.change(screen.getByLabelText('PIN del negocio'), { target: { value: '000123' } })
    submit(); await screen.findByRole('alert')
    const first = request.mock.calls[0][1]
    fireEvent.click(screen.getByRole('button', { name: 'Corregir PIN' }))
    expect(screen.queryByRole('button', { name: 'Continuar sin esta recomendación' })).toBeNull()
    fireEvent.change(screen.getByLabelText('PIN del negocio'), { target: { value: '000124' } })
    submit(); await screen.findByRole('heading', { name: 'Visita verificada' })
    expect(request.mock.calls[1][1]?.body).toEqual({ qr_token: 'synthetic-qr', pin: '000124', folder_id: 'folder-a', benefit_id: 'benefit-a' })
    expect(request.mock.calls[1][1]?.idempotencyKey).not.toBe(first?.idempotencyKey)
  })
  it.each(['qr', 'reference', 'both'])('no ofrece corregir el PIN de A con la intención B recibida durante el POST: %s', async changed => {
    let reject!: (reason: unknown) => void
    request.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail })).mockResolvedValueOnce(result)
    const view = setup(referred)
    await screen.findByText('Oferta de prueba')
    fireEvent.change(screen.getByLabelText('PIN del negocio'), { target: { value: '000123' } })
    submit()
    const first = request.mock.calls[0][1]
    if (changed !== 'reference') setConsumptionToken('business-qr-b')
    view.rerender(<ConsumePage {...view.props} context={changed !== 'qr' ? { ...referred, collaborator: { id: 'guide-b', name: 'Beatriz' } } : referred} />)
    await act(async () => reject(new ApiError(400, 'QR o PIN inválido')))
    expect(screen.queryByRole('button', { name: 'Corregir PIN' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Continuar sin esta recomendación' })).toBeNull()
    submit(); await screen.findByRole('heading', { name: 'Visita verificada' })
    expect(request.mock.calls[1][1]).toEqual(first)
    expect(first?.body).toEqual({ qr_token: 'synthetic-qr', pin: '000123', folder_id: 'folder-a', benefit_id: 'benefit-a' })
  })
  it('la corrección en el comando solo cambia PIN y clave aunque el llamador aporte otro QR y referencia', async () => {
    let reject!: (reason: unknown) => void
    request.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail })).mockResolvedValueOnce(result)
    const hook = renderHook(useVisitCommand)
    const bodyA = { qr_token: 'business-qr-a', pin: '000123', folder_id: 'guide-a', benefit_id: 'benefit-a' }
    let pending!: ReturnType<typeof hook.result.current.submit>
    act(() => { pending = hook.result.current.submit(bodyA) })
    act(() => { setConsumptionToken('business-qr-b'); hook.result.current.newIntent() })
    await act(async () => { reject(new ApiError(400, 'QR o PIN inválido')); await pending })
    act(() => hook.result.current.correct())
    await act(async () => { await hook.result.current.submit({ qr_token: 'business-qr-b', pin: '000124', folder_id: 'guide-b', benefit_id: 'benefit-b' }) })
    expect(request.mock.calls[0][1]?.body).toEqual(bodyA)
    expect(request.mock.calls[1][1]?.body).toEqual({ ...bodyA, pin: '000124' })
    expect(request.mock.calls[1][1]?.idempotencyKey).not.toBe(request.mock.calls[0][1]?.idempotencyKey)
  })
  it('no ofrece corregir PIN después de timeout seguido de400 ni borra su comando', async () => {
    request.mockRejectedValueOnce(new DOMException('Timeout', 'TimeoutError')).mockRejectedValueOnce(new ApiError(400, 'QR o PIN inválido')).mockResolvedValueOnce(result)
    const view = setup(referred)
    await screen.findByText('Oferta de prueba')
    fireEvent.change(screen.getByLabelText('PIN del negocio'), { target: { value: '000123' } })
    submit(); await screen.findByRole('alert')
    const first = request.mock.calls[0][1]
    submit(); await screen.findByText('QR o PIN inválido')
    expect(screen.queryByRole('button', { name: 'Corregir PIN' })).toBeNull()
    setConsumptionToken('another-qr')
    view.rerender(<ConsumePage {...view.props} context={{ ...referred, collaborator: { id: 'other-guide', name: 'B' } }} />)
    submit(); await screen.findByRole('heading', { name: 'Visita verificada' })
    expect(request.mock.calls[1][1]).toEqual(first)
    expect(request.mock.calls[2][1]).toEqual(first)
  })
  it.each(['pending', 'loading', 'blocked', 'error'] as const)('no envía consumo mientras la referencia está %s', status => {
    setup({ ...referred, status })
    submit()
    expect(request).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Continuar sin esta recomendación' })).toBeNull()
  })
  it('exige elegir el beneficio exacto si el negocio tiene varias opciones', async () => {
    optionsRequest.mockResolvedValue({ benefits: [{ id: 'a', title: 'Oferta A' }, { id: 'b', title: 'Oferta B' }] })
    request.mockResolvedValue({ ...result, collaborator_id: 'folder-a' })
    setup(referred)
    const selector = await screen.findByLabelText('Beneficio')
    fireEvent.change(screen.getByLabelText('PIN del negocio'), { target: { value: '000123' } })
    submit()
    expect(request).not.toHaveBeenCalled()
    fireEvent.change(selector, { target: { value: 'b' } })
    submit()
    await screen.findByText('Folio de la visita')
    expect(request.mock.calls[0][0]).toBe('/api/v2/consumptions/')
    expect(request.mock.calls[0][1]?.body).toMatchObject({ benefit_id: 'b', folder_id: 'folder-a' })
  })
  it('pega doce dígitos con ceros iniciales y rechaza PIN inválido en submit programático', async () => {
    request.mockResolvedValue(result); setup()
    const keyboard = userEvent.setup(), pin = screen.getByLabelText('PIN del negocio')
    fireEvent.change(pin, { target: { value: '123' } }); submit()
    expect(request).not.toHaveBeenCalled()
    await keyboard.clear(pin); await keyboard.click(pin); await keyboard.paste('000123456789')
    expect((pin as HTMLInputElement).value).toBe('000123456789')
    submit(); await screen.findByRole('heading', { name: 'Visita verificada' })
    expect((request.mock.calls[0][1]?.body as { pin: string }).pin).toBe('000123456789')
  })
  it.each([{ ...result, award: 0 }, { ...result, state: 'ANNULLED' }, { ...result, state: 'PENDING' }])('diferencia un resultado sin premio o sin VALID: $state / $award', async value => {
    request.mockResolvedValue(value); setup()
    fireEvent.change(screen.getByLabelText('PIN del negocio'), { target: { value: '000123' } })
    submit(); await screen.findByRole('status')
    if (value.state === 'VALID') expect(screen.getByText('0 créditos acreditados')).toBeTruthy()
    else { expect(screen.queryByText(/créditos acreditados/)).toBeNull(); expect(document.querySelector('.client-result-stamp')).toBeNull() }
  })
  it.each([false, true])('descarta un POST tardío al cambiar sesión o desmontar (%s)', async unmount => {
    let resolve!: (value: unknown) => void
    request.mockImplementation(() => new Promise(done => { resolve = done }))
    const { onComplete } = setup()
    fireEvent.change(screen.getByLabelText('PIN del negocio'), { target: { value: '000123' } }); submit()
    if (unmount) cleanup(); else invalidatePrivateState()
    setConsumptionToken('another-session-qr')
    await act(async () => resolve(result))
    expect(onComplete).not.toHaveBeenCalled()
    expect(screen.queryByText('Visita verificada')).toBeNull()
    const intent = await import('./qr-intent'); expect(intent.consumptionToken).toBe('another-session-qr')
  })
})
