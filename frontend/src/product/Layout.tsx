import type { ReactNode } from 'react'
import type { User } from './api'
import type { SiteSettings } from './admin/types'
import { defaultSiteSettings } from './useSiteSettings'
export function Brand({ name = 'Llave Extra' }: { name?: string }) { return <a href="/" className="product-brand"><img src="/logo-llave-extra.png" alt={name} width="145" height="81" /></a> }

function Header({ user, settings }: { user: User | null; settings: SiteSettings }) {
  return <header className="product-header"><a className="skip-link" href="#contenido">Saltar al contenido</a><div className="product-header-inner"><Brand name={settings.site_name} /><nav aria-label="Navegación principal"><a href="/beneficios">Beneficios</a><a href="/#como-funciona">Cómo funciona</a>{user?.role === 'TOURIST' && <><a href="/recomendaciones">Recomendaciones</a><a href="/mi-viaje">Mi viaje</a></>}{user?.role === 'ADMIN' && <a href="/gestion">Administrar</a>}{(user?.role === 'PROVIDER' || user?.role === 'COLLABORATOR') && <a href="/espacio">Mi espacio</a>}</nav><div className="product-header-actions">{user ? <><span className="product-user-email">{user.email}</span><button className="button button-ghost" onClick={() => window.dispatchEvent(new Event('llave:logout'))}>Salir</button></> : <><a className="button button-ghost" href="/ingresar">Ya tengo cuenta</a><a className="button button-orange" href="/registro">Crear mi cuenta</a></>}</div></div></header>
}

function Footer({ settings }: { settings: SiteSettings }) { return <footer className="product-footer"><Brand name={settings.site_name} /><p>{settings.footer_text}</p><div className="product-footer-links">{settings.contact_email && <a href={`mailto:${settings.contact_email}`}>{settings.contact_email}</a>}{settings.whatsapp_url && <a href={settings.whatsapp_url} target="_blank" rel="noopener noreferrer">WhatsApp</a>}{settings.instagram_url && <a href={settings.instagram_url} target="_blank" rel="noopener noreferrer">Instagram</a>}<a href="/creditos-imagenes">Créditos de imágenes y mapa</a></div></footer> }

export function ProductShell({ user, children, settings = defaultSiteSettings, settingsError = false, retrySettings }: { user: User | null; children: ReactNode; settings?: SiteSettings; settingsError?: boolean; retrySettings?: () => void }) { return <div className="product-shell"><Header user={user} settings={settings} />{settingsError && <div className="product-notice" role="status">No pudimos actualizar los textos y contactos del sitio. <button onClick={retrySettings}>Volver a intentar</button></div>}{children}<Footer settings={settings} /></div> }

export function ButtonLink({ href, children, tone = 'orange' }: { href: string; children: ReactNode; tone?: 'orange' | 'dark' | 'white' }) { return <a href={href} className={`button button-${tone}`}>{children}</a> }
