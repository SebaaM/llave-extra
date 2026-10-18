function readFragmentAt(path: string) {
  if (window.location.pathname !== path) return null
  const value = new URLSearchParams(window.location.hash.slice(1)).get('token')
  if (value) window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}`)
  return value
}

export let referralToken: string | null = readFragmentAt('/referencia')
export let consumptionToken: string | null = readFragmentAt('/consumo')
export let verifyToken: string | null = readFragmentAt('/verificar-email')
export let resetToken: string | null = readFragmentAt('/restablecer-clave')

export function setReferralToken(value: string | null) { referralToken = value }
export function setConsumptionToken(value: string | null) { consumptionToken = value }
export function setVerifyToken(value: string | null) { verifyToken = value }
export function setResetToken(value: string | null) { resetToken = value }
