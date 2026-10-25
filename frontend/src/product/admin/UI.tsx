import type { ReactNode } from 'react'
import { ProductLink } from '../navigation'
import { fieldLabels } from './data'
import { formatValue } from './formatValue'

export function Status({ children, error = false }: { children: ReactNode; error?: boolean }) { return <p className={`admin-feedback${error ? ' is-error' : ''}`} role={error ? 'alert' : 'status'}>{children}</p> }
export function LoadState({ loading, error, retry }: { loading: boolean; error: string; retry: () => void }) {
  if (loading) return <section className="admin-panel" role="status">Cargando información…</section>
  if (error) return <section className="admin-panel"><Status error>{error}</Status><button className="button button-dark" onClick={retry}>Volver a intentar</button></section>
  return null
}
export function DetailFields({ data, names }: { data: Record<string, unknown>; names: readonly string[] }) {
  return <dl className="admin-details">{names.map(name => <div key={name}><dt>{fieldLabels[name] ?? name.replaceAll('_', ' ')}</dt><dd>{formatValue(data[name])}</dd></div>)}</dl>
}
export function BackLink({ href, children = 'Volver al listado' }: { href: string; children?: ReactNode }) { return <ProductLink className="admin-back" href={href}>← {children}</ProductLink> }
