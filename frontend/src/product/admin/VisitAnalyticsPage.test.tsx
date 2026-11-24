import { useEffect, useState } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { invalidatePrivateState, setAccessToken } from '../api'
import type { User } from '../api'
import { AdminWorkspace } from './AdminWorkspace'

type VisitReport = {
  period: { from: string; to: string; timezone: string }
  linked_clients: { status: 'available' | 'unavailable'; value: number | null }
  valid_attributed_visits: number
  businesses: {
    count: number
    page: number
    page_size: number
    results: { provider_id: string; provider_name: string; visits: number }[]
  }
}

const admin: User = { id: 1, email: 'admin@example.test', role: 'ADMIN', email_verified: true }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

function visitReport(overrides: Partial<VisitReport> = {}): VisitReport {
  return {
    period: { from: '2026-10-19', to: '2026-11-17', timezone: 'America/Argentina/Ushuaia' },
    linked_clients: { status: 'available', value: 24 },
    valid_attributed_visits: 31,
    businesses: {
      count: 75,
      page: 1,
      page_size: 25,
      results: [{ provider_id: 'provider-1', provider_name: 'Comercio Sur', visits: 18 }],
    },
    ...overrides,
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}

function WorkspaceHarness() {
  const [location, setLocation] = useState(() => `${window.location.pathname}${window.location.search}`)

  useEffect(() => {
    const handleNavigate = (event: Event) => {
      const target = (event as CustomEvent<string>).detail
      window.history.pushState({}, '', target)
      setLocation(`${window.location.pathname}${window.location.search}`)
    }
    window.addEventListener('llave:navigate', handleNavigate)
    return () => window.removeEventListener('llave:navigate', handleNavigate)
  }, [])

  const current = new URL(location, window.location.origin)
  return <AdminWorkspace user={admin} path={current.pathname} search={current.search} />
}

const collaboratorPage = (results: { id: string; user_email: string }[], count = results.length, page = 1) => ({
  count,
  next: page * 100 < count ? `/api/v1/admin/collaborators/?page=${page + 1}` : null,
  previous: page > 1 ? `/api/v1/admin/collaborators/?page=${page - 1}` : null,
  results,
})

beforeEach(() => {
  cleanup()
  invalidatePrivateState()
  setAccessToken('admin-test')
  window.history.replaceState({}, '', '/gestion/cuenta')
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), window.location.origin)
    if (url.pathname.endsWith('/admin/collaborators/')) return json(collaboratorPage([]))
    if (url.pathname.endsWith('/admin/analytics/visits/')) return json(visitReport({ businesses: { count: 0, page: 1, page_size: 25, results: [] } }))
    return json({ count: 0, next: null, previous: null, results: [] })
  }))
})

afterEach(() => {
  cleanup()
  invalidatePrivateState()
  vi.unstubAllGlobals()
})

describe('informe administrativo de visitas', () => {
  it('agrupa la navegación de comercios con la lista y mantiene los filtros separados', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), window.location.origin)
      if (url.pathname.endsWith('/admin/analytics/visits/')) return json(visitReport())
      return json(collaboratorPage([]))
    }))
    render(<AdminWorkspace user={admin} path="/gestion/analitica/visitas" search="" />)

    const businesses = await screen.findByRole('region', { name: 'Comercios con visitas' })
    const table = within(businesses).getByRole('table')
    const pagination = within(businesses).getByRole('navigation', { name: 'Páginas de comercios' })
    expect(table.compareDocumentPosition(pagination) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0)
    const filters = screen.getByRole('form', { name: 'Filtros de visitas' })
    const from = within(filters).getByLabelText('Desde')
    const to = within(filters).getByLabelText('Hasta')
    const collaborator = within(filters).getByLabelText('Colaborador')
    const search = within(filters).getByLabelText('Buscar colaboradores')
    for (const [before, after] of [[from, to], [to, collaborator], [collaborator, search]]) {
      expect(before.compareDocumentPosition(after) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0)
    }
    expect(within(filters).queryByRole('navigation', { name: 'Páginas de comercios' })).toBeNull()
  })

  it('oculta los controles de páginas de colaboradores cuando solo hay una página', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), window.location.origin)
      if (url.pathname.endsWith('/admin/analytics/visits/')) return json(visitReport())
      return json(collaboratorPage([{ id: 'collaborator-1', user_email: 'marina@example.test' }]))
    }))
    render(<AdminWorkspace user={admin} path="/gestion/analitica/visitas" search="" />)
    await screen.findByRole('option', { name: 'marina@example.test' })

    expect(screen.queryByRole('button', { name: 'Colaboradores anteriores' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Siguientes colaboradores' })).toBeNull()
  })

  it('solo admite la subruta exacta de visitas', async () => {
    const calls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      calls.push(url)
      if (url.includes('/admin/analytics/visits/')) return json(visitReport())
      if (url.includes('/admin/collaborators/')) return json(collaboratorPage([]))
      return json(collaboratorPage([]))
    }))
    render(<AdminWorkspace user={admin} path="/gestion/analitica/visitas/extra" search="" />)

    await screen.findByRole('heading', { name: 'Sección no disponible', level: 2 })
    expect(calls.some(url => url.includes('/admin/analytics/visits/'))).toBe(false)
    expect(screen.getByRole('heading', { name: 'Sección no disponible', level: 1 })).toBeTruthy()
    expect(within(screen.getByRole('navigation', { name: 'Panel de administración' })).getByRole('link', { name: 'Analítica de visitas' }).getAttribute('aria-current')).toBeNull()
  })

  it('navega a la ruta, marca el filtro activo y reinicia la página al aplicar otro período', async () => {
    const reportCalls: URL[] = []
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), window.location.origin)
      if (url.pathname.endsWith('/admin/collaborators/')) return json(collaboratorPage([]))
      if (url.pathname.endsWith('/admin/analytics/visits/')) {
        reportCalls.push(url)
        const page = Number(url.searchParams.get('page') ?? '1')
        return json(visitReport({ valid_attributed_visits: 30 + page, businesses: { count: 75, page, page_size: 25, results: [{ provider_id: `provider-${page}`, provider_name: `Comercio ${page}`, visits: 18 }] } }))
      }
      return json({ count: 0, next: null, previous: null, results: [] })
    }))

    render(<WorkspaceHarness />)
    fireEvent.click(screen.getByRole('button', { name: 'Créditos y visitas' }))
    const nav = within(screen.getByRole('navigation', { name: 'Panel de administración' }))
    const link = nav.getByRole('link', { name: 'Analítica de visitas' })
    expect(link.getAttribute('href')).toBe('/gestion/analitica/visitas')
    fireEvent.click(link)

    await screen.findByRole('heading', { name: 'Visitas atribuidas' })
    await screen.findByText('31', { selector: 'dd' })
    expect(window.location.pathname).toBe('/gestion/analitica/visitas')
    expect(nav.getByRole('link', { name: 'Analítica de visitas' }).getAttribute('aria-current')).toBe('page')

    fireEvent.click(screen.getByRole('button', { name: 'Siguiente →' }))
    await waitFor(() => expect(new URL(window.location.href).searchParams.get('page')).toBe('2'))
    await screen.findByText('32', { selector: 'dd' })
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente →' }))
    await waitFor(() => expect(new URL(window.location.href).searchParams.get('page')).toBe('3'))
    await screen.findByText('33', { selector: 'dd' })

    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-11-01' } })
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar filtros' }))

    await waitFor(() => expect(new URL(window.location.href).searchParams.get('page')).toBe('1'))
    const applied = new URL(window.location.href)
    expect(applied.pathname).toBe('/gestion/analitica/visitas')
    expect(applied.searchParams.get('from')).toBe('2026-11-01')
    expect(applied.searchParams.get('to')).toBe('2026-11-17')
    expect(reportCalls.at(-1)?.searchParams.get('page')).toBe('1')
  })

  it('restablece los borradores aunque la URL ya esté en la página 1', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), window.location.origin)
      if (url.pathname.endsWith('/admin/collaborators/')) {
        return json(url.searchParams.get('search') === 'marina'
          ? collaboratorPage([{ id: 'collaborator-1', user_email: 'marina@example.test' }])
          : collaboratorPage([]))
      }
      if (url.pathname.endsWith('/admin/analytics/visits/')) return json(visitReport())
      return json({ count: 0, next: null, previous: null, results: [] })
    }))
    window.history.replaceState({}, '', '/gestion/analitica/visitas?page=1')

    render(<WorkspaceHarness />)
    await screen.findByText('31', { selector: 'dd' })
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-11-01' } })
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '' } })
    fireEvent.change(screen.getByLabelText('Buscar colaboradores'), { target: { value: 'marina' } })
    fireEvent.click(screen.getByRole('button', { name: 'Buscar colaboradores' }))
    await screen.findByRole('option', { name: 'marina@example.test' })
    fireEvent.change(screen.getByLabelText('Colaborador'), { target: { value: 'collaborator-1' } })
    fireEvent.submit(screen.getByLabelText('Desde').closest('form')!)
    expect(screen.getByRole('alert').textContent).toContain('Completa ambas fechas')

    fireEvent.click(screen.getByRole('button', { name: 'Restablecer filtros' }))

    expect((screen.getByLabelText('Desde') as HTMLInputElement).value).toBe('2026-10-19')
    expect((screen.getByLabelText('Hasta') as HTMLInputElement).value).toBe('2026-11-17')
    expect((screen.getByLabelText('Buscar colaboradores') as HTMLInputElement).value).toBe('')
    expect((screen.getByLabelText('Colaborador') as HTMLSelectElement).value).toBe('')
    expect(screen.queryByRole('alert')).toBeNull()
    await waitFor(() => expect(screen.queryByRole('option', { name: 'marina@example.test' })).toBeNull())

    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-11-02' } })
    fireEvent.click(screen.getByRole('button', { name: 'Restablecer filtros' }))
    expect((screen.getByLabelText('Desde') as HTMLInputElement).value).toBe('2026-10-19')
    expect((screen.getByLabelText('Hasta') as HTMLInputElement).value).toBe('2026-11-17')
  })

  it('conserva visible al colaborador borrador durante una nueva búsqueda y aplica el mismo identificador', async () => {
    const nextSearch = deferred<Response>()
    const reportCalls: URL[] = []
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const url = new URL(String(input), window.location.origin)
      if (url.pathname.endsWith('/admin/collaborators/')) {
        const search = url.searchParams.get('search')
        const page = Number(url.searchParams.get('page') ?? '1')
        if (search === 'marina' && page === 1) return Promise.resolve(json(collaboratorPage([{ id: 'collaborator-first', user_email: 'primera@example.test' }], 101, 1)))
        if (search === 'marina' && page === 2) return Promise.resolve(json(collaboratorPage([{ id: 'collaborator-selected', user_email: 'seleccionada@example.test' }], 101, 2)))
        if (search === 'otra') return nextSearch.promise
        return Promise.resolve(json(collaboratorPage([])))
      }
      if (url.pathname.endsWith('/admin/analytics/visits/')) {
        reportCalls.push(url)
        return Promise.resolve(json(visitReport()))
      }
      return Promise.resolve(json({ count: 0, next: null, previous: null, results: [] }))
    }))
    window.history.replaceState({}, '', '/gestion/analitica/visitas?from=2026-11-01&to=2026-11-07')

    render(<WorkspaceHarness />)
    await screen.findByText('31', { selector: 'dd' })
    fireEvent.change(screen.getByLabelText('Buscar colaboradores'), { target: { value: 'marina' } })
    fireEvent.click(screen.getByRole('button', { name: 'Buscar colaboradores' }))
    await screen.findByRole('option', { name: 'primera@example.test' })
    fireEvent.click(screen.getByRole('button', { name: 'Siguientes colaboradores' }))
    await screen.findByRole('option', { name: 'seleccionada@example.test' })
    fireEvent.change(screen.getByLabelText('Colaborador'), { target: { value: 'collaborator-selected' } })
    fireEvent.change(screen.getByLabelText('Buscar colaboradores'), { target: { value: 'otra' } })
    fireEvent.click(screen.getByRole('button', { name: 'Buscar colaboradores' }))

    await waitFor(() => expect((screen.getByLabelText('Colaborador') as HTMLSelectElement).value).toBe('collaborator-selected'))
    expect(screen.getByRole('option', { name: 'seleccionada@example.test' })).toBeTruthy()
    await act(async () => { nextSearch.resolve(json(collaboratorPage([{ id: 'collaborator-other', user_email: 'otra@example.test' }]))); await nextSearch.promise })
    expect((screen.getByLabelText('Colaborador') as HTMLSelectElement).value).toBe('collaborator-selected')
    expect(screen.getByRole('option', { name: 'seleccionada@example.test' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Aplicar filtros' }))

    await waitFor(() => expect(new URL(window.location.href).searchParams.get('collaborator_id')).toBe('collaborator-selected'))
    await waitFor(() => expect(reportCalls.at(-1)?.searchParams.get('collaborator_id')).toBe('collaborator-selected'))
  })

  it('define los conteos y aclara que no representan una conversión', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), window.location.origin)
      if (url.pathname.endsWith('/admin/collaborators/')) return json(collaboratorPage([]))
      if (url.pathname.endsWith('/admin/analytics/visits/')) return json(visitReport())
      return json({ count: 0, next: null, previous: null, results: [] })
    }))
    window.history.replaceState({}, '', '/gestion/analitica/visitas?page=1')

    render(<WorkspaceHarness />)
    await screen.findByText('31', { selector: 'dd' })

    expect(screen.getByText(/personas distintas vinculadas mediante QR/i)).toBeTruthy()
    expect(screen.getByText(/actualmente válidas.*dentro del período/i)).toBeTruthy()
    expect(screen.getByText(/no representan una tasa de conversión/i)).toBeTruthy()
  })

  it('oculta la página anterior mientras carga y restaura el foco en la paginación', async () => {
    const pageTwo = deferred<Response>()
    let pageTwoRequested = false
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const url = new URL(String(input), window.location.origin)
      if (url.pathname.endsWith('/admin/collaborators/')) return Promise.resolve(json(collaboratorPage([])))
      if (url.pathname.endsWith('/admin/analytics/visits/')) {
        if (url.searchParams.get('page') === '2') { pageTwoRequested = true; return pageTwo.promise }
        return Promise.resolve(json(visitReport({ businesses: { count: 75, page: 1, page_size: 25, results: [{ provider_id: 'provider-one', provider_name: 'Comercio página uno', visits: 18 }] } })))
      }
      return Promise.resolve(json({ count: 0, next: null, previous: null, results: [] }))
    }))
    window.history.replaceState({}, '', '/gestion/analitica/visitas?page=1')

    render(<WorkspaceHarness />)
    await screen.findByText('Comercio página uno')
    const next = screen.getByRole('button', { name: 'Siguiente →' })
    next.focus()
    expect(document.activeElement).toBe(next)
    fireEvent.click(next)
    await waitFor(() => expect(pageTwoRequested).toBe(true))
    expect(screen.queryByText('Comercio página uno')).toBeNull()

    await act(async () => {
      pageTwo.resolve(json(visitReport({ businesses: { count: 75, page: 2, page_size: 25, results: [{ provider_id: 'provider-two', provider_name: 'Comercio página dos', visits: 17 }] } })))
      await pageTwo.promise
    })
    await screen.findByText('Comercio página dos')
    expect(document.activeElement).toBe(screen.getByRole('navigation', { name: 'Páginas de comercios' }))
  })

  it('aplica filtros y descarta la consulta anterior', async () => {
    const stale = deferred<Response>()
    let staleSignal: AbortSignal | undefined
    let newRequest: URL | undefined
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), window.location.origin)
      if (url.pathname.endsWith('/admin/collaborators/')) return Promise.resolve(json(collaboratorPage([])))
      if (url.pathname.endsWith('/admin/analytics/visits/')) {
        if (url.searchParams.get('from') === '2026-11-01') {
          staleSignal = init?.signal ?? undefined
          return stale.promise
        }
        newRequest = url
        return Promise.resolve(json(visitReport({ linked_clients: { status: 'available', value: 7 }, valid_attributed_visits: 42, businesses: { count: 1, page: 1, page_size: 25, results: [{ provider_id: 'p-new', provider_name: 'Nuevo', visits: 42 }] } })))
      }
      return Promise.resolve(json({ count: 0, next: null, previous: null, results: [] }))
    }))
    window.history.replaceState({}, '', '/gestion/analitica/visitas?from=2026-11-01&to=2026-11-15&page=3')

    render(<WorkspaceHarness />)
    await waitFor(() => expect(staleSignal).toBeDefined())
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-11-08' } })
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar filtros' }))
    await screen.findByText('42', { selector: 'dd' })

    expect(newRequest?.searchParams.get('from')).toBe('2026-11-08')
    expect(newRequest?.searchParams.get('to')).toBe('2026-11-15')
    expect(newRequest?.searchParams.get('page')).toBe('1')
    expect(newRequest?.searchParams.has('search')).toBe(false)
    expect(staleSignal?.aborted).toBe(true)

    stale.resolve(json(visitReport({ linked_clients: { status: 'available', value: 999 }, valid_attributed_visits: 999, businesses: { count: 1, page: 3, page_size: 25, results: [{ provider_id: 'p-old', provider_name: 'Antiguo', visits: 999 }] } })))
    await waitFor(() => {
      expect(screen.getByText('42', { selector: 'dd' })).toBeTruthy()
      expect(screen.queryByText('999', { selector: 'dd' })).toBeNull()
      expect(screen.queryByText('Antiguo')).toBeNull()
    })
  })

  it('distingue período vacío de dato no disponible', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), window.location.origin)
      if (url.pathname.endsWith('/admin/collaborators/')) return json(collaboratorPage([]))
      if (url.pathname.endsWith('/admin/analytics/visits/')) {
        const unavailable = url.searchParams.get('from') === '2026-11-08'
        return json(visitReport({ linked_clients: unavailable ? { status: 'unavailable', value: null } : { status: 'available', value: 0 }, valid_attributed_visits: 0, businesses: { count: 0, page: 1, page_size: 25, results: [] } }))
      }
      return json({ count: 0, next: null, previous: null, results: [] })
    }))
    window.history.replaceState({}, '', '/gestion/analitica/visitas?from=2026-11-01&to=2026-11-07')

    render(<WorkspaceHarness />)
    await screen.findByText('No hay visitas atribuidas en este período.')
    expect(screen.getByText('Clientes vinculados').nextElementSibling?.textContent).toBe('0')
    expect(screen.getByText('Visitas atribuidas válidas').nextElementSibling?.textContent).toBe('0')

    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-11-08' } })
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-11-14' } })
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar filtros' }))

    await screen.findByText('No disponible para este período')
    expect(screen.getByText('Clientes vinculados').nextElementSibling?.textContent).toBe('No disponible para este período')
    expect(screen.getByText('Visitas atribuidas válidas').nextElementSibling?.textContent).toBe('0')
  })

  it('retira las métricas si se revoca el permiso', async () => {
    let reportCount = 0
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), window.location.origin)
      if (url.pathname.endsWith('/admin/collaborators/')) return json(collaboratorPage([]))
      if (url.pathname.endsWith('/admin/analytics/visits/')) {
        reportCount += 1
        return reportCount === 1 ? json(visitReport({ linked_clients: { status: 'available', value: 8 }, valid_attributed_visits: 12 })) : json({ detail: 'Acceso revocado' }, 403)
      }
      return json({ count: 0, next: null, previous: null, results: [] })
    }))
    window.history.replaceState({}, '', '/gestion/analitica/visitas?from=2026-11-01&to=2026-11-07')

    render(<WorkspaceHarness />)
    await screen.findByText('12', { selector: 'dd' })
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-11-08' } })
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-11-14' } })
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar filtros' }))

    await screen.findByRole('alert')
    expect(screen.queryByText('8', { selector: 'dd' })).toBeNull()
    expect(screen.queryByText('12', { selector: 'dd' })).toBeNull()
    expect(screen.queryByText('Comercio Sur')).toBeNull()
  })

  it('permite llegar a colaboradores de otras páginas y envía solo su identificador al informe', async () => {
    const reportCalls: URL[] = []
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), window.location.origin)
      if (url.pathname.endsWith('/admin/collaborators/')) {
        const page = Number(url.searchParams.get('page') ?? '1')
        if (url.searchParams.get('search') === 'marina' && page === 1) return json(collaboratorPage([{ id: 'collaborator-first', user_email: 'marina.primera@example.test' }], 101, 1))
        if (url.searchParams.get('search') === 'marina' && page === 2) return json(collaboratorPage([{ id: '0a000000-0000-4000-8000-000000000009', user_email: 'marina@example.test' }], 101, 2))
        return json(collaboratorPage([]))
      }
      if (url.pathname.endsWith('/admin/analytics/visits/')) {
        reportCalls.push(url)
        return json(visitReport())
      }
      return json({ count: 0, next: null, previous: null, results: [] })
    }))
    window.history.replaceState({}, '', '/gestion/analitica/visitas?from=2026-11-01&to=2026-11-07')

    render(<WorkspaceHarness />)
    await screen.findByText('31', { selector: 'dd' })
    fireEvent.change(screen.getByLabelText('Buscar colaboradores'), { target: { value: 'marina' } })
    fireEvent.click(screen.getByRole('button', { name: 'Buscar colaboradores' }))
    await screen.findByRole('option', { name: 'marina.primera@example.test' })
    const nextCollaborators = screen.getByRole('button', { name: 'Siguientes colaboradores' })
    nextCollaborators.focus()
    fireEvent.click(nextCollaborators)
    await screen.findByRole('option', { name: 'marina@example.test' })
    expect(document.activeElement).toBe(screen.getByLabelText('Colaborador'))
    fireEvent.change(screen.getByLabelText('Colaborador'), { target: { value: '0a000000-0000-4000-8000-000000000009' } })
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar filtros' }))

    await waitFor(() => expect(reportCalls.at(-1)?.searchParams.get('collaborator_id')).toBe('0a000000-0000-4000-8000-000000000009'))
    expect(reportCalls.at(-1)?.searchParams.has('search')).toBe(false)
    expect(reportCalls.at(-1)?.searchParams.toString()).not.toContain('marina')
  })
})
