import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Auth } from './PublicPages'
import userEvent from '@testing-library/user-event'
import { setResetToken } from './qr-intent'

const mocks = vi.hoisted(() => ({ api: vi.fn(), authenticate: vi.fn(), register: vi.fn() }))
vi.mock('./api', async importOriginal => ({ ...await importOriginal<typeof import('./api')>(), ...mocks }))
afterEach(() => { cleanup(); vi.clearAllMocks() })
const props = { onLogin: vi.fn(), onRegistered: vi.fn() }

describe('acceso del Cliente', () => {
  it('muestra y oculta la contraseña con teclado sin enviarla ni perder el valor', async () => {
    const keyboard = userEvent.setup()
    render(<Auth mode="login" {...props} />)
    const password = screen.getByLabelText('Contraseña') as HTMLInputElement
    fireEvent.change(password, { target: { value: 'clave sintética' } })
    screen.getByRole('button', { name: 'Mostrar contraseña' }).focus()
    await keyboard.keyboard('{Enter}')
    expect(password.type).toBe('text')
    expect(password.value).toBe('clave sintética')
    expect(screen.getByRole('button', { name: 'Ocultar contraseña' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Ocultar contraseña' }))
    expect(password.type).toBe('password')
    expect(password.autocomplete).toBe('current-password')
    expect(mocks.authenticate).not.toHaveBeenCalled()
  })

  it('conserva el token de recuperación en memoria hasta confirmar la nueva contraseña', async () => {
    setResetToken('token-sintetico')
    mocks.api.mockResolvedValueOnce({})
    render(<Auth mode="reset" {...props} />)
    expect(screen.queryByLabelText('Email')).toBeNull()
    const password = screen.getByLabelText('Contraseña') as HTMLInputElement
    expect(password.autocomplete).toBe('new-password')
    fireEvent.change(password, { target: { value: 'clave nueva sintética' } })
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar contraseña' }))
    await act(async () => {})
    expect(mocks.api).toHaveBeenCalledWith('/api/v1/auth/reset-password/', { method: 'POST', auth: false, body: { token: 'token-sintetico', password: 'clave nueva sintética' } })
    expect(screen.getByRole('status').textContent).toMatch(/La contraseña se actualizó/)
  })

  it('asocia el email inválido al campo sin llamar al servidor', () => {
    render(<Auth mode="forgot" {...props} />)
    const email = screen.getByLabelText('Email')
    fireEvent.change(email, { target: { value: 'no-es-un-email' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar instrucciones' }))
    expect(email.getAttribute('aria-invalid')).toBe('true')
    expect(email.getAttribute('aria-describedby')).toBe(screen.getByRole('alert').id)
    expect(document.activeElement).toBe(email)
    expect(mocks.api).not.toHaveBeenCalled()
  })

  it('bloquea el reenvío durante la recuperación y conserva la respuesta genérica', async () => {
    let finish!: (value: unknown) => void
    mocks.api.mockReturnValueOnce(new Promise(resolve => { finish = resolve }))
    render(<Auth mode="forgot" {...props} />)
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'cliente@example.test' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar instrucciones' }))
    expect((screen.getByRole('button', { name: 'Un momento…' }) as HTMLButtonElement).disabled).toBe(true)
    await act(async () => finish({ detail: 'no mostrar información de cuentas' }))
    expect(screen.getByRole('status').textContent).toBe('Si corresponde, recibirás un email con los pasos para continuar.')
    expect((screen.getByRole('button', { name: 'Enviar instrucciones' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('delega la política de contraseña al registro sin selector de rol', async () => {
    mocks.register.mockResolvedValueOnce({})
    render(<Auth mode="register" referral="referencia-sintetica" {...props} />)
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'cliente@example.test' } })
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'corta' } })
    fireEvent.click(screen.getByRole('button', { name: 'Crear mi cuenta' }))
    await act(async () => {})
    expect(mocks.register).toHaveBeenCalledWith('cliente@example.test', 'corta', 'referencia-sintetica')
    expect(screen.queryByRole('combobox')).toBeNull()
  })
})
