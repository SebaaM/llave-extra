import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { User } from '../api'
import { ProductShell } from '../Layout'

const tourist: User = { id: 41, email: 'cliente@example.test', role: 'TOURIST', email_verified: true }
const shell = (user: User | null, path = '/beneficios', hasRecommendations = true) => <ProductShell user={user} path={path} hasRecommendations={hasRecommendations}><main id="contenido"><h1>Contenido de prueba</h1></main></ProductShell>

afterEach(cleanup)

describe('navegación del Cliente', () => {
  it('ofrece Recomendaciones solo cuando hay selecciones recibidas disponibles', () => {
    const { rerender } = render(shell(tourist, '/beneficios', false))
    expect(screen.queryByRole('link', { name: 'Recomendaciones' })).toBeNull()
    rerender(shell(tourist, '/beneficios', true))
    expect(screen.getAllByRole('link', { name: 'Recomendaciones' })).toHaveLength(1)
    rerender(shell(tourist, '/beneficios', false))
    expect(screen.queryByRole('link', { name: 'Recomendaciones' })).toBeNull()
  })

  it('oculta Recomendaciones si el shell no recibió disponibilidad explícita', () => {
    render(<ProductShell user={tourist} path="/beneficios"><h1>Beneficios</h1></ProductShell>)
    expect(screen.queryByRole('link', { name: 'Recomendaciones' })).toBeNull()
  })

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
  it.each(['Tienda', 'Cuenta'])('conserva el foco en el contenido de destino al activar %s con Enter', async label => {
    const keyboard = userEvent.setup()
    const destination = label === 'Tienda' ? '/tienda' : '/perfil'
    const view = (path: string) => <ProductShell user={tourist} path={path}><main id="contenido"><h1>{path === destination ? 'Página de destino' : 'Página inicial'}</h1><button>Acción del destino</button></main></ProductShell>
    const { rerender } = render(view('/beneficios'))
    const listener = () => rerender(view(destination))
    window.addEventListener('llave:navigate', listener)
    try {
      screen.getByText('Menú').focus()
      await keyboard.keyboard('{Enter}')
      await keyboard.tab()
      if (label === 'Cuenta') await keyboard.tab()
      expect(document.activeElement).toBe(screen.getByRole('link', { name: label }))
      await keyboard.keyboard('{Enter}')
      expect(screen.getByRole('heading', { name: 'Página de destino' })).toBeTruthy()
      expect(document.activeElement).toBe(screen.getByRole('heading'))
      expect(screen.getByText('Menú').closest('details')!.open).toBe(false)
      await keyboard.tab()
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Acción del destino' }))
    } finally { window.removeEventListener('llave:navigate', listener) }
  })

  it('mantiene el destino de foco mientras carga y al reemplazar el contenido', async () => {
    const keyboard = userEvent.setup()
    const view = (path: string, loading = false) => <ProductShell user={tourist} path={path}>{loading
      ? <main id="contenido" role="status">Cargando página…</main>
      : <main id="contenido"><h1>Cuenta disponible</h1><button>Acción de cuenta</button></main>}</ProductShell>
    const { rerender } = render(view('/beneficios'))
    const listener = () => rerender(view('/perfil', true))
    window.addEventListener('llave:navigate', listener)
    try {
      screen.getByText('Menú').focus()
      await keyboard.keyboard('{Enter}')
      await keyboard.tab()
      await keyboard.tab()
      await keyboard.keyboard('{Enter}')
      const destination = screen.getByRole('region', { name: 'Contenido de la página' })
      expect(screen.getByRole('status').textContent).toBe('Cargando página…')
      expect(document.activeElement).toBe(destination)
      rerender(view('/perfil'))
      expect(document.activeElement).toBe(destination)
      await keyboard.tab()
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Acción de cuenta' }))
    } finally { window.removeEventListener('llave:navigate', listener) }
  })

  it.each([
    { ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }, { target: '_blank' }, { download: '' },
  ])('no cierra ni mueve el foco al abrir otro contexto: %j', options => {
    render(shell(tourist))
    const menu = screen.getByText('Menú').closest('details')!
    menu.open = true
    const link = within(menu).getByRole('link', { name: 'Cuenta' })
    if ('target' in options) link.setAttribute('target', options.target!)
    if ('download' in options) link.setAttribute('download', options.download!)
    link.focus()
    const listener = vi.fn()
    window.addEventListener('llave:navigate', listener)
    try {
      expect(fireEvent.click(link, options)).toBe(true)
      expect(document.activeElement).toBe(link)
      expect(menu.open).toBe(true)
      expect(listener).not.toHaveBeenCalled()
    } finally { window.removeEventListener('llave:navigate', listener) }
  })

  it('no traslada foco por un cambio de ruta ajeno al menú', () => {
    const { rerender } = render(shell(tourist))
    const logout = screen.getByRole('button', { name: 'Salir' })
    logout.focus()
    rerender(shell(tourist, '/mi-viaje'))
    expect(document.activeElement).toBe(logout)
  })
  it('traslada el foco también al activar la ruta actual desde el menú', async () => {
    const keyboard = userEvent.setup()
    render(shell(tourist, '/perfil'))
    screen.getByText('Menú').focus()
    await keyboard.keyboard('{Enter}')
    await keyboard.tab()
    await keyboard.tab()
    await keyboard.keyboard('{Enter}')
    expect(document.activeElement).toBe(screen.getByRole('heading'))
    expect(screen.getByText('Menú').closest('details')!.open).toBe(false)
  })

  it('no conserva una intención de foco tras un clic modificado', () => {
    const { rerender } = render(shell(tourist))
    const menu = screen.getByText('Menú').closest('details')!
    menu.open = true
    const link = within(menu).getByRole('link', { name: 'Cuenta' })
    link.focus()
    fireEvent.click(link, { ctrlKey: true })
    const logout = screen.getByRole('button', { name: 'Salir' })
    logout.focus()
    rerender(shell(tourist, '/perfil'))
    expect(document.activeElement).toBe(logout)
  })
  it('conserva menú y foco al abrir Cómo funciona en otra pestaña', () => {
    render(shell(tourist))
    const menu = screen.getByText('Menú').closest('details')!
    menu.open = true
    const link = within(menu).getByRole('link', { name: 'Cómo funciona' })
    link.focus()
    expect(fireEvent.click(link, { ctrlKey: true })).toBe(true)
    expect(menu.open).toBe(true)
    expect(document.activeElement).toBe(link)
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
