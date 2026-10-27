import { Status } from './UI'
import type { FormErrors } from './validation'

export function FieldError({ errors, name, prefix }: { errors: FormErrors; name: string; prefix: string }) {
  return errors.fields[name] ? <small className="admin-field-error" id={`${prefix}-${name}-error`}>{errors.fields[name].join(' ')}</small> : null
}
export function ErrorSummary({ errors }: { errors: FormErrors }) {
  return errors.global.length || Object.keys(errors.fields).length ? <Status error>{errors.global.join(' ') || 'Revisá los campos indicados antes de guardar.'}</Status> : null
}
