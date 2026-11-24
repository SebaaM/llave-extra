import { useEffect, useState } from 'react'
import { ApiError, currentSessionVersion, privateImage } from './api'

<<<<<<< HEAD
export function PrivatePhoto({ path, alt, onDenied }: { path: string | null; alt: string; onDenied?: () => void }) {
  const [image, setImage] = useState<{ path: string | null; url: string } | null>(null)
=======
export function PrivatePhoto({ path, alt, onDenied, onMissing, className = '' }: { path: string | null; alt: string; onDenied?: () => void; onMissing?: () => void; className?: string }) {
  const [image, setImage] = useState<{ path: string | null; url: string; version: number } | null>(null)
  const version = currentSessionVersion()
>>>>>>> develop

  useEffect(() => {
    let alive = true
    let created: string | null = null
<<<<<<< HEAD
    const version = currentSessionVersion()
    privateImage(path).then(value => {
      if (!value) return
      if (!alive) {
=======
    privateImage(path).then(value => {
      if (!value) return
      if (!alive || version !== currentSessionVersion()) {
>>>>>>> develop
        URL.revokeObjectURL(value)
        return
      }
      created = value
<<<<<<< HEAD
      setImage({ path, url: value })
=======
      setImage({ path, url: value, version })
>>>>>>> develop
    }).catch(failure => {
      if (alive && version === currentSessionVersion()) {
        setImage(null)
        if (failure instanceof ApiError && (failure.status === 401 || failure.status === 403)) onDenied?.()
<<<<<<< HEAD
=======
        if (failure instanceof ApiError && failure.status === 404) onMissing?.()
>>>>>>> develop
      }
    })

    return () => {
      alive = false
      if (created) URL.revokeObjectURL(created)
    }
<<<<<<< HEAD
  }, [path, onDenied])

  const url = image?.path === path ? image.url : null
  return <div className="product-provider-image">
=======
  }, [path, onDenied, onMissing, version])

  const url = image?.path === path && image.version === version ? image.url : null
  return <div className={`product-provider-image ${className}`}>
>>>>>>> develop
    {url ? <img src={url} alt={alt} /> : <span aria-hidden="true">✳</span>}
  </div>
}
