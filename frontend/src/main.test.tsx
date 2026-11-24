import { afterEach, beforeEach, expect, it, vi } from 'vitest'

vi.mock('react-dom/client', () => ({
  default: { createRoot: () => ({ render: vi.fn() }) },
}))
vi.mock('./App', () => ({ default: () => null }))

beforeEach(() => {
  vi.resetModules()
})

afterEach(() => {
  vi.restoreAllMocks()
  window.history.replaceState(null, '', '/')
})

it.each(['/referencia', '/consumo'])('limpia el QR en %s antes de solicitar fuentes externas', async path => {
  window.history.replaceState(null, '', `${path}#token=qr-sintetico`)
  let fontSheet: HTMLLinkElement | undefined
  let fragmentAtRequest: string | undefined
  vi.spyOn(document.head, 'append').mockImplementation((...nodes) => {
    for (const node of nodes) {
      if (node instanceof HTMLLinkElement && node.rel === 'stylesheet') {
        fontSheet = node
        fragmentAtRequest = window.location.hash
      }
    }
  })

  await import('./main')

  expect(fragmentAtRequest).toBe('')
  expect(fontSheet).toMatchObject({ referrerPolicy: 'no-referrer' })
})
