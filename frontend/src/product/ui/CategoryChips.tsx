export function CategoryChips({ categories, value, onChange }: { categories: string[]; value: string; onChange: (value: string) => void }) {
  const unknown = Boolean(value) && !categories.includes(value)
  return <div className="client-category-chips" role="group" aria-label="Categorías de beneficios">
    <button type="button" aria-pressed={value === ''} onClick={() => onChange('')}>Todas las categorías</button>
    {categories.map(category => <button key={category} type="button" aria-pressed={value === category} onClick={() => onChange(category)}>{category}</button>)}
    {unknown && <button type="button" aria-pressed="true" onClick={() => onChange('')}>{value} (filtro guardado)</button>}
  </div>
}
