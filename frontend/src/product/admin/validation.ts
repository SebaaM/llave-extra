import { ApiError } from '../api'
import { messageOf } from '../shared'

export type FormErrors = { fields: Record<string, string[]>; global: string[] }
export const emptyErrors = (): FormErrors => ({ fields: {}, global: [] })

// Only the fields belonging to this form and explicit global errors are rendered.
// Never walk arbitrary nested response data (which may belong to another contract).
export function formErrors(cause: unknown, names: readonly string[]): FormErrors {
  const errors = emptyErrors()
  if (cause instanceof ApiError && cause.status === 400 && cause.payload && typeof cause.payload === 'object') {
    for (const [name, value] of Object.entries(cause.payload)) {
      const messages = (Array.isArray(value) ? value : [value]).filter((item): item is string => typeof item === 'string')
      if (names.includes(name) && messages.length) errors.fields[name] = messages
      else if (['non_field_errors', '__all__', 'detail'].includes(name)) errors.global.push(...messages)
    }
    if (Object.keys(errors.fields).length || errors.global.length) return errors
    errors.global.push('Revisá los datos del formulario. No se pudieron guardar los cambios.')
  } else errors.global.push(messageOf(cause))
  return errors
}
export function fieldErrorProps(errors: FormErrors, name: string, prefix: string) {
  return { 'aria-invalid': errors.fields[name] ? true as const : undefined, 'aria-describedby': errors.fields[name] ? `${prefix}-${name}-error` : undefined }
}
