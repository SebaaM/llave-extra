import { beforeEach, describe, expect, it, vi } from 'vitest'

beforeEach(() => { vi.resetModules() })

describe('fragmentos QR efímeros', () => {
  it('lee la referencia solo en su ruta y la quita de la barra antes de continuar', async () => {
    window.history.replaceState({}, '', '/referencia#token=referencia-de-prueba')
    const intent = await import('./qr-intent')
    expect(intent.referralToken).toBe('referencia-de-prueba')
    expect(intent.consumptionToken).toBeNull()
    expect(window.location.hash).toBe('')
  })

  it('lee el QR del prestador solo en consumo y limpia el fragmento', async () => {
    window.history.replaceState({}, '', '/consumo#token=consumo-de-prueba')
    const intent = await import('./qr-intent')
    expect(intent.consumptionToken).toBe('consumo-de-prueba')
    expect(intent.referralToken).toBeNull()
    expect(window.location.hash).toBe('')
  })

  it('mantiene el QR únicamente en memoria al navegar a ingreso y permite eliminarlo al completar', async () => {
    window.history.replaceState({}, '', '/referencia#token=referencia-sintetica')
    const intent = await import('./qr-intent')
    window.history.pushState({}, '', '/ingresar')
    expect(intent.referralToken).toBe('referencia-sintetica')
    expect(window.location.hash).toBe('')
    intent.setReferralToken(null)
    expect(intent.referralToken).toBeNull()
    window.history.replaceState({}, '', '/consumo#token=prestador-sintetico')
    vi.resetModules()
    const nextIntent = await import('./qr-intent')
    window.history.pushState({}, '', '/ingresar')
    expect(nextIntent.consumptionToken).toBe('prestador-sintetico')
    expect(window.location.hash).toBe('')
    nextIntent.setConsumptionToken(null)
    expect(nextIntent.consumptionToken).toBeNull()
  })
})
