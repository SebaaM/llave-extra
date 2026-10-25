import { useCallback, useState } from 'react'
import type { FormEvent } from 'react'
import { ApiError, currentSessionVersion } from '../api'
import { ProductLink } from '../navigation'
import { messageOf } from '../shared'
import { saveSettings, settings } from './api'
import { useAdminLoad, useDirtyGuard } from './hooks'
import type { Field } from './types'
import { LoadState, Status } from './UI'

const general: Field[] = [
  { name: 'site_name', label: 'Nombre del sitio', required: true }, { name: 'home_title', label: 'Título de portada', required: true },
  { name: 'home_description', label: 'Descripción de portada', kind: 'textarea', required: true },
  { name: 'footer_text', label: 'Texto del pie', kind: 'textarea', required: true },
  { name: 'contact_email', label: 'Email de contacto', kind: 'email' },
  { name: 'whatsapp_url', label: 'Enlace de WhatsApp', kind: 'url' }, { name: 'instagram_url', label: 'Enlace de Instagram', kind: 'url' },
]
const catalog: Field[] = [
  { name: 'enabled', label: 'Catálogo público habilitado', kind: 'boolean' },
  { name: 'network_title', label: 'Título de la red' },
  { name: 'network_layout', label: 'Distribución', kind: 'select', options: [['RADIAL', 'Radial'], ['ORBIT', 'Órbita']] },
  { name: 'network_theme', label: 'Tema', kind: 'select', options: [['SAND', 'Arena'], ['OCEAN', 'Océano']] },
  { name: 'network_background', label: 'Fondo', kind: 'select', options: [['HARBOR', 'Puerto'], ['BEAGLE', 'Canal Beagle']] },
  { name: 'network_page_size', label: 'Prestadores por página (10–15)', kind: 'number' },
  { name: 'network_interval_seconds', label: 'Intervalo de la red (8–60 segundos)', kind: 'number' },
]
const credits: Field[] = [{ name: 'base_reward', label: 'Créditos por primera visita', kind: 'number' }, { name: 'target_visits', label: 'Meta de visitas', kind: 'number' }]
const shop: Field[] = [{ name: 'pickup_name', label: 'Punto de retiro' }, { name: 'pickup_address', label: 'Dirección de retiro' }, { name: 'pickup_hours', label: 'Horarios de retiro' }, { name: 'pickup_enabled', label: 'Retiro habilitado', kind: 'boolean' }]
const tabs = [
  { key: 'general', api: 'general', label: 'General', fields: general, note: 'Estos textos y contactos se muestran en el sitio público.' },
  { key: 'catalogo', api: 'catalog', label: 'Catálogo y red', fields: catalog, note: 'El interruptor solo afecta la visibilidad pública. Las carpetas privadas y los consumos elegibles siguen funcionando.' },
  { key: 'creditos', api: 'credits', label: 'Créditos', fields: credits, note: 'Las nuevas visitas usarán estos valores. Las visitas anteriores conservan los créditos registrados.' },
  { key: 'retiro', api: 'shop', label: 'Tienda y retiro', fields: shop, note: 'Los pedidos nuevos tomarán esta información. Los pedidos previos conservan su punto de retiro.' },
] as const
type Tab = typeof tabs[number]

export function Settings({ search }: { search: string }) {
  const chosen = new URLSearchParams(search).get('tab')
  const tab = tabs.find(item => item.key === chosen) ?? tabs[0]
  return <><nav className="admin-tabs" aria-label="Grupos de configuración">{tabs.map(item => <ProductLink key={item.key} href={`/gestion/configuracion?tab=${item.key}`} aria-current={tab.key === item.key ? 'page' : undefined}>{item.label}</ProductLink>)}</nav><SettingsGroup key={tab.key} tab={tab} /></>
}
function SettingsGroup({ tab }: { tab: Tab }) {
  const load = useCallback((signal: AbortSignal) => settings<Record<string, unknown>>(tab.api, signal), [tab.api])
  const { data, loading, error, reload, setState } = useAdminLoad(load)
  return <><LoadState loading={loading} error={error} retry={reload} />{data && <SettingsForm key={tab.key} tab={tab} data={data} onSaved={next => setState({ data: next, loading: false, error: '' })} />}</>
}
function formValues(tab: Tab, data: Record<string, unknown>) { return Object.fromEntries(tab.fields.map(field => [field.name, data[field.name] ?? (field.kind === 'boolean' ? false : '')])) }
function SettingsForm({ tab, data, onSaved }: { tab: Tab; data: Record<string, unknown>; onSaved: (next: Record<string, unknown>) => void }) {
  const [values, setValues] = useState<Record<string, unknown>>(() => formValues(tab, data))
  const [baseline, setBaseline] = useState<Record<string, unknown>>(() => formValues(tab, data))
  const [version, setVersion] = useState(data.version)
  const [saveError, setSaveError] = useState('')
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const dirty = JSON.stringify(values) !== JSON.stringify(baseline)
  useDirtyGuard(dirty)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (saving) return
    const body: Record<string, unknown> = { version }
    for (const field of tab.fields) if (JSON.stringify(values[field.name]) !== JSON.stringify(baseline[field.name])) body[field.name] = values[field.name]
    setSaving(true); setSaved(false); setSaveError('')
    const session = currentSessionVersion()
    try {
      const next = await saveSettings<Record<string, unknown>>(tab.api, body)
      if (session !== currentSessionVersion()) return
      const form = formValues(tab, next)
      setValues(form); setBaseline(form); setVersion(next.version); onSaved(next); setSaved(true)
      if (tab.key === 'general') window.dispatchEvent(new Event('llave:site-settings-changed'))
    } catch (cause) { if (session === currentSessionVersion()) setSaveError(cause instanceof ApiError && cause.status === 409 ? 'Esta configuración cambió desde que la abriste. Tus datos siguen aquí; compará con la versión actual antes de guardar.' : messageOf(cause)) }
    finally { if (session === currentSessionVersion()) setSaving(false) }
  }
  const replaceWithCurrent = async () => {
    if (dirty && !window.confirm('Se perderán tus cambios. ¿Querés cargar la configuración actual?')) return
    setSaving(true); setSaveError('')
    const session = currentSessionVersion()
    try { const next = await settings<Record<string, unknown>>(tab.api, new AbortController().signal); if (session !== currentSessionVersion()) return; const form = formValues(tab, next); setValues(form); setBaseline(form); setVersion(next.version); onSaved(next) }
    catch (cause) { if (session === currentSessionVersion()) setSaveError(messageOf(cause)) }
    finally { if (session === currentSessionVersion()) setSaving(false) }
  }
  return <form className="admin-panel admin-form" onSubmit={submit}><div className="admin-form-heading"><div><p className="eyebrow">CONFIGURACIÓN</p><h2>{tab.label}</h2><p>{tab.note}</p></div></div><div className="admin-form-grid">{tab.fields.map(field => <label key={field.name} className={field.kind === 'textarea' ? 'admin-wide' : ''}>{field.label}{field.kind === 'textarea' ? <textarea rows={4} value={String(values[field.name] ?? '')} onChange={event => setValues(current => ({ ...current, [field.name]: event.target.value }))} /> : field.kind === 'select' ? <select value={String(values[field.name] ?? '')} onChange={event => setValues(current => ({ ...current, [field.name]: event.target.value }))}>{field.options?.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select> : field.kind === 'boolean' ? <span className="admin-check"><input type="checkbox" checked={Boolean(values[field.name])} onChange={event => setValues(current => ({ ...current, [field.name]: event.target.checked }))} />{values[field.name] ? 'Sí' : 'No'}</span> : <input type={field.kind ?? 'text'} required={field.required} value={String(values[field.name] ?? '')} onChange={event => setValues(current => ({ ...current, [field.name]: field.kind === 'number' ? Number(event.target.value) : event.target.value }))} />}</label>)}</div>
      {tab.key === 'catalogo' && <NetworkPreview values={values} />}
      {tab.key === 'creditos' && <p>Las reglas por prestador se administran en <ProductLink href="/gestion/reglas-creditos">Reglas de créditos →</ProductLink></p>}
      {tab.key === 'retiro' && <p>Modo de pagos: <strong>{data.payment_provider === 'disabled' ? 'Deshabilitado' : data.payment_provider === 'fake' ? 'Demostración' : String(data.payment_provider)}</strong>. Se consulta aquí y no se cambia desde este formulario.</p>}
      {saveError && <Status error>{saveError}</Status>}{saved && <Status>Configuración guardada.</Status>}
      <div className="admin-actions"><button className="button button-orange" disabled={!dirty || saving}>{saving ? 'Guardando…' : 'Guardar este grupo'}</button><button type="button" className="button button-ghost" onClick={() => void replaceWithCurrent()}>{dirty ? 'Descartar cambios y cargar versión actual' : 'Actualizar desde el servidor'}</button></div>
    </form>
}

function NetworkPreview({ values }: { values: Record<string, unknown> }) {
  return <section className={`admin-network-preview theme-${String(values.network_theme).toLowerCase()} background-${String(values.network_background).toLowerCase()} layout-${String(values.network_layout).toLowerCase()}`} aria-label="Vista previa de la red"><p className="eyebrow">VISTA PREVIA LOCAL</p><h3>{String(values.network_title || 'La red local')}</h3><div className="admin-network-dots" aria-hidden="true"><span /><span /><span /><span /><span /></div><p>{values.enabled ? 'Catálogo público visible' : 'Catálogo público cerrado'} · {String(values.network_page_size || '—')} prestadores por página</p></section>
}
