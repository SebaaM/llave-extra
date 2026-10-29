import type { ReactNode } from 'react'

export function EmptyState({ title, description, children }: { title: string; description: string; children?: ReactNode }) {
  return <section className="client-empty-state">
    <span className="client-empty-mark" aria-hidden="true">✦</span>
    <h2>{title}</h2>
    <p>{description}</p>
    {children && <div className="client-empty-actions">{children}</div>}
  </section>
}
