import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ContactPage } from './ContactPage'
import { ProductShell } from './Layout'
import { defaultSiteSettings } from './useSiteSettings'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const settings = { ...defaultSiteSettings, contact_email: 'contacto@example.test', whatsapp_url: 'https://wa.me/5492901123456' }

it('usa la misma configuración para los canales de contacto y el flotante', () => {
  const { rerender } = render(<ProductShell user={null} path="/contacto" settings={settings}><ContactPage settings={settings} /></ProductShell>)
  expect(screen.getByRole('heading', { name: 'Contacto' })).toBeTruthy()
  expect(screen.getByRole('link', { name: 'Contactar por WhatsApp' }).getAttribute('href')).toBe(settings.whatsapp_url)
  expect(screen.getByRole('link', { name: 'Escribir por WhatsApp' }).getAttribute('href')).toBe(settings.whatsapp_url)
  expect(screen.getAllByRole('link', { name: settings.contact_email })[0].getAttribute('href')).toBe('mailto:contacto@example.test')
  rerender(<ProductShell user={null} path="/contacto"><ContactPage settings={defaultSiteSettings} /></ProductShell>)
  expect(screen.queryByRole('link', { name: /por WhatsApp/ })).toBeNull()
})

it('conserva la consulta ante un fallo y la limpia solo después de enviar', async () => {
  const send = vi.fn()
    .mockResolvedValueOnce(Response.json({ detail: 'No disponible' }, { status: 503 }))
    .mockResolvedValueOnce(new Response(null, { status: 204 }))
  vi.stubGlobal('fetch', send)
  render(<ContactPage settings={settings} />)
  fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Ada' } })
  fireEvent.change(screen.getByLabelText('Correo electrónico'), { target: { value: 'ada@example.test' } })
  fireEvent.change(screen.getByLabelText('Mensaje'), { target: { value: 'Consulta de prueba' } })
  fireEvent.click(screen.getByRole('button', { name: 'Enviar mensaje' }))
  await screen.findByRole('alert')
  expect((screen.getByLabelText('Mensaje') as HTMLTextAreaElement).value).toBe('Consulta de prueba')
  expect(send.mock.calls[0][0].pathname).toBe('/api/v1/contact/')
  expect(JSON.parse(send.mock.calls[0][1].body)).toEqual({ name: 'Ada', email: 'ada@example.test', message: 'Consulta de prueba' })
  expect(send.mock.calls[0][1].headers.has('Authorization')).toBe(false)
  fireEvent.click(screen.getByRole('button', { name: 'Enviar mensaje' }))
  await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Recibimos tu mensaje'))
  expect((screen.getByLabelText('Mensaje') as HTMLTextAreaElement).value).toBe('')
})
