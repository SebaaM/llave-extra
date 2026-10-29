import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HowItWorks } from './HowItWorks'
import { TripSummary } from './journey/TripSummary'

afterEach(() => { cleanup(); vi.restoreAllMocks() })
describe('recorrido del Cliente', () => {
  it('permite recorrer los cuatro pasos con teclado y sin avance automático', async () => {
    const keyboard = userEvent.setup()
    const timer = vi.spyOn(window, 'setTimeout')
    render(<HowItWorks />)
    const steps = within(screen.getByRole('group', { name: 'Pasos de tu recorrido' })).getAllByRole('button')
    expect(steps).toHaveLength(4)
    expect(steps[0].getAttribute('aria-pressed')).toBe('true')
    expect(timer).not.toHaveBeenCalled()
    steps[0].focus()
    for (let index = 1; index < 4; index += 1) {
      await keyboard.tab()
      await keyboard.keyboard(index === 2 ? ' ' : '{Enter}')
      expect(steps[index].getAttribute('aria-pressed')).toBe('true')
      expect(steps.filter(step => step.getAttribute('aria-pressed') === 'true')).toHaveLength(1)
    }
    expect(screen.getByRole('heading', { name: 'QR del colaborador' })).toBeTruthy()
    expect(screen.getByText('Abre una carpeta privada. No acredita una visita por sí solo.')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'QR y PIN del prestador' })).toBeTruthy()
  })
})

describe('resumen de Mi viaje', () => {
  it.each([[null, null], [{ balance: 83, redemptions_frozen: false }, null], [null, { total: 3, target: 5, completed: false }]])('omite cifras incompletas sin inventar cero (%j)', (wallet, progress) => {
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    render(<TripSummary wallet={wallet} progress={progress} />)
    expect(screen.queryByRole('definition')).toBeNull()
    expect(screen.queryByText('0')).toBeNull()
    expect(screen.getByRole('link', { name: 'Entrar a Mi viaje →' })).toBeTruthy()
    expect(fetcher).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
  it('muestra los valores recibidos, meta cumplida y canjes en revisión', () => {
    render(<TripSummary wallet={{ balance: 83, redemptions_frozen: true }} progress={{ total: 3, target: 2, completed: true }} />)
    expect(screen.getAllByRole('definition').map(item => item.textContent)).toEqual(['3', '2', '83'])
    expect(screen.getByText('Alcanzaste la meta vigente.')).toBeTruthy()
    expect(screen.getByText('Los canjes están en revisión.')).toBeTruthy()
  })
})
