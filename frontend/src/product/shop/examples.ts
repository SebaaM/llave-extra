// Inventario ilustrativo: no representa productos publicados, stock ni precios del servidor.
export type ProductShape = 'penguin' | 'mountain' | 'lighthouse' | 'planter' | 'keyring' | 'holder'
export type ShopExample = {
  slug: string
  name: string
  category: 'Recuerdos' | 'Para tu casa' | 'Accesorios'
  description: string
  price: number
  credits: number
  shape: ProductShape
  color: string
  background: string
  dimensions: string
}

export const shopExamples: readonly ShopExample[] = [
  { slug: 'pinguino-del-sur', name: 'Pingüino del sur', category: 'Recuerdos', description: 'Un pequeño compañero de escritorio inspirado en la fauna del fin del mundo.', price: 8500, credits: 4000, shape: 'penguin', color: '#205c60', background: '#e0e9e5', dimensions: '8 × 5 × 5 cm' },
  { slug: 'faro-del-beagle', name: 'Faro del Beagle', category: 'Recuerdos', description: 'Una versión en miniatura del paisaje que te acompaña al navegar el canal.', price: 12000, credits: 6000, shape: 'lighthouse', color: '#c65b3e', background: '#f2e4d7', dimensions: '14 × 6 × 6 cm' },
  { slug: 'maceta-montana', name: 'Maceta montaña', category: 'Para tu casa', description: 'Relieves y líneas geométricas para darle un rincón patagónico a tu espacio.', price: 16000, credits: 8000, shape: 'planter', color: '#8d9d7d', background: '#e8ebdf', dimensions: '10 × 10 × 9 cm' },
  { slug: 'llavero-fin-del-mundo', name: 'Llavero fin del mundo', category: 'Accesorios', description: 'Un recuerdo liviano para llevar un poquito de Ushuaia a donde vayas.', price: 4500, credits: 2000, shape: 'keyring', color: '#d87535', background: '#f5eadb', dimensions: '5 × 4 × 0,6 cm' },
  { slug: 'cordillera-miniatura', name: 'Cordillera en miniatura', category: 'Recuerdos', description: 'Una silueta de montañas para recordar esos paisajes que no entran en una foto.', price: 11000, credits: 5000, shape: 'mountain', color: '#5c7b88', background: '#e2e9ed', dimensions: '15 × 5 × 7 cm' },
  { slug: 'soporte-bosque', name: 'Soporte bosque', category: 'Accesorios', description: 'Un apoyo para tu celular con formas simples y un color inspirado en los bosques fueguinos.', price: 9500, credits: 4500, shape: 'holder', color: '#556d58', background: '#e4e7dc', dimensions: '9 × 8 × 10 cm' },
  { slug: 'pinguino-nieve', name: 'Pingüino nieve', category: 'Recuerdos', description: 'La versión clara de nuestro compañero austral, para sumar a tu colección.', price: 8500, credits: 4000, shape: 'penguin', color: '#70858c', background: '#e9edef', dimensions: '8 × 5 × 5 cm' },
  { slug: 'maceta-atardecer', name: 'Maceta atardecer', category: 'Para tu casa', description: 'Una pieza de líneas facetadas y tonos cálidos para decorar tu lugar favorito.', price: 16000, credits: 8000, shape: 'planter', color: '#c37861', background: '#f0e2dc', dimensions: '10 × 10 × 9 cm' },
  { slug: 'llavero-beagle', name: 'Llavero Beagle', category: 'Accesorios', description: 'Una pequeña silueta de montaña en los colores fríos del canal.', price: 4500, credits: 2000, shape: 'keyring', color: '#477a89', background: '#dfe9eb', dimensions: '5 × 4 × 0,6 cm' },
]

export const shopCategories = ['Todos', 'Recuerdos', 'Para tu casa', 'Accesorios'] as const
export const formatPesos = (value: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(value)
export const formatCredits = (value: number) => `${value.toLocaleString('es-AR')} créditos`
export const searchable = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-AR')
