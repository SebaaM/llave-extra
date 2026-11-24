import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defaultSiteSettings, useSiteSettings } from './useSiteSettings'

afterEach(() => { cleanup(); vi.unstubAllGlobals(); document.head.querySelector('meta[name="description"]')?.remove() })

describe('textos públicos del sitio', () => {
  it.each([
    ['Conocé propuestas de prestadores locales, revisá sus condiciones y sumá visitas verificadas a tu pasaporte de viaje.', 'Conocé propuestas de negocios locales, revisá sus condiciones y sumá visitas verificadas a tu pasaporte de viaje.'],
    ['Una descripción personalizada para tu viaje.', 'Una descripción personalizada para tu viaje.'],
  ])('presenta descripción y metadatos compatibles con la configuración: %s', async (received, expected) => {
    const meta = document.createElement('meta'); meta.name = 'description'; document.head.append(meta)
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ...defaultSiteSettings, home_description: received }), { headers: { 'Content-Type': 'application/json' } })))
    const { result } = renderHook(useSiteSettings)
    await waitFor(() => expect(result.current.settings.home_description).toBe(expected))
    expect(meta.content).toBe(expected)
  })

  it('usa negocios en el texto por defecto y conserva el fallback si la lectura falla', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 503 })))
    const { result } = renderHook(useSiteSettings)
    await act(async () => {})
    expect(result.current.error).toBe(true)
    expect(result.current.settings.home_description).toContain('negocios locales')
  })
})
