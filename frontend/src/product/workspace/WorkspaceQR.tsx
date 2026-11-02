import { useCallback, useEffect, useRef, useState } from 'react'
import { api, ApiError, currentSessionVersion, privateImage } from '../api'
import { safeExternal } from '../catalog'
import { messageOf } from '../shared'
import { useCurrent, useResource } from './hooks'
import { Feedback } from './UI'

type Credential = { configured?: boolean; qr_url?: string; url?: string }
export function WorkspaceQR({ kind, credentialPath }: { kind: 'provider' | 'collaborator'; credentialPath: string }) {
  return kind === 'collaborator' ? <CollaboratorQR key={`${credentialPath}:${currentSessionVersion()}`} path={credentialPath} /> : <ProviderQR kind={kind} credentialPath={credentialPath} />
}

type CollaboratorCredential = { url: string; version: string }
type Renewal = { key: string; body: { version: string } }
type QrPhase = 'reading' | 'ready' | 'confirm' | 'sending' | 'uncertain' | 'read-required' | 'denied'

function CollaboratorQR({ path }: { path: string }) {
  const [credential, setCredential] = useState<CollaboratorCredential | null>(null)
  const [phase, setPhase] = useState<QrPhase>('reading')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const command = useRef<Renewal | null>(null)
  const busy = useRef(false)
  const denied = useRef(false)
  const request = useRef(0)
  const current = useCurrent()
  const deny = useCallback(() => {
    denied.current = true; command.current = null; request.current += 1
    setCredential(null); setNotice(''); setError(''); setPhase('denied')
  }, [])
  const read = useCallback(async () => {
    if (!current() || command.current || busy.current || denied.current) return
    const sequence = ++request.current
    setCredential(null); setError(''); setNotice(''); setPhase('reading')
    try {
      const next = await api<CollaboratorCredential>(path)
      if (!current() || sequence !== request.current) return
      if (!safeExternal(next.url) || typeof next.version !== 'string' || !next.version) throw new Error('No pudimos consultar la versión vigente del QR.')
      setCredential(next); setPhase('ready')
    } catch (failure) {
      if (!current() || sequence !== request.current) return
      if (failure instanceof ApiError && (failure.status === 401 || failure.status === 403)) deny()
      else { setError(messageOf(failure)); setPhase('read-required') }
    }
  }, [current, deny, path])
  useEffect(() => {
    let alive = true
    queueMicrotask(() => { if (alive) void read() })
    const focus = () => { void read() }
    window.addEventListener('focus', focus)
    return () => { alive = false; request.current += 1; window.removeEventListener('focus', focus) }
  }, [read])
  const send = async (pending: Renewal) => {
    if (!current() || busy.current || denied.current) return
    busy.current = true; command.current = pending; request.current += 1
    setCredential(null); setNotice(''); setError(''); setPhase('sending')
    try {
      await api(`${path}renew/`, { method: 'POST', body: pending.body, idempotencyKey: pending.key })
      if (!current()) return
      command.current = null; busy.current = false
      await read()
    } catch (failure) {
      if (!current()) return
      if (failure instanceof ApiError && (failure.status === 401 || failure.status === 403)) deny()
      else if (failure instanceof ApiError && failure.status < 500 && failure.status !== 408 && failure.status !== 429) {
        command.current = null
        setError(`${messageOf(failure)} Volvé a consultar el QR vigente antes de una nueva renovación.`); setPhase('read-required')
      } else {
        setError('No pudimos confirmar la renovación. Reintentá la operación anterior para conocer el resultado.'); setPhase('uncertain')
      }
    } finally { if (current()) busy.current = false }
  }
  if (phase === 'denied') return <section className="workspace-panel"><Feedback error="El acceso a este QR ya no está habilitado. Actualizá para consultar tu autorización." /><button className="button button-dark" onClick={() => { denied.current = false; void read() }}>Actualizar autorización</button></section>
  const visible = credential && (phase === 'ready' || phase === 'confirm')
  return <div className="workspace-qr-layout"><section className="workspace-panel workspace-qr-panel">
    <span className="workspace-tag">TU CARPETA PRIVADA</span><h2>Una puerta a tus recomendaciones</h2>
    <p>Compartí tu QR para que los clientes abran la selección de beneficios de tu carpeta.</p>
    {visible && <QRImage key={credential.version} path="/api/v1/collaborator/qr.png" kind="collaborator" onDenied={deny} />}
    {phase === 'reading' && <p role="status">Actualizando QR…</p>}
    {phase === 'sending' && <p role="status">Renovando QR…</p>}
    <Feedback error={error} notice={notice} />
    {phase === 'uncertain' && <button className="button button-dark" onClick={() => { if (command.current) void send(command.current) }}>Reintentar renovación anterior</button>}
    {(phase === 'ready' || phase === 'read-required') && <div className="workspace-actions">
      {credential && <button className="button button-ghost" onClick={() => {
        const sequence = request.current
        void Promise.resolve().then(() => { if (current() && sequence === request.current && !command.current) return navigator.clipboard.writeText(credential.url) }).then(() => { if (current() && sequence === request.current && !command.current) setNotice('Enlace de referencia copiado.') }).catch(() => { if (current() && sequence === request.current && !command.current) setNotice('No pudimos copiar el enlace. Podés descargar el QR.') })
      }}>Copiar enlace</button>}
      <button className="button button-ghost" onClick={() => { void read() }}>Volver a consultar</button>
      {credential && <button className="button button-orange" onClick={() => setPhase('confirm')}>Renovar QR</button>}
    </div>}
    {phase === 'confirm' && <div role="group" aria-labelledby="renew-qr-title"><h3 id="renew-qr-title">¿Renovar tu QR?</h3><p>El QR anterior dejará de funcionar. Tendrás que actualizar tu material impreso y los enlaces compartidos.</p><div className="workspace-actions"><button className="button button-ghost" onClick={() => setPhase('ready')}>Cancelar</button><button className="button button-orange" onClick={() => { if (credential && !command.current && !busy.current) void send({ key: crypto.randomUUID(), body: { version: credential.version } }) }}>Confirmar renovación</button></div></div>}
    <p className="workspace-muted">Consultar, copiar o descargar conserva el mismo QR. Renovalo solo cuando quieras reemplazarlo.</p>
  </section><section className="workspace-panel workspace-qr-guide"><h2>Compartí tu selección</h2><ol><li>Elegí beneficios en el catálogo.</li><li>Descargá tu QR personal.</li><li>Invitá a los clientes a escanearlo e ingresar.</li></ol><p>El QR abre recomendaciones; no acredita un consumo.</p></section></div>
}

function ProviderQR({ kind, credentialPath }: { kind: 'provider' | 'collaborator'; credentialPath: string }) {
  const [notice, setNotice] = useState('')
  const [denied, setDenied] = useState(false)
  const deny = useCallback(() => setDenied(true), [])
  const load = useCallback((signal: AbortSignal) => {
    const version = currentSessionVersion()
    return api<Credential>(credentialPath, { signal }).catch(failure => {
      if (!signal.aborted && version === currentSessionVersion() && failure instanceof ApiError && (failure.status === 401 || failure.status === 403)) deny()
      throw failure
    })
  }, [credentialPath, deny])
  const resource = useResource(load)
  const current = useCurrent()
  const url = safeExternal(resource.data?.qr_url || resource.data?.url)
  const configured = resource.data && resource.data.configured !== false && url
  const pngPath = kind === 'collaborator' ? '/api/v1/collaborator/qr.png' : `${credentialPath}qr.png`
  if (denied) return <section className="workspace-panel"><Feedback error="El acceso a este QR ya no está habilitado. Actualizá para consultar tu autorización." /><button className="button button-dark" onClick={() => { setDenied(false); resource.reload() }}>Actualizar autorización</button></section>
  return <div className="workspace-qr-layout"><section className="workspace-panel workspace-qr-panel"><span className="workspace-tag">{kind === 'provider' ? 'VALIDACIÓN DE VISITAS' : 'TU CARPETA PRIVADA'}</span><h2>{kind === 'provider' ? 'El QR de tu negocio' : 'Una puerta a tus recomendaciones'}</h2><p>{kind === 'provider' ? 'Mostralo en tu negocio. El cliente escanea el código y valida la visita con tu PIN.' : 'Compartí tu QR para que los clientes abran la selección de beneficios de tu carpeta.'}</p>{resource.loading ? <p role="status">Actualizando QR…</p> : resource.error ? <Feedback error={resource.error} /> : configured ? <QRImage path={pngPath} kind={kind} onDenied={deny} /> : <p>Configurá tu PIN para habilitar el QR de consumo.</p>}{!resource.loading && <div className="workspace-actions">{kind === 'collaborator' && url && <button className="button button-ghost" onClick={() => { void Promise.resolve().then(() => { if (current()) return navigator.clipboard.writeText(url) }).then(() => { if (current()) setNotice('Enlace de referencia copiado.') }).catch(() => { if (current()) setNotice('No pudimos copiar el enlace. Podés descargar el QR.') }) }}>Copiar enlace</button>}<button className="button button-ghost" onClick={() => { setNotice(''); resource.reload() }}>Actualizar QR</button></div>}<Feedback notice={notice} /><p className="workspace-muted">El código se consulta de forma privada. Si el administrador lo renueva, actualizá tu material impreso.</p></section>{kind === 'provider' ? <PinForm path={credentialPath} onSaved={resource.reload} onDenied={deny} /> : <section className="workspace-panel workspace-qr-guide"><h2>Compartí tu selección</h2><ol><li>Elegí beneficios en el catálogo.</li><li>Descargá tu QR personal.</li><li>Invitá a los clientes a escanearlo e ingresar.</li></ol><p>El QR abre recomendaciones; no acredita un consumo.</p></section>}</div>
}

function QRImage({ path, kind, onDenied }: { path: string; kind: string; onDenied: () => void }) {
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    let alive = true
    let created: string | null = null
    const version = currentSessionVersion()
    privateImage(path).then(value => {
      if (!value) return
      if (!alive || version !== currentSessionVersion()) { URL.revokeObjectURL(value); return }
      created = value; setUrl(value)
    }).catch(failure => { if (alive && version === currentSessionVersion()) { setError(messageOf(failure)); if (failure instanceof ApiError && (failure.status === 401 || failure.status === 403)) onDenied() } })
    return () => { alive = false; if (created) URL.revokeObjectURL(created) }
  }, [path, onDenied])
  return <>{url ? <><img className="workspace-qr-image" src={url} alt={kind === 'provider' ? 'QR privado de consumo del negocio' : 'QR privado de recomendaciones'} /><a className="button button-dark" href={url} download={kind === 'provider' ? 'consumo.png' : 'referencia.png'}>Descargar QR PNG ↓</a></> : <p role={error ? 'alert' : 'status'}>{error || 'Generando imagen autorizada…'}</p>}</>
}

function PinForm({ path, onSaved, onDenied }: { path: string; onSaved: () => void; onDenied: () => void }) {
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const current = useCurrent()
  return <form className="workspace-panel workspace-form" onSubmit={event => {
    event.preventDefault(); setBusy(true); setError(''); setNotice('')
    const submitted = pin; setPin('')
    void api(path, { method: 'PUT', body: { pin: submitted } }).then(() => { if (current()) { setNotice('PIN actualizado. Usá el nuevo PIN para validar visitas.'); onSaved() } }).catch(failure => { if (current()) { setError(messageOf(failure)); if (failure instanceof ApiError && (failure.status === 401 || failure.status === 403)) onDenied() } }).finally(() => { if (current()) setBusy(false) })
  }}><h2>PIN de consumo</h2><p>Elegí un PIN de 6 a 12 dígitos. Es independiente de tu contraseña y nunca se muestra al consultar esta pantalla.</p><label>Nuevo PIN<input required type="password" inputMode="numeric" autoComplete="new-password" pattern="[0-9]{6,12}" minLength={6} maxLength={12} value={pin} onChange={event => setPin(event.target.value)} /></label><Feedback error={error} notice={notice} /><button className="button button-orange" disabled={busy}>{busy ? 'Guardando…' : 'Guardar PIN'}</button></form>
}
