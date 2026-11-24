import { useCallback, useEffect, useState } from 'react'
import { api } from './api'
import type { SiteSettings } from './admin/types'

const legacyHomeDescription = 'Conocé propuestas de prestadores locales, revisá sus condiciones y sumá visitas verificadas a tu pasaporte de viaje.'
export const defaultSiteSettings: SiteSettings = {
  site_name: 'Llave Extra',
  home_title: 'Beneficios para descubrir más de Ushuaia.',
  home_description: 'Conocé propuestas de negocios locales, revisá sus condiciones y sumá visitas verificadas a tu pasaporte de viaje.',
  footer_text: 'Llave Extra conecta tu viaje con beneficios locales en Ushuaia.',
  contact_email: '', whatsapp_url: '', instagram_url: '',
}
export function useSiteSettings() {
  const [settings, setSettings] = useState<SiteSettings>(defaultSiteSettings)
  const [error, setError] = useState(false)
  const [revision, setRevision] = useState(0)
  const retry = useCallback(() => setRevision(value => value + 1), [])
  useEffect(() => {
    const controller = new AbortController()
    api<SiteSettings>('/api/v1/site-settings/', { auth: false, signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) {
        // Compatibilidad de presentación solo para el valor predeterminado
        // histórico. Los textos personalizados se conservan exactamente.
        setSettings(data.home_description === legacyHomeDescription ? { ...data, home_description: defaultSiteSettings.home_description } : data)
        setError(false)
      } })
      .catch(() => { if (!controller.signal.aborted) setError(true) })
    return () => controller.abort()
  }, [revision])
  useEffect(() => {
    window.addEventListener('llave:site-settings-changed', retry)
    return () => window.removeEventListener('llave:site-settings-changed', retry)
  }, [retry])
  useEffect(() => {
    document.querySelector<HTMLMetaElement>('meta[name="description"]')?.setAttribute('content', settings.home_description)
  }, [settings.home_description])
  return { settings, error, retry }
}
