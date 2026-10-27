import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { api } from './api'
import type { Folder } from './api'
import { messageOf } from './shared'
import { consumptionToken, setConsumptionToken } from './qr-intent'

export function ConsumePage({ folders, onComplete }: { folders: Folder[]; onComplete: () => void }) {
  const [mode, setMode] = useState<'direct' | 'referred'>('direct')
  const [folderId, setFolderId] = useState(folders[0]?.collaborator_id ?? '')
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const keyRef = useRef(crypto.randomUUID())
  const keyPayload = useRef('')
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (mode === 'referred' && !folderId) { setError('Elegí una carpeta activa para el consumo referido.'); return }
    setError(''); setBusy(true)
    try {
      const body = { qr_token: consumptionToken, pin, ...(mode === 'referred' ? { folder_id: folderId } : {}) }
      const signature = JSON.stringify(body)
      if (signature !== keyPayload.current) { keyPayload.current = signature; keyRef.current = crypto.randomUUID() }
      await api('/api/v1/consumptions/', { method: 'POST', body, idempotencyKey: keyRef.current })
      setPin(''); setConsumptionToken(null); setDone(true); onComplete()
    } catch (caught) { setError(messageOf(caught)) }
    finally { setBusy(false) }
  }
  return <main id="contenido" className="qr-page page-container"><div className="qr-copy"><p className="eyebrow">VALIDAR VISITA / PRESTADOR</p><h1>Confirmá tu consumo.</h1><p>Escaneá el QR del prestador e ingresá el PIN que te facilite en el local. Si llegaste por una recomendación privada, podés asociar esa carpeta; también podés consumir directamente.</p><div className="qr-hint"><span aria-hidden="true">▦</span><div><strong>Dos QR con funciones distintas</strong><p>El QR de colaborador abre recomendaciones. El QR del prestador junto al PIN valida tu visita.</p></div></div></div><form className="qr-form" onSubmit={submit}><div className="qr-symbol" aria-hidden="true">▦</div>{done ? <div className="form-success" role="status"><strong>Visita enviada para validación.</strong><p>Actualizamos tus visitas y saldo con la respuesta del servidor.</p><a href="/mi-viaje">Ver Mi viaje →</a></div> : !consumptionToken ? <><h2>Falta el QR del prestador</h2><p>Volvé a escanear el QR de consumo que te muestra el prestador para continuar.</p><a href="/beneficios">Volver a beneficios</a></> : <><fieldset className="consumption-mode"><legend>¿Cómo llegaste a este prestador?</legend><label><input type="radio" name="consumption-mode" checked={mode === 'direct'} onChange={() => setMode('direct')} /> Lo descubrí por mi cuenta</label><label><input type="radio" name="consumption-mode" checked={mode === 'referred'} onChange={() => setMode('referred')} /> Por una recomendación privada</label></fieldset>{mode === 'referred' && <>{folders.length ? <><label htmlFor="consumption-folder">Carpeta relacionada</label><select id="consumption-folder" value={folderId} onChange={event => setFolderId(event.target.value)}>{!folderId && <option value="">Elegí una carpeta</option>}{folders.map(folder => <option key={folder.collaborator_id} value={folder.collaborator_id}>Carpeta · {folder.collaborator_id.slice(0, 8)}</option>)}</select></> : <p className="form-help">No tenés carpetas activas. <a href="/referencia">Ingresá un QR de colaborador</a> o elegí consumo directo.</p>}</>}<label htmlFor="provider-pin">PIN del prestador</label><input id="provider-pin" type="password" inputMode="numeric" pattern="[0-9]{6,12}" minLength={6} maxLength={12} autoComplete="off" value={pin} onChange={event => setPin(event.target.value.replace(/\D/g, '').slice(0, 12))} required /><p className="form-help">El PIN solo se envía para validar este consumo y no se guarda en el navegador.</p>{error && <p className="form-error" role="alert">{error}</p>}<button className="button button-orange form-submit" disabled={busy || (mode === 'referred' && !folderId)}>{busy ? 'Validando…' : 'Validar visita'}</button></>}</form></main>
}
