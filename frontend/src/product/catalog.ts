import { api } from './api'

export type PublicProvider = {
  id: string; slug: string; name: string; category: string; description: string
  address: string; hours: string; contact: string; map_url: string; website: string
  demo: boolean; image_url: string | null
}
export type PublicBenefit = {
  id: string; title: string; description: string; conditions: string
  valid_from: string | null; valid_until: string | null; demo: boolean
  image_url: string | null; provider: PublicProvider
}
export type Page<T> = { count: number; next: string | null; previous: string | null; results: T[] }
export type Presentation = {
  title: string; layout: 'RADIAL' | 'ORBIT'; theme: 'SAND' | 'OCEAN'
  background: 'HARBOR' | 'BEAGLE'; page_size: number; interval_seconds: number; city: string
}
export type NetworkItem = { provider: PublicProvider; benefit_id: string; benefit_title: string }
export type NetworkPage = Page<NetworkItem> & { presentation: Presentation }

export const catalogConfig = (signal?: AbortSignal) => api<{ enabled: boolean }>('/api/v1/catalog/config/', { auth: false, signal })
export const catalogCategories = (signal?: AbortSignal) => api<{ results: string[] }>('/api/v1/catalog/categories/', { auth: false, signal })
export const catalogBenefits = (page = 1, search = '', category = '', signal?: AbortSignal) => {
  const params = new URLSearchParams({ page: String(page) })
  if (search) params.set('search', search)
  if (category) params.set('category', category)
  return api<Page<PublicBenefit>>(`/api/v1/catalog/benefits/?${params}`, { auth: false, signal })
}
export const catalogBenefit = (id: string, signal?: AbortSignal) => api<PublicBenefit>(`/api/v1/catalog/benefits/${encodeURIComponent(id)}/`, { auth: false, signal })
export const publicNetwork = (page = 1, signal?: AbortSignal) => api<NetworkPage>(`/api/v1/catalog/network/?page=${page}`, { auth: false, signal })

// Catalog media uses the public policy. It deliberately never carries a JWT.
export async function publicImage(path: string, signal?: AbortSignal): Promise<string> {
  const url = new URL(path, window.location.origin)
  if (url.origin !== window.location.origin || !/^\/api\/v1\/catalog\/(benefits|providers)\/[^/]+\/media\/$/.test(url.pathname)) throw new Error('Medio público no autorizado')
  const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store', signal })
  if (!response.ok) throw new Error('No se pudo cargar la imagen.')
  const blob = await response.blob()
  if (signal?.aborted) throw new DOMException('Solicitud cancelada', 'AbortError')
  return URL.createObjectURL(blob)
}

export function safeExternal(url: string | null | undefined) {
  if (!url) return null
  try { const parsed = new URL(url); return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : null }
  catch { return null }
}

export function calendarDate(value: string | null) {
  if (!value) return null
  const [year, month, day] = value.split('-').map(Number)
  return new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, day)))
}
