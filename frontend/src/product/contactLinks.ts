export function contactEmailHref(email: string) {
  const separator = email.lastIndexOf('@')
  if (separator < 1 || separator === email.length - 1) return undefined

  const localPart = encodeURIComponent(email.slice(0, separator))
  const domain = encodeURIComponent(email.slice(separator + 1))
  return `mailto:${localPart}@${domain}`
}
