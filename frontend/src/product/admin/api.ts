import { ApiError, api, currentSessionVersion, privateImage } from '../api'
import type { DashboardData, Page, Row } from './types'

export const adminPath = (suffix: string) => `/api/v1/admin/${suffix}`
export function permissionLost(error: unknown) {
  if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
    window.dispatchEvent(new Event('llave:admin-revoked'))
    return true
  }
  return false
}
export async function adminApi<T>(suffix: string, options?: Parameters<typeof api>[1]): Promise<T> {
  try { return await api<T>(adminPath(suffix), options) }
  catch (error) { permissionLost(error); throw error }
}
export const dashboard = (signal: AbortSignal) => adminApi<DashboardData>('dashboard/', { signal })
export const collection = (resource: string, query: string, signal: AbortSignal) => adminApi<Page<Row>>(`${resource}/?${query}`, { signal })
export const detail = (resource: string, id: string, signal: AbortSignal) => adminApi<Row>(`${resource}/${encodeURIComponent(id)}/`, { signal })
export const settings = <T>(group: string, signal: AbortSignal) => adminApi<T>(`settings/${group}/`, { signal })
export const saveSettings = <T>(group: string, body: Record<string, unknown>) => adminApi<T>(`settings/${group}/`, { method: 'PATCH', body })

export type PendingCommand = { path: string; body: Record<string, unknown>; key: string }
export function makeCommand(path: string, body: Record<string, unknown>): PendingCommand {
  return { path, body: structuredClone(body), key: crypto.randomUUID() }
}
export async function sendCommand<T>(command: PendingCommand): Promise<T> {
  return adminApi<T>(command.path, { method: 'POST', body: command.body, idempotencyKey: command.key })
}
export async function authorizedDownload(path: string, filename: string) {
  const version = currentSessionVersion()
  try {
    const url = await privateImage(path)
    if (!url || version !== currentSessionVersion()) return
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.append(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  } catch (error) { permissionLost(error); throw error }
}
