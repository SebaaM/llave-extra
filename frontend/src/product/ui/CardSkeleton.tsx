export function CardSkeleton({ count }: { count: number }) {
  return <div className="client-skeleton-grid" role="status">
    <span className="client-sr-only">Cargando beneficios…</span>
    {Array.from({ length: Math.max(0, Math.floor(count)) }, (_, index) => <div className="client-card-skeleton" key={index} aria-hidden="true">
      <div className="client-skeleton-photo" />
      <div className="client-skeleton-copy"><span /><span /><span /></div>
    </div>)}
  </div>
}
