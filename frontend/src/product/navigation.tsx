import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from 'react'

import { navigate } from './navigate'

export function ProductLink({ href, children, onClick, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { children: ReactNode }) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event)
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    if ((event.currentTarget.target && event.currentTarget.target.toLowerCase() !== '_self') || event.currentTarget.hasAttribute('download')) return
    const target = new URL(href ?? '/', window.location.href)
    if (target.origin !== window.location.origin) return
    event.preventDefault()
    navigate(`${target.pathname}${target.search}${target.hash}`)
  }
  return <a href={href} onClick={handleClick} {...props}>{children}</a>
}
