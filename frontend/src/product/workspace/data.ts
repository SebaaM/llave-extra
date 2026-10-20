import { api, ApiError } from '../api'
import type { Benefit, Provider, User } from '../api'
import type { Page } from '../catalog'

export type CatalogBenefit = Omit<Benefit, 'image_url' | 'status'> & { provider: Pick<Provider, 'id' | 'name' | 'category' | 'demo'> }
export type Recommendation = { benefit_id: string; available: boolean; benefit: (Benefit & { provider: Provider }) | null }
export const providerPath = (id: string) => `/api/v1/provider/providers/${encodeURIComponent(id)}/`
export const benefitPath = (provider: string, benefit?: string) => `${providerPath(provider)}benefits/${benefit ? `${encodeURIComponent(benefit)}/` : ''}`
export const recommendationPath = (id: string) => `/api/v1/collaborator/recommendations/${encodeURIComponent(id)}/`
export async function loadProvider(signal: AbortSignal) {
  const providers = await api<Provider[]>('/api/v1/provider/providers/', { signal })
  if (providers.length > 1) throw new ApiError(409, 'Asignación inconsistente', { detail: 'La cuenta tiene más de un negocio asignado. Contactá al administrador para corregir la asignación.' })
  const provider = providers[0] ?? null
  const benefits = provider ? await api<Benefit[]>(benefitPath(provider.id), { signal }) : []
  return { provider, benefits }
}
export const loadRecommendations = (signal: AbortSignal) => api<{ recommendations: Recommendation[] }>('/api/v1/collaborator/recommendations/', { signal })
export function loadCatalog(page: number, search: string, category: string, signal: AbortSignal) {
  const query = new URLSearchParams({ page: String(page), search, category })
  return api<Page<CatalogBenefit>>(`/api/v1/collaborator/catalog/benefits/?${query}`, { signal })
}
export const stateLabel = (status: string) => ({ PUBLISHED: 'Publicado', DRAFT: 'Borrador', INACTIVE: 'Inactivo' })[status] ?? 'Sin publicar'
export function workspaceHome(user: User) { return user.role === 'PROVIDER' ? '/prestador' : user.role === 'COLLABORATOR' ? '/colaborador' : user.role === 'ADMIN' ? '/admin/' : '/mi-viaje' }
