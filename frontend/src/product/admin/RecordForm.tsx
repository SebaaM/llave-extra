import { useState } from 'react'
import type { FormEvent } from 'react'
import { ApiError, currentSessionVersion } from '../api'
import { ProductLink } from '../navigation'
import { messageOf } from '../shared'
import { adminApi } from './api'
import { useDirtyGuard } from './hooks'
import { ReferencePicker } from './ReferencePicker'
import type { Field, Resource, Row } from './types'
import { Status } from './UI'

function initial(fields: readonly Field[], data: Row | null) {
  return Object.fromEntries(fields.filter(field => field.kind !== 'file').map(field => [field.name, data?.[field.name] ?? (field.kind === 'boolean' ? false : field.kind === 'select' ? field.options?.[0]?.[0] ?? '' : '')])) as Record<string, unknown>
}
export function RecordForm({ resource, data, back, onSaved, onReload }: { resource: Resource; data: Row | null; back: string; onSaved: (row: Row) => void; onReload?: () => Promise<Row> }) {
  const fields = (resource.fields ?? []).filter(field => data ? !field.createOnly : !field.editOnly)
  const [values, setValues] = useState(() => initial(fields, data))
  const [baseline, setBaseline] = useState(() => initial(fields, data))
  const [baselineVersion, setBaselineVersion] = useState(data?.version)
  const [file, setFile] = useState<File | null>(null)
  const [removeImage, setRemoveImage] = useState(false)
  const [fileReset, setFileReset] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [conflict, setConflict] = useState(false)
  const [saved, setSaved] = useState(false)
  const dirty = JSON.stringify(values) !== JSON.stringify(baseline) || file !== null || removeImage
  const stale = Boolean(data && data.version !== baselineVersion)
  useDirtyGuard(dirty)
  const reloadCurrent = async () => {
    if (!onReload || !window.confirm('Se perderán los cambios del formulario. ¿Querés cargar la ficha actual?')) return
    const version = currentSessionVersion()
    try {
      const row = await onReload()
      if (version !== currentSessionVersion()) return
      const next = initial(fields, row)
      setValues(next); setBaseline(next); setBaselineVersion(row.version); setFile(null); setRemoveImage(false); setFileReset(value => value + 1); setConflict(false); setError('')
    } catch (cause) { if (version === currentSessionVersion()) setError(messageOf(cause)) }
  }
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (saving || stale) return
    const body: Record<string, unknown> = data ? { version: baselineVersion } : {}
    for (const field of fields) {
      if (field.kind === 'file') continue
      if (data && JSON.stringify(values[field.name]) === JSON.stringify(baseline[field.name])) continue
      if (!data && values[field.name] === '' && !field.required) continue
      body[field.name] = values[field.name] === '' && (field.kind === 'date' || field.kind === 'number') ? null : values[field.name]
    }
    if (file) body.image = file
    else if (removeImage) body.image = null
    const multipart = Boolean(file)
    const payload = multipart ? new FormData() : body
    if (multipart) for (const [key, value] of Object.entries(body)) {
      if (value instanceof File) (payload as FormData).append(key, value)
      else if (value !== undefined && value !== null) (payload as FormData).append(key, String(value))
      else (payload as FormData).append(key, '')
    }
    const version = currentSessionVersion()
    setSaving(true); setError(''); setConflict(false); setSaved(false)
    try {
      const row = await adminApi<Row>(data ? `${resource.key}/${data.id}/` : `${resource.key}/`, { method: data ? 'PATCH' : 'POST', body: payload })
      if (version !== currentSessionVersion()) return
      const next = initial(fields, row)
      setBaseline(next); setValues(next); setBaselineVersion(row.version); setFile(null); setRemoveImage(false); setFileReset(value => value + 1); setSaved(true)
      onSaved(row)
    } catch (cause) {
      if (version !== currentSessionVersion()) return
      setConflict(cause instanceof ApiError && cause.status === 409)
      setError(cause instanceof ApiError && cause.status === 409 ? 'Otra persona cambió este registro. Tus datos siguen en el formulario; recargá la ficha y compará antes de guardar.' : messageOf(cause))
    } finally { if (version === currentSessionVersion()) setSaving(false) }
  }
  return <form className="admin-panel admin-form" onSubmit={submit}>
    <div className="admin-form-heading"><div><p className="eyebrow">{data ? 'EDITAR REGISTRO' : 'NUEVO REGISTRO'}</p><h2>{data ? `Editar ${resource.singular.toLowerCase()}` : `Nuevo ${resource.singular.toLowerCase()}`}</h2></div><ProductLink href={back}>Cancelar</ProductLink></div>
    <div className="admin-form-grid">{fields.map(field => {
      if (field.kind === 'lookup' && field.lookup) return <div key={field.name} className="admin-field"><span>{field.label}</span><ReferencePicker label={field.label} kind={field.lookup} query={field.lookupQuery} value={String(values[field.name] ?? '')} onChange={value => setValues(current => ({ ...current, [field.name]: field.lookup === 'users' ? Number(value) : value }))} /></div>
      if (field.kind === 'file') return <div key={field.name} className="admin-field"><span>{field.label}</span><input key={fileReset} type="file" accept="image/png,image/jpeg,image/webp" disabled={removeImage} onChange={event => { setFile(event.target.files?.[0] ?? null); setRemoveImage(false) }} />{Boolean(data?.image_url) && <label className="admin-check"><input type="checkbox" checked={removeImage} onChange={event => { setRemoveImage(event.target.checked); if (event.target.checked) { setFile(null); setFileReset(value => value + 1) } }} />Quitar imagen actual</label>}</div>
      return <label key={field.name} className={field.kind === 'textarea' ? 'admin-wide' : ''}>{field.label}
      {field.kind === 'textarea' ? <textarea rows={4} value={String(values[field.name] ?? '')} onChange={event => setValues(current => ({ ...current, [field.name]: event.target.value }))} />
        : field.kind === 'select' ? <select value={String(values[field.name] ?? field.options?.[0]?.[0] ?? '')} onChange={event => setValues(current => ({ ...current, [field.name]: event.target.value }))}>{field.options?.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select>
          : field.kind === 'boolean' ? <span className="admin-check"><input type="checkbox" checked={Boolean(values[field.name])} onChange={event => setValues(current => ({ ...current, [field.name]: event.target.checked }))} />{values[field.name] ? 'Sí' : 'No'}</span>
            : <input type={field.kind ?? 'text'} step={field.kind === 'number' ? field.precision === 2 ? '0.01' : '1' : undefined} min={field.kind === 'number' ? 0 : undefined} required={field.required} value={String(values[field.name] ?? '')} onChange={event => setValues(current => ({ ...current, [field.name]: field.kind === 'number' && field.precision !== 2 ? (event.target.value === '' ? '' : Number(event.target.value)) : event.target.value }))} />}
    </label>})}</div>
    {stale && <Status error>La ficha cambió mientras editabas. Tus datos siguen aquí; compará con la versión actual antes de guardar.</Status>}{stale && <button type="button" className="button button-ghost" onClick={() => void reloadCurrent()}>Descartar cambios y cargar ficha actual</button>}
    {error && <Status error>{error}</Status>}{conflict && !stale && <button type="button" className="button button-ghost" onClick={() => void reloadCurrent()}>Descartar cambios y cargar ficha actual</button>}{saved && <Status>Los cambios se guardaron.</Status>}
    <div className="admin-actions"><button className="button button-orange" disabled={saving || stale || (Boolean(data) && !dirty)}>{saving ? 'Guardando…' : 'Guardar cambios'}</button>{data && !dirty && <span className="admin-muted">No hay cambios sin guardar.</span>}</div>
  </form>
}
