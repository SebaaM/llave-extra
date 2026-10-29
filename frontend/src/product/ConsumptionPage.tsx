import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { api, currentSessionVersion } from './api'
import type { ConsumptionResult, Folder } from './api'
import { messageOf } from './shared'
import { consumptionToken, setConsumptionToken } from './qr-intent'
import { ProductLink } from './navigation'
import { VisitResult } from './VisitResult'

export function ConsumePage({ folders, onComplete }: { folders: Folder[]; onComplete: () => void }) {
  const [mode, setMode] = useState<'direct' | 'referred'>('direct')
  const [folderId, setFolderId] = useState(folders[0]?.collaborator_id ?? '')
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ConsumptionResult | null>(null)
  const command = useRef<{ signature: string; key: string } | null>(null)
  const inFlight = useRef(false)
  const mounted = useRef(true)
  const version = useRef(currentSessionVersion())
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const current = () => mounted.current && version.current === currentSessionVersion()

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (inFlight.current || result || !current()) return
    if (!consumptionToken) { setError('Volvé a escanear el QR del prestador.'); return }
    if (!/^[0-9]{6,12}$/.test(pin)) { setError('Ingresá el PIN de 6 a 12 dígitos del prestador.'); return }
    if (mode === 'referred' && !folderId) { setError('Elegí una carpeta activa para el consumo referido.'); return }
    // El bloqueo cubre submits programáticos anteriores al siguiente render.
    inFlight.current = true
    setError(''); setBusy(true)
    const body = { qr_token: consumptionToken, pin, ...(mode === 'referred' ? { folder_id: folderId } : {}) }
    const signature = JSON.stringify(body)
    if (command.current?.signature !== signature) command.current = { signature, key: crypto.randomUUID() }
    try {
      const confirmed = await api<ConsumptionResult>('/api/v1/consumptions/', { method: 'POST', body, idempotencyKey: command.current.key })
      if (!current()) return
      setPin(''); setConsumptionToken(null); command.current = null; setResult(confirmed)
    } catch (caught) {
      if (current()) setError(messageOf(caught))
      return
    } finally {
      inFlight.current = false
      if (current()) setBusy(false)
    }
    // La actualización posterior es independiente del comando ya confirmado.
    if (current()) onComplete()
  }

  return <main id="contenido" className="qr-page page-container client-qr-page">
    <div className="qr-copy">
      <p className="eyebrow">VALIDAR VISITA / PRESTADOR</p><h1>Confirmá tu consumo.</h1>
      <p>Escaneá el QR del prestador e ingresá el PIN que te facilite en el local. Si llegaste por una recomendación privada, podés asociar esa carpeta; también podés consumir directamente.</p>
      <ol className="client-qr-steps" aria-label="Pasos para validar una visita">
        <li><strong>1. QR del prestador</strong><span>{consumptionToken || result ? 'QR recibido en este dispositivo.' : 'Escanealo en el local.'}</span></li>
        <li aria-current={!result && consumptionToken ? 'step' : undefined}><strong>2. PIN del local</strong><span>Un único campo de 6 a 12 dígitos.</span></li>
        <li aria-current={result ? 'step' : undefined}><strong>3. Confirmación</strong><span>La visita y los créditos los confirma el servidor.</span></li>
      </ol>
      <div className="qr-hint"><span aria-hidden="true">▦</span><div><strong>Dos QR con funciones distintas</strong><p>El QR de colaborador abre recomendaciones. El QR del prestador junto al PIN valida tu visita.</p></div></div>
    </div>
    <form className="qr-form" onSubmit={submit} aria-busy={busy}>
      {result ? <VisitResult result={result} /> : !consumptionToken ? <>
        <div className="qr-symbol" aria-hidden="true">▦</div><h2>Falta el QR del prestador</h2><p>Volvé a escanear el QR de consumo que te muestra el prestador para continuar.</p><ProductLink href="/beneficios">Volver a beneficios</ProductLink>
      </> : <>
        <div className="qr-symbol" aria-hidden="true">▦</div><h2>Validá tu visita</h2>
        <fieldset className="consumption-mode" disabled={busy}><legend>¿Cómo llegaste a este prestador?</legend>
          <label><input type="radio" name="consumption-mode" disabled={busy} checked={mode === 'direct'} onChange={() => { if (!inFlight.current) setMode('direct') }} /> Lo descubrí por mi cuenta</label>
          <label><input type="radio" name="consumption-mode" disabled={busy} checked={mode === 'referred'} onChange={() => { if (!inFlight.current) setMode('referred') }} /> Por una recomendación privada</label>
        </fieldset>
        {mode === 'referred' && <>{folders.length ? <>
          <label htmlFor="consumption-folder">Carpeta relacionada</label><select id="consumption-folder" value={folderId} disabled={busy} onChange={event => { if (!inFlight.current) setFolderId(event.target.value) }}>
            {!folderId && <option value="">Elegí una carpeta</option>}{folders.map(folder => <option key={folder.collaborator_id} value={folder.collaborator_id}>Carpeta · {folder.collaborator_id.slice(0, 8)}</option>)}
          </select>
        </> : <p className="form-help">No tenés carpetas activas. <ProductLink href="/referencia">Ingresá un QR de colaborador</ProductLink> o elegí consumo directo.</p>}</>}
        <label htmlFor="provider-pin">PIN del prestador</label><input id="provider-pin" type="password" inputMode="numeric" pattern="[0-9]{6,12}" minLength={6} maxLength={12} autoComplete="off" value={pin} disabled={busy} onChange={event => { if (!inFlight.current) setPin(event.target.value.replace(/\D/g, '').slice(0, 12)) }} required aria-describedby="pin-help" />
        <p id="pin-help" className="form-help">El PIN solo se envía para validar este consumo y no se guarda en el navegador.</p>
        {error && <><p className="form-error" role="alert">{error}</p><p className="form-help">Si no se confirmó la respuesta, reintentá sin cambiar los datos para recuperar el mismo resultado.</p></>}
        <button className="button button-orange form-submit" disabled={busy || (mode === 'referred' && !folderId)}>{busy ? 'Validando…' : 'Validar visita'}</button>
      </>}
    </form>
  </main>
}
