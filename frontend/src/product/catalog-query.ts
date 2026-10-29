export type CatalogQuery = { search: string; category: string; page: number }

export function readCatalogQuery(search: string): CatalogQuery {
  const params = new URLSearchParams(search)
  const page = Number(params.get('page') ?? '1')
  return {
    search: params.get('search') ?? '',
    category: params.get('category') ?? '',
    page: Number.isSafeInteger(page) && page >= 1 ? page : 1,
  }
}

export function catalogHref(query: CatalogQuery): string {
  const params = new URLSearchParams()
  if (query.search) params.set('search', query.search)
  if (query.category) params.set('category', query.category)
  if (query.page > 1) params.set('page', String(query.page))
  const search = params.toString()
  return `/beneficios${search ? `?${search}` : ''}`
}
