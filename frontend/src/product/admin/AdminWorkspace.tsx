import { useCallback, useState } from 'react'
import type { User } from '../api'
import { ProductLink } from '../navigation'
import { adminApi } from './api'
import { Dashboard } from './Dashboard'
import { auditActionLabel, auditResourceLabel, fieldLabels, resourceByKey } from './data'
import { useAdminLoad } from './hooks'
import { RecordDetail, NewRecord } from './RecordDetail'
import { ResourceList } from './ResourceList'
import { keyForRoute } from './routes'
import { Settings } from './Settings'
import type { Page, Row } from './types'
import { LoadState } from './UI'
import { formatValue } from './formatValue'
import './admin.css'

const mainLinks = [['', 'Inicio', '⌂'], ['usuarios', 'Usuarios', '◉'], ['prestadores', 'Prestadores', '▣'], ['beneficios', 'Beneficios', '✳'], ['colaboradores', 'Colaboradores', '♡'], ['consumos', 'Consumos', '◫'], ['billeteras', 'Billeteras', '▤'], ['ajustes', 'Ajustes de créditos', '↗'], ['productos', 'Productos', '◈'], ['pedidos', 'Pedidos', '▦'], ['cancelaciones', 'Cancelaciones', '⊘'], ['reglas-creditos', 'Reglas de créditos', '✦'], ['movimientos-stock', 'Movimientos de stock', '⇅'], ['operaciones-pago', 'Operaciones de pago', '◎'], ['actividad', 'Actividad', '◷'], ['configuracion', 'Configuración', '⚙'], ['cuenta', 'Mi cuenta', '○']] as const
export function AdminWorkspace({ user, path, search }: { user: User; path: string; search: string }) {
  const [menu, setMenu] = useState(false)
  const parts = path.replace(/^\/gestion\/?/, '').split('/').filter(Boolean)
  const section = parts[0] ?? ''
  const resource = resourceByKey.get(keyForRoute(section) ?? '')
  const title = mainLinks.find(([route]) => route === section)?.[1] ?? resource?.title ?? 'Sección no disponible'
  let content
  if (!section) content = <Dashboard />
  else if (section === 'configuracion') content = <Settings search={search} />
  else if (section === 'cuenta') content = <Account user={user} />
  else if (section === 'actividad') content = <Activity search={search} />
  else if (resource) content = parts[1] === 'nuevo' && resource.fields ? <NewRecord key={`${resource.key}:nuevo`} resource={resource} search={search} /> : parts[1] ? <RecordDetail key={`${resource.key}:${parts[1]}`} resource={resource} id={parts[1]} search={search} /> : <ResourceList key={resource.key} resource={resource} search={search} />
  else content = <section className="admin-panel"><h2>Sección no disponible</h2><ProductLink href="/gestion">Volver al inicio</ProductLink></section>
  return <div className="workspace admin-workspace">
    <a className="skip-link" href="#contenido">Saltar al contenido</a>
    <aside className="workspace-sidebar admin-sidebar"><a className="workspace-brand" href="/"><img src="/logo-llave-extra.png" width="145" height="81" alt="Llave Extra" /></a><div className="workspace-role"><span className="workspace-dot" />Espacio Administrador</div><button className="workspace-menu" aria-controls="admin-nav" aria-expanded={menu} onClick={() => setMenu(value => !value)}>Menú <span aria-hidden="true">{menu ? '−' : '+'}</span></button><nav id="admin-nav" aria-label="Panel de administración" className={menu ? 'is-open' : ''}>{mainLinks.map(([route, label, icon]) => <ProductLink key={route} href={`/gestion${route ? `/${route}` : ''}`} aria-current={section === route ? 'page' : undefined} onClick={() => setMenu(false)}><span aria-hidden="true">{icon}</span>{label}</ProductLink>)}</nav><div className="workspace-sidebar-bottom"><p>Gestión de la red local.<br /><strong>Llave Extra · Ushuaia</strong></p><ProductLink href="/">↗ Volver al sitio</ProductLink></div></aside>
    <div className="workspace-body"><header className="workspace-header"><span>USHUAIA · RED LOCAL</span><div><span className="workspace-email">{user.email}</span><button className="button button-ghost" onClick={() => window.dispatchEvent(new Event('llave:logout'))}>Salir</button></div></header><main id="contenido" className="workspace-main admin-main"><div className="workspace-heading"><p className="eyebrow">GESTIÓN DE LLAVE EXTRA</p><h1>{title}</h1></div>{content}<footer className="workspace-footer">LLAVE EXTRA <span>Conectamos lo mejor de Ushuaia.</span></footer></main></div>
  </div>
}
function Account({ user }: { user: User }) { return <section className="admin-panel"><p className="eyebrow">DATOS DE TU SESIÓN</p><h2>Mi cuenta</h2><dl className="admin-details"><div><dt>Email</dt><dd>{user.email}</dd></div><div><dt>Rol</dt><dd>Administrador</dd></div><div><dt>Verificación</dt><dd>{user.email_verified ? 'Email verificado' : 'Email pendiente'}</dd></div></dl><button className="button button-dark" onClick={() => window.dispatchEvent(new Event('llave:logout'))}>Cerrar sesión</button></section> }
function Activity({ search }: { search: string }) {
  const [searchInput, setSearchInput] = useState({ source: search, value: new URLSearchParams(search).get('search') ?? '' })
  const term = searchInput.source === search ? searchInput.value : new URLSearchParams(search).get('search') ?? ''
  const query = new URLSearchParams(search)
  const page = Math.max(1, Number(query.get('page') ?? '1') || 1)
  const load = useCallback((signal: AbortSignal) => adminApi<Page<Row>>(`activity/?${search.replace(/^\?/, '') || 'page=1'}`, { signal }), [search])
  const { data, loading, error, reload } = useAdminLoad(load)
  const go = (key: string, value: string) => { const next = new URLSearchParams(search); if (value) next.set(key, value); else next.delete(key); if (key !== 'page') next.delete('page'); window.dispatchEvent(new CustomEvent('llave:navigate', { detail: `/gestion/actividad?${next}` })) }
  return <><form className="admin-filters" onSubmit={event => { event.preventDefault(); go('search', term.trim()) }}><label>Buscar<input value={term} onChange={event => setSearchInput({ source: search, value: event.target.value })} placeholder="Email, acción o motivo" /></label><button className="button button-dark">Buscar</button><label>Acción<input value={query.get('action') ?? ''} onChange={event => go('action', event.target.value)} /></label><label>Recurso<input value={query.get('resource') ?? ''} onChange={event => go('resource', event.target.value)} /></label></form><LoadState loading={loading} error={error} retry={reload} />{data && <><p>{data.count.toLocaleString('es-AR')} registros</p><div className="admin-table-scroll"><table className="admin-table"><thead><tr><th>Fecha</th><th>Actor</th><th>Acción</th><th>Recurso</th><th>Motivo</th></tr></thead><tbody>{data.results.map(row => <tr key={String(row.id)}>{['created_at', 'actor_email', 'action', 'resource', 'reason'].map(key => <td key={key} data-label={fieldLabels[key] ?? key}>{key === 'action' ? auditActionLabel(row[key]) : key === 'resource' ? auditResourceLabel(row[key]) : formatValue(row[key])}</td>)}</tr>)}</tbody></table></div><nav className="admin-pagination" aria-label="Páginas"><button disabled={!data.previous} onClick={() => go('page', String(page - 1))}>← Anterior</button><span>Página {page}</span><button disabled={!data.next} onClick={() => go('page', String(page + 1))}>Siguiente →</button></nav></>}</>
}
