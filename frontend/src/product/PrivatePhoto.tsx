import { useEffect, useState } from 'react'
import { ApiError, currentSessionVersion, privateImage } from './api'

export function PrivatePhoto({ path, alt, onDenied, onMissing, className = '' }: { path: string | null; alt: string; onDenied?: () => void; onMissing?: () => void; className?: string }) {
  const [image, setImage] = useState<{ path: string | null; url: string; version: number } | null>(null)
  const version = currentSessionVersion()

  useEffect(() => {
    let alive = true
    let created: string | null = null
    privateImage(path).then(value => {
      if (!value) return
      if (!alive || version !== currentSessionVersion()) {
        URL.revokeObjectURL(value)
        return
      }
      created = value
      setImage({ path, url: value, version })
    }).catch(failure => {
      if (alive && version === currentSessionVersion()) {
        setImage(null)
        if (failure instanceof ApiError && (failure.status === 401 || failure.status === 403)) onDenied?.()
        if (failure instanceof ApiError && failure.status === 404) onMissing?.()
      }
    })

    return () => {
      alive = false
      if (created) URL.revokeObjectURL(created)
    }
  }, [path, onDenied, onMissing, version])

  const url = image?.path === path && image.version === version ? image.url : null
  return <div className={`product-provider-image ${className}`}>
    {url ? <img src={url} alt={alt} /> : <span aria-hidden="true">✳</span>}
  </div>
}
