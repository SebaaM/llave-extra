import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { ApiError, api } from './api'
import type { SiteSettings } from './admin/types'
import { contactEmailHref } from './contactLinks'
import { WhatsAppIcon } from './WhatsAppIcon'

export function ContactPage({ settings }: { settings: SiteSettings }) {
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [error, setError] = useState('')
  const pending = useRef<AbortController | null>(null)
  const emailHref = contactEmailHref(settings.contact_email)

  useEffect(() => () => pending.current?.abort(), [])

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending.current) return
    const form = event.currentTarget
    const data = new FormData(form)
    const body = {
      name: String(data.get('name') ?? '').trim(),
      email: String(data.get('email') ?? '').trim(),
      message: String(data.get('message') ?? '').trim(),
    }
    if (!body.name || !body.message) {
      setError('Completá tu nombre y el mensaje antes de enviar.')
      setStatus('error')
      return
    }
    const controller = new AbortController()
    pending.current = controller
    setStatus('sending')
    try {
      await api<void>('/api/v1/contact/', { auth: false, method: 'POST', body, signal: controller.signal })
      if (controller.signal.aborted) return
      form.reset()
      setStatus('sent')
    } catch (failure) {
      if (controller.signal.aborted) return
      const code = failure instanceof ApiError ? failure.status : 0
      setError(code === 429 ? 'Hay demasiados envíos en este momento. Esperá unos minutos antes de volver a intentar.'
        : code === 400 ? 'Revisá tu nombre, el correo y el mensaje antes de volver a intentar.'
          : 'No pudimos confirmar el envío. Tu mensaje quedó en el formulario.')
      setStatus('error')
    } finally {
      if (pending.current === controller) pending.current = null
    }
  }

  return <main id="contenido" className="contact-page content-width">
    <header className="contact-page-heading">
      <h1>Contacto</h1>
      <p>¿Tenés una consulta sobre Llave Extra? Escribinos por el canal que te resulte más cómodo.</p>
    </header>
    <div className="contact-page-grid">
      <section className="contact-channels" aria-labelledby="contact-channels-title">
        <h2 id="contact-channels-title">Canales de contacto</h2>
        {settings.whatsapp_url && <a className="contact-whatsapp-link" href={settings.whatsapp_url} target="_blank" rel="noopener noreferrer"><WhatsAppIcon /> Escribir por WhatsApp</a>}
        {emailHref && <div className="contact-email"><span>Correo electrónico</span><a href={emailHref}>{settings.contact_email}</a></div>}
        {!settings.whatsapp_url && !emailHref && <p>Podés enviarnos tu consulta con el formulario.</p>}
      </section>
      <section className="contact-form-panel" aria-labelledby="contact-form-title">
        <h2 id="contact-form-title">Envianos un mensaje</h2>
        <p id="contact-form-hint">Usaremos tu correo para responderte. No incluyas contraseñas, PIN ni datos de pago.</p>
        <form onSubmit={send} aria-describedby="contact-form-hint">
          <fieldset disabled={status === 'sending'}>
            <label>Nombre<input name="name" autoComplete="name" maxLength={100} required /></label>
            <label>Correo electrónico<input name="email" type="email" autoComplete="email" maxLength={254} required /></label>
            <label>Mensaje<textarea name="message" rows={5} maxLength={3000} required /></label>
            <button className="button button-orange" type="submit">{status === 'sending' ? 'Enviando…' : 'Enviar mensaje'}</button>
          </fieldset>
          {status === 'error' && <p className="contact-feedback" role="alert">{error}</p>}
          <p className="contact-feedback" role="status">{status === 'sent' ? 'Recibimos tu mensaje. Te responderemos por correo electrónico.' : status === 'sending' ? 'Enviando tu mensaje…' : ''}</p>
        </form>
      </section>
    </div>
  </main>
}
