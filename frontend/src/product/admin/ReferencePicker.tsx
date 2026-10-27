import { useCallback, useEffect, useState } from 'react'
import type { AriaAttributes } from 'react'
import { currentSessionVersion } from '../api'
import { messageOf } from '../shared'
import { collection, detail } from './api'
import type { Row } from './types'

type Kind = 'users' | 'providers' | 'benefits'
function labelFor(kind: Kind, row: Row) {
  return kind === 'users' ? `${String(row.email)} · ${String(row.role) === 'PROVIDER' ? 'Prestador' : String(row.role) === 'COLLABORATOR' ? 'Colaborador' : 'Cliente'}` : kind === 'benefits' ? `${String(row.title)} · ${String(row.provider_name ?? 'Prestador')}` : `${String(row.name)} · ${String(row.category ?? '')}`
}
export function ReferencePicker({ kind, query = '', value, onChange, selectedIds, disabled = false, label, ...accessibility }: { kind: Kind; query?: string; value: string; onChange: (value: string) => void; selectedIds?: readonly (string | number)[]; disabled?: boolean; label: string } & Pick<AriaAttributes, 'aria-invalid' | 'aria-describedby'>) {
  const [term, setTerm] = useState('')
  const [options, setOptions] = useState<Row[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const load = useCallback(async (search: string) => {
    setLoading(true); setError('')
    const version = currentSessionVersion()
    try {
      let rows: Row[]
      if (selectedIds) rows = await Promise.all(selectedIds.map(id => detail(kind, String(id), new AbortController().signal)))
      else {
        const params = new URLSearchParams(query)
        params.set('search', search)
        params.set('page_size', '100')
        rows = (await collection(kind, params.toString(), new AbortController().signal)).results
      }
      if (version === currentSessionVersion()) setOptions(rows)
    } catch (cause) { if (version === currentSessionVersion()) setError(messageOf(cause)) }
    finally { if (version === currentSessionVersion()) setLoading(false) }
  }, [kind, query, selectedIds])
  useEffect(() => { queueMicrotask(() => void load('')) }, [load])
  return <span className="admin-reference-picker"><span className="admin-reference-search"><input aria-label={`Buscar ${label.toLowerCase()}`} value={term} onChange={event => setTerm(event.target.value)} placeholder={kind === 'users' ? 'Buscar por email' : kind === 'benefits' ? 'Buscar beneficio' : 'Buscar prestador'} disabled={disabled || Boolean(selectedIds)} /><button type="button" onClick={() => void load(term.trim())} disabled={disabled || loading || Boolean(selectedIds)}>{loading ? 'Buscando…' : 'Buscar'}</button></span><select {...accessibility} aria-label={label} value={value} onChange={event => onChange(event.target.value)} disabled={disabled} required><option value="">Elegí una opción</option>{options.map(row => <option key={String(row.id)} value={String(row.id)}>{labelFor(kind, row)}</option>)}</select>{error && <small role="alert">{error}</small>}{!loading && !error && options.length === 0 && <small>{selectedIds ? 'No hay asignaciones vigentes.' : 'No hay resultados para esta búsqueda.'}</small>}</span>
}
