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
})
