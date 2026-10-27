import type { ReactNode } from 'react'
import { auditActionLabel, auditResourceLabel, fieldLabels, stateLabels } from './data'

export function formatValue(value: unknown, field?: string): ReactNode {
  if (value === null || value === undefined || value === '') return '—'
  if ((field === 'rule_snapshot' || field === 'pickup_snapshot') && typeof value === 'object') {
    const data = value as Record<string, unknown>
    const names = field === 'rule_snapshot' ? ['source', 'amount', 'target_visits'] : ['name', 'address', 'hours']
    return <dl className="admin-nested">{names.filter(name => name in data).map(name => <div key={name}><dt>{fieldLabels[name]}</dt><dd>{formatValue(data[name], name)}</dd></div>)}</dl>
  }
  if (field === 'changed_fields' && Array.isArray(value)) return value.map(name => fieldLabels[String(name)] ?? 'Otro campo').join(', ')
  if (typeof value === 'boolean') return value ? 'Sí' : 'No'
  if (typeof value === 'string') {
    if (stateLabels[value]) return stateLabels[value]
    if (/^\d{4}-\d\d-\d\dT/.test(value)) return new Date(value).toLocaleString('es-AR')
    return value
  }
  if (typeof value === 'number') return value.toLocaleString('es-AR')
  if (Array.isArray(value)) return value.length ? <ul className="admin-inline-list">{value.map((item, index) => <li key={index}>{formatValue(item)}</li>)}</ul> : 'Sin registros'
  if (typeof value === 'object') return <dl className="admin-nested">{Object.entries(value).map(([key, item]) => <div key={key}><dt>{fieldLabels[key] ?? 'Información adicional'}</dt><dd>{key === 'action' ? auditActionLabel(item) : key === 'resource' ? auditResourceLabel(item) : formatValue(item, key)}</dd></div>)}</dl>
  return String(value)
}
