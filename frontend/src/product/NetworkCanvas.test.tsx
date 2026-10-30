import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { invalidatePrivateState, setAccessToken } from './api'
import { NetworkCanvas } from './NetworkCanvas'
import { ProviderDetail } from './BenefitsPages'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const provider = { id: 'p1', slug: 'local', name: 'Local seguro', category: 'Paseos', description: '', address: '', hours: '', contact: '', map_url: '', website: '', demo: true, image_url: null as string | null }
const item = { provider, benefit_id: 'b1', benefit_title: 'Paseo vigente' }
const presentation = { title: 'Red elegida', layout: 'ORBIT', theme: 'OCEAN', background: 'HARBOR', page_size: 8, interval_seconds: 10, city: 'Ushuaia' }
const page = (results = [item], extra = {}) => ({ count: 16, next: 'next', previous: null, results, presentation, ...extra })
function viewport(mobile = false) {
  const listeners = new Set<() => void>()
  const media = { matches: mobile, addEventListener: vi.fn((_event: string, listener: () => void) => listeners.add(listener)), removeEventListener: vi.fn((_event: string, listener: () => void) => listeners.delete(listener)) }
  vi.stubGlobal('matchMedia', vi.fn((query: string) => query === '(max-width: 680px)' ? media : { matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
  return { media, resize(value: boolean) { act(() => { media.matches = value; listeners.forEach(listener => listener()) }) } }
}

beforeEach(() => {
  setAccessToken('sesion-a')
  vi.stubGlobal('navigator', Object.assign(Object.create(navigator), { locks: { request: (_name: string, _options: unknown, callback: () => Promise<unknown>) => callback() } }))
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
})
afterEach(() => { cleanup(); invalidatePrivateState(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('vista previa de la red', () => {
  it('selecciona por teclado, abre explícitamente y devuelve foco al cerrar', async () => {
    const user = userEvent.setup()
    const fetcher = vi.fn(async () => json(page()))
    vi.stubGlobal('fetch', fetcher)
    render(<NetworkCanvas />)
    const node = await screen.findByRole('button', { name: 'Local seguro: Paseo vigente' })
    node.focus()
    await user.keyboard('{Enter}')
    const preview = screen.getByRole('region', { name: 'Vista previa de Local seguro' })
    expect(within(preview).getByRole('heading', { name: 'Local seguro' })).toBe(document.activeElement)
    expect(within(preview).getByRole('link', { name: 'Ver beneficio y condiciones' }).getAttribute('href')).toBe('/beneficios/b1')
    expect(fetcher).toHaveBeenCalledTimes(1)
    await user.click(within(preview).getByRole('button', { name: 'Cerrar vista previa' }))
    expect(screen.queryByRole('region', { name: /Vista previa/ })).toBeNull()
    expect(document.activeElement).toBe(node)
  })

  it('adapta Red y Lista al ancho conservando página, resultados y foco sin selector manual', async () => {
    const screenSize = viewport()
    const fetcher = vi.fn(async (input: URL | RequestInfo) => new URL(String(input)).searchParams.get('page') === '2'
      ? json(page([{ ...item, provider: { ...provider, name: 'Último local' } }], { next: null, previous: 'prev' })) : json(page()))
    vi.stubGlobal('fetch', fetcher)
    render(<NetworkCanvas />)
    await screen.findByText('Local seguro')
    fireEvent.click(screen.getByRole('button', { name: 'Página siguiente' }))
    await screen.findByText('Último local')
    expect(screen.queryByRole('group', { name: 'Vista de la red' })).toBeNull()
    screen.getByRole('button', { name: 'Último local: Paseo vigente' }).focus()
    screenSize.resize(true)
    const list = screen.getByRole('list', { name: 'Negocios de esta página' })
    expect(within(list).getAllByRole('button')).toHaveLength(1)
    expect(within(list).getByText('Último local')).toBeTruthy()
    expect(screen.queryByText('Local seguro')).toBeNull()
    expect(document.activeElement).toBe(within(list).getByRole('button'))
    expect(screen.getByText('Página 2 de 2 · 16 negocios')).toBeTruthy()
    screenSize.resize(false)
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('button', { name: 'Último local: Paseo vigente' })).toBeTruthy()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Último local: Paseo vigente' }))
  })

  it('inicia en lista móvil y retira su escucha al desmontarse', async () => {
    const screenSize = viewport(true)
    vi.stubGlobal('fetch', vi.fn(async () => json(page())))
    const { unmount, container } = render(<NetworkCanvas />)
    await screen.findByRole('list', { name: 'Negocios de esta página' })
    expect(screen.getAllByRole('button', { name: 'Local seguro: Paseo vigente' })).toHaveLength(1)
    expect(container.textContent).not.toMatch(/prestador|colaborador|carpeta|servidor/i)
    unmount()
    expect(screenSize.media.removeEventListener).toHaveBeenCalledWith('change', screenSize.media.addEventListener.mock.calls[0][1])
  })

  it('conserva la ficha seleccionada y devuelve foco al nodo vigente después de cambiar ancho', async () => {
    const screenSize = viewport()
    const fetcher = vi.fn(async () => json(page()))
    vi.stubGlobal('fetch', fetcher)
    render(<NetworkCanvas />)
    fireEvent.click(await screen.findByRole('button', { name: 'Local seguro: Paseo vigente' }))
    const heading = screen.getByRole('heading', { name: 'Local seguro' })
    screenSize.resize(true)
    expect(document.activeElement).toBe(heading)
    expect(screen.getByRole('region', { name: 'Vista previa de Local seguro' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar vista previa' }))
    const list = screen.getByRole('list', { name: 'Negocios de esta página' })
    expect(document.activeElement).toBe(within(list).getByRole('button'))
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('retira selección al cambiar página y no la restaura con una respuesta tardía', async () => {
    let finish!: (response: Response) => void
    vi.stubGlobal('fetch', vi.fn((input: URL | RequestInfo) => new URL(String(input)).searchParams.get('page') === '2'
      ? new Promise<Response>(resolve => { finish = resolve }) : Promise.resolve(json(page()))))
    render(<NetworkCanvas />)
    fireEvent.click(await screen.findByRole('button', { name: 'Local seguro: Paseo vigente' }))
    fireEvent.click(screen.getByRole('button', { name: 'Página siguiente' }))
    expect(screen.queryByRole('region', { name: /Vista previa/ })).toBeNull()
    await act(async () => finish(json(page())))
    expect(screen.queryByRole('region', { name: /Vista previa/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Página anterior' }))
    await screen.findByRole('button', { name: 'Local seguro: Paseo vigente' })
    expect(screen.queryByRole('region', { name: /Vista previa/ })).toBeNull()
  })

  it('abre el callback privado sin solicitar detalles ni medios públicos', async () => {
    const open = vi.fn()
    const requests: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (input: URL | RequestInfo) => { requests.push(String(input)); return json(page()) }))
    render(<NetworkCanvas folderId="carpeta-a" onOpenProvider={open} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Local seguro: Paseo vigente' }))
    expect(open).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Ver beneficios de este negocio' }))
    expect(open).toHaveBeenCalledWith('p1')
    expect(requests).toHaveLength(1)
    expect(requests.every(url => url.includes('/folders/carpeta-a/network/'))).toBe(true)
    expect(screen.queryByRole('link')).toBeNull()
  })

  it.each([401, 403, 404])('retira ficha y nodos al denegar la red privada con %s', async status => {
    let deny = false
    const revoked = vi.fn()
    vi.stubGlobal('fetch', vi.fn(async (input: URL | RequestInfo) => String(input).includes('/auth/') ? json({}, 401) : deny ? json({}, status) : json(page())))
    render(<NetworkCanvas folderId="carpeta-a" onAccessRevoked={revoked} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Local seguro: Paseo vigente' }))
    deny = true
    fireEvent.click(screen.getByRole('button', { name: 'Página siguiente' }))
    await waitFor(() => expect(revoked).toHaveBeenCalledTimes(1))
    expect(screen.queryByText('Local seguro')).toBeNull()
    expect(screen.queryByText('Paseo vigente')).toBeNull()
  })

  it('descarta la carpeta anterior y la sesión A al reemplazarlas', async () => {
    let finish!: (response: Response) => void
    const revoked = vi.fn()
    const available = vi.fn()
    vi.stubGlobal('fetch', vi.fn((input: URL | RequestInfo) => String(input).includes('/carpeta-a/')
      ? new Promise<Response>(resolve => { finish = resolve }) : Promise.resolve(json(page([{ ...item, provider: { ...provider, name: 'Cuenta B' } }])))))
    const view = render(<NetworkCanvas folderId="carpeta-a" onAccessRevoked={revoked} onAvailabilityChange={available} />)
    invalidatePrivateState(); setAccessToken('sesion-b')
    view.rerender(<NetworkCanvas folderId="carpeta-b" onAccessRevoked={revoked} onAvailabilityChange={available} />)
    await screen.findByText('Cuenta B')
    await act(async () => finish(json(page([], { count: 0 }))))
    expect(screen.queryByText('Local seguro')).toBeNull()
    expect(revoked).not.toHaveBeenCalled()
    expect(available.mock.calls).toEqual([[true]])
  })

  it('la lectura pública no modifica la disponibilidad de recomendaciones privadas', async () => {
    const available = vi.fn()
    vi.stubGlobal('fetch', vi.fn(async () => json(page([], { count: 0 }))))
    render(<NetworkCanvas onAvailabilityChange={available} />)
    await screen.findByText('Pronto habrá negocios con beneficios para mostrar.')
    expect(available).not.toHaveBeenCalled()
  })

  it.each([true, false])('revalida un medio 404, diferenciando archivo ausente de acceso retirado (%s)', async authorized => {
    let networkCalls = 0
    const requests: string[] = []
    const revoked = vi.fn()
    const withPhoto = { ...item, provider: { ...provider, image_url: '/api/v1/folders/carpeta-a/providers/p1/media/' } }
    vi.stubGlobal('fetch', vi.fn(async (input: URL | RequestInfo) => {
      const url = String(input); requests.push(url)
      if (url.includes('/media/')) return json({}, 404)
      networkCalls++
      return networkCalls > 1 && !authorized ? json({}, 403) : json(page([withPhoto]))
    }))
    render(<NetworkCanvas folderId="carpeta-a" onAccessRevoked={revoked} />)
    await waitFor(() => expect(networkCalls).toBe(2))
    if (authorized) {
      fireEvent.click(await screen.findByRole('button', { name: 'Local seguro: Paseo vigente' }))
      expect(screen.getByRole('region', { name: 'Vista previa de Local seguro' })).toBeTruthy()
      expect(revoked).not.toHaveBeenCalled()
    } else {
      await waitFor(() => expect(revoked).toHaveBeenCalledTimes(1))
      expect(screen.queryByText('Local seguro')).toBeNull()
    }
    expect(requests.filter(url => url.includes('/media/'))).toHaveLength(1)
    expect(requests.some(url => url.includes('/catalog/'))).toBe(false)
  })

  it('presenta error recuperable y respeta resultados vacíos', async () => {
    let failure = true
    vi.stubGlobal('fetch', vi.fn(async () => failure ? json({}, 503) : json(page([], { count: 0, next: null }))))
    render(<NetworkCanvas />)
    await screen.findByRole('alert')
    failure = false
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    await screen.findByText('Pronto habrá negocios con beneficios para mostrar.')
    expect((screen.getByRole('button', { name: 'Página siguiente' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('mantiene la pausa con ficha abierta aun después de salir foco y hover, y reanuda al cerrar', async () => {
    const originalTimeout = window.setTimeout.bind(window)
    const originalClear = window.clearTimeout.bind(window)
    const scheduled: Array<() => void> = []
    const cleared = vi.fn()
    vi.spyOn(window, 'setTimeout').mockImplementation(((handler: TimerHandler, delay?: number, ...args: unknown[]) => {
      if (delay === 10000) { scheduled.push(handler as () => void); return 765 }
      return originalTimeout(handler, delay, ...args)
    }) as typeof window.setTimeout)
    vi.spyOn(window, 'clearTimeout').mockImplementation((id?: number) => { if (id === 765) cleared(); else originalClear(id) })
    vi.stubGlobal('fetch', vi.fn(async () => json(page())))
    const { container } = render(<NetworkCanvas />)
    const node = await screen.findByRole('button', { name: 'Local seguro: Paseo vigente' })
    await waitFor(() => expect(scheduled).toHaveLength(1))
    fireEvent.click(node)
    expect(cleared).toHaveBeenCalledTimes(1)
    const section = container.querySelector('section')!
    fireEvent.mouseLeave(section)
    fireEvent.blur(document.activeElement!, { relatedTarget: document.body })
    expect(scheduled).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar vista previa' }))
    fireEvent.blur(node, { relatedTarget: document.body })
    await waitFor(() => expect(scheduled).toHaveLength(2))
  })

  it('desmonta la ficha al cambiar carpeta o cuenta sin restaurarla al regresar', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(page())))
    const view = render(<NetworkCanvas folderId="carpeta-a" />)
    fireEvent.click(await screen.findByRole('button', { name: 'Local seguro: Paseo vigente' }))
    view.rerender(<NetworkCanvas folderId="carpeta-b" />)
    expect(screen.queryByRole('region', { name: /Vista previa/ })).toBeNull()
    await screen.findByRole('button', { name: 'Local seguro: Paseo vigente' })
    view.rerender(<NetworkCanvas folderId="carpeta-a" />)
    await screen.findByRole('button', { name: 'Local seguro: Paseo vigente' })
    expect(screen.queryByRole('region', { name: /Vista previa/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Local seguro: Paseo vigente' }))
    invalidatePrivateState(); setAccessToken('sesion-b')
    view.rerender(<NetworkCanvas folderId="carpeta-a" />)
    expect(screen.queryByRole('region', { name: /Vista previa/ })).toBeNull()
    await screen.findByRole('button', { name: 'Local seguro: Paseo vigente' })
    expect(screen.queryByRole('region', { name: /Vista previa/ })).toBeNull()
  })

  it('revoca los blobs visibles y tardíos al cambiar página', async () => {
    let finishBlob!: (blob: Blob) => void
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:foto-segura')
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    const withPhoto = { ...item, provider: { ...provider, image_url: '/api/v1/folders/carpeta-a/providers/p1/media/' } }
    let mediaCount = 0
    vi.stubGlobal('fetch', vi.fn(async (input: URL | RequestInfo) => {
      const url = String(input)
      if (url.includes('/media/')) {
        mediaCount++
        return mediaCount === 1 ? new Response('foto') : { ok: true, status: 200, blob: () => new Promise<Blob>(resolve => { finishBlob = resolve }) } as Response
      }
      return json(url.includes('page=2') ? page([], { next: null }) : page([withPhoto]))
    }))
    const { container } = render(<NetworkCanvas folderId="carpeta-a" />)
    const node = await screen.findByRole('button', { name: 'Local seguro: Paseo vigente' })
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1))
    fireEvent.click(node)
    await waitFor(() => expect(finishBlob).toBeTypeOf('function'))
    fireEvent.click(screen.getByRole('button', { name: 'Página siguiente' }))
    expect(revoke).toHaveBeenCalledWith('blob:foto-segura')
    await act(async () => finishBlob(new Blob(['foto tardía'])))
    expect(create).toHaveBeenCalledTimes(2)
    expect(revoke).toHaveBeenCalledTimes(2)
    expect(container.querySelector('img[src^="blob:"]')).toBeNull()
  })

  it.each([401, 403])('denegación vigente del medio %s retira toda la red y propaga una vez', async status => {
    const revoked = vi.fn()
    vi.stubGlobal('fetch', vi.fn(async (input: URL | RequestInfo) => {
      const url = String(input)
      return url.includes('/network/') ? json(page([{ ...item, provider: { ...provider, image_url: '/api/v1/folders/carpeta-a/providers/p1/media/' } }])) : json({}, status)
    }))
    render(<NetworkCanvas folderId="carpeta-a" onAccessRevoked={revoked} />)
    await waitFor(() => expect(revoked).toHaveBeenCalledTimes(1))
    expect(screen.queryByText('Local seguro')).toBeNull()
    expect(screen.queryByText('Paseo vigente')).toBeNull()
  })

  it('retira datos privados al recibir 404 del detalle y nunca consulta el catálogo', async () => {
    const revoked = vi.fn()
    const fetcher = vi.fn(async (input: URL | RequestInfo) => { expect(String(input)).not.toContain('/catalog/'); return json({}, 404) })
    vi.stubGlobal('fetch', fetcher)
    render(<ProviderDetail folderId="carpeta-a" provider={{ ...provider, status: 'PUBLISHED', address: 'Dirección privada', contact: 'Contacto privado' }} onAccessRevoked={revoked} />)
    await waitFor(() => expect(revoked).toHaveBeenCalledTimes(1))
    expect(screen.queryByText('Local seguro')).toBeNull()
    expect(screen.queryByText('Dirección privada')).toBeNull()
    expect(screen.queryByText('Contacto privado')).toBeNull()
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(String(fetcher.mock.calls[0]?.[0])).not.toContain('/catalog/')
  })

  it.each([200, 403, 503])('oculta el detalle mientras revalida un medio 404 y solo restaura con autorización (%s)', async status => {
    let detailCalls = 0
    let finish!: (response: Response) => void
    const revoked = vi.fn()
    const requests: string[] = []
    vi.stubGlobal('fetch', vi.fn((input: URL | RequestInfo) => {
      const url = String(input); requests.push(url)
      if (url.includes('/media/')) return Promise.resolve(json({}, 404))
      detailCalls++
      return detailCalls === 1 ? Promise.resolve(json([])) : new Promise<Response>(resolve => { finish = resolve })
    }))
    render(<ProviderDetail folderId="carpeta-a" provider={{ ...provider, status: 'PUBLISHED', address: 'Dirección privada', image_url: '/api/v1/folders/carpeta-a/providers/p1/media/' }} onAccessRevoked={revoked} />)
    await waitFor(() => expect(finish).toBeTypeOf('function'))
    expect(screen.queryByText('Dirección privada')).toBeNull()
    await act(async () => finish(json(status === 200 ? [] : {}, status)))
    if (status === 200) {
      await screen.findByText('Dirección privada')
      expect(revoked).not.toHaveBeenCalled()
    } else {
      expect(screen.queryByText('Dirección privada')).toBeNull()
      expect(revoked).toHaveBeenCalledTimes(status === 403 ? 1 : 0)
      if (status === 503) expect(screen.getByRole('button', { name: 'Reintentar' })).toBeTruthy()
    }
    expect(requests.filter(url => url.includes('/media/'))).toHaveLength(1)
    expect(requests.some(url => url.includes('/catalog/'))).toBe(false)
  })
})
