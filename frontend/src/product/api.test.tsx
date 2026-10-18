import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

beforeEach(() => { vi.resetModules() })
afterEach(() => { vi.unstubAllGlobals() })

describe('cliente de API con sesión de cliente', () => {
  it('comparte una sola rotación de refresh entre solicitudes privadas concurrentes', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    vi.stubGlobal('fetch', vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = String(input); calls.push({ url, init })
      if (url.endsWith('/auth/csrf/')) return json({ csrfToken: 'csrf-demo' })
      if (url.endsWith('/auth/refresh/')) return json({ access: 'access-rotado' })
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
    expect(privateCalls.every(call => new Headers(call.init?.headers).get('Authorization') === 'Bearer access-rotado')).toBe(true)
    expect(privateCalls.every(call => call.init?.credentials === 'same-origin' && call.init?.cache === 'no-store')).toBe(true)
  })

  it('reintenta un consumo 401 con la misma clave idempotente y el PIN solo en el cuerpo', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    vi.stubGlobal('fetch', vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = String(input); calls.push({ url, init })
      if (url.endsWith('/auth/csrf/')) return json({ csrfToken: 'csrf-demo' })
      if (url.endsWith('/auth/refresh/')) return json({ access: 'access-nuevo' })
      if (url.endsWith('/consumptions/')) return calls.filter(call => call.url.endsWith('/consumptions/')).length === 1 ? json({ detail: 'Sesión vencida' }, 401) : json({ id: 'registro' }, 201)
      return json({}, 404)
    }))
    const { api, setAccessToken } = await import('./api')
    setAccessToken('access-vencido')
    const key = '6178f532-c3fc-49ed-a4ea-820c6801b4dc'
    await expect(api('/api/v1/consumptions/', { method: 'POST', body: { folder_id: 'folder', qr_token: 'token-demo', pin: '123456' }, idempotencyKey: key })).resolves.toEqual({ id: 'registro' })
    const attempts = calls.filter(call => call.url.endsWith('/consumptions/'))
    expect(attempts).toHaveLength(2)
    expect(attempts.map(call => new Headers(call.init?.headers).get('Idempotency-Key'))).toEqual([key, key])
    expect(attempts[0].url).not.toContain('token-demo')
    expect(JSON.parse(String(attempts[0].init?.body))).toEqual({ folder_id: 'folder', qr_token: 'token-demo', pin: '123456' })
    expect(new Headers(attempts[0].init?.headers).get('Authorization')).toBe('Bearer access-vencido')
    expect(new Headers(attempts[1].init?.headers).get('Authorization')).toBe('Bearer access-nuevo')
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
})
