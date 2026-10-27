import { useCallback } from 'react'
import { ProductLink } from '../navigation'
import { auditActionLabel, auditResourceLabel } from './data'
import { dashboard } from './api'
import { useAdminLoad } from './hooks'
import { LoadState } from './UI'
import { formatValue } from './formatValue'

const counters = [
  ['active_users', 'Usuarios activos', 'usuarios?is_active=true'],
  ['published_providers', 'Prestadores publicados', 'prestadores?status=PUBLISHED'],
  ['current_benefits', 'Beneficios vigentes', 'beneficios?current=true'],
  ['enabled_collaborators', 'Colaboradores habilitados', 'colaboradores?enabled=true&user_active=true'],
] as const
const queues = [
  ['draft_providers', 'Prestadores por revisar', 'prestadores?status=DRAFT'],
  ['draft_benefits', 'Beneficios por revisar', 'beneficios?status=DRAFT'],
  ['orders_to_prepare', 'Pedidos por preparar', 'pedidos?state=PAID'],
  ['orders_to_deliver', 'Pedidos por entregar', 'pedidos?state=READY'],
  ['open_cancellations', 'Cancelaciones abiertas', 'cancelaciones?state=OPEN'],
  ['payment_reviews', 'Pagos en revisión', 'pedidos?state=PAYMENT_REVIEW'],
  ['pending_refunds', 'Reintegros pendientes', 'pedidos?state=REFUND_PENDING'],
  ['unresolved_adjustments', 'Ajustes de créditos pendientes', 'ajustes?resolved=false'],
  ['out_of_stock_products', 'Productos sin stock', 'productos?active=true&stock=0'],
] as const
export function Dashboard() {
  const load = useCallback((signal: AbortSignal) => dashboard(signal), [])
  const { data, loading, error, reload } = useAdminLoad(load)
  if (loading || error) return <LoadState loading={loading} error={error} retry={reload} />
  if (!data) return null
  return <>
    <div className="admin-intro"><div><p className="eyebrow">ESTADO DE LA RED</p><h2>Lo que necesita tu atención.</h2><p>Información operativa actual. Abrí cada sección para trabajar sobre los registros.</p></div><button className="button button-dark" onClick={reload}>Actualizar</button></div>
    <p className="admin-refreshed">Actualizado: {new Date(data.refreshed_at).toLocaleString('es-AR')}</p>
    <section aria-labelledby="admin-counts"><h2 id="admin-counts">Red activa</h2><div className="admin-card-grid">{counters.map(([key, label, link]) => <ProductLink className="admin-stat" href={`/gestion/${link}`} key={key}><span>{label}</span><strong>{data.counts[key].toLocaleString('es-AR')}</strong><small>Ver registros →</small></ProductLink>)}</div></section>
    <section aria-labelledby="admin-queues"><h2 id="admin-queues">Bandeja de trabajo</h2><div className="admin-queue-grid">{queues.map(([key, label, link]) => <ProductLink href={`/gestion/${link}`} className="admin-queue" key={key}><strong>{data.queues[key].toLocaleString('es-AR')}</strong><span>{label}</span><span aria-hidden="true">↗</span></ProductLink>)}</div></section>
    <div className="admin-dashboard-bottom"><section className="admin-panel"><h2>Configuración vigente</h2><dl className="admin-details"><div><dt>Catálogo público</dt><dd>{data.settings.catalog_enabled ? 'Abierto' : 'Cerrado'}</dd></div><div><dt>Retiro</dt><dd>{data.settings.pickup_enabled ? 'Habilitado' : 'Deshabilitado'} · {data.settings.pickup_configured ? 'Datos completos' : 'Datos pendientes'}</dd></div><div><dt>Recompensa base</dt><dd>{formatValue(data.settings.base_reward)} créditos</dd></div><div><dt>Meta</dt><dd>{formatValue(data.settings.target_visits)} visitas</dd></div><div><dt>Pagos</dt><dd>{data.settings.payment_provider === 'disabled' ? 'Deshabilitados' : data.settings.payment_provider === 'fake' ? 'Demostración' : 'Configurados'}</dd></div></dl><ProductLink href="/gestion/configuracion">Editar configuración →</ProductLink></section>
      <section className="admin-panel"><h2>Actividad reciente</h2>{data.recent_activity.length ? <ul className="admin-activity">{data.recent_activity.map(item => <li key={String(item.id)}><strong>{auditActionLabel(item.action)}</strong><span>{auditResourceLabel(item.resource)} · {String(item.actor_email ?? 'Sistema')}</span></li>)}</ul> : <p>Todavía no hay actividad registrada.</p>}<ProductLink href="/gestion/actividad">Ver actividad →</ProductLink></section></div>
  </>
}
