import { useEffect, useState } from 'react'
import { ApiError, currentSessionVersion, privateImage } from './api'

export function PrivatePhoto({ path, alt, onDenied }: { path: string | null; alt: string; onDenied?: () => void }) {
  const [image, setImage] = useState<{ path: string | null; url: string } | null>(null)

  useEffect(() => {
    let alive = true
    let created: string | null = null
    const version = currentSessionVersion()
    privateImage(path).then(value => {
      if (!value) return
      if (!alive) {
        URL.revokeObjectURL(value)
        return
      }
      created = value
      setImage({ path, url: value })
    }).catch(failure => {
      if (alive && version === currentSessionVersion()) {
        setImage(null)
        if (failure instanceof ApiError && (failure.status === 401 || failure.status === 403)) onDenied?.()
      }
    })

    return () => {
      alive = false
      if (created) URL.revokeObjectURL(created)
    }
  }, [path, onDenied])

  const url = image?.path === path ? image.url : null
  return <div className="product-provider-image">
    {url ? <img src={url} alt={alt} /> : <span aria-hidden="true">✳</span>}
  </div>
}
