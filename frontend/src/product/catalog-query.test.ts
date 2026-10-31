import { describe, expect, it } from 'vitest'
import { catalogHref, readCatalogQuery } from './catalog-query'

describe('consulta pública del catálogo', () => {
  it('lee enlaces directos sin recortar la categoría recibida', () => {
    expect(readCatalogQuery('?search=puerto&category=+Comida+&page=3')).toEqual({ search: 'puerto', category: ' Comida ', page: 3 })
  })
  it.each(['0', '-2', '1.5', 'no', 'Infinity', '9007199254740992'])('recupera la página inválida %s en página 1', page => {
    expect(readCatalogQuery(`?page=${page}`).page).toBe(1)
  })
  it('genera enlaces públicos reproducibles sin parámetros ajenos', () => {
    const query = { search: 'té & café', category: ' Comida ', page: 2 }
    expect(readCatalogQuery(new URL(catalogHref(query), 'https://ejemplo.test').search)).toEqual(query)
    expect(catalogHref({ search: '', category: '', page: 1 })).toBe('/beneficios')
  })
})
