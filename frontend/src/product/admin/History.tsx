import { ProductLink } from '../navigation'
import { auditActionLabel, fieldLabels, orderHistories } from './data'
import { formatValue } from './formatValue'
import type { Page, Row } from './types'

export function HistoryTable({ rows, columns }: { rows: readonly Row[]; columns: readonly string[] }) {
  if (!rows.length) return <p>Sin registros.</p>
  return <div className="admin-table-scroll"><table className="admin-table"><thead><tr>{columns.map(name => <th scope="col" key={name}>{fieldLabels[name]}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={String(row.id ?? index)}>{columns.map(name => <td key={name} data-label={fieldLabels[name]}>{name === 'action' ? auditActionLabel(row[name]) : formatValue(row[name])}</td>)}</tr>)}</tbody></table></div>
}

export function WalletMovements({ movements, search, base }: { movements: Page<Row>; search: string; base: string }) {
  const query = new URLSearchParams(search)
  const page = Math.max(1, Number(query.get('page')) || 1)
  const go = (target: number) => {
    const next = new URLSearchParams(search)
    next.set('page', String(target))
    window.dispatchEvent(new CustomEvent('llave:navigate', { detail: `${base}?${next}` }))
  }
  return <section className="admin-panel"><h2>Movimientos de billetera</h2><p>{movements.count.toLocaleString('es-AR')} movimientos de solo lectura.</p><HistoryTable rows={movements.results} columns={['created_at', 'kind', 'delta', 'reference', 'source_entry']} /><nav className="admin-pagination" aria-label="Páginas de movimientos"><button disabled={!movements.previous} onClick={() => go(page - 1)}>← Anterior</button><span>Página {page}</span><button disabled={!movements.next} onClick={() => go(page + 1)}>Siguiente →</button></nav></section>
}

export function OrderHistory({ name, value }: { name: string; value: unknown }) {
  const rows = Array.isArray(value) ? value as Row[] : []
  return <div><h3>{fieldLabels[name]}</h3><HistoryTable rows={rows} columns={orderHistories[name]} />{name === 'payment_operations' && rows.length > 0 && <p><ProductLink href="/gestion/operaciones-pago">Gestionar operaciones de pago →</ProductLink></p>}</div>
}
