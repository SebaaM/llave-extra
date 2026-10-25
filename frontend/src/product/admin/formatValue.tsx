import type { ReactNode } from 'react'
import { auditActionLabel, auditResourceLabel, fieldLabels, stateLabels } from './data'

export function formatValue(value: unknown): ReactNode {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'Sí' : 'No'
  if (typeof value === 'string') {
    if (stateLabels[value]) return stateLabels[value]
    if (/^\d{4}-\d\d-\d\dT/.test(value)) return new Date(value).toLocaleString('es-AR')
    return value
  }
  if (typeof value === 'number') return value.toLocaleString('es-AR')
  if (Array.isArray(value)) return value.length ? <ul className="admin-inline-list">{value.map((item, index) => <li key={index}>{formatValue(item)}</li>)}</ul> : 'Sin registros'
  if (typeof value === 'object') return <dl className="admin-nested">{Object.entries(value).map(([key, item]) => <div key={key}><dt>{fieldLabels[key] ?? key.replaceAll('_', ' ')}</dt><dd>{key === 'action' ? auditActionLabel(item) : key === 'resource' ? auditResourceLabel(item) : formatValue(item)}</dd></div>)}</dl>
  return String(value)
}
