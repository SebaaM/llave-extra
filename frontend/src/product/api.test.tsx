import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const sidA = '00000000-0000-4000-8000-000000000001'
const sidB = '00000000-0000-4000-8000-000000000002'

function accessJwt(userId: number, sid: string, jti: string, expired = false) {
  const now = Math.floor(Date.now() / 1000)
  const encode = (value: object) => btoa(JSON.stringify(value)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
  const header = encode({ alg: 'HS256', typ: 'JWT' })
  const payload = encode({ token_type: 'access', user_id: String(userId), sid, jti, iat: now - 300, exp: now + (expired ? -1 : 300), pwd: 'synthetic-fingerprint' })
  // La autenticidad se verifica en el servidor, simulado en esta suite.
  return `${header}.${payload}.synthetic-signature`
}

const nativeLocks = Object.getOwnPropertyDescriptor(navigator, 'locks')
beforeEach(() => {
  vi.resetModules()
  sessionStorage.clear()
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: { request: (_name: string, _options: unknown, callback: () => Promise<unknown>) => Promise.resolve(callback()) },
  })
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  if (nativeLocks) Object.defineProperty(navigator, 'locks', nativeLocks)
  else Reflect.deleteProperty(navigator, 'locks')
})

describe('cliente de API con sesión de cliente', () => {
  it.each([
    { userId: 2, image: false },
    { userId: 1, image: false },
    { userId: 2, image: true },
    { userId: 1, image: true },
  ])('descarta la renovación con SID ajeno tras 401 (dueño $userId, imagen $image)', async ({ userId, image }) => {
    const initial = accessJwt(1, sidA, 'a'.repeat(32))
    const next = accessJwt(userId, sidB, 'b'.repeat(32))
    const attempts: Array<string | null> = []
    let cookieAccess = initial
    const fetcher = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = String(input)
      const authorization = new Headers(init?.headers).get('Authorization')
      if (url.endsWith('/auth/csrf/')) return json({ csrfToken: 'csrf' })
      if (url.endsWith('/auth/login/')) return json({ access: initial })
      if (url.endsWith('/auth/me/')) return json({ id: 1 })
      if (url.endsWith('/auth/refresh/')) return json({ access: cookieAccess })
      attempts.push(authorization)
      return authorization === `Bearer ${initial}` ? json({}, 401) : json({ balance: 88 })
    })
    vi.stubGlobal('fetch', fetcher)
    const { api, authenticate, currentSessionVersion, privateImage, restoreSession } = await import('./api')
    await authenticate('alpha@example.test', 'synthetic-password')
    const version = currentSessionVersion()
    // Otro login en el origen reemplaza la cookie compartida.
    cookieAccess = next

    const pending = image ? privateImage('/api/v1/private/photo/') : api('/api/v1/me/wallet/')
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect(currentSessionVersion()).toBe(version + 1)
    expect(attempts).toEqual([`Bearer ${initial}`])
    await expect(restoreSession()).resolves.toBeNull()
    await expect(api('/api/v1/me/wallet/')).rejects.toMatchObject({ status: 401 })
    expect(attempts).toEqual([`Bearer ${initial}`])
    expect(fetcher.mock.calls.filter(([url]) => String(url).endsWith('/auth/refresh/'))).toHaveLength(1)
    expect(fetcher.mock.calls.some(([url]) => String(url).endsWith('/auth/logout/'))).toBe(false)
  })

  it('no restaura en un módulo nuevo si storage es legible pero no admite persistir el logout', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Cuota agotada') })
    const fetcher = vi.fn(async (input: URL | RequestInfo) => {
      const url = String(input)
      if (url.endsWith('/auth/csrf/')) return json({ csrfToken: 'csrf' })
      if (url.endsWith('/auth/logout/')) return json({}, 503)
      return json({ access: 'must-not-restore' })
    })
    vi.stubGlobal('fetch', fetcher)
    const previous = await import('./api')
    previous.setAccessToken('previous-session')
    await expect(previous.signOut()).rejects.toMatchObject({ status: 503 })
    expect(sessionStorage.getItem('llave-extra.logout-pending')).toBeNull()
    expect(previous.hasPendingLogout()).toBe(true)
    expect(await previous.restoreSession()).toBeNull()
    vi.resetModules()
    const reloaded = await import('./api')
    expect(await reloaded.restoreSession()).toBeNull()
    expect(fetcher.mock.calls.some(([url]) => String(url).includes('/auth/refresh/'))).toBe(false)
  })
  it('con storage denegado conserva en memoria el logout incierto y solo lo limpia tras login explícito', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('Sin storage') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Sin storage') })
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new DOMException('Sin storage') })
    const fetcher = vi.fn(async (input: URL | RequestInfo) => {
      const url = String(input)
      if (url.endsWith('/auth/csrf/')) return json({ csrfToken: 'csrf' })
      if (url.endsWith('/auth/logout/')) return json({}, 503)
      if (url.endsWith('/auth/login/')) return json({ access: 'new-session' })
      if (url.endsWith('/auth/me/')) return json({ id: 42, email: 'synthetic@example.test', role: 'TOURIST', email_verified: true })
      return json({}, 404)
    })
    vi.stubGlobal('fetch', fetcher)
    const { authenticate, hasPendingLogout, restoreSession, setAccessToken, signOut } = await import('./api')
    setAccessToken('previous-session')
    await expect(signOut()).rejects.toMatchObject({ status: 503 })
    expect(hasPendingLogout()).toBe(true)
    expect(await restoreSession()).toBeNull()
    expect(fetcher.mock.calls.some(([url]) => String(url).includes('/auth/refresh/'))).toBe(false)
    vi.mocked(Storage.prototype.getItem).mockReturnValueOnce(null)
    expect(hasPendingLogout()).toBe(true)
    vi.resetModules()
    const reloaded = await import('./api')
    expect(await reloaded.restoreSession()).toBeNull()
    expect(fetcher.mock.calls.some(([url]) => String(url).includes('/auth/refresh/'))).toBe(false)
    await authenticate('synthetic@example.test', 'Synthetic-password-42!')
    expect(hasPendingLogout()).toBe(false)
  })
  it('reintenta multipart conservando FormData y autorización sin fijar boundary', async () => {
    const oldAccess = accessJwt(1, sidA, 'a'.repeat(32), true)
    const newAccess = accessJwt(1, sidA, 'b'.repeat(32))
    const attempts: RequestInit[] = []
    vi.stubGlobal('fetch', vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/auth/csrf/')) return json({ csrfToken: 'csrf-form' })
      if (url.endsWith('/auth/refresh/')) return json({ access: newAccess })
      attempts.push(init!)
      return attempts.length === 1 ? json({ detail: 'Expirado' }, 401) : json({ id: 'benefit-form' })
    }))
    const { api, setAccessToken } = await import('./api')
    setAccessToken(oldAccess)
    const form = new FormData()
    form.append('title', 'Propuesta')
    form.append('image', new File(['image'], 'imagen.png', { type: 'image/png' }))
    await api('/api/v1/provider/providers/provider-test/benefits/', { method: 'POST', body: form, idempotencyKey: 'multipart-test' })
    expect(attempts).toHaveLength(2)
    expect(attempts.every(attempt => attempt.body === form)).toBe(true)
    expect(attempts.every(attempt => !new Headers(attempt.headers).has('Content-Type'))).toBe(true)
    expect(attempts.every(attempt => attempt.cache === 'no-store' && attempt.credentials === 'same-origin')).toBe(true)
    expect(new Headers(attempts[1].headers).get('Authorization')).toBe(`Bearer ${newAccess}`)
    expect(attempts.every(attempt => new Headers(attempt.headers).get('Idempotency-Key') === 'multipart-test')).toBe(true)
  })

  it('no envía una escritura multipart si la sesión cambia durante el refresh', async () => {
    let finishRefresh!: (response: Response) => void
    const writes: string[] = []
    vi.stubGlobal('fetch', vi.fn((input: URL | RequestInfo) => {
      const url = String(input)
      if (url.endsWith('/auth/csrf/')) return Promise.resolve(json({ csrfToken: 'csrf' }))
      if (url.endsWith('/auth/refresh/')) return new Promise<Response>(resolve => { finishRefresh = resolve })
      writes.push(url); return Promise.resolve(json({}))
    }))
    const { api, invalidatePrivateState } = await import('./api')
    const pending = api('/api/v1/provider/providers/provider-test/', { method: 'PATCH', body: new FormData() })
    const rejection = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    await vi.waitFor(() => expect(finishRefresh).toBeTypeOf('function'))
    invalidatePrivateState()
    finishRefresh(json({ access: 'viejo' }))
    await rejection
    expect(writes).toHaveLength(0)
  })

  it('respeta la cancelación previa de una subida multipart', async () => {
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    const { api, setAccessToken } = await import('./api')
    setAccessToken('access')
    const controller = new AbortController(); controller.abort()
    await expect(api('/api/v1/provider/providers/provider-test/', { method: 'PATCH', body: new FormData(), signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('comparte una sola rotación de refresh entre solicitudes privadas concurrentes', async () => {
    const newAccess = accessJwt(1, sidA, 'b'.repeat(32))
    const calls: Array<{ url: string; init?: RequestInit }> = []
    vi.stubGlobal('fetch', vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = String(input); calls.push({ url, init })
      if (url.endsWith('/auth/csrf/')) return json({ csrfToken: 'csrf-demo' })
      if (url.endsWith('/auth/refresh/')) return json({ access: newAccess })
      if (url.endsWith('/me/wallet/')) return json({ balance: 0, redemptions_frozen: false })
      if (url.endsWith('/me/progress/')) return json({ total: 0, target: 0, completed: true })
      return json({ detail: 'No encontrado' }, 404)
    }))
    const { api } = await import('./api')
    const [wallet, progress] = await Promise.all([api('/api/v1/me/wallet/'), api('/api/v1/me/progress/')])
    expect(wallet).toEqual({ balance: 0, redemptions_frozen: false })
    expect(progress).toEqual({ total: 0, target: 0, completed: true })
    expect(calls.filter(call => call.url.endsWith('/auth/refresh/'))).toHaveLength(1)
    const privateCalls = calls.filter(call => /\/me\/(wallet|progress)\/$/.test(call.url))
    expect(privateCalls.every(call => new Headers(call.init?.headers).get('Authorization') === `Bearer ${newAccess}`)).toBe(true)
    expect(privateCalls.every(call => call.init?.credentials === 'same-origin' && call.init?.cache === 'no-store')).toBe(true)
  })

  it('reintenta un consumo 401 con la misma clave idempotente y el PIN solo en el cuerpo', async () => {
    const oldAccess = accessJwt(1, sidA, 'a'.repeat(32), true)
    const newAccess = accessJwt(1, sidA, 'b'.repeat(32))
    const calls: Array<{ url: string; init?: RequestInit }> = []
    vi.stubGlobal('fetch', vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = String(input); calls.push({ url, init })
      if (url.endsWith('/auth/csrf/')) return json({ csrfToken: 'csrf-demo' })
      if (url.endsWith('/auth/refresh/')) return json({ access: newAccess })
      if (url.endsWith('/consumptions/')) return calls.filter(call => call.url.endsWith('/consumptions/')).length === 1 ? json({ detail: 'Sesión vencida' }, 401) : json({ id: 'registro' }, 201)
      return json({}, 404)
    }))
    const { api, setAccessToken } = await import('./api')
    setAccessToken(oldAccess)
    const key = '6178f532-c3fc-49ed-a4ea-820c6801b4dc'
    await expect(api('/api/v1/consumptions/', { method: 'POST', body: { folder_id: 'folder', qr_token: 'token-demo', pin: '123456' }, idempotencyKey: key })).resolves.toEqual({ id: 'registro' })
    const attempts = calls.filter(call => call.url.endsWith('/consumptions/'))
    expect(attempts).toHaveLength(2)
    expect(attempts.map(call => new Headers(call.init?.headers).get('Idempotency-Key'))).toEqual([key, key])
    expect(attempts[0].url).not.toContain('token-demo')
    expect(JSON.parse(String(attempts[0].init?.body))).toEqual({ folder_id: 'folder', qr_token: 'token-demo', pin: '123456' })
    expect(new Headers(attempts[0].init?.headers).get('Authorization')).toBe(`Bearer ${oldAccess}`)
    expect(new Headers(attempts[1].init?.headers).get('Authorization')).toBe(`Bearer ${newAccess}`)
  })

  it('conserva una renovación normal cuando llega un segundo 401 del access anterior', async () => {
    const oldAccess = accessJwt(1, sidA, 'a'.repeat(32), true)
    const newAccess = accessJwt(1, sidA, 'b'.repeat(32))
    let finishLateRequest!: (response: Response) => void
    const fetcher = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/auth/csrf/')) return json({ csrfToken: 'csrf' })
      if (url.endsWith('/auth/refresh/')) return json({ access: newAccess })
      if (new Headers(init?.headers).get('Authorization') === `Bearer ${newAccess}`) return json({ ok: true })
      if (url.endsWith('/me/wallet/')) return new Promise<Response>(resolve => { finishLateRequest = resolve })
      return json({}, 401)
    })
    vi.stubGlobal('fetch', fetcher)
    const { api, currentSessionVersion, setAccessToken } = await import('./api')
    setAccessToken(oldAccess)
    const version = currentSessionVersion()

    const late = api('/api/v1/me/wallet/')
    await expect(api('/api/v1/me/progress/')).resolves.toEqual({ ok: true })
    finishLateRequest(json({}, 401))
    await expect(late).resolves.toEqual({ ok: true })
    expect(currentSessionVersion()).toBe(version)
    expect(fetcher.mock.calls.filter(([url]) => String(url).endsWith('/auth/refresh/'))).toHaveLength(1)
  })

  it('descarta una respuesta privada que termina después de cerrar la sesión', async () => {
    let finish!: (response: Response) => void
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { finish = resolve })))
    const { api, invalidatePrivateState, setAccessToken } = await import('./api')
    setAccessToken('access-actual')
    const pending = api('/api/v1/me/wallet/')
    await Promise.resolve()
    invalidatePrivateState()
    finish(json({ balance: 999, redemptions_frozen: false }))
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('serializa un refresh pendiente antes del login de otra cuenta y descarta su access viejo', async () => {
    let finishRefresh!: (response: Response) => void
    const calls: Array<{ url: string; init?: RequestInit }> = []
    vi.stubGlobal('fetch', vi.fn((input: URL | RequestInfo, init?: RequestInit) => {
      const url = String(input)
      calls.push({ url, init })
      if (url.endsWith('/auth/csrf/')) return Promise.resolve(json({ csrfToken: 'csrf-demo' }))
      if (url.endsWith('/auth/refresh/')) return new Promise<Response>(resolve => { finishRefresh = resolve })
      if (url.endsWith('/auth/login/')) return Promise.resolve(json({ access: 'access-b' }))
      if (url.endsWith('/auth/me/')) return Promise.resolve(json({ id: 2, email: 'b@example.test', role: 'TOURIST', email_verified: true }))
      if (url.endsWith('/me/wallet/')) return Promise.resolve(json({ balance: 22 }))
      return Promise.resolve(json({}, 404))
    }))

    const { api, authenticate } = await import('./api')
    const locksRequest = vi.fn((_name: string, _options: unknown, callback: () => Promise<unknown>) => callback())
    const previousLocks = Object.getOwnPropertyDescriptor(navigator, 'locks')
    Object.defineProperty(navigator, 'locks', { configurable: true, value: { request: locksRequest } })
    const previousRequest = api('/api/v1/me/wallet/')
    await vi.waitFor(() => expect(calls.some(call => call.url.endsWith('/auth/refresh/'))).toBe(true))
    const nextLogin = authenticate('b@example.test', 'password')
    await Promise.resolve()
    expect(calls.some(call => call.url.endsWith('/auth/login/'))).toBe(false)

    finishRefresh(json({ access: 'access-a' }))
    await expect(previousRequest).rejects.toMatchObject({ name: 'AbortError' })
    await expect(nextLogin).resolves.toMatchObject({ id: 2, email: 'b@example.test' })
    await api('/api/v1/me/wallet/')

    const loginCall = calls.find(call => call.url.endsWith('/auth/login/'))
    const walletCall = calls.find(call => call.url.endsWith('/me/wallet/'))
    expect(loginCall).toBeDefined()
    expect(walletCall && new Headers(walletCall.init?.headers).get('Authorization')).toBe('Bearer access-b')
    expect(locksRequest).toHaveBeenCalledWith('llave-extra-auth-cookie', { mode: 'exclusive' }, expect.any(Function))
    if (previousLocks) Object.defineProperty(navigator, 'locks', previousLocks)
    else Reflect.deleteProperty(navigator, 'locks')
  })

  it('no crea una URL privada si la sesión cambia mientras termina de leerse el Blob', async () => {
    let finishBlob!: (blob: Blob) => void
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:private-image')
    vi.stubGlobal('fetch', vi.fn(async (input: URL | RequestInfo) => {
      const url = String(input)
      if (url.endsWith('/auth/csrf/')) return json({ csrfToken: 'csrf-demo' })
      if (url.endsWith('/auth/refresh/')) return json({ access: 'access-a' })
      if (url.endsWith('/private/photo/')) return new Response(new Blob(['photo']))
      return json({}, 404)
    }))
    vi.spyOn(Response.prototype, 'blob').mockImplementation(function () {
      return new Promise<Blob>(resolve => { finishBlob = resolve })
    })
    const { privateImage, invalidatePrivateState } = await import('./api')
    const pending = privateImage('/api/v1/private/photo/')
    await vi.waitFor(() => expect(finishBlob).toBeTypeOf('function'))
    invalidatePrivateState()
    finishBlob(new Blob(['private']))
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect(createObjectURL).not.toHaveBeenCalled()
  })

  it('mantiene el dispositivo desconectado y no restaura en silencio si el servidor no confirma el logout', async () => {
    const calls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (input: URL | RequestInfo) => {
      const url = String(input); calls.push(url)
      if (url.endsWith('/auth/csrf/')) return json({ csrfToken: 'csrf-demo' })
      if (url.endsWith('/auth/logout/')) return json({ detail: 'Servicio no disponible' }, 503)
      if (url.endsWith('/auth/refresh/')) return json({ access: 'access-que-no-debe-restaurarse' })
      return json({}, 404)
    }))
    const { restoreSession, setAccessToken, signOut, hasPendingLogout } = await import('./api')
    setAccessToken('access-actual')
    await expect(signOut()).rejects.toMatchObject({ status: 503 })
    expect(hasPendingLogout()).toBe(true)
    await expect(restoreSession()).resolves.toBeNull()
    expect(calls.some(url => url.endsWith('/auth/refresh/'))).toBe(false)
  })

  it('no acepta rutas de API de otro origen para enviar credenciales', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const { api, setAccessToken } = await import('./api')
    setAccessToken('access-secreto')
    await expect(api('https://ejemplo.invalid/api/v1/me/wallet/')).rejects.toThrow('Ruta de API no autorizada')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('no modifica cookies ni inicia autenticación sin coordinación Web Locks', async () => {
    Reflect.deleteProperty(navigator, 'locks')
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const { authenticate, restoreSession, signOut } = await import('./api')

    await expect(authenticate('viajera@example.test', 'password')).rejects.toThrow(/navegador actualizado/)
    await expect(restoreSession()).rejects.toThrow(/conexión segura/)
    await expect(signOut()).rejects.toThrow(/conexión segura/)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('libera el Web Lock de login antes de /me para que un 401 pueda refrescar sin deadlock', async () => {
    const calls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (input: URL | RequestInfo) => {
      const url = String(input)
      calls.push(url)
      if (url.endsWith('/auth/csrf/')) return json({ csrfToken: 'csrf-demo' })
      if (url.endsWith('/auth/login/')) return json({ access: 'access-login' })
      if (url.endsWith('/auth/me/')) return json({ detail: 'Access vencido' }, 401)
      if (url.endsWith('/auth/refresh/')) return json({ detail: 'Refresh vencido' }, 401)
      return json({}, 404)
    }))
    const { authenticate } = await import('./api')

    await expect(authenticate('viajera@example.test', 'password')).rejects.toMatchObject({ status: 401 })
    expect(calls.map(url => url.slice(url.lastIndexOf('/auth/')))).toEqual([
      '/auth/csrf/', '/auth/login/', '/auth/me/', '/auth/refresh/',
    ])
  }, 5000)
})
