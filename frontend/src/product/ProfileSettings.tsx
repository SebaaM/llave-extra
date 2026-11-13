import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { api, currentSessionVersion } from './api'
import type { User } from './api'
import { messageOf } from './shared'
import './profile-settings.css'

type Props = { user: User; notice: string; onResend: () => Promise<void> }
type PersonalDetails = { first_name: string; last_name: string; complete: boolean }
type BankDetails = { configured: boolean; cbu_masked: string | null; alias_masked: string | null }
type LoadResult<T> = { data: T; error?: never } | { data?: never; error: string }
const profilePath = '/api/v1/auth/profile/'
const bankPath = '/api/v1/auth/bank-details/'

function useAccountRequest() {
  const [version] = useState(currentSessionVersion)
  const alive = useRef(false)
  useEffect(() => {
    alive.current = true
    return () => { alive.current = false }
  }, [])
  return () => alive.current && version === currentSessionVersion()
}

function useAccountDetails<T>(path: string) {
  const [version] = useState(currentSessionVersion)
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState<{ attempt: number; value: LoadResult<T> }>()
  useEffect(() => {
    if (version !== currentSessionVersion()) return
    const controller = new AbortController()
    function finish(value: LoadResult<T>) {
      if (!controller.signal.aborted && version === currentSessionVersion()) setResult({ attempt, value })
    }
    void api<T>(path, { signal: controller.signal }).then(
      data => finish({ data }),
      error => finish({ error: messageOf(error) || 'Volvé a cargar los datos.' }),
    )
    return () => controller.abort()
  }, [path, attempt, version])
  return {
    result: result?.attempt === attempt ? result.value : undefined,
    retry: () => setAttempt(current => current + 1),
  }
}

export function ProfileSettings(props: Props) {
  return <AccountSettings key={`${props.user.id}:${props.user.role}:${currentSessionVersion()}`} {...props} />
}

function AccountSettings({ user, notice, onResend }: Props) {
  const [section, setSection] = useState<'profile' | 'bank'>('profile')
  const [resending, setResending] = useState(false)
  const [resendError, setResendError] = useState('')
  const isCurrent = useAccountRequest()
  const sending = useRef(false)

  async function resend() {
    if (sending.current || !isCurrent()) return
    sending.current = true
    setResending(true)
    setResendError('')
    try { await onResend() }
    catch (error) {
      if (isCurrent()) setResendError(messageOf(error))
    } finally {
      sending.current = false
      if (isCurrent()) setResending(false)
    }
  }

  return <div className="profile-settings">
    {user.role === 'COLLABORATOR' && <nav aria-label="Secciones de mi cuenta">
      <button type="button" aria-current={section === 'profile' ? 'page' : undefined} onClick={() => setSection('profile')}>Perfil personal</button>
      <button type="button" aria-current={section === 'bank' ? 'page' : undefined} onClick={() => setSection('bank')}>Datos bancarios</button>
    </nav>}
    <div className="profile-settings-email">
      <h2>Correo electrónico</h2>
      <p className="profile-settings-address">{user.email}</p>
      <p>{user.email_verified ? 'Email verificado' : 'Email pendiente de verificación'}</p>
      {!user.email_verified && <button type="button" className="button button-dark" disabled={resending} onClick={() => void resend()}>{resending ? 'Enviando…' : 'Reenviar email de verificación'}</button>}
      {resendError && <p className="form-error" role="alert">{resendError}</p>}
      {notice && <p role="status">{notice}</p>}
    </div>
    {section === 'profile' ? <PersonalSection collaborator={user.role === 'COLLABORATOR'} /> : <BankSection verified={user.email_verified} />}
  </div>
}

function LoadError({ error, retry }: { error: string; retry: () => void }) {
  return <>
    <p className="form-error" role="alert">{error}</p>
    <button type="button" className="button button-ghost" onClick={retry}>Volver a cargar</button>
  </>
}

function PersonalSection({ collaborator }: { collaborator: boolean }) {
  const { result, retry } = useAccountDetails<PersonalDetails>(profilePath)
  return <section className="profile-settings-section">
    <h2>Perfil personal</h2>
    {collaborator && <p>Tu nombre aparece en la selección de beneficios que compartís por QR.</p>}
    {!result && <p role="status">Cargando tu perfil…</p>}
    {result?.error && <LoadError error={result.error} retry={retry} />}
    {result?.data && <PersonalForm initial={result.data} />}
  </section>
}

function PersonalForm({ initial }: { initial: PersonalDetails }) {
  const [complete, setComplete] = useState(initial.complete)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const isCurrent = useAccountRequest()

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || !isCurrent()) return
    const values = new FormData(event.currentTarget)
    setSaved(false)
    const first_name = String(values.get('first_name') ?? '').trim()
    const last_name = String(values.get('last_name') ?? '').trim()
    if (!first_name || !last_name) {
      setError('Ingresá tu nombre y apellido.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const result = await api<PersonalDetails>(profilePath, { method: 'PATCH', body: { first_name, last_name } })
      if (!isCurrent()) return
      setComplete(result.complete)
      setSaved(true)
    } catch (caught) {
      if (isCurrent()) setError(messageOf(caught))
    } finally {
      if (isCurrent()) setBusy(false)
    }
  }

  return <form onSubmit={event => void save(event)}>
    <p>{complete ? 'Perfil completo' : 'Perfil pendiente de completar'}</p>
    <fieldset disabled={busy}>
      <div className="profile-settings-fields">
        <label>Nombre<input name="first_name" autoComplete="given-name" defaultValue={initial.first_name} maxLength={150} required /></label>
        <label>Apellido<input name="last_name" autoComplete="family-name" defaultValue={initial.last_name} maxLength={150} required /></label>
      </div>
      <button className="button button-dark" type="submit">{busy ? 'Guardando…' : 'Guardar perfil'}</button>
    </fieldset>
    {error && <p className="form-error" role="alert">{error}</p>}
    {saved && <p role="status">Guardamos tu perfil.</p>}
  </form>
}

function BankSection({ verified }: { verified: boolean }) {
  const { result, retry } = useAccountDetails<BankDetails>(bankPath)
  return <section className="profile-settings-section">
    <h2>Datos bancarios</h2>
    <p>Completá tu CBU para que puedan aprobar tus comisiones. Si ingresás un alias, asegurate de que corresponda a la misma cuenta.</p>
    {!verified && <p>Verificá tu email para guardar o cambiar tus datos bancarios.</p>}
    {!result && <p role="status">Cargando tus datos bancarios…</p>}
    {result?.error && <LoadError error={result.error} retry={retry} />}
    {result?.data && <BankForm key={String(verified)} initial={result.data} verified={verified} />}
  </section>
}

function BankForm({ initial, verified }: { initial: BankDetails; verified: boolean }) {
  const [details, setDetails] = useState(initial)
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const isCurrent = useAccountRequest()

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || !isCurrent()) return
    const values = new FormData(event.currentTarget)
    const cbu = String(values.get('cbu') ?? '').trim()
    const alias = String(values.get('alias') ?? '').trim()
    if (!/^[0-9]{22}$/.test(cbu)) {
      setError('Ingresá los 22 dígitos del CBU.')
      return
    }
    if (alias && !/^[A-Za-z0-9.-]{6,20}$/.test(alias)) {
      setError('El alias admite de 6 a 20 letras sin acentos, números, puntos o guiones.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const result = await api<BankDetails>(bankPath, { method: 'PUT', body: { cbu, alias } })
      if (!isCurrent()) return
      setDetails(result)
      setEditing(false)
      setSaved(true)
    } catch (caught) {
      if (isCurrent()) setError(messageOf(caught))
    } finally {
      if (isCurrent()) setBusy(false)
    }
  }

  return <>
    {details.configured ? <dl className="profile-settings-bank-status">
      <div><dt>CBU</dt><dd>{details.cbu_masked}</dd></div>
      <div><dt>Alias</dt><dd>{details.alias_masked ?? 'Sin alias'}</dd></div>
    </dl> : <p>Datos bancarios pendientes</p>}
    {saved && <p role="status">Guardamos tus datos bancarios.</p>}
    {verified && !editing && <button type="button" className="button button-dark" onClick={() => { setSaved(false); setEditing(true) }}>{details.configured ? 'Cambiar datos bancarios' : 'Cargar datos bancarios'}</button>}
    {verified && editing && <form autoComplete="off" onSubmit={event => void save(event)}>
      <fieldset disabled={busy}>
        <div className="profile-settings-fields">
          <label>CBU<input type="password" inputMode="numeric" name="cbu" autoComplete="off" required /></label>
          <label>Alias (opcional)<input type="text" name="alias" autoComplete="off" autoCapitalize="none" spellCheck={false} /></label>
        </div>
        {details.alias_masked && <p>Dejá el alias vacío para quitarlo.</p>}
        <div className="profile-settings-actions">
          <button className="button button-dark" type="submit">{busy ? 'Guardando…' : 'Guardar datos bancarios'}</button>
          <button type="button" className="button button-ghost" onClick={() => { setError(''); setEditing(false) }}>Cancelar</button>
        </div>
      </fieldset>
      {error && <p className="form-error" role="alert">{error}</p>}
    </form>}
  </>
}
