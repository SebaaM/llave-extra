import { act, cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { privateImage } = vi.hoisted(() => ({ privateImage: vi.fn() }))

vi.mock('./api', async importOriginal => {
  const actual = await importOriginal<typeof import('./api')>()
  return { ...actual, privateImage }
})

import { PrivatePhoto } from './BenefitsPages'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

describe('imagen autorizada', () => {
  it('revoca la URL si el Blob termina después de desmontar la ficha', async () => {
    let finish!: (value: string | null) => void
    privateImage.mockReturnValue(new Promise(resolve => { finish = resolve }))
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    const view = render(<PrivatePhoto path="/api/v1/private/photo/" alt="Foto privada" />)

    view.unmount()
    await act(async () => { finish('blob:private-late') })

    expect(revoke).toHaveBeenCalledWith('blob:private-late')
  })
})
