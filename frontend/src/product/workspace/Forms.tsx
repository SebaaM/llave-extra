import { useState } from 'react'
import type { FormEvent } from 'react'
import { api } from '../api'
import type { Benefit, Provider } from '../api'
import { messageOf } from '../shared'
import { benefitPath, providerPath } from './data'
import { useCurrent } from './hooks'
import { Feedback } from './UI'

export function BusinessForm({ provider, onSaved }: { provider: Provider; onSaved: () => void }) {
  const current = useCurrent()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const fields = [['description', 'Descripción'], ['address', 'Dirección'], ['hours', 'Horarios'], ['contact', 'Contacto'], ['map_url', 'Enlace al mapa'], ['website', 'Sitio web']] as const
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setBusy(true)
    const body = new FormData(event.currentTarget)
    const image = body.get('image') as File
    if (!image.size) body.delete('image')
    try { await api(providerPath(provider.id), { method: 'PATCH', body }); if (current()) onSaved() }
    catch (failure) { if (current()) setError(messageOf(failure)) }
    finally { if (current()) setBusy(false) }
  }
  return <form className="workspace-form workspace-panel" onSubmit={event => void save(event)}><h2>Información del negocio</h2><p>Nombre y categoría son administrados por la red. El resto de la ficha podés actualizarlo acá.</p><div className="workspace-form-grid">{fields.map(([name, label]) => <label key={name} className={name === 'description' ? 'workspace-wide' : ''}>{label}{name === 'description' ? <textarea name={name} defaultValue={provider[name]} rows={4} /> : <input name={name} type={name === 'website' || name === 'map_url' ? 'url' : 'text'} defaultValue={provider[name]} />}</label>)}<ImageField /></div><Feedback error={error} /><button className="button button-orange" disabled={busy}>{busy ? 'Guardando…' : 'Guardar ficha'}</button></form>
}

export function BenefitForm({ providerId, benefit, onSaved, onCancel }: { providerId: string; benefit?: Benefit; onSaved: (benefit: Benefit) => void; onCancel: () => void }) {
  const current = useCurrent()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError('')
    const body = new FormData(event.currentTarget)
    const start = String(body.get('valid_from') ?? '')
    const end = String(body.get('valid_until') ?? '')
    if (start && end && start > end) { setError('La fecha de inicio debe ser anterior o igual a la fecha de fin.'); return }
    const image = body.get('image') as File
    if (!image.size) body.delete('image')
    setBusy(true)
    try { const saved = await api<Benefit>(benefitPath(providerId, benefit?.id), { method: benefit ? 'PATCH' : 'POST', body }); if (current()) onSaved(saved) }
    catch (failure) { if (current()) setError(messageOf(failure)) }
    finally { if (current()) setBusy(false) }
  }
  return <form className="workspace-form workspace-panel" onSubmit={event => void save(event)}><h2>{benefit ? 'Editar beneficio' : 'Crear un beneficio'}</h2><p>{benefit?.status === 'PUBLISHED' ? 'Si modificás este beneficio publicado, volverá a borrador para revisión.' : 'Guardaremos tu propuesta como borrador para revisión de la red.'}</p><div className="workspace-form-grid"><label className="workspace-wide">Título<input name="title" required maxLength={200} defaultValue={benefit?.title ?? ''} /></label><label className="workspace-wide">Descripción<textarea name="description" required rows={4} defaultValue={benefit?.description ?? ''} /></label><label className="workspace-wide">Condiciones<textarea name="conditions" rows={3} defaultValue={benefit?.conditions ?? ''} /></label><label>Válido desde<input type="date" name="valid_from" defaultValue={benefit?.valid_from ?? ''} /></label><label>Válido hasta<input type="date" name="valid_until" defaultValue={benefit?.valid_until ?? ''} /></label><ImageField /></div><Feedback error={error} /><div className="workspace-actions"><button className="button button-orange" disabled={busy}>{busy ? 'Guardando…' : 'Guardar borrador'}</button><button type="button" className="button button-ghost" onClick={onCancel}>Cancelar</button></div></form>
}

function ImageField() { return <label className="workspace-wide">Imagen<input name="image" type="file" accept="image/jpeg,image/png,image/webp" /><small>JPG, PNG o WebP. Si no elegís un archivo se conserva la imagen actual.</small></label> }
