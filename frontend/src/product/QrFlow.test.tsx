import { StrictMode } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const tourist = { id: 804, email: 'cliente@example.test', role: 'TOURIST', email_verified: true }
const collaborator = { id: 'guide-a', name: 'Ana del Sur' }
const provider = { id: 'shop-a', name: 'Café del puerto', slug: 'cafe', category: 'Café', description: '', address: '', hours: '', contact: '', map_url: '', website: '', image_url: null, status: 'PUBLISHED', demo: false }
const benefit = { id: 'benefit-a', title: 'Merienda local', description: 'Una pausa', conditions: 'Por la tarde', image_url: null, valid_from: null, valid_until: null, status: 'PUBLISHED', demo: false, provider }
const page = (extra = {}) => ({ count: 1, next: null, previous: null, collaborator, results: [benefit], ...extra })
const hintKey = 'llave-extra.qr-context'
const nativeLocks = Object.getOwnPropertyDescriptor(navigator, 'locks')
beforeEach(() => {
  sessionStorage.clear()
  Object.defineProperty(navigator, 'locks', { configurable: true, value: { request: (_name: string, _options: unknown, callback: () => Promise<unknown>) => Promise.resolve(callback()) } })
})
afterEach(() => {
  cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks()
  if (nativeLocks) Object.defineProperty(navigator, 'locks', nativeLocks)
  else Reflect.deleteProperty(navigator, 'locks')
})
type Override = (url: string, init?: RequestInit) => Response | Promise<Response> | undefined
async function mount(path = '/referencia', token: string | null = 'synthetic-guide-qr', override?: Override, strict = false) {
  window.history.replaceState({}, '', path)
  const client = await import('./api'); client.invalidatePrivateState()
  const intents = await import('./qr-intent'); intents.setReferralToken(token); intents.setConsumptionToken(path === '/consumo' ? 'synthetic-business-qr' : null)
  const fetcher = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
    const url = String(input)
    const value = override?.(url, init); if (value !== undefined) return value
    if (url.endsWith('/auth/csrf/')) return json({ csrfToken: 'csrf-test' })
    if (url.endsWith('/auth/refresh/')) return json({ access: 'access-test' })
    if (url.endsWith('/auth/me/')) return json(tourist)
    if (url.endsWith('/auth/logout/')) return new Response(null, { status: 204 })
    if (url.endsWith('/referrals/redeem/')) return json({ collaborator_id: collaborator.id, collaborator_name: collaborator.name, granted_at: '' })
    if (url.includes('/folders/guide-a/benefits/')) return json(page())
    if (url.endsWith('/me/wallet/')) return json({ balance: 0 })
    if (url.endsWith('/me/progress/')) return json({ total: 0, target: 5 })
    if (url.endsWith('/me/consumptions/')) return json([])
    return json({}, 404)
  })
  vi.stubGlobal('fetch', fetcher)
  const { default: ProductApp } = await import('./ProductApp')
  const view = render(strict ? <StrictMode><ProductApp /></StrictMode> : <ProductApp />)
  return { ...view, fetcher, intents }
}

describe('selección contextual del QR', () => {
  it('redime una vez y presenta nombre y beneficios privados sin descubrir grants', async () => {
    const { fetcher } = await mount('/referencia', 'synthetic-guide-qr', undefined, true)
    await screen.findByRole('heading', { name: 'Recomendaciones de Ana del Sur' })
    expect(screen.getByRole('heading', { name: 'Merienda local' })).toBeTruthy()
    expect(screen.getByText('Café del puerto')).toBeTruthy()
    expect(fetcher.mock.calls.filter(([url]) => String(url).includes('/referrals/redeem/'))).toHaveLength(1)
    expect(fetcher.mock.calls.some(([url]) => /\/me\/folders\/|\/network\/|\/catalog\//.test(String(url)))).toBe(false)
    expect(sessionStorage.getItem(hintKey)).toBe(JSON.stringify({ accountId: tourist.id, collaboratorId: collaborator.id }))
    expect(document.querySelector('a[href="/recomendaciones"]')).toBeNull()
  })

  it('revalida una pista tras el QR del negocio y atribuye sin selector histórico', async () => {
    sessionStorage.setItem(hintKey, JSON.stringify({ accountId: tourist.id, collaboratorId: collaborator.id }))
    let body: unknown
    const { fetcher } = await mount('/consumo', null, (url, init) => {
      if (url.endsWith('/consumptions/') && init?.method === 'POST') { body = JSON.parse(String(init?.body)); return json({ id: 'visit', provider_id: provider.id, collaborator_id: collaborator.id, award: 10, balance: 10, state: 'VALID', created_at: '' }) }
    })
    await screen.findByText('Visita recomendada por Ana del Sur')
    expect(screen.queryByRole('combobox')).toBeNull()
    fireEvent.change(screen.getByLabelText('PIN del negocio'), { target: { value: '000123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Validar visita' }))
    await screen.findByRole('heading', { name: 'Visita verificada' })
    expect(body).toEqual({ qr_token: 'synthetic-business-qr', pin: '000123', folder_id: collaborator.id })
    expect(fetcher.mock.calls.some(([url]) => /redeem|me\/folders/.test(String(url)))).toBe(false)
  })

  it('una pista revocada bloquea el consumo y nunca lo convierte a directo', async () => {
    sessionStorage.setItem(hintKey, JSON.stringify({ accountId: tourist.id, collaboratorId: collaborator.id }))
    const { fetcher } = await mount('/consumo', null, url => url.includes('/folders/') ? json({ detail: 'QR revocado' }, 403) : undefined)
    await screen.findByText(/Esta recomendación ya no está disponible/)
    expect((screen.getByRole('button', { name: 'Validar visita' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.submit(screen.getByLabelText('PIN del negocio').closest('form')!)
    expect(fetcher.mock.calls.some(([url]) => /\/consumptions\/$/.test(String(url)) && !String(url).includes('/me/'))).toBe(false)
    await waitFor(() => expect(sessionStorage.getItem(hintKey)).toBeNull())
  })

  it('conserva la pista mientras restaura sesión y bloquea hasta que el servidor la revalida', async () => {
    let finishAccount!: (value: Response) => void, finishSelection!: (value: Response) => void
    sessionStorage.setItem(hintKey, JSON.stringify({ accountId: tourist.id, collaboratorId: collaborator.id }))
    const { fetcher } = await mount('/consumo', null, url => {
      if (url.endsWith('/auth/me/')) return new Promise(resolve => { finishAccount = resolve })
      if (url.includes('/folders/guide-a/benefits/')) return new Promise(resolve => { finishSelection = resolve })
    })
    await waitFor(() => expect(finishAccount).toBeTypeOf('function'))
    expect(sessionStorage.getItem(hintKey)).not.toBeNull()
    expect(screen.queryByLabelText('PIN del negocio')).toBeNull()
    await act(async () => finishAccount(json(tourist)))
    const pin = await screen.findByLabelText('PIN del negocio')
    expect((pin as HTMLInputElement).disabled).toBe(true)
    fireEvent.submit(pin.closest('form')!)
    expect(fetcher.mock.calls.filter(([url, init]) => String(url).endsWith('/consumptions/') && init?.method === 'POST')).toHaveLength(0)
    await act(async () => finishSelection(json(page())))
    await screen.findByText('Visita recomendada por Ana del Sur')
    expect((pin as HTMLInputElement).disabled).toBe(false)
  })

  it.each([
    { accountId: 999, collaboratorId: 'guide-a' }, { accountId: tourist.id, collaboratorId: '../escape' },
    { accountId: tourist.id, collaboratorId: 'guide-a', token: 'forbidden' }, { accountId: String(tourist.id), collaboratorId: 'guide-a' },
  ])('descarta pista ajena o malformada sin consultar historial: %j', async hint => {
    sessionStorage.setItem(hintKey, JSON.stringify(hint))
    const { fetcher } = await mount('/consumo', null)
    await screen.findByText('Lo descubrí por mi cuenta')
    expect(sessionStorage.getItem(hintKey)).toBeNull()
    expect(fetcher.mock.calls.some(([url]) => /\/folders\//.test(String(url)))).toBe(false)
  })

  it('permite elegir una visita directa explícita antes del primer POST', async () => {
    sessionStorage.setItem(hintKey, JSON.stringify({ accountId: tourist.id, collaboratorId: collaborator.id }))
    let body: unknown
    await mount('/consumo', null, (url, init) => {
      if (url.endsWith('/consumptions/') && init?.method === 'POST') { body = JSON.parse(String(init.body)); return json({ id: 'direct', provider_id: provider.id, collaborator_id: null, award: 10, balance: 10, state: 'VALID', created_at: '' }) }
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Continuar sin esta recomendación' }))
    await screen.findByText('Lo descubrí por mi cuenta')
    expect(sessionStorage.getItem(hintKey)).toBeNull()
    fireEvent.change(screen.getByLabelText('PIN del negocio'), { target: { value: '000123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Validar visita' }))
    await screen.findByRole('heading', { name: 'Visita verificada' })
    expect(body).toEqual({ qr_token: 'synthetic-business-qr', pin: '000123' })
  })

  it('pagina manualmente sin mostrar la página anterior durante revalidación', async () => {
    let finish!: (value: Response) => void
    const { fetcher } = await mount('/referencia', 'synthetic-guide-qr', url => {
      if (url.includes('/folders/guide-a/benefits/')) {
        if (new URL(url).searchParams.get('page') === '2') return new Promise(resolve => { finish = resolve })
        return json(page({ count: 25, next: '/api/v1/folders/guide-a/benefits/?page=2&page_size=24' }))
      }
    })
    await screen.findByRole('heading', { name: benefit.title })
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente →' }))
    expect(screen.queryByText(benefit.title)).toBeNull()
    await waitFor(() => expect(finish).toBeTypeOf('function'))
    await act(async () => finish(json(page({ count: 25, previous: '/api/v1/folders/guide-a/benefits/?page=1&page_size=24', results: [{ ...benefit, id: 'last', title: 'Última propuesta' }] }))))
    await screen.findByRole('heading', { name: 'Última propuesta' })
    expect(screen.getByText('Página 2 · 25 beneficios')).toBeTruthy()
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1 }))
    fireEvent.click(screen.getByRole('button', { name: '← Anterior' }))
    await screen.findByRole('heading', { name: benefit.title })
    expect(fetcher.mock.calls.filter(([url]) => /folders.*benefits/.test(String(url)))).toHaveLength(3)
  })

  it.each([403, 404, 503])('retira contenido en revalidación %s y permite recuperación autoritativa', async status => {
    let failed = false
    const { fetcher } = await mount('/referencia', 'synthetic-guide-qr', url => url.includes('/folders/') ? json(failed ? { detail: 'Lectura rechazada' } : page(), failed ? status : 200) : undefined)
    await screen.findByRole('heading', { name: benefit.title })
    failed = true
    fireEvent(window, new Event('focus'))
    await screen.findByRole('alert')
    expect(screen.queryByText(benefit.title)).toBeNull()
    expect(screen.queryByText(provider.name)).toBeNull()
    expect(sessionStorage.getItem(hintKey)).toBeNull()
    failed = false
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar selección' }))
    await screen.findByRole('heading', { name: benefit.title })
    expect(fetcher.mock.calls.filter(([url]) => String(url).includes('/referrals/redeem/'))).toHaveLength(1)
  })

  it('un QR nuevo sustituye la selección y descarta una lectura tardía del anterior', async () => {
    let finishOld!: (value: Response) => void
    const { intents } = await mount('/referencia', 'old-guide-qr', (url, init) => {
      if (url.endsWith('/referrals/redeem/')) return json({ collaborator_id: JSON.parse(String(init?.body)).token === 'old-guide-qr' ? 'old-guide' : 'new-guide', collaborator_name: 'Guía', granted_at: '' })
      if (url.includes('/folders/old-guide/')) return new Promise(resolve => { finishOld = resolve })
      if (url.includes('/folders/new-guide/')) return json(page({ collaborator: { id: 'new-guide', name: 'Nueva guía' }, results: [{ ...benefit, title: 'Selección nueva' }] }))
    })
    await waitFor(() => expect(finishOld).toBeTypeOf('function'))
    act(() => intents.setReferralToken('new-guide-qr'))
    await screen.findByRole('heading', { name: 'Recomendaciones de Nueva guía' })
    await act(async () => finishOld(json(page({ collaborator: { id: 'old-guide', name: 'Guía anterior' }, results: [{ ...benefit, title: 'Selección anterior' }] }))))
    expect(screen.queryByText('Selección anterior')).toBeNull()
    expect(screen.getByRole('heading', { name: 'Selección nueva' })).toBeTruthy()
    expect(sessionStorage.getItem(hintKey)).toBe(JSON.stringify({ accountId: tourist.id, collaboratorId: 'new-guide' }))
  })

  it('conserva el comando incierto al recorrer otro QR y volver a consumo en la SPA', async () => {
    const posts: RequestInit[] = []
    const { intents } = await mount('/consumo', 'synthetic-guide-qr', (url, init) => {
      if (url.endsWith('/consumptions/') && init?.method === 'POST') {
        posts.push(init)
        if (posts.length === 1) throw new DOMException('Timeout', 'TimeoutError')
        return json({ id: 'recovered', provider_id: provider.id, collaborator_id: collaborator.id, award: 10, balance: 10, state: 'VALID', created_at: '' })
      }
    })
    await screen.findByText('Visita recomendada por Ana del Sur')
    fireEvent.change(screen.getByLabelText('PIN del negocio'), { target: { value: '000123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Validar visita' }))
    await screen.findByRole('alert')
    await act(async () => { window.history.pushState({}, '', '/referencia'); window.dispatchEvent(new PopStateEvent('popstate')); intents.setReferralToken('another-guide-qr') })
    await screen.findByRole('heading', { name: 'Recomendaciones de Ana del Sur' })
    await act(async () => { window.history.pushState({}, '', '/consumo#token=new-business-qr'); window.dispatchEvent(new PopStateEvent('popstate')) })
    const retry = await screen.findByRole('button', { name: 'Validar visita' })
    fireEvent.click(retry)
    await screen.findByRole('heading', { name: 'Visita verificada' })
    expect(posts).toHaveLength(2)
    expect(posts[1].body).toBe(posts[0].body)
    expect(new Headers(posts[1].headers).get('Idempotency-Key')).toBe(new Headers(posts[0].headers).get('Idempotency-Key'))
    expect(JSON.parse(String(posts[1].body))).toEqual({ qr_token: 'synthetic-business-qr', pin: '000123', folder_id: collaborator.id })
    expect(window.location.hash).toBe('')
  })

  it('usa el medio privado real del beneficio antes del medio del negocio, y limpia las tarjetas hermanas si se deniega', async () => {
    const benefitMedia = '/api/v1/folders/guide-a/providers/shop-a/benefits/benefit-a/media/'
    const providerMedia = '/api/v1/folders/guide-a/providers/shop-a/media/'
    let rejectPhoto!: (value: Response) => void
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:private-sibling')
    const { fetcher } = await mount('/referencia', 'synthetic-guide-qr', url => {
      if (url.includes('/folders/guide-a/benefits/')) return json(page({ results: [{ ...benefit, image_url: benefitMedia, provider: { ...provider, image_url: providerMedia } }, { ...benefit, id: 'sibling', title: 'Oferta hermana', image_url: null, provider: { ...provider, image_url: providerMedia } }] }))
      if (url.endsWith(benefitMedia)) return new Promise(resolve => { rejectPhoto = resolve })
      if (url.endsWith(providerMedia)) return new Response(new Blob(['photo']), { status: 200 })
    })
    await screen.findByRole('heading', { name: 'Oferta hermana' })
    await waitFor(() => expect(document.querySelector('img[src="blob:private-sibling"]')).not.toBeNull())
    await act(async () => rejectPhoto(json({}, 403)))
    await screen.findByText(/Esta recomendación ya no está disponible/)
    expect(screen.queryByText(benefit.title)).toBeNull()
    expect(screen.queryByText('Oferta hermana')).toBeNull()
    expect(revoke).toHaveBeenCalledWith('blob:private-sibling')
    expect(document.querySelector('img[src^="blob:"]')).toBeNull()
    expect(fetcher.mock.calls.some(([url]) => /\/catalog\/|\/me\/folders\//.test(String(url)))).toBe(false)
  })

  it.each([200, 403, 503])('revalida un medio 404 y solo restaura datos con autorización (%s)', async status => {
    const media = '/api/v1/folders/guide-a/providers/shop-a/benefits/benefit-a/media/'
    let reads = 0, finish!: (value: Response) => void
    const { fetcher } = await mount('/referencia', 'synthetic-guide-qr', url => {
      if (url.endsWith(media)) return json({}, 404)
      if (url.includes('/folders/guide-a/benefits/')) {
        reads += 1
        if (reads === 1) return json(page({ results: [{ ...benefit, image_url: media }] }))
        return new Promise(resolve => { finish = resolve })
      }
    })
    await waitFor(() => expect(finish).toBeTypeOf('function'))
    expect(screen.queryByText(benefit.title)).toBeNull()
    await act(async () => finish(json(status === 200 ? page({ results: [{ ...benefit, image_url: media }] }) : {}, status)))
    if (status === 200) await screen.findByRole('heading', { name: benefit.title })
    else { await screen.findByRole('alert'); expect(screen.queryByText(benefit.title)).toBeNull() }
    expect(fetcher.mock.calls.filter(([url]) => String(url).endsWith(media))).toHaveLength(1)
  })

  it('descarta un medio tardío de A al abrir B sin borrar la selección nueva', async () => {
    const media = '/api/v1/folders/guide-a/providers/shop-a/benefits/benefit-a/media/'
    let finishMedia!: (value: Response) => void
    const { intents } = await mount('/referencia', 'synthetic-guide-qr', (url, init) => {
      if (url.endsWith('/referrals/redeem/') && JSON.parse(String(init?.body)).token === 'guide-b-qr') return json({ collaborator_id: 'guide-b', collaborator_name: 'B', granted_at: '' })
      if (url.includes('/folders/guide-a/benefits/')) return json(page({ results: [{ ...benefit, image_url: media }] }))
      if (url.endsWith(media)) return new Promise(resolve => { finishMedia = resolve })
      if (url.includes('/folders/guide-b/benefits/')) return json(page({ collaborator: { id: 'guide-b', name: 'Beatriz' }, results: [{ ...benefit, title: 'Beneficio de B' }] }))
    })
    await waitFor(() => expect(finishMedia).toBeTypeOf('function'))
    act(() => intents.setReferralToken('guide-b-qr'))
    expect(screen.queryByText(benefit.title)).toBeNull()
    await screen.findByRole('heading', { name: 'Beneficio de B' })
    await act(async () => finishMedia(json({}, 403)))
    expect(screen.getByRole('heading', { name: 'Recomendaciones de Beatriz' })).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('el logout limpia contexto y pista antes de completar la solicitud remota', async () => {
    let finishLogout!: (value: Response) => void
    await mount('/referencia', 'synthetic-guide-qr', url => url.endsWith('/auth/logout/') ? new Promise(resolve => { finishLogout = resolve }) : undefined)
    await screen.findByRole('heading', { name: benefit.title })
    fireEvent.click(screen.getByRole('button', { name: 'Salir' }))
    expect(screen.queryByText(benefit.title)).toBeNull()
    expect(sessionStorage.getItem(hintKey)).toBeNull()
    await waitFor(() => expect(finishLogout).toBeTypeOf('function'))
    await act(async () => finishLogout(new Response(null, { status: 204 })))
  })

  it('conserva intención durante login y solo redime después de autenticar', async () => {
    let authenticated = false
    const { fetcher } = await mount('/referencia', 'pending-guide-qr', url => {
      if (url.endsWith('/auth/refresh/') && !authenticated) return json({}, 401)
      if (url.endsWith('/auth/login/')) { authenticated = true; return json({ access: 'access-login' }) }
    })
    await screen.findByRole('link', { name: 'Crear cuenta con este QR' })
    expect(fetcher.mock.calls.some(([url]) => String(url).includes('/referrals/redeem/'))).toBe(false)
    await act(async () => { window.history.pushState({}, '', '/ingresar'); window.dispatchEvent(new PopStateEvent('popstate')) })
    fireEvent.change(await screen.findByLabelText('Email'), { target: { value: tourist.email } })
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'Clave-segura-987!' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ingresar' }))
    await screen.findByRole('heading', { name: 'Recomendaciones de Ana del Sur' })
    const redemptions = fetcher.mock.calls.filter(([url]) => String(url).includes('/referrals/redeem/'))
    expect(redemptions).toHaveLength(1)
    expect(JSON.parse(String(redemptions[0][1]?.body))).toEqual({ token: 'pending-guide-qr' })
  })

  it('muestra la selección al completar QR → registro → login sin descubrir accesos históricos', async () => {
    let authenticated = false
    const { fetcher } = await mount('/referencia', 'registration-guide-qr', url => {
      if (url.endsWith('/auth/refresh/') && !authenticated) return json({}, 401)
      if (url.endsWith('/auth/register/')) return json({ ...tourist, email_verified: false }, 201)
      if (url.endsWith('/auth/login/')) { authenticated = true; return json({ access: 'registered-session' }) }
    })
    fireEvent.click(await screen.findByRole('link', { name: 'Crear cuenta con este QR' }))
    await screen.findByRole('heading', { name: 'Creá tu cuenta' })
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: tourist.email } })
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'Clave-segura-987!' } })
    fireEvent.click(screen.getByRole('button', { name: 'Crear mi cuenta' }))
    await screen.findByRole('heading', { name: 'Qué bueno verte' })
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: tourist.email } })
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'Clave-segura-987!' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ingresar' }))
    await screen.findByRole('heading', { name: 'Recomendaciones de Ana del Sur' })
    expect(window.location.pathname).toBe('/referencia')
    expect(screen.getByRole('heading', { name: benefit.title })).toBeTruthy()
    expect(fetcher.mock.calls.some(([url]) => String(url).includes('/me/folders/'))).toBe(false)
    const register = fetcher.mock.calls.find(([url]) => String(url).includes('/auth/register/'))
    expect(JSON.parse(String(register?.[1]?.body)).referral_token).toBe('registration-guide-qr')
    const redemptions = fetcher.mock.calls.filter(([url]) => String(url).includes('/referrals/redeem/'))
    expect(redemptions).toHaveLength(1)
    expect(JSON.parse(String(redemptions[0][1]?.body))).toEqual({ token: 'registration-guide-qr' })
  })

  it('cambiar de cuenta no restaura la selección ni una lectura privada tardía de A', async () => {
    let accountB = false, reads = 0, finishOld!: (value: Response) => void
    const { fetcher, intents } = await mount('/referencia', 'guide-a-qr', url => {
      if (url.endsWith('/auth/login/')) { accountB = true; return json({ access: 'access-b' }) }
      if (url.endsWith('/auth/me/')) return json(accountB ? { ...tourist, id: 805, email: 'b@example.test' } : tourist)
      if (url.includes('/folders/guide-a/benefits/')) return ++reads === 1 ? json(page()) : new Promise(resolve => { finishOld = resolve })
    })
    await screen.findByRole('heading', { name: benefit.title })
    fireEvent(window, new Event('focus'))
    await waitFor(() => expect(finishOld).toBeTypeOf('function'))
    await act(async () => { window.history.pushState({}, '', '/ingresar'); window.dispatchEvent(new PopStateEvent('popstate')) })
    fireEvent.change(await screen.findByLabelText('Email'), { target: { value: 'b@example.test' } })
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'Clave-segura-987!' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ingresar' }))
    await screen.findByRole('heading', { name: 'Tu pasaporte local.' })
    await act(async () => finishOld(json(page())))
    await act(async () => { intents.setConsumptionToken('business-b-qr'); window.history.pushState({}, '', '/consumo'); window.dispatchEvent(new PopStateEvent('popstate')) })
    await screen.findByText('Lo descubrí por mi cuenta')
    expect(screen.queryByText(benefit.title)).toBeNull()
    expect(sessionStorage.getItem(hintKey)).toBeNull()
    expect(fetcher.mock.calls.filter(([url]) => String(url).includes('/folders/guide-a/benefits/'))).toHaveLength(2)
  })

  it('coordina el submit manual, conserva el token tras timeout y reintenta una sola redención', async () => {
    let posts = 0
    const { fetcher, intents } = await mount('/referencia', null, url => {
      if (url.endsWith('/referrals/redeem/') && ++posts === 1) return Promise.reject(new DOMException('Timeout', 'TimeoutError'))
    })
    const input = await screen.findByLabelText('Código de recomendaciones')
    fireEvent.change(input, { target: { value: 'manual-guide-qr' } })
    act(() => { fireEvent.submit(input.closest('form')!); fireEvent.submit(input.closest('form')!) })
    await screen.findByRole('alert')
    expect(intents.referralToken).toBe('manual-guide-qr')
    expect(posts).toBe(1)
    fireEvent.click(screen.getByRole('button', { name: 'Abrir recomendaciones' }))
    await screen.findByRole('heading', { name: 'Recomendaciones de Ana del Sur' })
    expect(fetcher.mock.calls.filter(([url]) => String(url).includes('/referrals/redeem/'))).toHaveLength(2)
    expect(intents.referralToken).toBeNull()
  })

  it('una selección vigente vacía retira todas las tarjetas sin ofrecer datos públicos como alternativa', async () => {
    let empty = false
    const { fetcher } = await mount('/referencia', 'synthetic-guide-qr', url => url.includes('/folders/') ? json(page(empty ? { count: 0, results: [] } : {})) : undefined)
    await screen.findByRole('heading', { name: benefit.title })
    empty = true; fireEvent(window, new Event('focus'))
    await screen.findByText('Por ahora no hay beneficios disponibles en esta selección.')
    expect(screen.queryByText(benefit.title)).toBeNull()
    expect(screen.queryByText(provider.name)).toBeNull()
    expect(fetcher.mock.calls.some(([url]) => String(url).includes('/catalog/'))).toBe(false)
  })

  it('el contexto funciona solo en memoria si sessionStorage está denegado', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('Sin storage') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Sin storage') })
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new DOMException('Sin storage') })
    const { fetcher } = await mount('/referencia', 'memory-only-qr', url => url.endsWith('/auth/login/') ? json({ access: 'explicit-memory-session' }) : undefined)
    await screen.findByRole('link', { name: 'Crear cuenta con este QR' })
    expect(fetcher.mock.calls.some(([url]) => String(url).includes('/auth/refresh/'))).toBe(false)
    await act(async () => { window.history.pushState({}, '', '/ingresar'); window.dispatchEvent(new PopStateEvent('popstate')) })
    fireEvent.change(await screen.findByLabelText('Email'), { target: { value: tourist.email } })
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'Clave-segura-987!' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ingresar' }))
    await screen.findByRole('heading', { name: 'Recomendaciones de Ana del Sur' })
    expect(screen.getByRole('heading', { name: benefit.title })).toBeTruthy()
  })

  it('revoca un Blob tardío de otro QR y no lo muestra en la selección nueva', async () => {
    const media = '/api/v1/folders/guide-a/providers/shop-a/benefits/benefit-a/media/'
    let finishBlob!: (value: Blob) => void
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:late-guide-a')
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const { intents } = await mount('/referencia', 'synthetic-guide-qr', (url, init) => {
      if (url.endsWith('/referrals/redeem/') && JSON.parse(String(init?.body)).token === 'new-qr') return json({ collaborator_id: 'guide-b', collaborator_name: 'Beatriz' })
      if (url.includes('/folders/guide-a/benefits/')) return json(page({ results: [{ ...benefit, image_url: media }] }))
      if (url.endsWith(media)) { const response = new Response(null, { status: 200 }); response.blob = () => new Promise(resolve => { finishBlob = resolve }); return response }
      if (url.includes('/folders/guide-b/benefits/')) return json(page({ collaborator: { id: 'guide-b', name: 'Beatriz' } }))
    })
    await waitFor(() => expect(finishBlob).toBeTypeOf('function'))
    act(() => intents.setReferralToken('new-qr'))
    await screen.findByRole('heading', { name: 'Recomendaciones de Beatriz' })
    await act(async () => finishBlob(new Blob(['late-photo'])))
    expect(create).toHaveBeenCalledOnce()
    expect(revoke).toHaveBeenCalledWith('blob:late-guide-a')
    expect(document.querySelector('img[src="blob:late-guide-a"]')).toBeNull()
  })
})
