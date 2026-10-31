import { useState } from 'react'

export function PasswordField({ id, label, value, onChange, autoComplete, disabled, error }: { id: string; label: string; value: string; onChange: (value: string) => void; autoComplete: 'current-password' | 'new-password'; disabled?: boolean; error?: string }) {
  const [visible, setVisible] = useState(false)
  return <div className="client-password-field">
    <label htmlFor={id}>{label}</label>
    <div className="client-password-control">
      <input id={id} type={visible ? 'text' : 'password'} autoComplete={autoComplete} required value={value} disabled={disabled} aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : undefined} onChange={event => onChange(event.target.value)} />
      <button type="button" disabled={disabled} aria-controls={id} aria-pressed={visible} onClick={() => setVisible(current => !current)}>{visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}</button>
    </div>
    {error && <p id={`${id}-error`} className="form-error" role="alert">{error}</p>}
  </div>
}
