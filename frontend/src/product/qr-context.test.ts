import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearQrHint, privateSelectionMedia, qrHintKey, readQrHint, selectionPageNumber, writeQrHint } from './qr-context'

afterEach(() => { vi.restoreAllMocks(); sessionStorage.clear() })
describe('límites del contexto QR', () => {
  it('persiste únicamente los IDs y tolera storage no disponible', () => {
    writeQrHint(42, 'guide-a')
    expect(JSON.parse(sessionStorage.getItem(qrHintKey)!)).toEqual({ accountId: 42, collaboratorId: 'guide-a' })
    expect(readQrHint(42)).toBe('guide-a')
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('Denegado') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Denegado') })
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new DOMException('Denegado') })
    expect(() => { writeQrHint(42, 'guide-a'); clearQrHint() }).not.toThrow()
    expect(readQrHint(42)).toBeNull()
  })
  it.each(['not-json', 'null', '[]', '{"accountId":42}', '{"accountId":42,"collaboratorId":42}'])('descarta la pista inválida %s', value => {
    sessionStorage.setItem(qrHintKey, value)
    expect(readQrHint(42)).toBeNull()
    expect(sessionStorage.getItem(qrHintKey)).toBeNull()
  })
  it('valida las rutas privadas reales de beneficio y negocio', () => {
    const benefit = '/api/v1/folders/guide/providers/shop/benefits/offer/media/'
    expect(privateSelectionMedia(benefit, 'guide', 'shop', 'offer')).toBe(benefit)
    expect(privateSelectionMedia('/api/v1/folders/guide/providers/shop/media/', 'guide', 'shop')).toBe('/api/v1/folders/guide/providers/shop/media/')
    for (const invalid of ['/api/v1/catalog/benefits/offer/media/', '/api/v1/folders/other/providers/shop/benefits/offer/media/', 'https://other.test/api/v1/folders/guide/providers/shop/benefits/offer/media/', `${benefit}?token=secret`]) expect(privateSelectionMedia(invalid, 'guide', 'shop', 'offer')).toBeNull()
  })
  it.each([
    'https://other.test/api/v1/folders/guide/benefits/?page=2', '/api/v1/folders/other/benefits/?page=2',
    '/api/v1/catalog/benefits/?page=2', '/api/v1/folders/guide/benefits/?page=2&token=secret',
    '/api/v1/folders/guide/benefits/?page=2&page=3', '/api/v1/folders/guide/benefits/?page=0',
    '/api/v1/folders/guide/benefits/?page=-1', '/api/v1/folders/guide/benefits/?page=2#secret',
  ])('no sigue una página fuera de la selección: %s', url => { expect(selectionPageNumber(url, 'guide')).toBeNull() })
  it('acepta paginación relativa o absoluta del mismo origen', () => {
    expect(selectionPageNumber('/api/v1/folders/guide/benefits/?page=2&page_size=24', 'guide')).toBe(2)
    expect(selectionPageNumber(`${window.location.origin}/api/v1/folders/guide/benefits/?page=3`, 'guide')).toBe(3)
  })
})
