export const isPublicHome = (path: string) => path === '/' || path === '/index.html'

export const isPublicShowcase = (path: string) =>
  isPublicHome(path) || path === '/beneficios' || path.startsWith('/beneficios/')
