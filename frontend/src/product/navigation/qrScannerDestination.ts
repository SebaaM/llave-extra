const QR_PATH = /^\/(consumo|referencia)#token=[A-Za-z0-9_.:-]{1,2048}$/

export function scanDestination(value: string, origin = window.location.origin): string | null {
  const link = value.trim()
  if (!link.startsWith(origin)) return null
  const destination = link.slice(origin.length)
  return QR_PATH.test(destination) ? destination : null
}
