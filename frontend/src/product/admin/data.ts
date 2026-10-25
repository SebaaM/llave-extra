import type { Field, Resource } from './types'

export const roleOptions = [['TOURIST', 'Cliente'], ['COLLABORATOR', 'Colaborador'], ['PROVIDER', 'Prestador'], ['ADMIN', 'Administrador']] as const
export const statusOptions = [['DRAFT', 'Borrador'], ['PUBLISHED', 'Publicado']] as const
const yesNo = [['true', 'Sí'], ['false', 'No']] as const
const networkFields: Field[] = [
  { name: 'network_title', label: 'Título de la red' },
  { name: 'network_layout', label: 'Distribución', kind: 'select', options: [['RADIAL', 'Radial'], ['ORBIT', 'Órbita']] },
  { name: 'network_theme', label: 'Tema', kind: 'select', options: [['SAND', 'Arena'], ['OCEAN', 'Océano']] },
  { name: 'network_background', label: 'Fondo', kind: 'select', options: [['HARBOR', 'Puerto'], ['BEAGLE', 'Canal Beagle']] },
  { name: 'network_page_size', label: 'Prestadores por página', kind: 'number' },
  { name: 'network_interval_seconds', label: 'Intervalo de la red (segundos)', kind: 'number' },
]
const media: Field = { name: 'image', label: 'Imagen', kind: 'file' }
const providerFields: Field[] = [
  { name: 'slug', label: 'Identificador para la URL', required: true }, { name: 'name', label: 'Nombre', required: true },
  { name: 'category', label: 'Categoría', required: true }, { name: 'description', label: 'Descripción', kind: 'textarea' },
  { name: 'address', label: 'Dirección' }, { name: 'hours', label: 'Horarios' }, { name: 'contact', label: 'Contacto' },
  { name: 'map_url', label: 'Enlace al mapa', kind: 'url' }, { name: 'website', label: 'Sitio web', kind: 'url' }, media,
  { name: 'status', label: 'Publicación', kind: 'select', options: statusOptions },
]
const benefitFields: Field[] = [
  { name: 'provider', label: 'Prestador', kind: 'lookup', lookup: 'providers', required: true, createOnly: true },
  { name: 'title', label: 'Título', required: true }, { name: 'description', label: 'Descripción', kind: 'textarea' },
  { name: 'conditions', label: 'Condiciones', kind: 'textarea' },
  { name: 'valid_from', label: 'Válido desde', kind: 'date' }, { name: 'valid_until', label: 'Válido hasta', kind: 'date' }, media,
  { name: 'status', label: 'Publicación', kind: 'select', options: statusOptions },
]
export const resources: Resource[] = [
  { key: 'users', title: 'Usuarios', singular: 'Usuario', columns: ['email', 'role', 'is_active', 'email_verified'], fields: [
    { name: 'email', label: 'Email', kind: 'email', required: true, createOnly: true }, { name: 'first_name', label: 'Nombre' },
    { name: 'last_name', label: 'Apellido' }, { name: 'role', label: 'Rol', kind: 'select', options: roleOptions.slice(0, 3), createOnly: true },
    { name: 'is_active', label: 'Cuenta activa', kind: 'boolean', editOnly: true },
  ], filters: [{ name: 'role', label: 'Rol', options: roleOptions }, { name: 'is_active', label: 'Cuenta activa', options: yesNo }, { name: 'email_verified', label: 'Email verificado', options: yesNo }] },
  { key: 'providers', title: 'Prestadores', singular: 'Prestador', columns: ['name', 'category', 'status', 'user_ids'], fields: providerFields, filters: [{ name: 'status', label: 'Estado', options: statusOptions }], detail: ['description', 'address', 'hours', 'contact', 'website', 'demo', 'provenance', 'user_ids', 'image_url'] },
  { key: 'benefits', title: 'Beneficios', singular: 'Beneficio', columns: ['title', 'provider_name', 'status', 'valid_until'], fields: benefitFields, filters: [{ name: 'status', label: 'Estado', options: statusOptions }, { name: 'current', label: 'Vigencia', options: [['true', 'Vigente']] }], detail: ['description', 'conditions', 'valid_from', 'valid_until', 'demo', 'provenance', 'image_url'] },
  { key: 'collaborators', title: 'Colaboradores', singular: 'Colaborador', columns: ['user_email', 'enabled', 'benefit_ids'], fields: [{ name: 'user', label: 'Usuario Colaborador', kind: 'lookup', lookup: 'users', lookupQuery: 'role=COLLABORATOR&is_active=true', createOnly: true, required: true }, ...networkFields], filters: [{ name: 'enabled', label: 'Habilitado', options: yesNo }, { name: 'user_active', label: 'Usuario activo', options: yesNo }], detail: ['benefit_ids', ...networkFields.map(field => field.name)] },
  { key: 'consumptions', title: 'Consumos', singular: 'Consumo', columns: ['tourist_email', 'provider_name', 'award', 'state', 'created_at'], filters: [{ name: 'state', label: 'Estado', options: [['VALID', 'Válido'], ['ANNULLED', 'Anulado']] }], detail: ['collaborator_email', 'rule_snapshot', 'annulled_at', 'annul_reason'] },
  { key: 'wallets', title: 'Billeteras', singular: 'Billetera', columns: ['tourist_email', 'balance', 'redemptions_frozen'], detail: ['movements'] },
  { key: 'adjustments', title: 'Ajustes de créditos', singular: 'Ajuste', columns: ['tourist_email', 'shortfall', 'resolved_at', 'resolution'], filters: [{ name: 'resolved', label: 'Resolución', options: [['false', 'Pendiente'], ['true', 'Resuelto']] }], detail: ['consumption', 'funded_amount', 'forgiven_amount', 'resolution_reason'] },
  { key: 'products', title: 'Productos', singular: 'Producto', columns: ['name', 'active', 'stock', 'price_money', 'price_credits'], fields: [
    { name: 'name', label: 'Nombre', required: true }, { name: 'description', label: 'Descripción', kind: 'textarea' }, media,
    { name: 'active', label: 'Activo', kind: 'boolean' }, { name: 'price_money', label: 'Precio en pesos', kind: 'number' },
    { name: 'price_credits', label: 'Precio en créditos', kind: 'number' },
  ], filters: [{ name: 'active', label: 'Activo', options: yesNo }, { name: 'stock', label: 'Stock', options: [['0', 'Sin stock']] }], detail: ['description', 'demo', 'image_url'] },
  { key: 'orders', title: 'Pedidos', singular: 'Pedido', columns: ['customer_email', 'mode', 'state', 'created_at'], filters: [{ name: 'state', label: 'Estado', options: [['PENDING_PAYMENT', 'Pendiente de pago'], ['PAID', 'Pagado'], ['READY', 'Preparado'], ['PICKED_UP', 'Entregado'], ['CANCELED', 'Cancelado'], ['EXPIRED', 'Vencido'], ['PAYMENT_REVIEW', 'Pago en revisión'], ['REFUND_PENDING', 'Reintegro pendiente'], ['REFUNDED', 'Reintegrado']] }, { name: 'mode', label: 'Medio', options: [['CREDITS', 'Créditos'], ['MONEY', 'Dinero']] }], detail: ['total_money', 'total_credits', 'pickup_snapshot', 'reserved_until', 'payment_provider', 'payment_confirmed', 'lines', 'cancellations', 'payment_operations', 'audit'] },
  { key: 'cancellations', title: 'Cancelaciones', singular: 'Cancelación', columns: ['customer_email', 'reason', 'state', 'created_at'], filters: [{ name: 'state', label: 'Estado', options: [['OPEN', 'Abierta'], ['APPROVED', 'Aprobada'], ['REJECTED', 'Rechazada']] }], detail: ['resolution_reason', 'resolved_at', 'resolved_by'] },
  { key: 'credit-rules', title: 'Reglas de créditos', singular: 'Regla', columns: ['provider_name', 'reward'], fields: [{ name: 'provider', label: 'Prestador', kind: 'lookup', lookup: 'providers', required: true, createOnly: true }, { name: 'reward', label: 'Créditos por visita', kind: 'number', required: true }], detail: ['provider'] },
  { key: 'stock-adjustments', title: 'Movimientos de stock', singular: 'Movimiento', columns: ['product_name', 'delta', 'resulting_stock', 'reason', 'created_at'] },
  { key: 'payment-operations', title: 'Operaciones de pago', singular: 'Operación', columns: ['kind', 'state', 'attempts', 'created_at'], filters: [{ name: 'state', label: 'Estado', options: [['BLOCKED', 'Bloqueada'], ['PENDING', 'Pendiente'], ['RUNNING', 'En proceso'], ['DONE', 'Completada']] }, { name: 'kind', label: 'Tipo', options: [['CREATE', 'Creación'], ['REFUND', 'Reintegro'], ['RECONCILE', 'Consulta']] }], detail: ['order', 'available_at', 'last_code'] },
]
export const resourceByKey = new Map(resources.map(resource => [resource.key, resource]))
export const fieldLabels: Record<string, string> = Object.assign(Object.fromEntries(resources.flatMap(resource => [...resource.columns, ...(resource.detail ?? [])].map(name => [name, ({
  email: 'Email', role: 'Rol', is_active: 'Activo', email_verified: 'Email verificado', name: 'Nombre', category: 'Categoría', status: 'Estado', user_ids: 'Usuarios asignados',
  title: 'Título', provider_name: 'Prestador', valid_until: 'Válido hasta', enabled: 'Habilitado', benefit_ids: 'Beneficios elegidos', user_email: 'Usuario',
  tourist_email: 'Cliente', award: 'Créditos otorgados', state: 'Estado', created_at: 'Fecha', balance: 'Saldo', redemptions_frozen: 'Canjes suspendidos',
  shortfall: 'Faltante', resolved_at: 'Resuelto el', resolution: 'Resolución', active: 'Activo', stock: 'Stock', price_money: 'Precio en pesos', price_credits: 'Precio en créditos',
  customer_email: 'Cliente', mode: 'Pago', reason: 'Motivo', reward: 'Recompensa', delta: 'Variación', resulting_stock: 'Stock resultante', kind: 'Tipo', attempts: 'Intentos',
} as Record<string, string>)[name] ?? name]))), { actor_email: 'Actor', action: 'Acción', resource: 'Recurso' })
export const stateLabels: Record<string, string> = { TOURIST: 'Cliente', COLLABORATOR: 'Colaborador', PROVIDER: 'Prestador', ADMIN: 'Administrador', DRAFT: 'Borrador', PUBLISHED: 'Publicado', VALID: 'Válido', ANNULLED: 'Anulado', PENDING_PAYMENT: 'Pendiente de pago', PAID: 'Pagado', READY: 'Preparado', PICKED_UP: 'Entregado', CANCELED: 'Cancelado', EXPIRED: 'Vencido', PAYMENT_REVIEW: 'Pago en revisión', REFUND_PENDING: 'Reintegro pendiente', REFUNDED: 'Reintegrado', OPEN: 'Abierta', APPROVED: 'Aprobada', REJECTED: 'Rechazada', CREDITS: 'Créditos', MONEY: 'Dinero', BLOCKED: 'Bloqueada', PENDING: 'Pendiente', RUNNING: 'En proceso', DONE: 'Completada', SENT: 'Enviada', FAILED: 'Fallida', REVERSAL: 'Reversión', FUNDED: 'Cubierto', FORGIVEN: 'Condonado', EARN: 'Acreditación', REDEEM: 'Canje', ADJUSTMENT: 'Ajuste', CREATE: 'Creación', REFUND: 'Reintegro', RECONCILE: 'Consulta' }
const auditActions: Record<string, string> = {
  'settings.update': 'Configuración actualizada', 'users.invite': 'Invitación solicitada',
  'providers.assign-user': 'Usuario asignado al prestador', 'providers.unassign-user': 'Usuario desvinculado del prestador',
  'providers.set-pin': 'PIN actualizado', 'providers.rotate-qr': 'QR del prestador renovado',
  'collaborators.enable': 'Colaborador habilitado', 'collaborators.disable': 'Colaborador deshabilitado',
  'collaborators.rotate-qr': 'QR del colaborador renovado', 'collaborators.add-benefit': 'Beneficio agregado a carpeta',
  'collaborators.remove-benefit': 'Beneficio quitado de carpeta', 'consumptions.annul': 'Consumo anulado',
  'adjustments.resolve': 'Ajuste de créditos resuelto', 'products.adjust-stock': 'Stock ajustado',
  'orders.prepare': 'Pedido preparado', 'orders.deliver': 'Pedido entregado', 'orders.refund': 'Reintegro solicitado',
  'cancellations.approve': 'Cancelación aprobada', 'cancellations.reject': 'Cancelación rechazada',
  'payment-operations.retry': 'Operación de pago reprogramada', 'credit-rules.remove': 'Regla de créditos eliminada',
  CHECKOUT: 'Pedido creado', CANCELLATION_REQUESTED: 'Cancelación solicitada', CANCELLATION_APPROVED: 'Cancelación aprobada',
  CANCELLATION_REJECTED: 'Cancelación rechazada', REFUND_REQUESTED: 'Reintegro solicitado', PAYMENT_RETRY: 'Pago reprogramado',
}
const auditResources: Record<string, string> = {
  'settings.general': 'Configuración general', 'settings.catalog': 'Catálogo y red', 'settings.credits': 'Créditos', 'settings.shop': 'Tienda y retiro',
  users: 'Usuarios', providers: 'Prestadores', benefits: 'Beneficios', collaborators: 'Colaboradores', consumptions: 'Consumos',
  wallets: 'Billeteras', adjustments: 'Ajustes de créditos', products: 'Productos', orders: 'Pedidos', cancellations: 'Cancelaciones',
  'credit-rules': 'Reglas de créditos', 'stock-adjustments': 'Movimientos de stock', 'payment-operations': 'Operaciones de pago',
}
export function auditActionLabel(value: unknown) {
  const code = String(value ?? '')
  if (auditActions[code]) return auditActions[code]
  if (stateLabels[code]) return stateLabels[code]
  const match = /^(.*)\.(create|update)$/.exec(code)
  if (match) return `${auditResources[match[1]] ?? 'Registro'} ${match[2] === 'create' ? 'creado' : 'actualizado'}`
  return code.replace(/[._-]+/g, ' ').toLocaleLowerCase('es-AR').replace(/^./, letter => letter.toLocaleUpperCase('es-AR'))
}
export function auditResourceLabel(value: unknown) { const code = String(value ?? ''); return auditResources[code] ?? code.replace(/[._-]+/g, ' ') }
