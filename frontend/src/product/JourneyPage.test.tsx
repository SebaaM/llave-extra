import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Trip } from './JourneyPage'
import type { Consumption } from './api'

const history = [
  { id: 'visit-1', provider_id: 'p1', provider_name: 'Café del canal', collaborator_id: null, award: 1200, state: 'VALID', created_at: '2026-10-20T15:00:00Z' },
  { id: 'visit-2', provider_id: 'p2', provider_name: 'Paseos del sur', collaborator_id: 'folder', award: 500, state: 'ANNULLED', created_at: '2026-10-21T15:00:00Z' },
  { id: 'visit-3', provider_id: 'p3', collaborator_id: null, award: 0, state: 'VALID', created_at: '2026-10-22T15:00:00Z' },
  { id: 'visit-4', provider_id: 'p4', collaborator_id: null, award: 0, state: 'ANNULLED', created_at: '2026-10-23T15:00:00Z' },
] satisfies Consumption[]

afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('Mi viaje', () => {
  it('muestra los mismos datos propios en Pasaporte e Historial sin consultar catálogos ni carpetas', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch')
    const keyboard = userEvent.setup()
    render(<Trip wallet={{ balance: 17, redemptions_frozen: false }} progress={{ total: 8, target: 12, completed: false }} history={history} onRefresh={vi.fn()} />)
    const passport = screen.getByRole('button', { name: 'Pasaporte' })
    const compact = screen.getByRole('button', { name: 'Historial' })
    expect(passport.getAttribute('aria-pressed')).toBe('true')
    const assertVisits = () => {
      const visits = within(screen.getByRole('list', { name: 'Visitas registradas' })).getAllByRole('listitem')
      expect(visits).toHaveLength(4)
      expect(within(visits[0]).getByRole('heading', { name: 'Café del canal' })).toBeTruthy()
      expect(within(visits[0]).getByText('Visita verificada')).toBeTruthy()
      expect(within(visits[0]).getByText('1.200 créditos acreditados')).toBeTruthy()
      expect(visits[0].querySelector('time')?.getAttribute('datetime')).toBe(history[0].created_at)
      expect(within(visits[1]).getByText('Visita anulada')).toBeTruthy()
      expect(within(visits[1]).getByText('500 créditos al registrar la visita')).toBeTruthy()
      expect(within(visits[1]).getByText('Esta visita ya no forma parte de tu progreso.')).toBeTruthy()
      expect(within(visits[2]).getByRole('heading', { name: 'Visita verificada' })).toBeTruthy()
      expect(within(visits[2]).getByText('Sin créditos acreditados')).toBeTruthy()
      expect(within(visits[3]).getByRole('heading', { name: 'Visita anulada' })).toBeTruthy()
    }
    assertVisits()
    expect(screen.getByText('Los nombres de los comercios son los actuales.')).toBeTruthy()
    compact.focus()
    await keyboard.keyboard('{Enter}')
    expect(compact.getAttribute('aria-pressed')).toBe('true')
    expect(document.activeElement).toBe(compact)
    assertVisits()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('mantiene saldo, progreso y meta del servidor aunque el historial sea parcial o el saldo esté congelado', () => {
    const refresh = vi.fn()
    render(<Trip wallet={{ balance: 9, redemptions_frozen: true }} progress={{ total: 8, target: 12, completed: true }} history={history.slice(0, 1)} onRefresh={refresh} />)
    const progress = screen.getByRole('progressbar', { name: 'Progreso de visitas válidas' })
    expect(progress.getAttribute('value')).toBe('8')
    expect(progress.getAttribute('max')).toBe('12')
    expect(screen.getByText('Llegaste a la meta vigente.')).toBeTruthy()
    expect(screen.getByText('Te faltan 4 visitas para la meta vigente.')).toBeTruthy()
    expect(screen.getByText('9')).toBeTruthy()
    expect(screen.getByText('El uso de créditos está pausado mientras se revisa tu cuenta.')).toBeTruthy()
    expect(screen.getByText('Gastar créditos no borra tus visitas.')).toBeTruthy()
    expect(screen.getByRole('link', { name: /Explorar la tienda · Vista previa/ }).getAttribute('href')).toBe('/tienda')
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar' }))
    expect(refresh).toHaveBeenCalledOnce()
  })

  it('distingue datos todavía nulos de saldo y progreso cero, también en Historial', () => {
    const { rerender } = render(<Trip wallet={null} progress={null} history={[]} onRefresh={vi.fn()} />)
    expect(screen.getByText('Saldo todavía no disponible.')).toBeTruthy()
    expect(screen.getByText('Progreso todavía no disponible.')).toBeTruthy()
    expect(screen.queryByRole('progressbar')).toBeNull()
    expect(screen.queryByText(/Te faltan/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Historial' }))
    expect(screen.getByRole('heading', { name: 'Tu primer sello todavía no llegó.' })).toBeTruthy()
    rerender(<Trip wallet={{ balance: 0, redemptions_frozen: false }} progress={{ total: 0, target: 5, completed: false }} history={[]} onRefresh={vi.fn()} />)
    expect(screen.queryByText('Saldo todavía no disponible.')).toBeNull()
    expect(screen.queryByText('Progreso todavía no disponible.')).toBeNull()
    expect(screen.getByRole('progressbar').getAttribute('value')).toBe('0')
    expect(screen.getByText('Te faltan 5 visitas para la meta vigente.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Historial' }).getAttribute('aria-pressed')).toBe('true')
  })

  it.each([['8', { total: 8, target: 5, completed: true }, 'Te faltan 0 visitas para la meta vigente.'], ['4', { total: 4, target: 5, completed: false }, 'Te falta 1 visita para la meta vigente.']] as const)('calcula solo las visitas restantes sin reducir el total %s a la meta', (_label, progress, remaining) => {
    render(<Trip wallet={null} progress={progress} history={[]} onRefresh={vi.fn()} />)
    expect(screen.getByRole('progressbar').getAttribute('value')).toBe(String(progress.total))
    expect(screen.getByText(remaining)).toBeTruthy()
  })

  it('preserva texto largo y trata nombre vacío como ausente en ambas vistas', () => {
    const longName = 'Un comercio con un nombre muy extenso '.repeat(12)
    render(<Trip wallet={null} progress={null} history={[{ ...history[0], provider_name: longName }, { ...history[1], provider_name: '   ' }]} onRefresh={vi.fn()} />)
    const heading = screen.getAllByRole('heading', { level: 3 })[0]
    expect(heading.textContent).toBe(longName)
    expect(screen.getByRole('heading', { name: 'Visita anulada' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Historial' }))
    expect(screen.getAllByRole('heading', { level: 3 })[0].textContent).toBe(longName)
    expect(screen.queryByRole('link', { name: longName })).toBeNull()
  })

  it('no inventa restantes ni barra cuando las cifras de progreso son inválidas', () => {
    render(<Trip wallet={null} progress={{ total: -1, target: 0, completed: false }} history={[]} onRefresh={vi.fn()} />)
    expect(screen.queryByRole('progressbar')).toBeNull()
    expect(screen.queryByText(/Te faltan/)).toBeNull()
    expect(screen.getByText('Progreso todavía no disponible.')).toBeTruthy()
  })

  it('tolera nombre nulo y fecha ausente sin convertir un estado desconocido en visita válida', () => {
    render(<Trip wallet={null} progress={null} history={[{ ...history[0], provider_name: null, state: 'UNKNOWN', created_at: '' }]} onRefresh={vi.fn()} />)
    expect(screen.getByRole('heading', { name: 'Estado de visita no disponible' })).toBeTruthy()
    expect(screen.getByText('Fecha no disponible')).toBeTruthy()
    expect(screen.queryByText('Visita verificada')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Historial' }))
    expect(screen.getByRole('heading', { name: 'Estado de visita no disponible' })).toBeTruthy()
  })
})
