import { useLayoutEffect, useReducer, useRef } from 'react'
import type { MouseEvent } from 'react'
import type { User } from '../api'
import { ProductLink } from '../navigation'

const destinations = [
  { href: '/beneficios', label: 'Beneficios' },
  { href: '/recomendaciones', label: 'Recomendaciones' },
  { href: '/mi-viaje', label: 'Mi viaje' },
]

function isCurrentTabNavigation(event: MouseEvent<HTMLAnchorElement>) {
  const link = event.currentTarget
  return !event.defaultPrevented && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey
    && (!link.target || link.target.toLowerCase() === '_self') && !link.hasAttribute('download')
    && new URL(link.href).origin === window.location.origin
}
export function ClientNavigation({ user, path, hasRecommendations = false }: { user: User | null; path: string; hasRecommendations?: boolean }) {
  const menu = useRef<HTMLDetailsElement>(null)
  const pendingFocus = useRef<{ path: string; userId: number } | null>(null)
  const [focusRequest, requestContentFocus] = useReducer((value: number) => value + 1, 0)
  useLayoutEffect(() => {
    const pending = pendingFocus.current
    pendingFocus.current = null
    if (!pending || pending.path !== path || pending.userId !== user?.id) return
    const content = menu.current?.closest('.product-shell')?.querySelector<HTMLElement>('.client-page-content')
    const heading = content?.querySelector<HTMLElement>('h1')
    if (heading) heading.tabIndex = -1
    const target = heading ?? content
    target?.focus()
  }, [path, focusRequest, user?.id])

  if (user?.role !== 'TOURIST') return null

  const availableDestinations = destinations.filter(({ href }) => href !== '/recomendaciones' || hasRecommendations)
  const route = path.replace(/\/$/, '') || '/'
  const hideBar = ['/consumo', '/ingresar', '/registro', '/recuperar', '/restablecer-clave', '/verificar-email', '/verificar']
    .some(page => route === page || route.startsWith(`${page}/`))
  const active = (href: string) => route === href || route.startsWith(`${href}/`) ? 'page' as const : undefined
  const closeMenu = () => { if (menu.current) menu.current.open = false }
  const navigateFromMenu = (event: MouseEvent<HTMLAnchorElement>) => {
    const link = event.currentTarget
    if (!isCurrentTabNavigation(event)) return
    pendingFocus.current = { path: new URL(link.href).pathname, userId: user.id }
    requestContentFocus()
    closeMenu()
  }

  return <div className="client-navigation-group">
    {!hideBar && <nav className="client-navigation" aria-label="Tu viaje">
      {availableDestinations.map(({ href, label }) => <ProductLink key={href} href={href} aria-current={active(href)} onClick={closeMenu}>{label}</ProductLink>)}
    </nav>}
    <details key={path} className="client-menu" ref={menu} onKeyDown={event => {
      if (event.key === 'Escape' && menu.current?.open) {
        closeMenu()
        menu.current.querySelector('summary')?.focus()
      }
    }}>
      <summary>Menú</summary>
      <nav className="client-menu-links" aria-label="Navegación de cuenta">
        {hideBar && availableDestinations.map(({ href, label }) => <ProductLink key={href} href={href} aria-current={active(href)} onClick={navigateFromMenu}>{label}</ProductLink>)}
        <ProductLink href="/tienda" aria-current={active('/tienda')} onClick={navigateFromMenu}>Tienda</ProductLink>
        <ProductLink href="/perfil" aria-current={active('/perfil')} onClick={navigateFromMenu}>Cuenta</ProductLink>
        <a href="/#como-funciona" onClick={event => { if (isCurrentTabNavigation(event)) closeMenu() }}>Cómo funciona</a>
      </nav>
    </details>
  </div>
}
