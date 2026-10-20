import { ApiError } from './api'

export function messageOf(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Tu sesión venció. Ingresá de nuevo para continuar.'
    if (error.status === 429) return 'Hubo demasiados intentos. Esperá un momento y volvé a probar.'
    const payload = error.payload as Record<string, unknown> | null
    const detail = payload?.detail ?? Object.values(payload ?? {}).flat()[0]
    if ((error.status === 400 || error.status === 403 || error.status === 409) && typeof detail === 'string') return detail
    if (error.status === 403) return 'El acceso no está habilitado para esta cuenta. Si cambió una carpeta, actualizá la pantalla.'
    if (error.status === 409) return 'Esta operación ya se registró o la clave de reintento no coincide.'
    return error.message
  }
  if (error instanceof DOMException && error.name === 'AbortError') return ''
  return 'No pudimos conectar con el servicio. Revisá tu conexión e intentá de nuevo.'
}
