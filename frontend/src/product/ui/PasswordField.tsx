import { useState } from 'react'

export function PasswordField({ id, label, value, onChange, autoComplete, disabled }: { id: string; label: string; value: string; onChange: (value: string) => void; autoComplete: 'current-password' | 'new-password'; disabled?: boolean }) {
  const [visible, setVisible] = useState(false)
  return <div className="client-password-field">
    <label htmlFor={id}>{label}</label>
    <div className="client-password-control">
      <input id={id} type={visible ? 'text' : 'password'} autoComplete={autoComplete} required value={value} disabled={disabled} onChange={event => onChange(event.target.value)} />
      <button type="button" disabled={disabled} aria-controls={id} aria-pressed={visible} onClick={() => setVisible(current => !current)}>{visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}</button>
    </div>
  </div>
}
