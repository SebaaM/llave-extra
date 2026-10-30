import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FolderPage, ProviderDetail } from './BenefitsPages'
import { invalidatePrivateState, setAccessToken } from './api'

vi.mock('./NetworkCanvas', () => ({ NetworkCanvas: () => <p>Red privada</p> }))
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const provider = { id: 'p1', slug: 'local', name: 'Local privado', category: 'Café privado', description: 'Descripción privada', address: 'Dirección privada', hours: '', contact: 'Contacto privado', map_url: '', website: '', demo: true, status: 'ACTIVE', image_url: '/api/v1/folders/a/providers/p1/media/' }
const props = { folders: [{ collaborator_id: 'a', granted_at: '' }], selected: 'a', select: vi.fn(), providers: [provider], onOpen: vi.fn() }
beforeEach(() => {
  setAccessToken('sesion-a')
  vi.stubGlobal('navigator', Object.assign(Object.create(navigator), { locks: { request: (_name: string, _options: unknown, callback: () => Promise<unknown>) => callback() } }))
  URL.createObjectURL = vi.fn(() => 'blob:foto-privada')
  URL.revokeObjectURL = vi.fn()
})
afterEach(() => { cleanup(); invalidatePrivateState(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('postales privadas', () => {
  it.each([200, 403, 404, 503])('permite recuperar explícitamente una selección denegada solo tras revalidación privada %s', async status => {
    let finish!: (response: Response) => void
    const revoked = vi.fn()
    const calls: string[] = []
    vi.stubGlobal('fetch', vi.fn((input: URL | RequestInfo) => {
      const url = String(input); calls.push(url)
      return url.endsWith('/media/') ? Promise.resolve(json({}, 403)) : new Promise<Response>(resolve => { finish = resolve })
    }))
    const { rerender } = render(<FolderPage {...props} onAccessRevoked={revoked} />)
    await waitFor(() => expect(revoked).toHaveBeenCalledTimes(1))
    // El padre puede limpiar y actualizar props sin desmontar la misma carpeta.
    rerender(<FolderPage {...props} providers={[]} onAccessRevoked={revoked} />)
    rerender(<FolderPage {...props} providers={[{ ...provider, name: 'Datos del padre', image_url: null }]} onAccessRevoked={revoked} />)
    expect(screen.queryByText('Datos del padre')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar recomendaciones' }))
    await waitFor(() => expect(finish).toBeTypeOf('function'))
    expect(screen.queryByText(provider.name)).toBeNull()
    expect(screen.queryByText('Red privada')).toBeNull()
    await act(async () => finish(json(status === 200 ? [{ ...provider, name: 'Selección vigente', image_url: null }] : {}, status)))
    if (status === 200) await screen.findByRole('heading', { name: 'Selección vigente' })
    else {
      expect(screen.queryByText('Selección vigente')).toBeNull()
      expect(screen.queryByText('Red privada')).toBeNull()
      expect(screen.getByRole('button', { name: 'Reintentar recomendaciones' })).toBeTruthy()
    }
    expect(calls.filter(url => url.endsWith('/providers/'))).toHaveLength(1)
    expect(calls.filter(url => url.endsWith('/media/'))).toHaveLength(1)
    expect(calls.some(url => url.includes('/catalog/'))).toBe(false)
    expect(revoked).toHaveBeenCalledTimes([403, 404].includes(status) ? 2 : 1)
  })
  it('conserva el selector para salir de una carpeta denegada sin restaurar sus metadatos', async () => {
    const select = vi.fn()
    const folders = [...props.folders, { collaborator_id: 'b', granted_at: '' }]
    vi.stubGlobal('fetch', vi.fn(async () => json({}, 403)))
    const { rerender } = render(<FolderPage {...props} folders={folders} select={select} />)
    await screen.findByText('El acceso a estas recomendaciones ya no está disponible.')
    fireEvent.change(screen.getByLabelText('Selección recibida'), { target: { value: 'b' } })
    expect(select).toHaveBeenCalledWith('b')
    expect(screen.queryByText(provider.name)).toBeNull()
    rerender(<FolderPage {...props} folders={folders} selected="b" providers={[{ ...provider, name: 'Local de B', image_url: null }]} />)
    expect(screen.getByRole('heading', { name: 'Local de B' })).toBeTruthy()
    expect(screen.queryByText(provider.name)).toBeNull()
  })
  it('no restaura el reintento de una denegación de otra sesión', async () => {
    let finish!: (response: Response) => void
    const revoked = vi.fn()
    const changedA = vi.fn()
    const changedB = vi.fn()
    vi.stubGlobal('fetch', vi.fn((input: URL | RequestInfo) => String(input).endsWith('/media/') ? Promise.resolve(json({}, 403)) : new Promise<Response>(resolve => { finish = resolve })))
    const { rerender } = render(<FolderPage {...props} onAccessRevoked={revoked} onProvidersChange={changedA} />)
    await waitFor(() => expect(revoked).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar recomendaciones' }))
    await waitFor(() => expect(finish).toBeTypeOf('function'))
    invalidatePrivateState()
    setAccessToken('sesion-b')
    rerender(<FolderPage {...props} providers={[]} onAccessRevoked={revoked} onProvidersChange={changedB} />)
    await act(async () => finish(json([provider])))
    expect(screen.queryByText(provider.name)).toBeNull()
    expect(screen.queryByRole('img')).toBeNull()
    expect(revoked).toHaveBeenCalledTimes(1)
    expect(changedA.mock.calls).toEqual([[[]], [[]]])
    expect(changedB).not.toHaveBeenCalled()
  })
  it.each([401, 403])('retira metadatos al denegar un medio con %s', async status => {
    const revoked = vi.fn()
    vi.stubGlobal('fetch', vi.fn(async () => json({}, status)))
    render(<FolderPage {...props} onAccessRevoked={revoked} />)
    await waitFor(() => expect(revoked).toHaveBeenCalledTimes(1))
    expect(screen.queryByText(provider.name)).toBeNull()
    expect(screen.queryByText(provider.description)).toBeNull()
    expect(screen.queryByText(provider.category)).toBeNull()
    expect(screen.queryByText('Red privada')).toBeNull()
  })
  it.each([200, 403, 404, 503])('revalida una vez un medio 404 y procesa el resultado privado %s', async status => {
    let finish!: (response: Response) => void
    const revoked = vi.fn()
    const calls: string[] = []
    vi.stubGlobal('fetch', vi.fn((input: URL | RequestInfo) => {
      const url = String(input); calls.push(url)
      return url.endsWith('/media/') ? Promise.resolve(json({}, 404)) : new Promise<Response>(resolve => { finish = resolve })
    }))
    render(<FolderPage {...props} onAccessRevoked={revoked} />)
    await waitFor(() => expect(finish).toBeTypeOf('function'))
    expect(screen.queryByText(provider.name)).toBeNull()
    expect(screen.queryByText(provider.description)).toBeNull()
    expect(screen.queryByText('Red privada')).toBeNull()
    await act(async () => finish(json(status === 200 ? [provider] : {}, status)))
    if (status === 200) await screen.findByRole('heading', { name: provider.name })
    else await waitFor(() => expect(screen.queryByText(provider.name)).toBeNull())
    expect(revoked).toHaveBeenCalledTimes([403, 404].includes(status) ? 1 : 0)
    expect(calls.filter(url => url.endsWith('/media/'))).toHaveLength(1)
    expect(calls.filter(url => url.endsWith('/providers/'))).toHaveLength(1)
    expect(calls.some(url => url.includes('/catalog/'))).toBe(false)
  })
  it('descarta la revalidación y el blob tardíos al cambiar carpeta', async () => {
    let finish!: (response: Response) => void
    vi.stubGlobal('fetch', vi.fn((input: URL | RequestInfo) => String(input).endsWith('/media/') ? Promise.resolve(json({}, 404)) : new Promise<Response>(resolve => { finish = resolve })))
    const { rerender } = render(<FolderPage {...props} />)
    await waitFor(() => expect(finish).toBeTypeOf('function'))
    rerender(<FolderPage {...props} selected="b" providers={[]} />)
    await act(async () => finish(json([provider])))
    expect(screen.queryByText(provider.name)).toBeNull()
    expect(screen.queryByText(provider.description)).toBeNull()
  })
  it('permite reintentar una revalidación transitoria sin mostrar metadatos anteriores', async () => {
    let attempts = 0
    const calls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (input: URL | RequestInfo) => {
      const url = String(input); calls.push(url)
      if (url.endsWith('/media/')) return json({}, 404)
      return ++attempts === 1 ? json({}, 503) : json([{ ...provider, name: 'Nombre vigente' }])
    }))
    render(<FolderPage {...props} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Reintentar recomendaciones' }))
    expect(screen.queryByText(provider.name)).toBeNull()
    await screen.findByRole('heading', { name: 'Nombre vigente' })
    expect(calls.filter(url => url.endsWith('/media/'))).toHaveLength(1)
    expect(calls.filter(url => url.endsWith('/providers/'))).toHaveLength(2)
  })
  it('revoca el blob visible al denegarse otra foto de la selección', async () => {
    let finish!: (response: Response) => void
    vi.stubGlobal('fetch', vi.fn((input: URL | RequestInfo) => String(input).includes('/p2/') ? new Promise<Response>(resolve => { finish = resolve }) : Promise.resolve(new Response('foto'))))
    render(<FolderPage {...props} providers={[provider, { ...provider, id: 'p2', name: 'Otro local privado', image_url: '/api/v1/folders/a/providers/p2/media/' }]} />)
    await screen.findByRole('img', { name: `Imagen de ${provider.name}` })
    await act(async () => finish(json({}, 403)))
    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.queryByText(provider.name)).toBeNull()
    expect(screen.queryByText('Otro local privado')).toBeNull()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:foto-privada')
  })
  it('ignora la revalidación de una sesión anterior aunque conserve la carpeta', async () => {
    let finish!: (response: Response) => void
    const revoked = vi.fn()
    vi.stubGlobal('fetch', vi.fn((input: URL | RequestInfo) => String(input).endsWith('/media/') ? Promise.resolve(json({}, 404)) : new Promise<Response>(resolve => { finish = resolve })))
    const { rerender } = render(<FolderPage {...props} onAccessRevoked={revoked} />)
    await waitFor(() => expect(finish).toBeTypeOf('function'))
    invalidatePrivateState()
    setAccessToken('sesion-b')
    rerender(<FolderPage {...props} providers={[{ ...provider, name: 'Selección de B', image_url: null }]} onAccessRevoked={revoked} />)
    await act(async () => finish(json({}, 403)))
    expect(screen.getByRole('heading', { name: 'Selección de B' })).toBeTruthy()
    expect(screen.queryByText(provider.name)).toBeNull()
    expect(revoked).not.toHaveBeenCalled()
  })
  it('no vuelve a pedir una foto al cambiar callbacks del padre', async () => {
    const fetcher = vi.fn(async () => new Response('foto'))
    vi.stubGlobal('fetch', fetcher)
    const { rerender } = render(<FolderPage {...props} onAccessRevoked={() => undefined} />)
    await screen.findByRole('img')
    rerender(<FolderPage {...props} onAccessRevoked={() => undefined} />)
    await act(async () => undefined)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it.each([401, 403, 404])('el detalle denegado con %s no conserva datos privados', async status => {
    const revoked = vi.fn()
    vi.stubGlobal('fetch', vi.fn(async () => json({}, status)))
    render(<ProviderDetail folderId="a" provider={provider} onAccessRevoked={revoked} />)
    await waitFor(() => expect(revoked).toHaveBeenCalledTimes(1))
    for (const text of [provider.name, provider.address, provider.contact, provider.description]) expect(screen.queryByText(text)).toBeNull()
  })
})
