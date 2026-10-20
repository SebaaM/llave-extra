import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ProductApp from '../ProductApp'
import { currentSessionVersion, invalidatePrivateState } from '../api'
import type { User } from '../api'
import { WorkspaceQR } from './WorkspaceQR'

const { openAdmin } = vi.hoisted(() => ({ openAdmin: vi.fn() }))
vi.mock('./documentNavigation', () => ({ openAdmin }))
const json = (body: unknown, status = 200) => new Response(body == null ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const provider = { id: 'business-1', slug: 'business', name: 'Negocio de prueba', category: 'Café', description: 'Ficha propia', address: 'Calle local', hours: '', contact: '', map_url: '', website: '', image_url: null, status: 'PUBLISHED', demo: true }
const benefit = { id: 'benefit-1', title: 'Propuesta de prueba', description: 'Descripción de la propuesta', conditions: 'Condiciones de prueba', valid_from: null, valid_until: null, image_url: null, status: 'PUBLISHED', demo: true }
const catalogBenefit = { ...benefit, provider }
const originalLocks = Object.getOwnPropertyDescriptor(navigator, 'locks')
const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
type Handler = (path: string, init?: RequestInit) => Response | Promise<Response> | undefined

beforeEach(() => {
  cleanup(); sessionStorage.clear(); invalidatePrivateState(); openAdmin.mockReset()
  Object.defineProperty(navigator, 'locks', { configurable: true, value: { request: (_name: string, _options: unknown, callback: () => Promise<unknown>) => callback() } })
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:workspace-test')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
})
afterEach(() => {
  cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks()
  if (originalLocks) Object.defineProperty(navigator, 'locks', originalLocks)
  else Reflect.deleteProperty(navigator, 'locks')
  if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard)
  else Reflect.deleteProperty(navigator, 'clipboard')
})

function mount(role: User['role'], route: string, handler?: Handler) {
  const calls: { path: string; init?: RequestInit }[] = []
  window.history.replaceState({}, '', route)
  vi.stubGlobal('fetch', vi.fn((input: URL | RequestInfo, init?: RequestInit) => {
    const path = new URL(String(input), window.location.origin).pathname
    calls.push({ path, init })
    const override = handler?.(path, init)
    if (override) return Promise.resolve(override)
    if (path.endsWith('/auth/csrf/')) return Promise.resolve(json({ csrfToken: 'csrf-test' }))
    if (path.endsWith('/auth/refresh/') || path.endsWith('/auth/login/')) return Promise.resolve(json({ access: 'access-test' }))
    if (path.endsWith('/auth/me/')) return Promise.resolve(json({ id: 901, email: 'cuenta@example.test', role, email_verified: true }))
    if (path === '/api/v1/provider/providers/') return Promise.resolve(json([provider]))
    if (path === '/api/v1/provider/providers/business-1/benefits/') return Promise.resolve(json([benefit]))
    if (path === '/api/v1/collaborator/recommendations/') return Promise.resolve(json({ recommendations: [{ benefit_id: benefit.id, available: true, benefit: catalogBenefit }] }))
    if (path === '/api/v1/collaborator/catalog/benefits/') return Promise.resolve(json({ count: 1, next: null, previous: null, results: [catalogBenefit] }))
    return Promise.resolve(json({}, 404))
  }))
  const view = render(<ProductApp />)
  return { ...view, calls }
}

describe('paneles operativos por rol', () => {
  it('restaura /espacio como Prestador y usa solo su negocio, sin endpoints financieros', async () => {
    const { calls } = mount('PROVIDER', '/espacio')
    await screen.findByRole('heading', { name: provider.name })
    expect(window.location.pathname).toBe('/prestador')
    expect(screen.getByRole('link', { name: /Mis beneficios/ }).getAttribute('href')).toBe('/prestador/beneficios')
    expect(calls.some(call => /wallet|progress|consumptions|collaborator/.test(call.path))).toBe(false)
    expect(screen.queryByRole('combobox')).toBeNull()
  })

  it.each([['cero', [], 'Tu negocio está por llegar'], ['varios', [provider, { ...provider, id: 'otro' }], 'No pudimos abrir tu negocio']] as const)('falla cerrado con %s negocios', async (_label, providers, title) => {
    const { calls } = mount('PROVIDER', '/prestador', path => path === '/api/v1/provider/providers/' ? json(providers) : undefined)
    await screen.findByRole('heading', { name: title })
    expect(calls.some(call => call.path.includes('/benefits/'))).toBe(false)
  })

  it.each(['PROVIDER', 'COLLABORATOR', 'ADMIN'] as const)('permite cambiar de cuenta desde /ingresar con rol %s', async role => {
    const { calls } = mount(role, '/ingresar')
    await screen.findByRole('heading', { name: 'Qué bueno verte' })
    expect(calls.some(call => /provider\/providers|collaborator\/|me\/wallet/.test(call.path))).toBe(false)
    expect(openAdmin).not.toHaveBeenCalled()
  })

  it('conserva la portada pública para una sesión de red', async () => {
    const { calls } = mount('COLLABORATOR', '/')
    await screen.findByRole('link', { name: 'Mi espacio' })
    expect(calls.some(call => call.path.includes('/collaborator/'))).toBe(false)
  })

  it.each([['PROVIDER', '/colaborador'], ['COLLABORATOR', '/prestador']] as const)('deniega la ruta ajena de %s sin iniciar sus APIs', async (role, path) => {
    const { calls } = mount(role, path)
    await screen.findByRole('heading', { name: 'Esta sección no corresponde a tu rol.' })
    expect(calls.some(call => /provider\/providers|collaborator\//.test(call.path))).toBe(false)
  })

  it('abre Admin mediante navegación de documento al resolver /espacio', async () => {
    mount('ADMIN', '/espacio')
    await waitFor(() => expect(openAdmin).toHaveBeenCalledWith(true))
  })

  it('abre Admin mediante documento después del login', async () => {
    mount('ADMIN', '/ingresar')
    await screen.findByRole('heading', { name: 'Qué bueno verte' })
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'otra@example.test' } })
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'Clave-ejemplo-123!' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ingresar' }))
    await waitFor(() => expect(openAdmin).toHaveBeenCalledWith())
    expect(window.location.pathname).toBe('/ingresar')
  })

  it('guarda la ficha por multipart con la whitelist y conserva el nombre informativo', async () => {
    let submitted: FormData | null = null
    mount('PROVIDER', '/prestador/negocio', (path, init) => {
      if (path.endsWith('/business-1/') && init?.method === 'PATCH') { submitted = init.body as FormData; return json(provider) }
    })
    await screen.findByLabelText('Descripción')
    expect(screen.queryByLabelText('Nombre')).toBeNull()
    fireEvent.change(screen.getByLabelText('Descripción'), { target: { value: 'Nueva ficha' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar ficha' }))
    await screen.findByText('La ficha de tu negocio se guardó.')
    expect(submitted).toBeInstanceOf(FormData)
    expect(submitted!.get('description')).toBe('Nueva ficha')
    expect(submitted!.has('image')).toBe(false)
    expect(submitted!.has('name')).toBe(false)
  })

  it('valida fechas, crea un borrador y confirma la respuesta real', async () => {
    let submitted: FormData | null = null
    mount('PROVIDER', '/prestador/beneficios', (path, init) => {
      if (path.endsWith('/benefits/') && init?.method === 'POST') { submitted = init.body as FormData; return json({ ...benefit, status: 'DRAFT' }, 201) }
    })
    fireEvent.click(await screen.findByRole('button', { name: '+ Crear beneficio' }))
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Nueva propuesta' } })
    fireEvent.change(screen.getByLabelText('Descripción'), { target: { value: 'Una experiencia local' } })
    fireEvent.change(screen.getByLabelText('Válido desde'), { target: { value: '2027-01-03' } })
    fireEvent.change(screen.getByLabelText('Válido hasta'), { target: { value: '2027-01-01' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }))
    await screen.findByText('La fecha de inicio debe ser anterior o igual a la fecha de fin.')
    expect(submitted).toBeNull()
    fireEvent.change(screen.getByLabelText('Válido hasta'), { target: { value: '2027-01-05' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }))
    await screen.findByText('Beneficio guardado como borrador. Queda pendiente de revisión.')
    expect(submitted!.get('title')).toBe('Nueva propuesta')
    expect(submitted!.has('status')).toBe(false)
  })

  it('informa revisión al editar publicado y no ofrece borrar ni publicar', async () => {
    mount('PROVIDER', '/prestador/beneficios', (path, init) => path.endsWith('/benefit-1/') && init?.method === 'PATCH' ? json({ ...benefit, status: 'DRAFT' }) : undefined)
    fireEvent.click(await screen.findByRole('button', { name: 'Editar' }))
    expect(screen.queryByRole('button', { name: 'Eliminar borrador' })).toBeNull()
    expect(screen.getByText(/Si modificás este beneficio publicado/)).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Propuesta editada' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }))
    await screen.findByText('Beneficio guardado como borrador. Queda pendiente de revisión.')
    expect(screen.queryByRole('button', { name: 'Publicar' })).toBeNull()
  })

  it('muestra el conflicto al borrar un borrador seleccionado sin quitar la tarjeta', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    mount('PROVIDER', '/prestador/beneficios', (path, init) => {
      if (path.endsWith('/benefits/')) return json([{ ...benefit, status: 'DRAFT' }])
      if (path.endsWith('/benefit-1/') && init?.method === 'DELETE') return json({ detail: 'El beneficio tiene recomendaciones activas.' }, 409)
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Eliminar borrador' }))
    await screen.findByRole('alert')
    expect(screen.getByText('El beneficio tiene recomendaciones activas.')).toBeTruthy()
    expect(screen.getByRole('heading', { name: benefit.title })).toBeTruthy()
  })

  it('ignora una escritura de A que termina después del ingreso de B', async () => {
    let accountB = false
    let finishWrite!: (response: Response) => void
    mount('PROVIDER', '/prestador/negocio', (path, init) => {
      if (path.endsWith('/auth/login/')) { accountB = true; return json({ access: 'account-b' }) }
      if (path.endsWith('/auth/me/')) return json({ id: accountB ? 902 : 901, email: accountB ? 'b@example.test' : 'a@example.test', role: 'PROVIDER', email_verified: true })
      if (path.endsWith('/business-1/') && init?.method === 'PATCH') return new Promise<Response>(resolve => { finishWrite = resolve })
      if (path === '/api/v1/provider/providers/' && accountB) return json([])
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Guardar ficha' }))
    await waitFor(() => expect(finishWrite).toBeTypeOf('function'))
    window.history.pushState({}, '', '/ingresar'); fireEvent(window, new PopStateEvent('popstate'))
    await screen.findByRole('heading', { name: 'Qué bueno verte' })
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'b@example.test' } })
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'Clave-ejemplo-123!' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ingresar' }))
    await screen.findByRole('heading', { name: 'Tu negocio está por llegar' })
    await act(async () => finishWrite(json(provider)))
    expect(screen.queryByText('La ficha de tu negocio se guardó.')).toBeNull()
    expect(screen.queryByText('a@example.test')).toBeNull()
    expect(screen.getByText('b@example.test')).toBeTruthy()
  })

  it('agrega un beneficio concreto al catálogo privado y deshabilita la repetición', async () => {
    let selected = false
    const { calls } = mount('COLLABORATOR', '/colaborador/catalogo', (path, init) => {
      if (path === '/api/v1/collaborator/recommendations/') return json({ recommendations: selected ? [{ benefit_id: benefit.id, available: true, benefit: catalogBenefit }] : [] })
      if (path.endsWith('/recommendations/benefit-1/') && init?.method === 'PUT') { selected = true; return json(null, 201) }
    })
    fireEvent.click(await screen.findByRole('button', { name: '+ Agregar a mi carpeta' }))
    await screen.findByText('Beneficio agregado a tus recomendaciones.')
    const added = await screen.findByRole('button', { name: '✓ Ya está en tu carpeta' })
    expect((added as HTMLButtonElement).disabled).toBe(true)
    const put = calls.find(call => call.init?.method === 'PUT')!
    expect(put.path).toBe('/api/v1/collaborator/recommendations/benefit-1/')
    expect(put.init!.body).toBe('{}')
    expect(calls.some(call => call.path.startsWith('/api/v1/catalog/'))).toBe(false)
  })

  it('quita una selección no disponible sin mostrar contenido retirado', async () => {
    let selected = true
    mount('COLLABORATOR', '/colaborador/recomendaciones', (path, init) => {
      if (path === '/api/v1/collaborator/recommendations/') return json({ recommendations: selected ? [{ benefit_id: benefit.id, available: false, benefit: null }] : [] })
      if (path.endsWith('/recommendations/benefit-1/') && init?.method === 'DELETE') { selected = false; return json(null, 204) }
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Quitar recomendación' }))
    await screen.findByRole('heading', { name: 'Dale tu mirada a la red' })
    expect(screen.queryByText(benefit.title)).toBeNull()
  })

  it('busca y pagina el selector privado con los parámetros de servidor', async () => {
    const queries: URLSearchParams[] = []
    mount('COLLABORATOR', '/colaborador/catalogo')
    const original = globalThis.fetch
    vi.stubGlobal('fetch', vi.fn((input: URL | RequestInfo, init?: RequestInit) => {
      const url = new URL(String(input), window.location.origin)
      if (url.pathname === '/api/v1/collaborator/catalog/benefits/') {
        queries.push(url.searchParams)
        return Promise.resolve(json({ count: 26, next: url.searchParams.get('page') === '2' ? null : '?page=2', previous: url.searchParams.get('page') === '2' ? '?page=1' : null, results: [catalogBenefit] }))
      }
      return original(input, init)
    }))
    await screen.findByRole('heading', { name: benefit.title })
    fireEvent.change(screen.getByLabelText('Buscar beneficio'), { target: { value: 'café' } })
    fireEvent.change(screen.getByLabelText('Categoría'), { target: { value: 'Gastronomía' } })
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }))
    await screen.findByText('26 beneficios · Página 1')
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente →' }))
    await screen.findByText('26 beneficios · Página 2')
    expect(queries.at(-1)?.get('page')).toBe('2')
    expect(queries.at(-1)?.get('search')).toBe('café')
    expect(queries.at(-1)?.get('category')).toBe('Gastronomía')
  })

  it('limpia las recomendaciones al perder habilitación cuando vuelve el foco', async () => {
    let enabled = true
    mount('COLLABORATOR', '/colaborador/recomendaciones', path => path === '/api/v1/collaborator/recommendations/' && !enabled ? json({ detail: 'Colaborador no habilitado' }, 403) : undefined)
    await screen.findByRole('heading', { name: benefit.title })
    enabled = false
    fireEvent(window, new Event('focus'))
    expect(screen.queryByRole('heading', { name: benefit.title })).toBeNull()
    await screen.findByRole('heading', { name: 'Tu espacio no está disponible' })
  })

  it('cierra el menú móvil al navegar y conserva aria-controls', async () => {
    mount('PROVIDER', '/prestador')
    fireEvent.click(await screen.findByRole('button', { name: /Menú/ }))
    expect(screen.getByRole('button', { name: /Menú/ }).getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(screen.getByRole('link', { name: /Mis beneficios/ }))
    await screen.findByRole('heading', { name: 'Las propuestas de tu negocio' })
    expect(screen.getByRole('button', { name: /Menú/ }).getAttribute('aria-expanded')).toBe('false')
    expect(screen.getByRole('button', { name: /Menú/ }).getAttribute('aria-controls')).toBe('workspace-nav')
  })
})

describe('QR privado y PIN', () => {
  it('copia el enlace privado solo después de una acción explícita', async () => {
    const copy = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: copy } })
    mount('COLLABORATOR', '/colaborador/qr', path => {
      if (path === '/api/v1/collaborator/qr/') return json({ url: `${window.location.origin}/referencia#token=synthetic-test` })
      if (path === '/api/v1/collaborator/qr.png') return new Response(new Blob(['png'], { type: 'image/png' }))
    })
    const button = await screen.findByRole('button', { name: 'Copiar enlace' })
    expect(copy).not.toHaveBeenCalled()
    fireEvent.click(button)
    await screen.findByText('Enlace de referencia copiado.')
    expect(copy).toHaveBeenCalledTimes(1)
  })

  it('consulta el QR solo en su sección, lo renueva al foco y revoca cada Blob', async () => {
    const { calls } = mount('COLLABORATOR', '/colaborador/qr', path => {
      if (path === '/api/v1/collaborator/qr/') return json({ url: `${window.location.origin}/referencia#token=synthetic-test` })
      if (path === '/api/v1/collaborator/qr.png') return new Response(new Blob(['png'], { type: 'image/png' }))
    })
    await screen.findByRole('img', { name: 'QR privado de recomendaciones' })
    expect(calls.filter(call => call.path === '/api/v1/collaborator/qr.png')).toHaveLength(1)
    fireEvent(window, new Event('focus'))
    await waitFor(() => expect(calls.filter(call => call.path === '/api/v1/collaborator/qr.png')).toHaveLength(2))
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:workspace-test')
    expect(screen.queryByText(/synthetic-test/)).toBeNull()
    expect(window.location.hash).toBe('')
  })

  it('descarta el Blob QR que termina después del logout', async () => {
    let finish!: (response: Response) => void
    mount('COLLABORATOR', '/colaborador/qr', path => {
      if (path === '/api/v1/collaborator/qr/') return json({ url: `${window.location.origin}/referencia#token=synthetic-test` })
      if (path === '/api/v1/collaborator/qr.png') return new Promise<Response>(resolve => { finish = resolve })
      if (path.endsWith('/auth/logout/')) return json(null, 204)
    })
    await waitFor(() => expect(finish).toBeTypeOf('function'))
    fireEvent.click(screen.getByRole('button', { name: 'Salir' }))
    await act(async () => finish(new Response(new Blob(['late'], { type: 'image/png' }))))
    expect(screen.queryByRole('img', { name: 'QR privado de recomendaciones' })).toBeNull()
    expect(URL.createObjectURL).not.toHaveBeenCalled()
  })

  it('revoca el Blob QR tardío después de salir de la sección con la misma sesión', async () => {
    let finish!: (response: Response) => void
    mount('COLLABORATOR', '/colaborador/qr', path => {
      if (path === '/api/v1/collaborator/qr/') return json({ url: `${window.location.origin}/referencia#token=synthetic-test` })
      if (path === '/api/v1/collaborator/qr.png') return new Promise<Response>(resolve => { finish = resolve })
    })
    await waitFor(() => expect(finish).toBeTypeOf('function'))
    fireEvent.click(screen.getByRole('link', { name: /Mi cuenta/ }))
    await screen.findByRole('heading', { name: 'Tu cuenta' })
    await act(async () => finish(new Response(new Blob(['late'], { type: 'image/png' }))))
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:workspace-test')
    expect(screen.queryByRole('img', { name: 'QR privado de recomendaciones' })).toBeNull()
  })

  it('retira el enlace y QR si el PNG responde 403', async () => {
    mount('COLLABORATOR', '/colaborador/qr', path => {
      if (path === '/api/v1/collaborator/qr/') return json({ url: `${window.location.origin}/referencia#token=synthetic-test` })
      if (path === '/api/v1/collaborator/qr.png') return json({ detail: 'Deshabilitado' }, 403)
    })
    await screen.findByText('El acceso a este QR ya no está habilitado. Actualizá para consultar tu autorización.')
    expect(screen.queryByRole('button', { name: 'Copiar enlace' })).toBeNull()
  })

  it('envía PIN solo por PUT y lo limpia inmediatamente sin devolver el valor', async () => {
    const calls: { body?: BodyInit | null; url: string }[] = []
    vi.stubGlobal('fetch', vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = String(input); calls.push({ body: init?.body, url })
      if (url.endsWith('/auth/csrf/')) return json({ csrfToken: 'csrf' })
      if (url.endsWith('/auth/refresh/')) return json({ access: 'access' })
      if (init?.method === 'PUT') return json({ configured: true })
      return json({ configured: false })
    }))
    render(<WorkspaceQR kind="provider" credentialPath="/api/v1/provider/providers/business-1/consumption-credential/" />)
    const input = screen.getByLabelText('Nuevo PIN') as HTMLInputElement
    expect(input.type).toBe('password')
    fireEvent.change(input, { target: { value: '123456789' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar PIN' }))
    expect(input.value).toBe('')
    await screen.findByText('PIN actualizado. Usá el nuevo PIN para validar visitas.')
    expect(calls.some(call => call.body === '{"pin":"123456789"}')).toBe(true)
    expect(calls.every(call => !call.url.includes('123456789'))).toBe(true)
    expect(currentSessionVersion()).toBeGreaterThan(0)
  })
})
