import { useEffect, useState } from 'react'
import { privateImage } from './api'

export function PrivatePhoto({ path, alt }: { path: string | null; alt: string }) {
  const [image, setImage] = useState<{ path: string | null; url: string } | null>(null)

  useEffect(() => {
    let alive = true
    let created: string | null = null
    privateImage(path).then(value => {
      if (!value) return
      if (!alive) {
        URL.revokeObjectURL(value)
        return
      }
      created = value
      setImage({ path, url: value })
    }).catch(() => {
      if (alive) setImage(null)
    })

    return () => {
      alive = false
      if (created) URL.revokeObjectURL(created)
    }
  }, [path])

  const url = image?.path === path ? image.url : null
  return <div className="product-provider-image">
    {url ? <img src={url} alt={alt} /> : <span aria-hidden="true">✳</span>}
  </div>
}
