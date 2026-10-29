import { useRef } from 'react'
import type { User } from '../api'
import { ProductLink } from '../navigation'

const destinations = [
  { href: '/beneficios', label: 'Beneficios' },
  { href: '/recomendaciones', label: 'Recomendaciones' },
  { href: '/mi-viaje', label: 'Mi viaje' },
]

export function ClientNavigation({ user, path }: { user: User | null; path: string }) {
  const menu = useRef<HTMLDetailsElement>(null)
  if (user?.role !== 'TOURIST') return null

  const route = path.replace(/\/$/, '') || '/'
  const hideBar = ['/consumo', '/ingresar', '/registro', '/recuperar', '/restablecer-clave', '/verificar-email', '/verificar']
    .some(page => route === page || route.startsWith(`${page}/`))
  const active = (href: string) => route === href || route.startsWith(`${href}/`) ? 'page' as const : undefined
  const closeMenu = () => { if (menu.current) menu.current.open = false }

  return <div className="client-navigation-group">
    {!hideBar && <nav className="client-navigation" aria-label="Tu viaje">
      {destinations.map(({ href, label }) => <ProductLink key={href} href={href} aria-current={active(href)} onClick={closeMenu}>{label}</ProductLink>)}
    </nav>}
    <details key={path} className="client-menu" ref={menu} onKeyDown={event => {
      if (event.key === 'Escape' && menu.current?.open) {
        closeMenu()
        menu.current.querySelector('summary')?.focus()
      }
    }}>
      <summary>Menú</summary>
      <nav className="client-menu-links" aria-label="Navegación de cuenta">
        {hideBar && destinations.map(({ href, label }) => <ProductLink key={href} href={href} aria-current={active(href)} onClick={closeMenu}>{label}</ProductLink>)}
        <ProductLink href="/tienda" aria-current={active('/tienda')} onClick={closeMenu}>Tienda</ProductLink>
        <ProductLink href="/perfil" aria-current={active('/perfil')} onClick={closeMenu}>Cuenta</ProductLink>
        <a href="/#como-funciona" onClick={closeMenu}>Cómo funciona</a>
      </nav>
    </details>
  </div>
}
