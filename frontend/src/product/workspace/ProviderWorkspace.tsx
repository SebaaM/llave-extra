import { useState } from 'react'
import { api } from '../api'
import type { Benefit } from '../api'
import { PrivatePhoto } from '../PrivatePhoto'
import { ProductLink } from '../navigation'
import { safeExternal } from '../catalog'
import { messageOf } from '../shared'
import { benefitPath, loadProvider, providerPath, stateLabel } from './data'
import { BusinessForm, BenefitForm } from './Forms'
import { useCurrent, useResource } from './hooks'
import { Empty, Feedback, Stats } from './UI'
import { WorkspaceQR } from './WorkspaceQR'

export function ProviderWorkspace({ section }: { section: string }) {
  const { data, loading, error, reload } = useResource(loadProvider)
  const [editing, setEditing] = useState<Benefit | 'new' | null>(null)
  const [notice, setNotice] = useState('')
  const [actionError, setActionError] = useState('')
  const [busy, setBusy] = useState('')
  const current = useCurrent()
  if (loading) return <p role="status">Cargando tu negocio…</p>
  if (error) return <Empty title="No pudimos abrir tu negocio" text={error}><button className="button button-dark" onClick={reload}>Volver a intentar</button></Empty>
  if (!data?.provider) return <Empty title="Tu negocio está por llegar" text="Todavía no tenés un negocio asignado. Contactá al administrador de Llave Extra para comenzar." />
  const { provider, benefits } = data
  async function remove(benefit: Benefit) {
    if (!window.confirm(`¿Eliminar el borrador «${benefit.title}»?`)) return
    setBusy(benefit.id); setActionError(''); setNotice('')
    try { await api(benefitPath(provider!.id, benefit.id), { method: 'DELETE' }); if (current()) { setNotice('Borrador eliminado.'); reload() } }
    catch (failure) { if (current()) setActionError(messageOf(failure)) }
    finally { if (current()) setBusy('') }
  }
  if (section === '/qr') return <WorkspaceQR kind="provider" credentialPath={`${providerPath(provider.id)}consumption-credential/`} />
  return <>
    <Feedback error={actionError} notice={notice} />
    {section === '' && <><section className="workspace-welcome"><div><span className="workspace-tag">SOS PARTE DE LLAVE EXTRA</span><h2>Lo local empieza<br />en tu negocio.</h2><p>Mantené tu propuesta al día y acercá nuevas experiencias a quienes visitan Ushuaia.</p><ProductLink className="button button-orange" href="/prestador/beneficios">Gestionar beneficios <span aria-hidden="true">↗</span></ProductLink></div><div className="workspace-welcome-symbol" aria-hidden="true">✳</div></section><Stats items={[[ 'Beneficios creados', benefits.length ], ['Publicados', benefits.filter(item => item.status === 'PUBLISHED').length], ['Borradores', benefits.filter(item => item.status === 'DRAFT').length]]} /></>}
    {(section === '' || section === '/negocio') && <section className="workspace-panel workspace-business"><PrivatePhoto path={provider.image_url} alt={`Imagen de ${provider.name}`} /><div><span className="workspace-tag">{provider.category || 'NEGOCIO LOCAL'}</span><h2>{provider.name}</h2><p><span className={`workspace-badge ${provider.status === 'PUBLISHED' ? 'is-available' : ''}`}>{stateLabel(provider.status)}</span>{provider.demo && <span className="workspace-badge">Demostración</span>}</p><p>{provider.description || 'Completá tu ficha para presentar tu propuesta a la comunidad.'}</p>{provider.address && <p>{provider.address}</p>}{section === '' && <ProductLink href="/prestador/negocio">Editar información →</ProductLink>}{section === '/negocio' && <div className="workspace-actions">{safeExternal(provider.map_url) && <a href={safeExternal(provider.map_url)!} target="_blank" rel="noopener noreferrer">Ver mapa ↗</a>}{safeExternal(provider.website) && <a href={safeExternal(provider.website)!} target="_blank" rel="noopener noreferrer">Visitar sitio ↗</a>}</div>}</div></section>}
    {section === '/negocio' && <BusinessForm provider={provider} onSaved={() => { setNotice('La ficha de tu negocio se guardó.'); reload() }} />}
    {section === '' && <section className="workspace-panel workspace-next"><div><h2>Prepará tu punto de encuentro</h2><p>Descargá tu QR de consumo para que los clientes puedan validar su visita.</p></div><ProductLink href="/prestador/qr" className="button button-dark">Ver QR y PIN →</ProductLink></section>}
    {section === '/beneficios' && <>{editing ? <BenefitForm key={editing === 'new' ? 'new' : editing.id} providerId={provider.id} benefit={editing === 'new' ? undefined : editing} onCancel={() => setEditing(null)} onSaved={saved => { setEditing(null); setNotice(saved.status === 'DRAFT' ? 'Beneficio guardado como borrador. Queda pendiente de revisión.' : 'Beneficio guardado.'); reload() }} /> : <><div className="workspace-section-heading"><div><h2>Las propuestas de tu negocio</h2><p>El administrador revisa y publica tus beneficios.</p></div><button className="button button-orange" onClick={() => { setEditing('new'); setNotice('') }}>+ Crear beneficio</button></div>{!benefits.length ? <Empty title="Tu próxima propuesta empieza acá" text="Creá el primer beneficio de tu negocio para enviarlo a revisión." /> : <div className="workspace-card-grid">{benefits.map(benefit => <article className="workspace-panel workspace-benefit" key={benefit.id}><PrivatePhoto path={benefit.image_url} alt={benefit.title} /><div className="workspace-card-content"><span className={`workspace-badge ${benefit.status === 'PUBLISHED' ? 'is-available' : ''}`}>{stateLabel(benefit.status)}</span><h3>{benefit.title}</h3><p>{benefit.description}</p>{benefit.conditions && <p className="workspace-muted">{benefit.conditions}</p>}<p className="workspace-muted">Desde {benefit.valid_from || 'sin límite'} · Hasta {benefit.valid_until || 'sin límite'}</p><div className="workspace-actions"><button className="button button-dark" onClick={() => setEditing(benefit)}>Editar</button>{benefit.status === 'DRAFT' && <button className="button button-ghost" disabled={!!busy} onClick={() => void remove(benefit)}>{busy === benefit.id ? 'Eliminando…' : 'Eliminar borrador'}</button>}</div></div></article>)}</div>}</>}</>}
  </>
}
