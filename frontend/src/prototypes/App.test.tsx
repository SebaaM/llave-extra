import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode } from 'react'
import App from '../App'

const demoKey = 'llave-extra-prototipo-v1'
const route = (path: string) => window.history.replaceState({}, '', path)
const grant = (verified = false) => sessionStorage.setItem(demoKey, JSON.stringify({ user: true, verified, grant: true, consumed: [] }))

beforeEach(() => {
  sessionStorage.clear()
  route('/prototipos')
  document.title = 'Llave Extra'
  vi.stubGlobal('scrollTo', vi.fn())
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('las rutas de prototipos', () => {
  for (const [variant, heading] of [
    ['guia', /La ciudad tiene.*mucho por contar/],
    ['pasaporte', /Cada parada.*cuenta una historia/],
    ['beneficios', /Tu viaje tiene.*ventajas/],
  ]) {
    it(`muestra ${variant} sin publicar la carpeta ni sus prestadores`, () => {
      route(`/prototipos/${variant}`)
      render(<App />)
      expect(screen.getByRole('heading', { level: 1, name: heading })).toBeTruthy()
      expect(screen.queryByText('Kuar Resto & Bar')).toBeNull()
      expect(screen.queryByText('Carpeta Faro')).toBeNull()
    })
    it(`bloquea acceso directo a la carpeta ${variant}`, () => {
      route(`/prototipos/${variant}/carpeta`)
      render(<App />)
      expect(screen.getByRole('heading', { name: 'Esta carpeta necesita una llave.' })).toBeTruthy()
      expect(screen.queryByText('Kuar Resto & Bar')).toBeNull()
    })
    it(`renderiza la carpeta ${variant} después de un grant demo`, () => {
      grant()
      route(`/prototipos/${variant}/carpeta`)
      render(<App />)
      expect(screen.getByText('Kuar Resto & Bar')).toBeTruthy()
    })
  }
})

// Este recorrido combina escritura de formulario y dos validaciones QR simuladas de 300 ms.
it('valida registro y QR de colaborador, conserva el grant al refrescar y lo pierde al cerrar sesión', async () => {
  const user = userEvent.setup()
  route('/prototipos/guia/registro')
  const view = render(<App />)
  await user.click(screen.getByRole('button', { name: 'Crear cuenta demo ↗' }))
  expect(screen.getByRole('alert').textContent).toContain('email válido')
  await user.type(screen.getByRole('textbox', { name: 'Email' }), 'demo@example.test')
  await user.type(screen.getByLabelText('Contraseña'), 'demo-12345')
  await user.click(screen.getByRole('button', { name: 'Crear cuenta demo ↗' }))
  await screen.findByRole('heading', { name: 'Una referencia abre nuevas puertas.' })
  await user.type(screen.getByRole('textbox', { name: 'Código de QR demo' }), 'DEMO-PAUSADO')
  await user.click(screen.getByRole('button', { name: 'Abrir carpeta demo ↗' }))
  expect((await screen.findByRole('alert')).textContent).toContain('deshabilitado')
  expect(screen.queryByText('Kuar Resto & Bar')).toBeNull()
  await user.clear(screen.getByRole('textbox', { name: 'Código de QR demo' }))
  await user.type(screen.getByRole('textbox', { name: 'Código de QR demo' }), 'DEMO-FARO')
  await user.click(screen.getByRole('button', { name: 'Abrir carpeta demo ↗' }))
  await screen.findByRole('heading', { name: /Tu guía para.*salir a descubrir/ })
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('main')))
  expect(document.title).toContain('Tu guía para salir a descubrir')
  expect(screen.getByText('Kuar Resto & Bar')).toBeTruthy()
  view.unmount()
  render(<App />)
  expect(screen.getByText('Kuar Resto & Bar')).toBeTruthy()
  await user.click(screen.getByRole('link', { name: 'Mi viaje' }))
  await user.click(screen.getByRole('button', { name: 'Cerrar sesión demo' }))
  route('/prototipos/guia/carpeta')
  fireEvent.popState(window)
  expect(screen.getByRole('heading', { name: 'Esta carpeta necesita una llave.' })).toBeTruthy()
}, 10_000)

it('exige leer el QR del prestador antes del PIN y acredita solo con ambos pasos', async () => {
  const user = userEvent.setup()
  grant(true)
  route('/prototipos/guia/prestador/kuar')
  render(<App />)
  const openDialog = screen.getByRole('button', { name: 'Validar consumo demo ↗' })
  await user.click(openDialog)
  await user.keyboard('{Escape}')
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(document.activeElement).toBe(openDialog)
  await user.click(openDialog)
  const dialog = screen.getByRole('dialog')
  expect(within(dialog).queryByLabelText(/PIN del prestador/)).toBeNull()
  expect(within(dialog).queryByRole('button', { name: 'Simular consumo ↗' })).toBeNull()
  await user.click(within(dialog).getByRole('button', { name: /Simular lectura del QR del prestador/ }))
  expect(within(dialog).getByText(/QR de Kuar Resto & Bar leído/)).toBeTruthy()
  await user.type(within(dialog).getByLabelText(/PIN del prestador/), '0000')
  await user.click(within(dialog).getByRole('button', { name: 'Simular consumo ↗' }))
  expect(within(dialog).getByRole('alert').textContent).toContain('no coincide')
  await user.clear(within(dialog).getByLabelText(/PIN del prestador/))
  await user.type(within(dialog).getByLabelText(/PIN del prestador/), '1234')
  await user.click(within(dialog).getByRole('button', { name: 'Simular consumo ↗' }))
  const success = screen.getByRole('status')
  expect(within(success).getByText('Visita ya acreditada en la demo.')).toBeTruthy()
  await waitFor(() => expect(document.activeElement).toBe(success))
  await user.click(screen.getByRole('link', { name: 'Mi viaje' }))
  const wallet = screen.getByText('CRÉDITOS DISPONIBLES · DEMO').closest('section')
  const progress = screen.getByText('VISITAS VÁLIDAS').closest('section')
  expect(wallet?.querySelector('strong')?.textContent).toBe('1.000')
  expect(progress?.querySelector('strong')?.textContent?.replace(/\s+/g, ' ').trim()).toBe('1 / 5')
})

it('conserva el orden de tabulación inicial bajo StrictMode', async () => {
  const user = userEvent.setup()
  render(<StrictMode><App /></StrictMode>)
  expect(document.activeElement).toBe(document.body)
  expect(document.title).toContain('La misma ciudad.')
  await user.tab()
  expect(document.activeElement).toBe(screen.getByRole('link', { name: 'Saltar al contenido' }))
  await user.tab()
  expect(document.activeElement).toBe(screen.getByRole('link', { name: 'Comparar opciones ↗' }))
  await user.tab()
  expect(document.activeElement).toBe(screen.getAllByRole('link', { name: 'Llave Extra' })[0])
})

it('no enfoca una acreditación previa al cargar una ficha bajo StrictMode', async () => {
  const user = userEvent.setup()
  sessionStorage.setItem(demoKey, JSON.stringify({ user: true, verified: true, grant: true, consumed: ['kuar'] }))
  route('/prototipos/guia/prestador/kuar')
  render(<StrictMode><App /></StrictMode>)
  expect(screen.getByText('Visita ya acreditada en la demo.')).toBeTruthy()
  expect(document.activeElement).toBe(document.body)
  await user.tab()
  expect(document.activeElement).toBe(screen.getByRole('link', { name: 'Saltar al contenido' }))
})

it('anuncia y enfoca cada vista tras navegación interna y popstate bajo StrictMode', async () => {
  const user = userEvent.setup()
  render(<StrictMode><App /></StrictMode>)
  const firstPrototype = screen.getAllByRole('link', { name: 'Explorar prototipo ↗' })[0]
  firstPrototype.focus()
  await user.keyboard('{Enter}')
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('main')))
  expect(document.title).toContain('La ciudad tiene mucho por contar.')
  const start = screen.getByRole('link', { name: 'Empezar ↗' })
  start.focus()
  await user.keyboard('{Enter}')
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('main')))
  expect(document.title).toContain('Empezá tu viaje.')
  route('/prototipos/pasaporte')
  fireEvent.popState(window)
  await waitFor(() => expect(screen.getByRole('heading', { name: /Cada parada.*cuenta una historia/ })).toBeTruthy())
  expect(document.activeElement).toBe(screen.getByRole('main'))
  expect(document.title).toContain('Cada parada cuenta una historia.')
})
