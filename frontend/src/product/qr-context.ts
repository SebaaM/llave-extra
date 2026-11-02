import type { Benefit, Provider } from './api'

export const qrHintKey = 'llave-extra.qr-context'
export type Collaborator = { id: string; name: string }
export type SelectionPage = { count: number; next: string | null; previous: string | null; collaborator: Collaborator; results: Array<Benefit & { provider: Provider }> }
export type QrContext = {
  owner: number | null; version: number; revision: number
  status: 'none' | 'pending' | 'loading' | 'ready' | 'error' | 'blocked'
  collaborator: Collaborator | null; page: SelectionPage | null; pageNumber: number
  error: string; missing: string[]
}

export function clearQrHint() { try { sessionStorage.removeItem(qrHintKey) } catch { /* La memoria sigue disponible. */ } }
export function writeQrHint(accountId: number, collaboratorId: string) {
  try { sessionStorage.setItem(qrHintKey, JSON.stringify({ accountId, collaboratorId })) } catch { /* No persistir secretos como alternativa. */ }
}
export function readQrHint(accountId: number): string | null {
  try {
    const raw = sessionStorage.getItem(qrHintKey)
    if (!raw) return null
    const value: unknown = JSON.parse(raw)
    if (value && typeof value === 'object' && Object.keys(value).sort().join(',') === 'accountId,collaboratorId') {
      const hint = value as { accountId: unknown; collaboratorId: unknown }
      if (Number.isSafeInteger(hint.accountId) && hint.accountId === accountId && typeof hint.collaboratorId === 'string' && /^[a-zA-Z0-9-]{1,100}$/.test(hint.collaboratorId)) return hint.collaboratorId
    }
  } catch { /* Una pista dañada no autoriza acceso. */ }
  clearQrHint()
  return null
}

// Las URLs remotas solo indican el número de página; nunca se siguen directamente.
export function selectionPageNumber(value: string | null, collaboratorId: string): number | null {
  if (!value) return null
  try {
    const url = new URL(value, window.location.origin)
    if (url.origin !== window.location.origin || url.username || url.password || url.hash || url.pathname !== `/api/v1/folders/${encodeURIComponent(collaboratorId)}/benefits/`) return null
    if ([...url.searchParams.keys()].some(key => !['page', 'page_size'].includes(key)) || url.searchParams.getAll('page').length > 1 || url.searchParams.getAll('page_size').length > 1) return null
    // DRF omite page cuando el enlace anterior vuelve a la primera página.
    const raw = url.searchParams.get('page') ?? '1'
    const page = Number(raw)
    return /^[1-9][0-9]*$/.test(raw) && Number.isSafeInteger(page) ? page : null
  } catch { return null }
}

export function privateSelectionMedia(path: string | null, collaboratorId: string, providerId: string, benefitId?: string) {
  if (!path) return null
  const expected = `/api/v1/folders/${encodeURIComponent(collaboratorId)}/providers/${encodeURIComponent(providerId)}/${benefitId ? `benefits/${encodeURIComponent(benefitId)}/` : ''}media/`
  try { const url = new URL(path, window.location.origin); return url.origin === window.location.origin && url.pathname === expected && !url.search && !url.hash ? expected : null } catch { return null }
}
