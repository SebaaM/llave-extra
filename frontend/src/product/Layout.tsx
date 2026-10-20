import type { ReactNode } from 'react'
import type { User } from './api'

export function Brand() { return <a href="/" className="product-brand"><img src="/logo-llave-extra.png" alt="Llave Extra" width="145" height="81" /></a> }

function Header({ user }: { user: User | null }) {
  return <header className="product-header"><a className="skip-link" href="#contenido">Saltar al contenido</a><div className="product-header-inner"><Brand /><nav aria-label="Navegación principal"><a href="/beneficios">Beneficios</a><a href="/#como-funciona">Cómo funciona</a>{user?.role === 'TOURIST' && <><a href="/recomendaciones">Recomendaciones</a><a href="/mi-viaje">Mi viaje</a></>}{user?.role === 'ADMIN' && <a href="/admin/">Administrar</a>}</nav><div className="product-header-actions">{user ? <><span className="product-user-email">{user.email}</span><button className="button button-ghost" onClick={() => window.dispatchEvent(new Event('llave:logout'))}>Salir</button></> : <><a className="button button-ghost" href="/ingresar">Ya tengo cuenta</a><a className="button button-orange" href="/registro">Crear mi cuenta</a></>}</div></div></header>
}

function Footer() { return <footer className="product-footer"><Brand /><p>Llave Extra conecta tu viaje con beneficios locales en Ushuaia.</p><a href="/creditos-imagenes">Créditos de imágenes y mapa</a></footer> }

export function ProductShell({ user, children }: { user: User | null; children: ReactNode }) { return <div className="product-shell"><Header user={user} />{children}<Footer /></div> }

export function ButtonLink({ href, children, tone = 'orange' }: { href: string; children: ReactNode; tone?: 'orange' | 'dark' | 'white' }) { return <a href={href} className={`button button-${tone}`}>{children}</a> }
