import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { api, currentSessionVersion } from './api'
import type { QrContext } from './qr-context'
import { consumptionToken } from './qr-intent'
import { ProductLink } from './navigation'
import { VisitResult } from './VisitResult'
import { useVisitCommand } from './useVisitCommand'
import type { VisitCommand } from './useVisitCommand'
import { messageOf } from './shared'

type BenefitOption = { id: string; title: string }
type Options = { qr: string; folder: string; revision: number; benefits: BenefitOption[]; error: string }

function useBenefitOptions(qr: string | null, folder: string | undefined) {
  const [revision, setRevision] = useState(0)
  const [options, setOptions] = useState<Options | null>(null)
  useEffect(() => {
    if (!qr || !folder) return
    const controller = new AbortController(), version = currentSessionVersion()
    const publish = (benefits: BenefitOption[], error: string) => {
      if (!controller.signal.aborted && currentSessionVersion() === version) {
        setOptions({ qr, folder, revision, benefits, error })
      }
    }
    api<{ benefits: BenefitOption[] }>('/api/v2/consumptions/options/', {
      method: 'POST', body: { qr_token: qr, folder_id: folder }, signal: controller.signal,
    }).then(data => publish(data.benefits, '')).catch(error => publish([], messageOf(error)))
    return () => controller.abort()
  }, [qr, folder, revision])
  return {
    options: options?.qr === qr && options.folder === folder && options.revision === revision ? options : null,
    reload: () => setRevision(value => value + 1),
  }
}

export function ConsumePage({ context, command, onComplete, onReferenceDenied, onDirect }: { context: QrContext; command?: VisitCommand; onComplete: () => void; onReferenceDenied: () => void; onDirect: () => void }) {
  const localCommand = useVisitCommand()
  const visit = command ?? localCommand
  const [pin, setPin] = useState(() => visit.pending?.body.pin ?? '')
  const [error, setError] = useState('')
  const [selection, setSelection] = useState<{ qr: string; folder: string; id: string } | null>(null)
  const frozen = !!visit.pending
  const folderId = context.status === 'ready' ? context.collaborator?.id : undefined
  const boundBody = visit.pending?.body ?? visit.correction
  const sameIntent = !boundBody || (boundBody.qr_token === consumptionToken && boundBody.folder_id === folderId)
  const correctionDrift = !!visit.correction && !sameIntent
  const blocked = (context.status !== 'none' && context.status !== 'ready') || correctionDrift
  const displayedPin = visit.pending?.body.pin ?? pin
  const qr = boundBody?.qr_token ?? consumptionToken
  const boundFolder = boundBody ? boundBody.folder_id : folderId
  const { options, reload } = useBenefitOptions(qr, boundFolder)
  const benefits = options?.benefits ?? []
  const matchingSelection = selection?.qr === qr && selection.folder === boundFolder ? selection.id : ''
  const benefitId = boundBody?.benefit_id ?? (benefits.length === 1 ? benefits[0].id : matchingSelection)
  const needsBenefit = !!boundFolder && !boundBody && !benefits.some(item => item.id === benefitId)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (visit.busy || visit.result || (blocked && !visit.uncertain) || needsBenefit) return
    if (!qr) { setError('Volvé a escanear el QR del negocio.'); return }
    if (!/^[0-9]{6,12}$/.test(displayedPin)) { setError('Ingresá el PIN de 6 a 12 dígitos del negocio.'); return }
    setError('')
    const result = await visit.submit({ qr_token: qr, pin: displayedPin, ...(boundFolder ? { folder_id: boundFolder, benefit_id: benefitId } : {}) })
    if (result.denied) onReferenceDenied()
    if (result.completed) { setPin(''); onComplete() }
  }
  return <main id="contenido" className="qr-page page-container client-qr-page">
    <div className="qr-copy">
      <p className="eyebrow">VALIDAR TU VISITA</p><h1>Confirmá tu visita.</h1>
      <p>Escaneá el QR del negocio e ingresá el PIN que te facilite en el local. Si abriste una recomendación, la visita conserva esa referencia. También podés descubrir negocios por tu cuenta.</p>
      <ol className="client-qr-steps" aria-label="Pasos para validar una visita">
        <li><strong>1. QR del negocio</strong><span>{qr || visit.result ? 'QR recibido en este dispositivo.' : 'Escanealo en el local.'}</span></li>
        <li aria-current={!visit.result && qr ? 'step' : undefined}><strong>2. PIN del local</strong><span>Un único campo de 6 a 12 dígitos.</span></li>
        <li aria-current={visit.result ? 'step' : undefined}><strong>3. Confirmación</strong><span>Al confirmar, vas a ver el resultado de tu visita y los créditos.</span></li>
      </ol>
      <div className="qr-hint"><span aria-hidden="true">▦</span><div><strong>Dos QR con funciones distintas</strong><p>El QR de quien te recomendó abre su selección de beneficios. El QR del negocio junto al PIN valida tu visita.</p></div></div>
    </div>
    <form className="qr-form" onSubmit={submit} aria-busy={visit.busy}>
      {visit.result ? <VisitResult result={visit.result} /> : !qr ? <>
        <div className="qr-symbol" aria-hidden="true">▦</div><h2>Falta el QR del negocio</h2><p>Volvé a escanear el QR para validar visitas que te muestra el negocio para continuar.</p><ProductLink href="/beneficios">Volver a beneficios</ProductLink>
      </> : <>
        <div className="qr-symbol" aria-hidden="true">▦</div><h2>Validá tu visita</h2>
        {blocked ? <p role={context.error || correctionDrift ? 'alert' : 'status'}>{context.error || (correctionDrift ? 'El QR o la recomendación cambió. Abrí de nuevo el QR para iniciar otra visita.' : 'Comprobando la recomendación antes de validar tu visita…')}</p> : context.collaborator ? <>
          <p>Visita recomendada por {context.collaborator.name}</p>
          {!frozen && !visit.attempted && <button type="button" className="button button-ghost" onClick={onDirect}>Continuar sin esta recomendación</button>}
        </> : <p>Lo descubrí por mi cuenta</p>}
        {blocked && <ProductLink href="/referencia">Revisar recomendación</ProductLink>}
        {boundFolder && !blocked && <>
          {!options && !boundBody && <p role="status">Buscando los beneficios de esta recomendación…</p>}
          {options?.error && !boundBody && <><p className="form-error" role="alert">{options.error}</p><button type="button" className="button button-ghost" onClick={reload}>Reintentar beneficios</button></>}
          {benefits.length === 1 && <p>Beneficio: <strong>{benefits[0].title}</strong></p>}
          {benefits.length > 1 && <><label htmlFor="visit-benefit">Beneficio</label><select id="visit-benefit" value={benefitId} required disabled={!!boundBody || visit.busy} onChange={event => setSelection({ qr, folder: boundFolder, id: event.target.value })}>
            <option value="">Elegí un beneficio</option>{benefits.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
          </select></>}
        </>}
        <label htmlFor="provider-pin">PIN del negocio</label><input id="provider-pin" type="password" inputMode="numeric" pattern="[0-9]{6,12}" minLength={6} maxLength={12} autoComplete="off" value={displayedPin} disabled={visit.busy || frozen || blocked} onChange={event => { if (!frozen && !visit.busy) setPin(event.target.value.replace(/\D/g, '').slice(0, 12)) }} required aria-describedby="pin-help" />
        <p id="pin-help" className="form-help">El PIN solo se envía para validar este consumo y no se guarda en el navegador.</p>
        {(error || visit.error) && <p className="form-error" role="alert">{error || visit.error}</p>}
        {!blocked && sameIntent && visit.errorStatus === 400 && !visit.hadUncertainty && !visit.busy && (visit.benefitError
          ? <button type="button" className="button button-ghost" onClick={() => { setSelection(null); visit.reselect(); reload() }}>Volver a elegir beneficio</button>
          : <button type="button" className="button button-ghost" onClick={visit.correct}>Corregir PIN</button>)}
        {frozen && <p className="form-help">{visit.uncertain ? 'La respuesta no se confirmó. Reintentá con los mismos datos para recuperar el resultado; otro QR no modifica este envío.' : 'Los datos enviados se conservan. Si la recomendación fue rechazada, abrí un nuevo QR vigente para iniciar otra visita.'}</p>}
        <button className="button button-orange form-submit" disabled={visit.busy || (blocked && !visit.uncertain) || needsBenefit}>{visit.busy ? 'Validando…' : 'Validar visita'}</button>
      </>}
    </form>
  </main>
}
