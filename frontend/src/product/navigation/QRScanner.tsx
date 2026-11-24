import { useEffect, useId, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { scanDestination } from './qrScannerDestination'
import './qrScanner.css'

const INVALID_LINK = 'No es un QR válido de Llave Extra. Probá con un código de un prestador o colaborador.'

function stopStream(stream?: MediaStream) {
  stream?.getTracks().forEach(track => track.stop())
}

function readPixels(source: HTMLVideoElement | HTMLImageElement, canvas: HTMLCanvasElement) {
  const width = source instanceof HTMLVideoElement ? source.videoWidth : source.naturalWidth
  const height = source instanceof HTMLVideoElement ? source.videoHeight : source.naturalHeight
  if (!width || !height) return null
  const scale = Math.min(1, 1024 / Math.max(width, height))
  canvas.width = Math.max(1, Math.round(width * scale))
  canvas.height = Math.max(1, Math.round(height * scale))
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('Canvas unavailable')
  context.drawImage(source, 0, 0, canvas.width, canvas.height)
  return context.getImageData(0, 0, canvas.width, canvas.height)
}

async function loadLocalImage(url: string) {
  const image = new Image()
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve()
    image.onerror = () => reject(new Error('Image unreadable'))
    image.src = url
  })
  return image
}

type Capture = { status: 'idle' | 'starting' | 'camera' | 'image'; error?: string }
type Resources = { run: number; stream?: MediaStream; timer?: ReturnType<typeof setTimeout>; imageUrl?: string }

function resetResources(resources: Resources, video?: HTMLVideoElement | null) {
  resources.run += 1
  clearTimeout(resources.timer)
  stopStream(resources.stream)
  if (resources.imageUrl) URL.revokeObjectURL(resources.imageUrl)
  if (video) video.srcObject = null
  resources.stream = undefined
  resources.timer = undefined
  resources.imageUrl = undefined
}

export function QRScanner({ onScan, onClose }: { onScan: (path: string) => void; onClose: () => void }) {
  const titleId = useId()
  const helpId = useId()
  const dialog = useRef<HTMLDialogElement>(null)
  const video = useRef<HTMLVideoElement>(null)
  const resources = useRef<Resources>({ run: 0 })
  const navigated = useRef(false)
  const [capture, setCapture] = useState<Capture>({ status: 'idle' })
  const [link, setLink] = useState('')
  const busy = capture.status !== 'idle'

  useEffect(() => {
    const current = dialog.current
    const preview = video.current
    const active = resources.current
    const trigger = document.activeElement
    if (current && typeof current.showModal === 'function') current.showModal()
    else if (current) current.open = true
    return () => {
      resetResources(active, preview)
      if (current?.open) {
        if (typeof current.close === 'function') current.close()
        else current.open = false
      }
      if (!navigated.current && trigger instanceof HTMLElement && trigger.isConnected) trigger.focus()
    }
  }, [])

  function accept(value: string) {
    const destination = scanDestination(value)
    if (!destination) return false
    navigated.current = true
    resetResources(resources.current, video.current)
    setLink('')
    setCapture({ status: 'idle' })
    onScan(destination)
    return true
  }

  function dismiss() {
    resetResources(resources.current, video.current)
    onClose()
  }

  async function startCamera() {
    const active = resources.current
    if (busy) return
    if (typeof navigator.mediaDevices?.getUserMedia !== 'function') {
      setCapture({ status: 'idle', error: 'La cámara no está disponible. Elegí una imagen o pegá el enlace del QR.' })
      return
    }
    const run = ++active.run
    setCapture({ status: 'starting' })
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' } } })
      const preview = video.current
      if (active.run !== run || !preview) {
        stopStream(stream)
        return
      }
      active.stream = stream
      preview.srcObject = stream
      const { default: decode } = await import('jsqr')
      if (active.run !== run) return
      await preview.play()
      if (active.run !== run) return
      setCapture({ status: 'camera' })
      const canvas = document.createElement('canvas')
      const checkFrame = () => {
        if (active.run !== run) return
        try {
          const pixels = readPixels(preview, canvas)
          const result = pixels && decode(pixels.data, pixels.width, pixels.height)
          if (result) {
            if (accept(result.data)) return
            setCapture({ status: 'camera', error: INVALID_LINK })
          }
          active.timer = setTimeout(checkFrame, 240)
        } catch {
          resetResources(active, preview)
          setCapture({ status: 'idle', error: 'No se pudo leer la cámara. Elegí una imagen o pegá el enlace del QR.' })
        }
      }
      active.timer = setTimeout(checkFrame, 0)
    } catch {
      if (active.run !== run) return
      resetResources(active, video.current)
      setCapture({ status: 'idle', error: 'No se pudo acceder a la cámara. Revisá el permiso, elegí una imagen o pegá el enlace del QR.' })
    }
  }

  async function readImage(file: File) {
    const active = resources.current
    resetResources(active, video.current)
    if (!file.type.startsWith('image/') || file.size > 15 * 1024 * 1024) {
      setCapture({ status: 'idle', error: 'Elegí una imagen de hasta 15 MB.' })
      return
    }
    const run = active.run
    setCapture({ status: 'image' })
    try {
      const url = URL.createObjectURL(file)
      active.imageUrl = url
      const [{ default: decode }, image] = await Promise.all([import('jsqr'), loadLocalImage(url)])
      if (active.run !== run) return
      const pixels = readPixels(image, document.createElement('canvas'))
      const result = pixels && decode(pixels.data, pixels.width, pixels.height)
      if (result && accept(result.data)) return
      setCapture({ status: 'idle', error: result ? INVALID_LINK : 'No encontramos un QR en la imagen. Probá con una foto más nítida.' })
    } catch {
      if (active.run === run) setCapture({ status: 'idle', error: 'No se pudo leer la imagen. Elegí otra o pegá el enlace del QR.' })
    } finally {
      if (active.run === run && active.imageUrl) {
        URL.revokeObjectURL(active.imageUrl)
        active.imageUrl = undefined
      }
    }
  }

  function submitLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!accept(link)) setCapture(current => ({ ...current, error: INVALID_LINK }))
  }

  return <dialog ref={dialog} className="qr-scanner" aria-labelledby={titleId} aria-describedby={helpId} onCancel={event => {
    event.preventDefault()
    dismiss()
  }}>
    <div className="qr-scanner-header">
      <h2 id={titleId}>Escanear QR</h2>
      <button type="button" className="button button-ghost qr-scanner-close" onClick={dismiss}>Cerrar</button>
    </div>
    <p id={helpId}>Usá el QR de un comercio o de un colaborador de Llave Extra.</p>
    <video ref={video} className="qr-scanner-preview" hidden={capture.status !== 'camera' && capture.status !== 'starting'} muted playsInline aria-label="Vista de la cámara" />
    {capture.status === 'starting' && <p role="status">Abriendo cámara…</p>}
    {capture.status === 'camera' && <p role="status">Ubicá el QR completo frente a la cámara.</p>}
    {capture.status === 'image' && <p role="status">Buscando un QR en la imagen…</p>}
    {capture.error && <p className="qr-scanner-error" role="alert">{capture.error}</p>}
    <div className="qr-scanner-options">
      {capture.status === 'camera'
        ? <button type="button" className="button button-dark" onClick={() => {
          resetResources(resources.current, video.current)
          setCapture({ status: 'idle' })
        }}>Apagar cámara</button>
        : <button type="button" className="button button-dark" onClick={() => void startCamera()} disabled={busy}>Activar cámara</button>}
      <label className="qr-scanner-image">
        <span>Elegir imagen</span>
        <input type="file" accept="image/*" disabled={capture.status === 'image'} onChange={event => {
          const file = event.currentTarget.files?.[0]
          event.currentTarget.value = ''
          if (file) void readImage(file)
        }} />
      </label>
    </div>
    <form className="qr-scanner-link" onSubmit={submitLink}>
      <label>Enlace del QR
        <input value={link} onChange={event => setLink(event.target.value)} type="text" inputMode="url" autoCapitalize="none" autoComplete="off" spellCheck={false} required maxLength={2400} />
      </label>
      <button type="submit" className="button button-ghost">Abrir enlace</button>
    </form>
  </dialog>
}
