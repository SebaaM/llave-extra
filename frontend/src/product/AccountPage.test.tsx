import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { AccountPage } from './AccountPage'
import { ApiError } from './api'

afterEach(cleanup)
const user = { id: 804, email: `${'viajera'.repeat(14)}@example.test`, role: 'TOURIST' as const, email_verified: false }

describe('perfil del Cliente', () => {
  it('presenta el correo completo, verificación pendiente y enlace a Mi viaje', () => {
    render(<AccountPage user={user} notice="" onResend={vi.fn()} />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(user.email)
    expect(screen.getByText('Email pendiente de verificación')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Ver Mi viaje' }).getAttribute('href')).toBe('/mi-viaje')
  })
  it('evita solicitudes simultáneas y presenta errores sin reemplazar el perfil', async () => {
    let fail!: (reason: unknown) => void
    const resend = vi.fn(() => new Promise<void>((_resolve, reject) => { fail = reject }))
    render(<AccountPage user={user} notice="" onResend={resend} />)
    fireEvent.click(screen.getByRole('button', { name: 'Reenviar email de verificación' }))
    const busy = screen.getByRole('button', { name: 'Enviando…' }) as HTMLButtonElement
    expect(busy.disabled).toBe(true)
    fireEvent.click(busy)
    expect(resend).toHaveBeenCalledTimes(1)
    await act(async () => fail(new ApiError(429, 'Probá de nuevo más tarde.')))
    expect(screen.getByRole('alert').textContent).toBe('Hubo demasiados intentos. Esperá un momento y volvé a probar.')
    expect((screen.getByRole('button', { name: 'Reenviar email de verificación' }) as HTMLButtonElement).disabled).toBe(false)
    expect(screen.getByRole('heading', { level: 1 })).toBeTruthy()
  })
  it('muestra la confirmación genérica y no ofrece reenviar si ya está verificado', () => {
    render(<AccountPage user={{ ...user, email_verified: true }} notice="Si corresponde, recibirás un email para verificar tu cuenta." onResend={vi.fn()} />)
    expect(screen.getByText('Email verificado')).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByRole('status').textContent).toMatch(/Si corresponde/)
  })
  it('habilita de nuevo el reenvío después de una respuesta correcta', async () => {
    let finish!: () => void
    const resend = vi.fn(() => new Promise<void>(resolve => { finish = resolve }))
    render(<AccountPage user={user} notice="" onResend={resend} />)
    fireEvent.click(screen.getByRole('button', { name: 'Reenviar email de verificación' }))
    expect((screen.getByRole('button', { name: 'Enviando…' }) as HTMLButtonElement).disabled).toBe(true)
    await act(async () => finish())
    expect((screen.getByRole('button', { name: 'Reenviar email de verificación' }) as HTMLButtonElement).disabled).toBe(false)
  })
})
