import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, AuthCoordinationError, api, currentSessionVersion, hasPendingLogout, invalidatePrivateState, restoreSession, signOut, verifyEmailToken } from './api'
import type { Consumption, Progress, User, Wallet } from './api'
import { messageOf } from './shared'
import { consumptionToken, captureQrIntent, verifyToken, setVerifyToken } from './qr-intent'
import { ProductShell, ButtonLink } from './Layout'
import { Auth } from './PublicPages'
import { AccountPage } from './AccountPage'
import { HomePage } from './HomePage'
import { ShopPage, ShopDetail } from './shop/ShopPage'
import { BenefitDetail, CatalogPage } from './CatalogPages'
import { CreditsPage } from './CreditsPage'
import { ContactPage } from './ContactPage'
import { QrPage } from './ReferencePage'
import { Trip } from './JourneyPage'
import { ConsumePage } from './ConsumptionPage'
import { ProductLink } from './navigation'
import { Workspace } from './workspace/Workspace'
import { workspaceHome } from './workspace/data'
import { AdminWorkspace } from './admin/AdminWorkspace'
import { checkAdminNavigation } from './admin/hooks'
import { useSiteSettings } from './useSiteSettings'
import { useQrContext } from './useQrContext'
import { useVisitCommand } from './useVisitCommand'

const clientPath = (path: string) => path.replace(/\/+$/, '') === '/recomendaciones' ? '/beneficios' : path

const logoutNotice = 'La sesión se quitó de este dispositivo, pero no pudimos confirmar su cierre completo. Iniciá sesión de nuevo solo si querés continuar.'

export default function ProductApp() {
  const [path, setPath] = useState(() => clientPath(window.location.pathname))
  const [search, setSearch] = useState(window.location.search)
  const [user, setUser] = useState<User | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [notice, setNotice] = useState(() => hasPendingLogout() ? logoutNotice : '')
  const [wallet, setWallet] = useState<Wallet | null>(null)
  const [progress, setProgress] = useState<Progress | null>(null)
  const [history, setHistory] = useState<Consumption[]>([])
  const [tripOwner, setTripOwner] = useState<{ identity: number; version: number } | null>(null)
  const [pageError, setPageError] = useState('')
  const identityRef = useRef<number | null>(null)
  const locationRef = useRef(`${window.location.pathname}${window.location.search}`)
  const site = useSiteSettings()
  const renderedSessionVersion = currentSessionVersion()
  const qr = useQrContext(user, path)
  const clearQrContext = qr.clear
  const visit = useVisitCommand()
  const resetVisit = visit.reset

  const stillCurrent = useCallback(
    (version: number, identity: number | null) => version === currentSessionVersion()
      && identity !== null
      && identityRef.current === identity,
    [],
  )

  const clearPrivateData = useCallback(() => {
    resetVisit()
    setWallet(null)
    setProgress(null)
    setHistory([])
    setTripOwner(null)
  }, [resetVisit])

  const loadTrip = useCallback(async () => {
    const version = currentSessionVersion()
    const identity = identityRef.current
    const [nextWallet, nextProgress, nextHistory] = await Promise.all([
      api<Wallet>('/api/v1/me/wallet/'),
      api<Progress>('/api/v1/me/progress/'),
      api<Consumption[]>('/api/v1/me/consumptions/'),
    ])
    if (!stillCurrent(version, identity)) return
    setWallet(nextWallet)
    setProgress(nextProgress)
    setHistory(nextHistory)
    setTripOwner({ identity: identity!, version })
  }, [stillCurrent])

  const clearAccount = useCallback((keepIntent = false) => {
    clearQrContext(keepIntent)
    identityRef.current = null
    setUser(null)
    clearPrivateData()
  }, [clearPrivateData, clearQrContext])

  useEffect(() => {
    const applyLocation = () => {
      captureQrIntent()
      const normalized = clientPath(window.location.pathname)
      if (normalized !== window.location.pathname) window.history.replaceState({}, '', `${normalized}${window.location.search}`)
      const next = `${window.location.pathname}${window.location.search}`
      locationRef.current = next
      setPath(window.location.pathname)
      setSearch(window.location.search)
      setPageError('')
    }
    const onPopState = () => {
      const next = `${window.location.pathname}${window.location.search}`
      if (locationRef.current.startsWith('/gestion') && next !== locationRef.current && !checkAdminNavigation()) {
        window.history.pushState({}, '', locationRef.current)
        return
      }
      applyLocation()
    }
    const route = (event: Event) => {
      const target = (event as CustomEvent<string>).detail
      if (locationRef.current.startsWith('/gestion') && target !== locationRef.current && !checkAdminNavigation()) return
      window.history.pushState({}, '', target)
      applyLocation()
    }
    applyLocation()
    window.addEventListener('popstate', onPopState)
    window.addEventListener('llave:navigate', route)
    return () => {
      window.removeEventListener('popstate', onPopState)
      window.removeEventListener('llave:navigate', route)
    }
  }, [])

  useEffect(() => {
    const heading = document.querySelector<HTMLElement>('#contenido h1')
    const title = heading?.textContent?.replace(/\s+/g, ' ').trim() || 'Beneficios para tu viaje'
    document.title = `${title} · ${site.settings.site_name}`
  }, [path, authReady, user, site.settings.site_name, site.settings.home_title, qr.state.status, qr.state.collaborator?.name])

  useEffect(() => {
    const handler = () => {
      clearAccount()
      setPageError('')
      setNotice('Tu sesión cambió. Volvé a ingresar para continuar.')
    }
    window.addEventListener('llave:session-replaced', handler)
    return () => window.removeEventListener('llave:session-replaced', handler)
  }, [clearAccount])

  useEffect(() => {
    let active = true
    restoreSession().then(async current => {
      if (!active) return
      identityRef.current = current?.id ?? null
      setUser(current)
      if (current?.role === 'TOURIST') {
        const openingShop = window.location.pathname === '/tienda' || window.location.pathname.startsWith('/tienda/')
        await Promise.all(openingShop ? [] : [loadTrip()]).catch(error => {
          if (active && identityRef.current === current.id) setPageError(messageOf(error))
        })
      }
    }).catch(error => {
      if (!active) return
      if (error instanceof AuthCoordinationError) setNotice(error.message)
      else if (!(error instanceof ApiError && error.status === 401)) setPageError(messageOf(error))
    }).finally(() => {
      if (active) setAuthReady(true)
    })
    return () => { active = false }
  }, [loadTrip])

  useEffect(() => {
    if (user?.role !== 'TOURIST' || path !== '/mi-viaje') return
    void loadTrip().catch(error => {
      if (identityRef.current === user.id) setPageError(messageOf(error))
    })
  }, [user, path, loadTrip])

  useEffect(() => {
    const handler = () => {
      if (path.startsWith('/gestion') && !checkAdminNavigation()) return
      // Hide the current account's private state before starting network I/O.
      clearAccount()
      setPageError('')
      setNotice(logoutNotice)
      void signOut().then(() => {
        setNotice('')
        window.history.pushState({}, '', '/')
        setPath('/')
      }).catch(() => {
        setNotice(`${logoutNotice} Para volver a entrar, usá un navegador actualizado en una conexión segura (HTTPS).`)
        window.history.pushState({}, '', '/')
        setPath('/')
      })
    }
    window.addEventListener('llave:logout', handler)
    return () => window.removeEventListener('llave:logout', handler)
  }, [clearAccount, path])

  useEffect(() => {
    const handler = () => {
      invalidatePrivateState()
      clearAccount()
      setNotice('Tu acceso administrativo cambió. Ingresá de nuevo si necesitás continuar.')
      window.history.replaceState({}, '', '/ingresar')
      locationRef.current = '/ingresar'
      setPath('/ingresar')
      setSearch('')
    }
    window.addEventListener('llave:admin-revoked', handler)
    return () => window.removeEventListener('llave:admin-revoked', handler)
  }, [clearAccount])

  useEffect(() => {
    if (!verifyToken) return
    verifyEmailToken(verifyToken).then(() => {
      setVerifyToken(null)
      setNotice('Email verificado. Ya podés acreditar consumos elegibles.')
    }).catch(error => setPageError(messageOf(error)))
  }, [])

  useEffect(() => {
    if (!authReady || !user) return
    if (path === '/espacio' || (user.role === 'ADMIN' && path === '/admin')) {
      const target = workspaceHome(user)
      window.history.replaceState({}, '', target)
      window.dispatchEvent(new PopStateEvent('popstate'))
    }
  }, [authReady, user, path])

  useEffect(() => {
    window.addEventListener('llave:referral-intent', visit.newIntent)
    window.addEventListener('llave:consumption-intent', visit.newIntent)
    window.addEventListener('llave:qr-context-changed', visit.newIntent)
    return () => {
      window.removeEventListener('llave:referral-intent', visit.newIntent)
      window.removeEventListener('llave:consumption-intent', visit.newIntent)
      window.removeEventListener('llave:qr-context-changed', visit.newIntent)
    }
  }, [visit.newIntent])

  const isProductPublic = path === '/' || path === '/index.html'
  const isAuth = ['/registro', '/ingresar', '/recuperar', '/restablecer-clave'].includes(path)
  const redirectToRole = user && user.role !== 'TOURIST'
  const shellUser = authReady ? user : null
  const onLogin = (current: User) => {
    clearPrivateData()
    identityRef.current = current.id
    setUser(current)
    setNotice('')
    setPageError('')
    if (current.role === 'TOURIST') {
      void loadTrip().catch(error => {
        if (identityRef.current === current.id) setPageError(messageOf(error))
      })
    }
    const target = current.role === 'TOURIST'
      ? consumptionToken ? '/consumo' : qr.hasPendingIntent() ? '/referencia' : '/mi-viaje'
      : workspaceHome(current)
    window.history.pushState({}, '', target)
    locationRef.current = target
    setPath(target)
  }

  const retry = () => {
    setPageError('')
    void loadTrip().catch(error => setPageError(messageOf(error)))
  }

  const renderContent = () => {
    if (isProductPublic) return <HomePage settings={site.settings} trip={user?.role === 'TOURIST' && wallet && progress && tripOwner?.identity === user.id && tripOwner.version === currentSessionVersion() ? { wallet, progress } : undefined} />
    if (path === '/tienda' || path === '/tienda/') return <ShopPage />
    if (path.startsWith('/tienda/')) return <ShopDetail slug={path.slice('/tienda/'.length).replace(/\/$/, '')} />
    if (path === '/beneficios') return <CatalogPage search={search} />
    if (path.startsWith('/beneficios/')) return <BenefitDetail id={path.slice('/beneficios/'.length)} />
    if (path === '/creditos-imagenes') return <CreditsPage />
    if (path === '/contacto' || path === '/contacto/') return <ContactPage settings={site.settings} />
    if (!authReady) return <main id="contenido" className="product-loading" role="status">Preparando tu viaje…</main>
    if (path === '/verificar-email') {
      return <main id="contenido" className="product-empty content-width"><h1>Verificá tu email</h1><p>{pageError || notice || 'Usá el enlace que enviamos a tu correo para confirmar tu cuenta.'}</p><ProductLink href="/ingresar">Ir a ingresar</ProductLink></main>
    }
    if (isAuth) {
      return <Auth
        key={path}
        mode={path === '/registro' ? 'register' : path === '/ingresar' ? 'login' : path === '/recuperar' ? 'forgot' : 'reset'}
        referral={qr.draftToken || null}
        onLogin={onLogin}
        onLoginStart={() => clearAccount(true)}
        onRegistered={email => {
          setNotice(`Cuenta creada para ${email}. Verificá el email para habilitar consumos.`)
          window.history.pushState({}, '', '/ingresar')
          setPath('/ingresar')
        }}
      />
    }
    if (path === '/referencia') return <QrPage signedIn={!!user} canRedeem={!user || user.role === 'TOURIST'} coordinator={qr} />
    if (!user && path === '/consumo') {
      return <main id="contenido" className="product-gate content-width"><h1>Ingresá para validar tu visita.</h1><p>El QR del negocio quedó disponible mientras iniciás sesión.</p><ProductLink className="button button-orange" href="/ingresar">Ingresar</ProductLink></main>
    }
    if (!user) {
      return <main id="contenido" className="product-gate content-width"><h1>Ingresá para continuar</h1><p>Así podés consultar tu viaje y validar tus visitas.</p><div className="product-hero-actions"><ButtonLink href="/ingresar">Ingresar</ButtonLink><ButtonLink href="/registro" tone="dark">Crear mi cuenta</ButtonLink></div></main>
    }
    if (redirectToRole || path.startsWith('/prestador') || path.startsWith('/colaborador')) return <main id="contenido" className="product-gate content-width"><h1>Esta sección no corresponde a tu rol.</h1><ProductLink href={workspaceHome(user)} className="button button-dark">Ir a mi espacio</ProductLink></main>
    if (pageError) {
      return <main id="contenido" className="product-gate content-width"><h1>No pudimos cargar esta información.</h1><p role="alert">{pageError}</p><button className="button button-orange" onClick={retry}>Volver a intentar</button></main>
    }
    if (path === '/mi-viaje') return <Trip wallet={wallet} progress={progress} history={history} onRefresh={() => { setPageError(''); void loadTrip().catch(error => setPageError(messageOf(error))) }} />
    if (path === '/consumo') return <ConsumePage key={`${user.id}:${renderedSessionVersion}`} context={qr.state} command={visit} onReferenceDenied={qr.block} onDirect={() => qr.clear()} onComplete={() => {
      const version = currentSessionVersion(), identity = identityRef.current
      void loadTrip().catch(() => {
        if (stillCurrent(version, identity)) setNotice('El resultado del consumo ya fue confirmado. No pudimos actualizar Mi viaje; abrí Mi viaje y usá Actualizar. No hace falta volver a validar la visita.')
      })
    }} />
    if (path === '/perfil') {
      return <AccountPage key={`${user.id}:${renderedSessionVersion}`} user={user} notice={notice} onResend={async () => {
        const version = currentSessionVersion(), identity = identityRef.current
        await api('/api/v1/auth/resend-verification/', { method: 'POST', auth: false, body: { email: user.email } })
        if (stillCurrent(version, identity)) setNotice('Si corresponde, recibirás un email para verificar tu cuenta.')
      }} />
    }
    return <main id="contenido" className="product-gate content-width"><h1>Esta sección no está disponible.</h1><a href="/">Volver a inicio</a></main>
  }

  const inAdmin = user && authReady && user.role === 'ADMIN' && (path === '/gestion' || path.startsWith('/gestion/'))
  if (inAdmin) return <AdminWorkspace key={`${user.id}:${currentSessionVersion()}:${path}`} user={user} path={path} search={search} />
  const inWorkspace = user && authReady && ((user.role === 'PROVIDER' && (path === '/prestador' || path.startsWith('/prestador/'))) || (user.role === 'COLLABORATOR' && (path === '/colaborador' || path.startsWith('/colaborador/'))))
  if (inWorkspace) return <Workspace key={`${user.id}:${currentSessionVersion()}:${path}`} user={user} path={path} />
  return <ProductShell path={path} user={shellUser} settings={site.settings} settingsError={site.error} retrySettings={site.retry}>{notice && path !== '/verificar' && path !== '/perfil' && <div className="product-notice" role="status">{notice}</div>}{renderContent()}</ProductShell>
}
