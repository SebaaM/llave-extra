export type Variant = 'guia' | 'pasaporte' | 'beneficios'

export type Provider = {
  id: string
  name: string
  category: string
  benefit: string
  condition: string
  address: string
  glyph: string
  color: string
  status: 'published_pending_merchant_confirmation'
}

// Los nombres y beneficios provienen del inventario público. La carpeta es ficticia.
export const providers: Provider[] = [
  { id: 'kuar', name: 'Kuar Resto & Bar', category: 'Sabores', benefit: '10% de descuento', condition: 'En reserva. Sujeto a confirmación del comercio.', address: 'Perito Moreno 2232', glyph: '✦', color: 'coral', status: 'published_pending_merchant_confirmation' },
  { id: 'tamara', name: 'Chocolatería Tamara Vasak', category: 'Sabores', benefit: 'Un obsequio', condition: 'Con tu compra. Consultá disponibilidad.', address: 'El Confín · ubicación a confirmar', glyph: '✳', color: 'cocoa', status: 'published_pending_merchant_confirmation' },
  { id: 'glaciares', name: 'Glaciares Fueguinos', category: 'Aventura', benefit: '30% de descuento', condition: 'Para la comunidad Llave Extra. Consultá condiciones.', address: 'Ushuaia · punto de encuentro a confirmar', glyph: '✧', color: 'blue', status: 'published_pending_merchant_confirmation' },
  { id: 'regaleria', name: 'Regalería del Sur', category: 'Compras', benefit: '10% de descuento', condition: 'En compra. Confirmá condiciones en el local.', address: 'Ubicación a confirmar', glyph: '✿', color: 'green', status: 'published_pending_merchant_confirmation' },
]

export const variants: { id: Variant; name: string; kicker: string; description: string }[] = [
  { id: 'guia', name: 'Guía local', kicker: 'Explorá primero', description: 'Una guía para descubrir lugares y planear tu recorrido.' },
  { id: 'pasaporte', name: 'Pasaporte', kicker: 'Coleccioná momentos', description: 'Tu viaje, tus visitas y tus créditos siempre a la vista.' },
  { id: 'beneficios', name: 'Beneficios', kicker: 'Elegí tu ventaja', description: 'Ofertas claras para comparar y aprovechar en la ciudad.' },
]

export const demoCodes = { valid: 'DEMO-FARO', disabled: 'DEMO-PAUSADO' } as const

export function validateDemoQr(code: string): 'valid' | 'disabled' | 'invalid' {
  const normalized = code.trim().toUpperCase()
  if (normalized === demoCodes.valid) return 'valid'
  if (normalized === demoCodes.disabled) return 'disabled'
  return 'invalid'
}

export function isPrivatePath(path: string) {
  return /\/(carpeta|prestador|perfil|tienda)(\/|$)/.test(path)
}
