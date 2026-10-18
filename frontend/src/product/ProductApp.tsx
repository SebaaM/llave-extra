import { useEffect, useState } from 'react'
import { ApiError, api, hasPendingLogout, restoreSession, signOut, verifyEmailToken } from './api'
import type { Consumption, Folder, Progress, Provider, User, Wallet } from './api'
import { messageOf } from './shared'
import { consumptionToken, referralToken, setReferralToken, verifyToken, setVerifyToken } from './qr-intent'
import { ProductShell, ButtonLink } from './Layout'
import { Auth, Landing } from './PublicPages'
import { FolderPage, ProviderDetail } from './BenefitsPages'
import { QrPage } from './ReferencePage'
import { Trip } from './JourneyPage'
import { ConsumePage } from './ConsumptionPage'
import { ProductLink } from './navigation'

export default function ProductApp() {
  const [path, setPath] = useState(window.location.pathname), [user, setUser] = useState<User | null>(null), [authReady, setAuthReady] = useState(false), [notice, setNotice] = useState(() => hasPendingLogout() ? 'La sesión se quitó de este dispositivo, pero no pudimos confirmar su revocación en el servidor. Iniciá sesión de nuevo solo si querés continuar.' : ''), [folders, setFolders] = useState<Folder[]>([]), [selectedFolder, setSelectedFolder] = useState(''), [providers, setProviders] = useState<Provider[]>([]), [selectedProvider, setSelectedProvider] = useState<Provider | null>(null), [wallet, setWallet] = useState<Wallet | null>(null), [progress, setProgress] = useState<Progress | null>(null), [history, setHistory] = useState<Consumption[]>([]), [pageError, setPageError] = useState('')
  const loadTrip = async () => {
    const [nextWallet, nextProgress, nextHistory] = await Promise.all([api<Wallet>('/api/v1/me/wallet/'), api<Progress>('/api/v1/me/progress/'), api<Consumption[]>('/api/v1/me/consumptions/')])
    setWallet(nextWallet); setProgress(nextProgress); setHistory(nextHistory)
  }
  const loadFolders = async () => {
    const result = await api<{ folders: Folder[] }>('/api/v1/me/folders/')
    setFolders(result.folders); setSelectedFolder(current => result.folders.some(item => item.collaborator_id === current) ? current : result.folders[0]?.collaborator_id ?? '');
    if (result.folders.length) setNotice('')
  }
  const loadProviders = async (folderId: string) => { if (!folderId) { setProviders([]); return }; setProviders(await api<Provider[]>(`/api/v1/folders/${folderId}/providers/`)) }
  useEffect(() => { const update = () => { setPath(window.location.pathname); setSelectedProvider(null); setPageError('') }; const route = (event: Event) => { const target = (event as CustomEvent<string>).detail; window.history.pushState({}, '', target); update() }; window.addEventListener('popstate', update); window.addEventListener('llave:navigate', route); return () => { window.removeEventListener('popstate', update); window.removeEventListener('llave:navigate', route) } }, [])
  useEffect(() => { const heading = document.querySelector<HTMLElement>('#contenido h1'); const title = heading?.textContent?.replace(/\s+/g, ' ').trim() || 'Beneficios para tu viaje'; document.title = `${title} · Llave Extra` }, [path, selectedProvider, authReady, user])
  useEffect(() => { let active = true; restoreSession().then(async current => { if (!active) return; setUser(current); if (current?.role === 'TOURIST') { await Promise.all([loadFolders(), loadTrip()]).catch(error => setPageError(messageOf(error))) } }).catch(error => { if (active && !(error instanceof ApiError && error.status === 401)) setPageError(messageOf(error)) }).finally(() => active && setAuthReady(true)); return () => { active = false } }, [])
  useEffect(() => { if (user?.role === 'TOURIST' && selectedFolder && path === '/beneficios') window.queueMicrotask(() => { void loadProviders(selectedFolder).catch(error => setPageError(messageOf(error))) }) }, [user, selectedFolder, path])
  useEffect(() => { if (user?.role === 'TOURIST' && path === '/mi-viaje') window.queueMicrotask(() => { void loadTrip().catch(error => setPageError(messageOf(error))) }) }, [user, path])
  useEffect(() => { const clearPrivateState = () => { setUser(null); setFolders([]); setProviders([]); setWallet(null); setHistory([]); setProgress(null); setSelectedProvider(null) }; const handler = async () => { try { await signOut(); clearPrivateState(); setNotice(''); window.location.assign('/') } catch { clearPrivateState(); setNotice('La sesión se quitó de este dispositivo, pero no pudimos confirmar su revocación en el servidor. Iniciá sesión de nuevo solo si querés continuar.'); window.location.assign('/') } }; window.addEventListener('llave:logout', handler); return () => window.removeEventListener('llave:logout', handler) }, [user])
  useEffect(() => { if (user?.role === 'TOURIST' && referralToken) api('/api/v1/referrals/redeem/', { method: 'POST', body: { token: referralToken } }).then(async () => { setReferralToken(null); setNotice('La referencia se vinculó a tu cuenta.'); await loadFolders() }).catch(error => setPageError(messageOf(error))) }, [user])
  useEffect(() => { if (verifyToken) verifyEmailToken(verifyToken).then(() => { setVerifyToken(null); setNotice('Email verificado. Ya podés acreditar consumos cuando estés dentro de una carpeta autorizada.') }).catch(error => setPageError(messageOf(error))) }, [])
  useEffect(() => { if (authReady && user?.role === 'ADMIN') window.location.replace('/admin/') }, [authReady, user])
  const folderId = selectedFolder
  const openProvider = async (providerId: string) => { if (!folderId) return; try { setPageError(''); setSelectedProvider(await api<Provider>(`/api/v1/folders/${folderId}/providers/${providerId}/`)) } catch (error) { setPageError(messageOf(error)); await loadFolders(); await loadProviders(folderId).catch(() => setProviders([])) } }
  const isProductPublic = path === '/' || path === '/index.html'
  const isAuth = ['/registro', '/ingresar', '/recuperar', '/restablecer-clave'].includes(path)
  const redirectToRole = user && user.role !== 'TOURIST'
  const shellUser = authReady ? user : null
  const renderContent = () => {
    if (isProductPublic) return <Landing />
    if (!authReady) return <main id="contenido" className="product-loading" role="status">Preparando tu viaje…</main>
    if (path === '/espacio' || (user && user.role !== 'TOURIST')) return <main id="contenido" className="product-empty content-width"><h1>Tu espacio de trabajo</h1><p>La gestión de Colaborador y Prestador forma parte de la siguiente etapa de Llave Extra.</p><a className="button button-orange" href="/">Volver a beneficios</a></main>
    if (path === '/verificar-email') return <main id="contenido" className="product-empty content-width"><h1>Verificá tu email</h1><p>{pageError || notice || 'Usá el enlace que enviamos a tu correo para confirmar tu cuenta.'}</p><ProductLink href="/ingresar">Ir a ingresar</ProductLink></main>
    if (isAuth) return <Auth key={path} mode={path === '/registro' ? 'register' : path === '/ingresar' ? 'login' : path === '/recuperar' ? 'forgot' : 'reset'} referral={referralToken} onLogin={current => { setUser(current); setNotice(''); if (current.role === 'TOURIST') { void Promise.all([loadFolders(), loadTrip()]).catch(error => setPageError(messageOf(error))) }; const target = current.role === 'TOURIST' ? consumptionToken ? '/consumo' : referralToken ? '/referencia' : '/mi-viaje' : current.role === 'ADMIN' ? '/admin/' : '/espacio'; window.history.pushState({}, '', target); setPath(target) }} onRegistered={email => { setNotice(`Cuenta creada para ${email}. Verificá el email para habilitar consumos.`); window.history.pushState({}, '', '/ingresar'); setPath('/ingresar') }} />
    if (path === '/referencia') return <QrPage signedIn={!!user} folders={folders} onRedeemed={() => void loadFolders()} />
    if (!user && path === '/consumo') return <main id="contenido" className="product-gate content-width"><h1>Ingresá para validar tu visita.</h1><p>El QR del prestador quedó disponible mientras iniciás sesión.</p><ProductLink className="button button-orange" href="/ingresar">Ingresar</ProductLink></main>
    if (!user) return <main id="contenido" className="product-gate content-width"><h1>Ingresá para continuar</h1><p>Así podemos mostrarte solo las recomendaciones autorizadas para tu cuenta.</p><div className="product-hero-actions"><ButtonLink href="/ingresar">Ingresar</ButtonLink><ButtonLink href="/registro" tone="dark">Crear mi cuenta</ButtonLink></div></main>
    if (redirectToRole) return <main id="contenido" className="product-loading" role="status">Abriendo tu espacio…</main>
    if (pageError) return <main id="contenido" className="product-gate content-width"><h1>No pudimos cargar esta información.</h1><p role="alert">{pageError}</p><button className="button button-orange" onClick={() => { setPageError(''); if (path === '/beneficios') { void loadFolders().then(() => selectedFolder ? loadProviders(selectedFolder) : undefined).catch(error => setPageError(messageOf(error))) } else { void loadTrip().catch(error => setPageError(messageOf(error))) } }}>Volver a intentar</button></main>
    if (path === '/beneficios') return selectedProvider ? <ProviderDetail folderId={folderId} provider={selectedProvider} /> : folders.length ? <FolderPage folders={folders} selected={selectedFolder} select={setSelectedFolder} providers={providers} onOpen={id => void openProvider(id)} /> : <main id="contenido" className="product-gate content-width"><p className="eyebrow">BENEFICIOS PARA VOS</p><h1>Tu primera carpeta empieza con un QR.</h1><p>Pedile a un colaborador el QR de referencia para abrir sus recomendaciones privadas. Ese código da acceso a una carpeta y no acredita una visita.</p><ButtonLink href="/referencia">Tengo un QR</ButtonLink></main>
    if (path === '/mi-viaje') return <Trip wallet={wallet} progress={progress} history={history} onRefresh={() => { setPageError(''); void loadTrip().catch(error => setPageError(messageOf(error))) }} />
    if (path === '/consumo') return <ConsumePage folders={folders} onComplete={() => { void Promise.all([loadTrip(), loadFolders()]).catch(error => setPageError(messageOf(error))) }} />
    if (path === '/perfil') return <main id="contenido" className="product-gate content-width"><p className="eyebrow">MI CUENTA</p><h1>{user.email}</h1><p>Email {user.email_verified ? 'verificado' : 'pendiente de verificación'}</p>{!user.email_verified && <form onSubmit={async event => { event.preventDefault(); try { await api('/api/v1/auth/resend-verification/', { method: 'POST', auth: false, body: { email: user.email } }); setNotice('Si corresponde, recibirás un email para verificar tu cuenta.') } catch (error) { setPageError(messageOf(error)) } }}><button className="button button-orange">Reenviar email de verificación</button></form>}<p>{notice}</p></main>
    return <main id="contenido" className="product-gate content-width"><h1>Esta sección no está disponible.</h1><a href="/">Volver a inicio</a></main>
  }
  return <ProductShell user={shellUser}>{notice && path !== '/verificar' && <div className="product-notice" role="status">{notice}</div>}{renderContent()}</ProductShell>
}
