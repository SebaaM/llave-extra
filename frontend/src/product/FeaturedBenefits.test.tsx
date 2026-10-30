import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FeaturedBenefits } from './FeaturedBenefits'
import type { PublicBenefit } from './catalog'

const first: PublicBenefit = { id: 'b1', title: 'Una pausa local', description: '', conditions: 'Antes de pedir.', valid_from: null, valid_until: null, demo: false, image_url: null, provider: { id: 'p1', slug: 'cafe', name: 'Café del canal', category: 'Café', description: '', address: '', hours: '', contact: '', map_url: '', website: '', demo: false, image_url: null } }
const benefits = [first, { ...first, id: 'b2', title: 'Un paseo por el canal' }, { ...first, id: 'b3', title: 'Una experiencia local' }]

afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('beneficios destacados', () => {
  it('recorre y elige beneficios con teclado, conserva foco y no crea temporizadores', async () => {
    const keyboard = userEvent.setup()
    const interval = vi.spyOn(window, 'setInterval')
    const timeout = vi.spyOn(window, 'setTimeout')
    render(<FeaturedBenefits benefits={benefits} />)
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
  it('reinicia la selección cuando llegan nuevos resultados sin mostrar datos anteriores', () => {
    const { rerender } = render(<FeaturedBenefits benefits={benefits} />)
    fireEvent.click(screen.getByRole('button', { name: 'Beneficio siguiente' }))
    rerender(<FeaturedBenefits benefits={[{ ...first, id: 'nuevo', title: 'Nuevo beneficio' }]} />)
    expect(screen.getByRole('heading', { name: 'Nuevo beneficio' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: benefits[1].title })).toBeNull()
    expect(screen.getByRole('button', { name: 'Beneficio siguiente' }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('button', { name: 'Beneficio anterior' }).hasAttribute('disabled')).toBe(true)
    expect(screen.queryByRole('list')).toBeNull()
    rerender(<FeaturedBenefits benefits={[]} />)
    expect(screen.queryByRole('region')).toBeNull()
  })
})
