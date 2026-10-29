import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { User } from '../api'
import { ProductShell } from '../Layout'

const tourist: User = { id: 41, email: 'cliente@example.test', role: 'TOURIST', email_verified: true }
const shell = (user: User | null, path = '/beneficios') => <ProductShell user={user} path={path}><main id="contenido"><h1>Contenido de prueba</h1></main></ProductShell>

afterEach(cleanup)

describe('navegación del Cliente', () => {
  it('presenta una sola navegación de tres destinos para el Cliente', () => {
    render(shell(tourist))
    const navigation = screen.getByRole('navigation', { name: 'Tu viaje' })
    expect(within(navigation).getAllByRole('link').map(link => link.textContent)).toEqual(['Beneficios', 'Recomendaciones', 'Mi viaje'])
    for (const name of ['Beneficios', 'Recomendaciones', 'Mi viaje']) expect(screen.getAllByRole('link', { name })).toHaveLength(1)
  })

  it.each(['/beneficios', '/beneficios/oferta-de-prueba'])('marca Beneficios como ruta activa en %s', path => {
    render(shell(tourist, path))
    expect(screen.getByRole('link', { name: 'Beneficios' }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByRole('link', { name: 'Mi viaje' }).hasAttribute('aria-current')).toBe(false)
  })

  it.each([['/recomendaciones', 'Recomendaciones'], ['/mi-viaje', 'Mi viaje']])('marca el destino activo %s', (path, label) => {
    render(shell(tourist, path))
    expect(screen.getByRole('link', { name: label }).getAttribute('aria-current')).toBe('page')
  })

  it('usa un menú nativo con Tienda y Cuenta y cierra al navegar', () => {
    render(shell(tourist))
    const summary = screen.getByText('Menú')
    expect(summary.tagName).toBe('SUMMARY')
    const menu = summary.closest('details')!
    menu.open = true
    const listener = vi.fn()
    window.addEventListener('llave:navigate', listener)
    try {
      expect(within(menu).getByRole('link', { name: 'Tienda' }).getAttribute('href')).toBe('/tienda')
      fireEvent.click(within(menu).getByRole('link', { name: 'Cuenta' }))
      expect(listener.mock.calls[0][0].detail).toBe('/perfil')
      expect(menu.open).toBe(false)
    } finally { window.removeEventListener('llave:navigate', listener) }
  })

  it.each(['/consumo', '/consumo/', '/ingresar', '/registro', '/recuperar', '/restablecer-clave', '/verificar-email'])('retira la barra al ingresar PIN o credenciales: %s', path => {
    render(shell(tourist, path))
    expect(screen.queryByRole('navigation', { name: 'Tu viaje' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Salir' })).toBeTruthy()
  })

  it.each([null, 'PROVIDER', 'COLLABORATOR', 'ADMIN'] as const)('conserva accesos de otros roles y no muestra barra para %s', role => {
    render(shell(role ? { ...tourist, role } : null))
    expect(screen.queryByRole('navigation', { name: 'Tu viaje' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Beneficios' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Tienda' })).toBeTruthy()
    if (role === 'ADMIN') expect(screen.getByRole('link', { name: 'Administrar' })).toBeTruthy()
    else if (role) expect(screen.getByRole('link', { name: 'Mi espacio' })).toBeTruthy()
    else expect(screen.getByRole('link', { name: 'Ya tengo cuenta' })).toBeTruthy()
  })

  it('cierra con Escape y devuelve el foco al control del menú', () => {
    render(shell(tourist))
    const summary = screen.getByText('Menú')
    const menu = summary.closest('details')!
    menu.open = true
    within(menu).getByRole('link', { name: 'Cuenta' }).focus()
    fireEvent.keyDown(menu, { key: 'Escape' })
    expect(menu.open).toBe(false)
    expect(document.activeElement).toBe(summary)
  })

  it('cierra el menú al cambiar de ruta o de Cliente', () => {
    const { rerender } = render(shell(tourist))
    screen.getByText('Menú').closest('details')!.open = true
    rerender(shell(tourist, '/mi-viaje'))
    expect(screen.getByText('Menú').closest('details')!.open).toBe(false)
    screen.getByText('Menú').closest('details')!.open = true
    rerender(shell({ ...tourist, id: 42 }, '/mi-viaje'))
    expect(screen.getByText('Menú').closest('details')!.open).toBe(false)
  })
  it('desmonta menú y barra al cerrar sesión o cambiar de rol', () => {
    const { rerender } = render(shell(tourist))
    expect(screen.getByRole('navigation', { name: 'Tu viaje' })).toBeTruthy()
    rerender(shell(null))
    expect(screen.queryByRole('navigation', { name: 'Tu viaje' })).toBeNull()
    expect(screen.queryByText('Menú')).toBeNull()
    rerender(shell({ ...tourist, id: 42, role: 'PROVIDER' }))
    expect(screen.queryByRole('navigation', { name: 'Tu viaje' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Mi espacio' })).toBeTruthy()
  })
})
