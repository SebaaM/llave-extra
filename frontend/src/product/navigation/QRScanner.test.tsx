import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { QRScanner } from './QRScanner'
import { scanDestination } from './qrScannerDestination'

const origin = window.location.origin
const reference = '/referencia#token=r2.payload:signature'
const visit = '/consumo#token=payload:timestamp:signature'

describe('QR Scanner', () => {
  afterEach(() => {
    cleanup()
    vi.doUnmock('jsqr')
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it.each([reference, visit])('routes own signed-link shapes without external navigation', path => {
    expect(scanDestination(`${origin}${path}`, origin)).toBe(path)
  })

  it.each([
    'https://elsewhere.test/referencia#token=a:b',
    '/consumo#token=a:b',
    `${origin}/foo/../consumo#token=a:b`,
    `${origin}/consumo?x=1#token=a:b`,
    `${origin}/consumo/#token=a:b`,
    `${origin}/otra-ruta#token=a:b`,
    `${origin}/consumo#token=a:b&token=c:d`,
    `${origin}/consumo#token=`,
    `${origin}/consumo#token=%2F`,
  ])('rejects a noncanonical or unrelated QR, %s', link => {
    expect(scanDestination(link, origin)).toBeNull()
  })

  it('does not request a camera on render and allows pasting a link after denial', async () => {
    const getUserMedia = vi.fn().mockRejectedValue(new DOMException('', 'NotAllowedError'))
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } })
    const onScan = vi.fn()
    render(<QRScanner onScan={onScan} onClose={vi.fn()} />)
    expect(getUserMedia).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Activar cámara' }))
    await screen.findByText(/No se pudo acceder a la cámara/)
    expect(getUserMedia).toHaveBeenCalledWith({ audio: false, video: { facingMode: { ideal: 'environment' } } })
    fireEvent.change(screen.getByLabelText('Enlace del QR'), { target: { value: `${origin}${reference}` } })
    fireEvent.click(screen.getByRole('button', { name: 'Abrir enlace' }))
    expect(onScan).toHaveBeenCalledExactlyOnceWith(reference)
  })

  it('does not route an unrelated pasted URL', () => {
    const onScan = vi.fn()
    render(<QRScanner onScan={onScan} onClose={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Enlace del QR'), { target: { value: 'https://elsewhere.test/' } })
    fireEvent.click(screen.getByRole('button', { name: 'Abrir enlace' }))
    expect(screen.getByRole('alert').textContent).toMatch(/No es un QR válido de Llave Extra/)
    expect(onScan).not.toHaveBeenCalled()
  })

  it('stops a stream that resolves after the scanner unmounts', async () => {
    let resolveStream!: (stream: unknown) => void
    const getUserMedia = vi.fn().mockReturnValue(new Promise(resolve => { resolveStream = resolve }))
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } })
    const stop = vi.fn()
    const { unmount } = render(<QRScanner onScan={vi.fn()} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Activar cámara' }))
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(1))
    unmount()
    await act(async () => resolveStream({ getTracks: () => [{ stop }] }))
    expect(stop).toHaveBeenCalledTimes(1)
  })

  it('decodes from the rear-camera preview without a native QR detection API', async () => {
    const data = new Uint8ClampedArray(4 * 96 * 96)
    const decode = vi.fn().mockReturnValue({ data: `${origin}${reference}` })
    vi.doMock('jsqr', () => ({ default: decode }))
    const stop = vi.fn()
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop }] }) } })
    vi.spyOn(HTMLVideoElement.prototype, 'videoWidth', 'get').mockReturnValue(96)
    vi.spyOn(HTMLVideoElement.prototype, 'videoHeight', 'get').mockReturnValue(96)
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn(), getImageData: () => ({ data, width: 96, height: 96 }) } as unknown as CanvasRenderingContext2D)
    const onScan = vi.fn()
    render(<QRScanner onScan={onScan} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Activar cámara' }))
    await waitFor(() => expect(onScan).toHaveBeenCalledExactlyOnceWith(reference))
    expect(decode).toHaveBeenCalledExactlyOnceWith(data, 96, 96)
    expect(stop).toHaveBeenCalledTimes(1)
  })

  it('decodes a selected image entirely in the browser and releases its URL', async () => {
    const decode = vi.fn().mockReturnValue({ data: `${origin}${visit}` })
    vi.doMock('jsqr', () => ({ default: decode }))
    const URLReplacement = class extends URL {
      static createObjectURL = vi.fn(() => 'blob:qr-test')
      static revokeObjectURL = vi.fn()
    }
    vi.stubGlobal('URL', URLReplacement)
    vi.stubGlobal('Image', function () {
      const image = document.createElement('img')
      Object.defineProperties(image, {
        naturalWidth: { value: 96 },
        naturalHeight: { value: 96 },
        src: { set() { queueMicrotask(() => image.dispatchEvent(new Event('load'))) } },
      })
      return image
    })
    const data = new Uint8ClampedArray(4 * 96 * 96)
    const drawImage = vi.fn()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage, getImageData: () => ({ data, width: 96, height: 96 }) } as unknown as CanvasRenderingContext2D)
    const onScan = vi.fn()
    render(<QRScanner onScan={onScan} onClose={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Elegir imagen'), { target: { files: [new File(['fixture'], 'test.png', { type: 'image/png' })] } })
    await waitFor(() => expect(onScan).toHaveBeenCalledExactlyOnceWith(visit))
    expect(drawImage).toHaveBeenCalledTimes(1)
    expect(decode).toHaveBeenCalledExactlyOnceWith(data, 96, 96)
    expect(URLReplacement.revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:qr-test')
  })
})
