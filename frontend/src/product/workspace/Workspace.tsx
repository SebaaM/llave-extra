import { Empty } from './UI'
import { useState } from 'react'
import type { User } from '../api'
import { ProductLink } from '../navigation'
import { ProviderWorkspace } from './ProviderWorkspace'
import { CollaboratorWorkspace } from './CollaboratorWorkspace'
import './workspace.css'
import { workspaceHome } from './data'

export function Workspace({ user, path }: { user: User; path: string }) {
  const [open, setOpen] = useState(false)
  const provider = user.role === 'PROVIDER'
  const base = workspaceHome(user)
  const links = provider ? [['', 'Resumen', '◫'], ['/negocio', 'Mi negocio', '⌂'], ['/beneficios', 'Mis beneficios', '✳'], ['/qr', 'QR y PIN', '▦'], ['/cuenta', 'Mi cuenta', '○']] : [['', 'Resumen', '◫'], ['/recomendaciones', 'Mis recomendaciones', '♡'], ['/catalogo', 'Explorar catálogo', '✳'], ['/qr', 'Mi QR', '▦'], ['/cuenta', 'Mi cuenta', '○']]
  const selected = links.find(([suffix]) => `${base}${suffix}` === path)
  const title = selected?.[1] ?? 'Sección no disponible'
  return <div className="workspace">
    <a className="skip-link" href="#contenido">Saltar al contenido</a>
    <aside className="workspace-sidebar">
      <a className="workspace-brand" href="/"><img src="/logo-llave-extra.png" width="145" height="81" alt="Llave Extra" /></a>
      <div className="workspace-role"><span className="workspace-dot" />Espacio {provider ? 'Prestador' : 'Colaborador'}</div>
      <button className="workspace-menu" aria-controls="workspace-nav" aria-expanded={open} onClick={() => setOpen(!open)}>Menú <span aria-hidden="true">{open ? '−' : '+'}</span></button>
      <nav id="workspace-nav" aria-label="Panel de gestión" className={open ? 'is-open' : ''}>{links.map(([suffix, label, icon]) => <ProductLink key={suffix} href={`${base}${suffix}`} aria-current={path === `${base}${suffix}` ? 'page' : undefined} onClick={() => setOpen(false)}><span aria-hidden="true">{icon}</span>{label}</ProductLink>)}</nav>
      <div className="workspace-sidebar-bottom"><p>Tu lugar en la red.<br /><strong>Más experiencias locales.</strong></p><a href="/">↗ Volver al sitio</a></div>
    </aside>
    <div className="workspace-body"><header className="workspace-header"><span>USHUAIA · RED LOCAL</span><div><span className="workspace-email">{user.email}</span><button className="button button-ghost" onClick={() => window.dispatchEvent(new Event('llave:logout'))}>Salir</button></div></header>
      <main id="contenido" className="workspace-main"><div className="workspace-heading"><p className="eyebrow">TU ESPACIO, TU COMUNIDAD</p><h1>{title}</h1></div>
        {!selected ? <Empty title="Esta sección no está disponible" text="Usá el menú para volver a tu panel." /> : path.endsWith('/cuenta') ? <Account user={user} /> : provider ? <ProviderWorkspace section={selected[0]} /> : <CollaboratorWorkspace section={selected[0]} />}
        <footer className="workspace-footer">LLAVE EXTRA <span>Conectamos lo mejor de Ushuaia.</span></footer>
      </main>
    </div>
  </div>
}

function Account({ user }: { user: User }) { return <section className="workspace-panel"><p className="eyebrow">DATOS DE TU SESIÓN</p><h2>Tu cuenta</h2><dl className="workspace-details"><dt>Email</dt><dd>{user.email}</dd><dt>Rol</dt><dd>{user.role === 'PROVIDER' ? 'Prestador' : 'Colaborador'}</dd><dt>Verificación</dt><dd>{user.email_verified ? 'Email verificado' : 'Email pendiente de verificación'}</dd></dl><p>Las asignaciones y habilitaciones se gestionan con el administrador de la red.</p><button className="button button-dark" onClick={() => window.dispatchEvent(new Event('llave:logout'))}>Cerrar sesión</button></section> }
