import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ProductShell } from './Layout'
import { defaultSiteSettings } from './useSiteSettings'

afterEach(cleanup)

describe('configuración pública en el pie de página', () => {
  it.each([
    'contacto?cc=otro@example.test',
    'contacto#privado@example.test',
    'contacto%0D%0A@example.test',
    'contacto+alias@example.test',
    '"contacto@interno"@example.test',
  ])('conserva %s como una sola dirección de correo', contact_email => {
    render(<ProductShell user={null} path="/" settings={{ ...defaultSiteSettings, contact_email }}>Inicio</ProductShell>)

    const link = screen.getByRole('link', { name: contact_email })
    const url = new URL((link as HTMLAnchorElement).href)
    expect(url.protocol).toBe('mailto:')
    expect(url.search).toBe('')
    expect(url.hash).toBe('')
    expect(decodeURIComponent(url.pathname)).toBe(contact_email)
  })

  it('presenta los textos configurables como texto literal', () => {
    const footer_text = '<img src=x onerror=window.auditExecuted=true>'
    render(<ProductShell user={null} path="/" settings={{ ...defaultSiteSettings, footer_text }}>Inicio</ProductShell>)

    expect(screen.getByText(footer_text)).toBeTruthy()
    expect(document.querySelector('[onerror]')).toBeNull()
  })
})
