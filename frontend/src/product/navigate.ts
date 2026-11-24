export function navigate(path: string) {
  window.dispatchEvent(new CustomEvent('llave:navigate', { detail: path }))
}
