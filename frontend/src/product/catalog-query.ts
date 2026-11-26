export type CatalogQuery = { search: string; category: string; page: number; provider?: string }

export function readCatalogQuery(search: string): CatalogQuery {
  const params = new URLSearchParams(search)
  const page = Number(params.get('page') ?? '1')
  const provider = params.get('provider')
  return {
    search: params.get('search') ?? '',
    category: params.get('category') ?? '',
    page: Number.isSafeInteger(page) && page >= 1 ? page : 1,
    ...(provider ? { provider } : {}),
  }
}

export function catalogHref(query: CatalogQuery): string {
  const params = new URLSearchParams()
  if (query.search) params.set('search', query.search)
  if (query.category) params.set('category', query.category)
  if (query.provider) params.set('provider', query.provider)
  if (query.page > 1) params.set('page', String(query.page))
  const search = params.toString()
  return `/beneficios${search ? `?${search}` : ''}`
}
