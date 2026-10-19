import { act, cleanup, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'

const { publicImage } = vi.hoisted(() => ({ publicImage: vi.fn() }))
vi.mock('./catalog', async importOriginal => ({ ...await importOriginal<typeof import('./catalog')>(), publicImage }))

import { PublicPhoto } from './CatalogPages'

afterEach(() => { cleanup(); vi.clearAllMocks(); vi.restoreAllMocks() })

it('revoca una imagen pública si la respuesta llega después de salir del catálogo', async () => {
  let finish!: (url: string) => void
  publicImage.mockReturnValue(new Promise(resolve => { finish = resolve }))
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
  const view = render(<PublicPhoto path="/api/v1/catalog/providers/p1/media/" alt="Kuar" name="Kuar" />)
  view.unmount()
  await act(async () => finish('blob:catalog-late'))
  expect(revoke).toHaveBeenCalledWith('blob:catalog-late')
})
