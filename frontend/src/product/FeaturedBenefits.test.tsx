import { useState } from 'react'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FeaturedBenefits } from './FeaturedBenefits'
import type { PublicBenefit } from './catalog'

const first: PublicBenefit = { id: 'b1', title: 'Una pausa local', description: '', conditions: 'Antes de pedir.', valid_from: null, valid_until: null, demo: false, image_url: null, provider: { id: 'p1', slug: 'cafe', name: 'Café del canal', category: 'Café', description: '', address: '', hours: '', contact: '', map_url: '', website: '', demo: false, image_url: null } }
const benefits = [first, { ...first, id: 'b2', title: 'Un paseo por el canal' }, { ...first, id: 'b3', title: 'Una experiencia local' }]
function Carousel() {
  const [index, setIndex] = useState(0)
  return <FeaturedBenefits benefit={benefits[index]} count={benefits.length} index={index} onSelect={next => setIndex((next + benefits.length) % benefits.length)} />
}

afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('beneficios destacados', () => {
  it('recorre y elige beneficios con teclado, conserva foco y no crea temporizadores', async () => {
    const keyboard = userEvent.setup()
    const interval = vi.spyOn(window, 'setInterval')
    const timeout = vi.spyOn(window, 'setTimeout')
    render(<Carousel />)
    expect(interval).not.toHaveBeenCalled()
    expect(timeout).not.toHaveBeenCalled()
    const previous = screen.getByRole('button', { name: 'Beneficio anterior' })
    previous.focus()
    await keyboard.keyboard('{Enter}')
    expect(screen.getByRole('heading', { name: benefits[2].title })).toBeTruthy()
    expect(document.activeElement).toBe(previous)
    await keyboard.tab()
    await keyboard.keyboard(' ')
    expect(screen.getByRole('heading', { name: first.title })).toBeTruthy()
    const options = within(screen.getByRole('list', { name: 'Elegir beneficio destacado' })).getAllByRole('button')
    options[1].focus()
    await keyboard.keyboard(' ')
    expect(options.map(option => option.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'false'])
    expect(screen.getByRole('heading', { name: benefits[1].title })).toBeTruthy()
    expect(screen.getByRole('status', { name: 'Beneficio destacado actual' }).textContent).toContain(`2 de 3: ${benefits[1].title}`)
    expect(screen.getAllByRole('article')).toHaveLength(1)
    expect(document.activeElement).toBe(options[1])
  })
  it('retira tarjetas pendientes conservando controles, limita indicadores y omite selectores para uno', () => {
    const select = vi.fn()
    const { rerender } = render(<FeaturedBenefits benefit={first} count={27} index={0} onSelect={select} />)
    const next = screen.getByRole('button', { name: 'Beneficio siguiente' })
    next.focus()
    rerender(<FeaturedBenefits count={27} index={24} onSelect={select}>Cargando…</FeaturedBenefits>)
    expect(screen.queryByRole('article')).toBeNull()
    expect(screen.getByRole('button', { name: 'Beneficio siguiente' })).toBe(next)
    expect(document.activeElement).toBe(next)
    expect(screen.queryByRole('list')).toBeNull()
    rerender(<FeaturedBenefits benefit={first} count={1} index={0} onSelect={select} />)
    expect(screen.getByRole('heading', { name: first.title })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Beneficio siguiente' }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('button', { name: 'Beneficio anterior' }).hasAttribute('disabled')).toBe(true)
    expect(screen.queryByRole('list')).toBeNull()
    rerender(<FeaturedBenefits count={0} index={0} onSelect={select} />)
    expect(screen.queryByRole('article')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })
})
