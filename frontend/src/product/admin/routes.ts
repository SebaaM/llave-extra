export const routes: Record<string, string> = { users: 'usuarios', providers: 'prestadores', benefits: 'beneficios', collaborators: 'colaboradores', consumptions: 'consumos', wallets: 'billeteras', adjustments: 'ajustes', products: 'productos', orders: 'pedidos', cancellations: 'cancelaciones', 'credit-rules': 'reglas-creditos', 'stock-adjustments': 'movimientos-stock', 'payment-operations': 'operaciones-pago' }
export function routeFor(key: string) { return routes[key] }
export function keyForRoute(route: string) { return Object.entries(routes).find(([, value]) => value === route)?.[0] }
