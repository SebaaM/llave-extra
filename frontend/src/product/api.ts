export type User = { id: number; email: string; role: 'TOURIST' | 'COLLABORATOR' | 'PROVIDER' | 'ADMIN'; email_verified: boolean }
export type Folder = { collaborator_id: string; granted_at: string }
export type Provider = { id: string; slug: string; name: string; category: string; description: string; address: string; hours: string; contact: string; map_url: string; website: string; image_url: string | null; status: string; demo: boolean }
export type Benefit = { id: string; title: string; description: string; conditions: string; valid_from: string | null; valid_until: string | null; image_url: string | null; status: string; demo: boolean }
// Nombre actual del comercio en lectura propia; puede faltar en respuestas anteriores.
export type Consumption = { id: string; provider_id: string; provider_name?: string | null; collaborator_id: string | null; award: number; state: string; created_at: string }
export type ConsumptionResult = Consumption & { balance: number }
export type Wallet = { balance: number; redemptions_frozen: boolean }
export type Progress = { total: number; target: number; completed: boolean }

export class ApiError extends Error {
  constructor(readonly status: number, message: string, readonly payload?: unknown) { super(message); this.name = 'ApiError' }
}

export class AuthCoordinationError extends Error {
  constructor() {
    super('Para proteger tu sesión, usá un navegador actualizado en una conexión segura (HTTPS).')
    this.name = 'AuthCoordinationError'
  }
}

type SessionIdentity = { sid: string; userId: string }
let accessToken: string | null = null
let refreshBinding: SessionIdentity | 'unrecognized' | 'replaced' | null = null
let csrfToken: string | null = null
let refreshing: { version: number; promise: Promise<string | null> } | null = null
let authQueue: Promise<void> = Promise.resolve()
let sessionVersion = 0
const privateControllers = new Set<AbortController>()
const logoutPendingKey = 'llave-extra.logout-pending'
let memoryPendingLogout = false
let explicitlyAuthenticated = false
const verificationRequests = new Map<string, Promise<unknown>>()

export function currentSessionVersion() { return sessionVersion }
export function hasPendingLogout() {
  if (memoryPendingLogout) return true
  try { return sessionStorage.getItem(logoutPendingKey) === '1' }
  catch { return memoryPendingLogout }
}
function markPendingLogout(pending: boolean) {
  memoryPendingLogout = pending
  try {
    if (pending) sessionStorage.setItem(logoutPendingKey, '1')
    else sessionStorage.removeItem(logoutPendingKey)
  } catch { /* La protección del dispositivo continúa en memoria si storage está denegado. */ }
}
function canPersistLogoutState() {
  const probe = `${logoutPendingKey}.check`
  try {
    sessionStorage.setItem(probe, '1')
    const written = sessionStorage.getItem(probe) === '1'
    sessionStorage.removeItem(probe)
    return written
  } catch { return false }
}
export function invalidatePrivateState() {
  sessionVersion += 1
  for (const controller of privateControllers) controller.abort()
  privateControllers.clear()
  accessToken = null
  if (refreshBinding !== 'replaced') refreshBinding = null
  refreshing = null
  explicitlyAuthenticated = false
}
export function setAccessToken(value: string | null) {
  accessToken = value
  refreshBinding = value ? readSessionIdentity(value) ?? 'unrecognized' : null
}

function readSessionIdentity(token: string): SessionIdentity | null {
  // La API autentica el JWT. Acá sus claims solo vinculan la renovación a la sesión local.
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const { sid, user_id: userId } = JSON.parse(atob(parts[1].replaceAll('-', '+').replaceAll('_', '/')))
    if (typeof sid === 'string' && sid && ((typeof userId === 'string' && userId) || Number.isSafeInteger(userId))) {
      return { sid, userId: String(userId) }
    }
  } catch { /* Sin claims comparables, un 401 requiere volver a ingresar. */ }
  return null
}

function endpoint(path: string) {
  const url = new URL(path, window.location.origin)
  const consumptionV2 = ['/api/v2/consumptions/', '/api/v2/consumptions/options/'].includes(url.pathname)
  if (url.origin !== window.location.origin || (!url.pathname.startsWith('/api/v1/') && !consumptionV2)) throw new Error('Ruta de API no autorizada')
  return url
}
async function jsonOrError(response: Response) {
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    const message = typeof body?.detail === 'string' ? body.detail : response.status === 429 ? 'Esperá un momento antes de volver a intentar.' : response.status >= 500 ? 'El servicio no está disponible ahora. Probá de nuevo más tarde.' : response.status === 403 ? 'No tenés autorización para esta acción.' : 'No se pudo completar la solicitud.'
    throw new ApiError(response.status, message, body)
  }
  return body
}
export async function ensureCsrf() {
  if (csrfToken) return csrfToken
  const response = await fetch(endpoint('/api/v1/auth/csrf/'), { credentials: 'same-origin', cache: 'no-store' })
  const body = await jsonOrError(response)
  csrfToken = body.csrfToken
  return csrfToken!
}
async function csrfHeaders() { return { 'X-CSRFToken': await ensureCsrf() } }

function serializeAuthMutation<T>(operation: () => Promise<T>): Promise<T> {
  const result = authQueue.then(async () => {
    // The refresh cookie is shared by every tab on this origin. Web Locks keep
    // a late Set-Cookie from an older tab from winning over a newer login.
    const locks = navigator.locks
    if (!locks) throw new AuthCoordinationError()
    return await locks.request('llave-extra-auth-cookie', { mode: 'exclusive' }, operation)
  })
  authQueue = result.then(() => undefined, () => undefined)
  return result
}

async function refreshInCurrentSession(version: number): Promise<string | null> {
  return serializeAuthMutation(async () => {
    if (version !== sessionVersion || refreshBinding === 'replaced') return null
    if (accessToken) return accessToken
    const expected = refreshBinding
    try {
      const response = await fetch(endpoint('/api/v1/auth/refresh/'), {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: await csrfHeaders(),
      })
      const body = await jsonOrError(response)
      if (version !== sessionVersion) return null
      const identity = typeof body?.access === 'string' ? readSessionIdentity(body.access) : null
      if (expected && (expected === 'unrecognized' || !identity || expected.sid !== identity.sid || expected.userId !== identity.userId)) {
        // La cookie puede corresponder a otra pestaña. Solo se invalida esta instancia.
        invalidatePrivateState()
        refreshBinding = 'replaced'
        window.dispatchEvent(new Event('llave:session-replaced'))
        return null
      }
      accessToken = typeof body?.access === 'string' ? body.access : null
      refreshBinding = identity ?? (accessToken ? 'unrecognized' : null)
      return accessToken
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        if (version === sessionVersion) accessToken = null
        return null
      }
      throw error
    }
  })
}

async function refreshAccess(): Promise<string | null> {
  if (refreshBinding === 'replaced') return null
  if (accessToken) return accessToken
  const version = sessionVersion
  if (refreshing?.version === version) return refreshing.promise
  const promise = refreshInCurrentSession(version)
  const flight = { version, promise }
  refreshing = flight
  void promise.then(
    () => { if (refreshing === flight) refreshing = null },
    () => { if (refreshing === flight) refreshing = null },
  )
  return promise
}

function refreshAfterUnauthorized(rejectedToken: string | null) {
  // Otro 401 de la misma ráfaga puede llegar tras una renovación exitosa.
  if (accessToken === rejectedToken) accessToken = null
  return refreshAccess()
}

type RequestOptions = { method?: string; body?: unknown; auth?: boolean; retryAuth?: boolean; idempotencyKey?: string; signal?: AbortSignal }
export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const url = endpoint(path)
  const method = options.method ?? 'GET'
  const isPrivate = options.auth !== false
  const version = sessionVersion
  const controller = isPrivate ? new AbortController() : null
  if (controller) privateControllers.add(controller)
  const abort = () => controller?.abort()
  options.signal?.addEventListener('abort', abort, { once: true })
  if (options.signal?.aborted) controller?.abort()
  const send = async (retry: boolean): Promise<T> => {
    if ((isPrivate && version !== sessionVersion) || options.signal?.aborted || controller?.signal.aborted) throw new DOMException('Solicitud cancelada', 'AbortError')
    if (isPrivate && !accessToken && retry) {
      const token = await refreshAccess()
      if (version !== sessionVersion || controller?.signal.aborted) throw new DOMException('Sesión reemplazada', 'AbortError')
      if (!token) throw new ApiError(401, 'Iniciá sesión para continuar.')
    }
    const headers = new Headers({ Accept: 'application/json' })
    const multipart = options.body instanceof FormData
    if (options.body !== undefined && !multipart) headers.set('Content-Type', 'application/json')
    const tokenUsed = isPrivate ? accessToken : null
    if (tokenUsed) headers.set('Authorization', `Bearer ${tokenUsed}`)
    if (options.idempotencyKey) headers.set('Idempotency-Key', options.idempotencyKey)
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && url.pathname.startsWith('/api/v1/auth/')) headers.set('X-CSRFToken', await ensureCsrf())
    if ((isPrivate && version !== sessionVersion) || options.signal?.aborted || controller?.signal.aborted) throw new DOMException('Solicitud cancelada', 'AbortError')
    const response = await fetch(url, { method, headers, body: multipart ? options.body as FormData : options.body === undefined ? undefined : JSON.stringify(options.body), credentials: 'same-origin', cache: 'no-store', signal: controller?.signal ?? options.signal })
    if (isPrivate && version !== sessionVersion) throw new DOMException('Sesión reemplazada', 'AbortError')
    if (response.status === 401 && isPrivate && options.retryAuth !== false && retry) {
      const token = await refreshAfterUnauthorized(tokenUsed)
      if (version !== sessionVersion || controller?.signal.aborted) throw new DOMException('Sesión reemplazada', 'AbortError')
      if (!token) throw new ApiError(401, 'Tu sesión venció. Volvé a ingresar.')
      return send(false)
    }
    if (response.status === 204) return undefined as T
    const result = await jsonOrError(response) as T
    if (isPrivate && version !== sessionVersion) throw new DOMException('Sesión reemplazada', 'AbortError')
    return result
  }
  try { return await send(true) }
  finally { if (controller) privateControllers.delete(controller); options.signal?.removeEventListener('abort', abort) }
}

export async function restoreSession() {
  // A failed logout may leave the HttpOnly refresh cookie valid. Do not restore
  // it silently after a reload; require an explicit login to establish a session.
  if (hasPendingLogout()) return null
  // Sin storage no se puede conocer un logout incierto de la instancia anterior.
  // Solo el login explícito en esta instancia permite continuar en memoria.
  if (!explicitlyAuthenticated && !canPersistLogoutState()) return null
  const token = await refreshAccess()
  if (!token) return null
  return api<User>('/api/v1/auth/me/')
}
export async function signOut() {
  const oldToken = accessToken
  markPendingLogout(true)
  invalidatePrivateState()
  try {
    await serializeAuthMutation(async () => {
      const response = await fetch(endpoint('/api/v1/auth/logout/'), {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { ...(oldToken ? { Authorization: `Bearer ${oldToken}` } : {}), 'X-CSRFToken': await ensureCsrf() },
      })
      if (!response.ok) await jsonOrError(response)
    })
    markPendingLogout(false)
  } finally { csrfToken = null }
}
export async function privateImage(path: string | null) {
  if (!path) return null
  const version = sessionVersion
  const url = endpoint(path)
  const response = await apiResponse(url)
  const blob = await response.blob()
  if (version !== sessionVersion) throw new DOMException('Sesión reemplazada', 'AbortError')
  return URL.createObjectURL(blob)
}
async function apiResponse(url: URL) {
  const version = sessionVersion
  const tokenUsed = accessToken ?? await refreshAccess()
  if (version !== sessionVersion) throw new DOMException('Sesión reemplazada', 'AbortError')
  if (!tokenUsed) throw new ApiError(401, 'No se pudo cargar la imagen autorizada.')
  const send = (token: string) => fetch(url, { credentials: 'same-origin', cache: 'no-store', headers: { Authorization: `Bearer ${token}` } })
  let response = await send(tokenUsed)
  if (version !== sessionVersion) throw new DOMException('Sesión reemplazada', 'AbortError')
  if (response.status === 401) {
    const token = await refreshAfterUnauthorized(tokenUsed)
    if (version !== sessionVersion) throw new DOMException('Sesión reemplazada', 'AbortError')
    if (token) response = await send(token)
  }
  if (version !== sessionVersion) throw new DOMException('Sesión reemplazada', 'AbortError')
  if (!response.ok) throw new ApiError(response.status, 'No se pudo cargar la imagen autorizada.')
  return response
}

export async function authenticate(email: string, password: string) {
  invalidatePrivateState()
  const version = sessionVersion
  await serializeAuthMutation(async () => {
    if (version !== sessionVersion) throw new DOMException('Sesión reemplazada', 'AbortError')
    const body = await api<{ access: string }>('/api/v1/auth/login/', { method: 'POST', body: { email, password }, auth: false })
    if (version !== sessionVersion) throw new DOMException('Sesión reemplazada', 'AbortError')
    markPendingLogout(false)
    setAccessToken(body.access)
    explicitlyAuthenticated = true
  })
  // The shared-cookie lock protects the login response and its Set-Cookie.
  // Keep /me outside it: a 401 may need refreshAccess(), which must acquire
  // the same lock to rotate the HttpOnly cookie.
  if (version !== sessionVersion) throw new DOMException('Sesión reemplazada', 'AbortError')
  return api<User>('/api/v1/auth/me/')
}
export function verifyEmailToken(token: string) {
  const existing = verificationRequests.get(token)
  if (existing) return existing
  const request = api('/api/v1/auth/verify-email/', { method: 'POST', auth: false, body: { token } }).catch(error => { verificationRequests.delete(token); throw error })
  verificationRequests.set(token, request)
  return request
}
export async function register(email: string, password: string, referralToken?: string) {
  return api('/api/v1/auth/register/', { method: 'POST', auth: false, body: { email, password, ...(referralToken ? { referral_token: referralToken } : {}) } })
}
