import type { ReactNode } from 'react'

export function Empty({ title, text, children }: { title: string; text: string; children?: ReactNode }) { return <div className="workspace-empty"><span aria-hidden="true">✳</span><h2>{title}</h2><p>{text}</p>{children}</div> }
export function Feedback({ error = '', notice = '' }: { error?: string; notice?: string }) { return <>{error && <p className="workspace-feedback is-error" role="alert">{error}</p>}{notice && <p className="workspace-feedback" role="status">{notice}</p>}</> }
export function Stats({ items }: { items: [string, number][] }) { return <div className="workspace-stats">{items.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value.toLocaleString('es-AR')}</strong></div>)}</div> }
