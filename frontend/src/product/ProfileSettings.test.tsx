import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, currentSessionVersion } from './api'
import type { User } from './api'
import { ProfileSettings } from './ProfileSettings'

vi.mock('./api', async importOriginal => ({
  ...await importOriginal<typeof import('./api')>(),
  api: vi.fn(),
  currentSessionVersion: vi.fn(),
}))

const tourist: User = { id: 1, role: 'TOURIST', email: 'cliente@example.test', email_verified: false }
const collaborator: User = { id: 2, role: 'COLLABORATOR', email: 'colabora@example.test', email_verified: true }
const profile = { first_name: '', last_name: '', complete: false }
const configuredBank = { configured: true, cbu_masked: '•••• 2345', alias_masked: '••••' }

function account(user: User, onResend = vi.fn(async () => {})) {
  return <ProfileSettings user={user} notice="" onResend={onResend} />
}

describe('cuenta propia', () => {
  afterEach(cleanup)
  beforeEach(() => {
    vi.mocked(api).mockReset()
    vi.mocked(currentSessionVersion).mockReturnValue(1)
  })

  it('guarda nombre y apellido y permite reenviar la verificación del Cliente', async () => {
    vi.mocked(api).mockResolvedValueOnce(profile).mockResolvedValueOnce({ first_name: 'Ana', last_name: 'López', complete: true })
    const resend = vi.fn(async () => {})
    render(account(tourist, resend))
    expect(screen.queryByRole('button', { name: 'Datos bancarios' })).toBeNull()
    const name = await screen.findByLabelText('Nombre')
    fireEvent.change(name, { target: { value: ' Ana ' } })
    fireEvent.change(screen.getByLabelText('Apellido'), { target: { value: 'López' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar perfil' }))
    expect(await screen.findByText('Guardamos tu perfil.')).toBeTruthy()
    expect(api).toHaveBeenLastCalledWith('/api/v1/auth/profile/', { method: 'PATCH', body: { first_name: 'Ana', last_name: 'López' } })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Reenviar email de verificación' })))
    expect(resend).toHaveBeenCalledOnce()
  })

  it('descarta nombres de la sesión anterior aunque el transporte resuelva', async () => {
    let resolvePrevious!: (value: unknown) => void
    vi.mocked(api).mockReturnValueOnce(new Promise(resolve => { resolvePrevious = resolve }))
      .mockResolvedValueOnce({ first_name: 'Nombre nuevo', last_name: 'Actual', complete: true })
    const { rerender } = render(account(tourist))
    vi.mocked(currentSessionVersion).mockReturnValue(2)
    rerender(account(collaborator))
    expect(await screen.findByDisplayValue('Nombre nuevo')).toBeTruthy()
    await act(async () => resolvePrevious({ first_name: 'Nombre anterior', last_name: 'Privado', complete: true }))
    expect(screen.queryByDisplayValue('Nombre anterior')).toBeNull()
    expect(screen.getByDisplayValue('Nombre nuevo')).toBeTruthy()
  })

  it('descarta una respuesta bancaria pendiente cuando cambia la sesión', async () => {
    let resolvePrevious!: (value: unknown) => void
    vi.mocked(api).mockResolvedValueOnce(profile)
      .mockReturnValueOnce(new Promise(resolve => { resolvePrevious = resolve }))
      .mockResolvedValueOnce(profile)
    const { rerender } = render(account(collaborator))
    fireEvent.click(screen.getByRole('button', { name: 'Datos bancarios' }))
    expect(screen.getByText('Cargando tus datos bancarios…')).toBeTruthy()
    vi.mocked(currentSessionVersion).mockReturnValue(2)
    rerender(account({ ...collaborator, id: 3 }))
    await act(async () => resolvePrevious(configuredBank))
    expect(screen.queryByText('•••• 2345')).toBeNull()
    expect(await screen.findByLabelText('Nombre')).toBeTruthy()
  })

  it('muestra valores enmascarados y limpia el formulario al salir de la pestaña', async () => {
    vi.mocked(api).mockImplementation(async path => path.endsWith('bank-details/') ? configuredBank : profile)
    render(account(collaborator))
    fireEvent.click(screen.getByRole('button', { name: 'Datos bancarios' }))
    expect(await screen.findByText('•••• 2345')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar datos bancarios' }))
    fireEvent.change(screen.getByLabelText('CBU'), { target: { value: '0000000000000000000000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Perfil personal' }))
    expect(screen.queryByLabelText('CBU')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Datos bancarios' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Cambiar datos bancarios' }))
    expect((screen.getByLabelText('CBU') as HTMLInputElement).value).toBe('')
  })
})
