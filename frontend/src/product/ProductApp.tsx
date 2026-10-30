import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, AuthCoordinationError, api, currentSessionVersion, hasPendingLogout, invalidatePrivateState, restoreSession, signOut, verifyEmailToken } from './api'
import type { Consumption, Folder, Progress, Provider, User, Wallet } from './api'
import { messageOf } from './shared'
import { consumptionToken, referralToken, setReferralToken, verifyToken, setVerifyToken } from './qr-intent'
import { ProductShell, ButtonLink } from './Layout'
import { Auth } from './PublicPages'
import { AccountPage } from './AccountPage'
import { HomePage } from './HomePage'
import { ShopPage, ShopDetail } from './shop/ShopPage'
import { BenefitDetail, CatalogPage } from './CatalogPages'
import { CreditsPage } from './CreditsPage'
import { FolderPage, ProviderDetail } from './BenefitsPages'
import { QrPage } from './ReferencePage'
import { Trip } from './JourneyPage'
import { ConsumePage } from './ConsumptionPage'
import { ProductLink } from './navigation'
import { Workspace } from './workspace/Workspace'
import { workspaceHome } from './workspace/data'
import { AdminWorkspace } from './admin/AdminWorkspace'
import { checkAdminNavigation } from './admin/hooks'
import { useSiteSettings } from './useSiteSettings'

const logoutNotice = 'La sesión se quitó de este dispositivo, pero no pudimos confirmar su cierre completo. Iniciá sesión de nuevo solo si querés continuar.'

export default function ProductApp() {
  const [path, setPath] = useState(window.location.pathname)
  const [search, setSearch] = useState(window.location.search)
  const [user, setUser] = useState<User | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [notice, setNotice] = useState(() => hasPendingLogout() ? logoutNotice : '')
  const [folders, setFolders] = useState<Folder[]>([])
  const [recommendations, setRecommendations] = useState<Record<string, boolean | 'error'>>({})
  const [folderCheckState, setFolderCheckState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const recommendationsGeneration = useRef(0)
  const recommendationsEpoch = useRef<Record<string, number>>({})
  const recommendationsController = useRef<AbortController | null>(null)
  const [selectedFolder, setSelectedFolder] = useState('')
  const [providers, setProviders] = useState<Provider[]>([])
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null)
  const [wallet, setWallet] = useState<Wallet | null>(null)
  const [progress, setProgress] = useState<Progress | null>(null)
  const [history, setHistory] = useState<Consumption[]>([])
  const [tripOwner, setTripOwner] = useState<{ identity: number; version: number } | null>(null)
  const [pageError, setPageError] = useState('')
  const identityRef = useRef<number | null>(null)
  const providersRequestRef = useRef(0)
  const detailRequestRef = useRef(0)
  const selectedFolderRef = useRef('')
  const locationRef = useRef(`${window.location.pathname}${window.location.search}`)
  const site = useSiteSettings()
  const renderedSessionVersion = currentSessionVersion()
  const renderedRecommendationsGeneration = recommendationsGeneration.current

  const stillCurrent = useCallback(
    (version: number, identity: number | null) => version === currentSessionVersion()
      && identity !== null
      && identityRef.current === identity,
    [],
  )

  const clearPrivateData = useCallback(() => {
    recommendationsGeneration.current += 1
    recommendationsController.current?.abort()
    recommendationsEpoch.current = {}
    setRecommendations({})
    setFolderCheckState('idle')
    providersRequestRef.current += 1
    detailRequestRef.current += 1
    setFolders([])
    setSelectedFolder('')
    selectedFolderRef.current = ''
    setProviders([])
    setSelectedProvider(null)
    setWallet(null)
    setProgress(null)
    setHistory([])
    setTripOwner(null)
  }, [])

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

  const loadFolders = useCallback(async () => {
    const version = currentSessionVersion()
    const identity = identityRef.current
    const generation = ++recommendationsGeneration.current
    recommendationsController.current?.abort()
    const controller = new AbortController()
    recommendationsController.current = controller
    setRecommendations({})
    setFolderCheckState('loading')
    let result: { folders: Folder[] }
    try {
      result = await api<{ folders: Folder[] }>('/api/v1/me/folders/')
    } catch (error) {
      if (stillCurrent(version, identity) && generation === recommendationsGeneration.current) setFolderCheckState('error')
      throw error
    }
    if (!stillCurrent(version, identity) || generation !== recommendationsGeneration.current) return
    setFolderCheckState('ready')
    const nextSelected = result.folders.some(folder => folder.collaborator_id === selectedFolderRef.current)
      ? selectedFolderRef.current
      : result.folders[0]?.collaborator_id ?? ''
    if (nextSelected !== selectedFolderRef.current) {
      selectedFolderRef.current = nextSelected
      setSelectedFolder(nextSelected)
      setProviders([])
      setSelectedProvider(null)
    }
    setFolders(result.folders)
    if (result.folders.length) setNotice('')
    // Los accesos no prueban que existan selecciones vigentes. Consultar solo
    // existencia en la primera página privada, sin guardar nodos ni medios.
    for (const folder of result.folders) {
      const id = folder.collaborator_id
      const epoch = recommendationsEpoch.current[id] ?? 0
      const current = () => !controller.signal.aborted && stillCurrent(version, identity) && generation === recommendationsGeneration.current && epoch === (recommendationsEpoch.current[id] ?? 0)
      void api<{ count: number }>(`/api/v1/folders/${encodeURIComponent(id)}/network/?page=1`, { signal: controller.signal }).then(network => {
        if (current()) setRecommendations(previous => ({ ...previous, [id]: network.count > 0 }))
      }).catch(() => { if (current()) setRecommendations(previous => ({ ...previous, [id]: 'error' })) })
    }
  }, [stillCurrent])

  useEffect(() => () => { recommendationsGeneration.current += 1; recommendationsController.current?.abort() }, [])

  const loadProviders = useCallback(async (folderId: string) => {
    const version = currentSessionVersion()
    const identity = identityRef.current
    const request = ++providersRequestRef.current
    const generation = recommendationsGeneration.current
    if (!folderId) {
      setProviders([])
      return
    }
    try {
      const result = await api<Provider[]>(`/api/v1/folders/${folderId}/providers/`)
      if (!stillCurrent(version, identity) || selectedFolderRef.current !== folderId || request !== providersRequestRef.current || generation !== recommendationsGeneration.current) return
      recommendationsEpoch.current[folderId] = (recommendationsEpoch.current[folderId] ?? 0) + 1
      setRecommendations(previous => ({ ...previous, [folderId]: result.length > 0 }))
      setProviders(result)
    } catch (error) {
      if (stillCurrent(version, identity) && selectedFolderRef.current === folderId && request === providersRequestRef.current && generation === recommendationsGeneration.current) {
        recommendationsEpoch.current[folderId] = (recommendationsEpoch.current[folderId] ?? 0) + 1
        setRecommendations(previous => ({ ...previous, [folderId]: 'error' }))
        throw error
      }
    }
  }, [stillCurrent])

  const selectFolder = useCallback((folderId: string) => {
    providersRequestRef.current += 1
    detailRequestRef.current += 1
    selectedFolderRef.current = folderId
    setSelectedFolder(folderId)
    setProviders([])
    setSelectedProvider(null)
    setPageError('')
  }, [])

  const updateFolderProviders = useCallback((folderId: string, version: number, identity: number, generation: number, next: Provider[]) => {
    if (!stillCurrent(version, identity) || selectedFolderRef.current !== folderId || generation !== recommendationsGeneration.current) return
    recommendationsEpoch.current[folderId] = (recommendationsEpoch.current[folderId] ?? 0) + 1
    setRecommendations(previous => ({ ...previous, [folderId]: next.length > 0 }))
    // La revalidación de medios invalida también la fuente compartida, para que
    // remontar la página no pueda restaurar la lista anterior ni un GET tardío.
    providersRequestRef.current += 1
    detailRequestRef.current += 1
    setProviders(next)
    setSelectedProvider(null)
  }, [stillCurrent])

  const clearAccount = useCallback(() => {
    identityRef.current = null
    setUser(null)
    clearPrivateData()
  }, [clearPrivateData])

  useEffect(() => {
    const applyLocation = () => {
      detailRequestRef.current += 1
      const next = `${window.location.pathname}${window.location.search}`
      locationRef.current = next
      setPath(window.location.pathname)
      setSearch(window.location.search)
      setSelectedProvider(null)
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
  }, [path, selectedProvider, authReady, user, site.settings.site_name, site.settings.home_title])

  useEffect(() => {
    let active = true
    restoreSession().then(async current => {
      if (!active) return
      identityRef.current = current?.id ?? null
      setUser(current)
      if (current?.role === 'TOURIST') {
        const openingShop = window.location.pathname === '/tienda' || window.location.pathname.startsWith('/tienda/')
        await Promise.all([loadFolders(), ...(openingShop ? [] : [loadTrip()])]).catch(error => {
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
  }, [loadFolders, loadTrip])

  useEffect(() => {
    if (user?.role !== 'TOURIST' || !selectedFolder || path !== '/recomendaciones') return
    const folderId = selectedFolder
    window.queueMicrotask(() => {
      void loadProviders(folderId).catch(error => {
        if (identityRef.current === user.id && selectedFolderRef.current === folderId) setPageError(messageOf(error))
      })
    })
  }, [user, selectedFolder, path, loadProviders])

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
    if (user?.role !== 'TOURIST' || !referralToken) return
    const version = currentSessionVersion()
    const identity = user.id
    api('/api/v1/referrals/redeem/', { method: 'POST', body: { token: referralToken } })
      .then(async () => {
        if (!stillCurrent(version, identity)) return
        setReferralToken(null)
        setNotice('Las recomendaciones se vincularon a tu cuenta.')
        await loadFolders()
      })
      .catch(error => {
        if (stillCurrent(version, identity)) setPageError(messageOf(error))
      })
  }, [user, loadFolders, stillCurrent])

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

  const openProvider = async (providerId: string) => {
    const folderId = selectedFolderRef.current
    const version = currentSessionVersion()
    const identity = identityRef.current
    const request = ++detailRequestRef.current
    if (!folderId || !identity) return
    setPageError('')
    setSelectedProvider(null)
    try {
      const provider = await api<Provider>(`/api/v1/folders/${folderId}/providers/${providerId}/`)
      if (!stillCurrent(version, identity) || selectedFolderRef.current !== folderId || request !== detailRequestRef.current) return
      setSelectedProvider(provider)
    } catch (error) {
      if (!stillCurrent(version, identity) || selectedFolderRef.current !== folderId || request !== detailRequestRef.current) return
      setPageError(messageOf(error))
      await loadFolders()
      if (!stillCurrent(version, identity) || selectedFolderRef.current !== folderId || request !== detailRequestRef.current) return
      await loadProviders(folderId).catch(() => setProviders([]))
    }
  }

  const revokeProviderView = async () => {
    const version = currentSessionVersion()
    const identity = identityRef.current
    const revokedFolder = selectedFolderRef.current
    recommendationsEpoch.current[revokedFolder] = (recommendationsEpoch.current[revokedFolder] ?? 0) + 1
    setRecommendations(previous => ({ ...previous, [revokedFolder]: false }))
    providersRequestRef.current += 1
    detailRequestRef.current += 1
    setSelectedProvider(null)
    setProviders([])
    try {
      await loadFolders()
      if (!stillCurrent(version, identity) || selectedFolderRef.current !== revokedFolder) return
      const folderId = selectedFolderRef.current
      if (folderId) await loadProviders(folderId)
    } catch (error) {
      if (stillCurrent(version, identity) && selectedFolderRef.current === revokedFolder) setPageError(messageOf(error))
    }
  }

  const isProductPublic = path === '/' || path === '/index.html'
  const isAuth = ['/registro', '/ingresar', '/recuperar', '/restablecer-clave'].includes(path)
  const redirectToRole = user && user.role !== 'TOURIST'
  const shellUser = authReady ? user : null
  const hasRecommendations = folders.some(folder => recommendations[folder.collaborator_id] === true)
  const checkingRecommendations = folderCheckState === 'loading' || (folderCheckState !== 'error' && folders.some(folder => recommendations[folder.collaborator_id] === undefined))
  const recommendationsError = folderCheckState === 'error' || folders.some(folder => recommendations[folder.collaborator_id] === 'error')

  const onLogin = (current: User) => {
    clearPrivateData()
    identityRef.current = current.id
    setUser(current)
    setNotice('')
    setPageError('')
    if (current.role === 'TOURIST') {
      void Promise.all([loadFolders(), loadTrip()]).catch(error => {
        if (identityRef.current === current.id) setPageError(messageOf(error))
      })
    }
    const target = current.role === 'TOURIST'
      ? consumptionToken ? '/consumo' : referralToken ? '/referencia' : '/mi-viaje'
      : workspaceHome(current)
    window.history.pushState({}, '', target)
    locationRef.current = target
    setPath(target)
  }

  const retry = () => {
    setPageError('')
    if (path === '/recomendaciones') {
      void loadFolders().then(() => selectedFolderRef.current ? loadProviders(selectedFolderRef.current) : undefined)
        .catch(error => setPageError(messageOf(error)))
    } else {
      void loadTrip().catch(error => setPageError(messageOf(error)))
    }
  }

  const renderContent = () => {
    if (isProductPublic) return <HomePage settings={site.settings} trip={user?.role === 'TOURIST' && wallet && progress && tripOwner?.identity === user.id && tripOwner.version === currentSessionVersion() ? { wallet, progress } : undefined} />
    if (path === '/tienda' || path === '/tienda/') return <ShopPage />
    if (path.startsWith('/tienda/')) return <ShopDetail slug={path.slice('/tienda/'.length).replace(/\/$/, '')} />
    if (path === '/beneficios') return <CatalogPage search={search} />
    if (path.startsWith('/beneficios/')) return <BenefitDetail id={path.slice('/beneficios/'.length)} />
    if (path === '/creditos-imagenes') return <CreditsPage />
    if (!authReady) return <main id="contenido" className="product-loading" role="status">Preparando tu viaje…</main>
    if (path === '/verificar-email') {
      return <main id="contenido" className="product-empty content-width"><h1>Verificá tu email</h1><p>{pageError || notice || 'Usá el enlace que enviamos a tu correo para confirmar tu cuenta.'}</p><ProductLink href="/ingresar">Ir a ingresar</ProductLink></main>
    }
    if (isAuth) {
      return <Auth
        key={path}
        mode={path === '/registro' ? 'register' : path === '/ingresar' ? 'login' : path === '/recuperar' ? 'forgot' : 'reset'}
        referral={referralToken}
        onLogin={onLogin}
        onLoginStart={clearAccount}
        onRegistered={email => {
          setNotice(`Cuenta creada para ${email}. Verificá el email para habilitar consumos.`)
          window.history.pushState({}, '', '/ingresar')
          setPath('/ingresar')
        }}
      />
    }
    if (path === '/referencia') return <QrPage key={`${user?.id}:${renderedSessionVersion}`} signedIn={!!user} canRedeem={!user || user.role === 'TOURIST'} folders={folders} hasRecommendations={hasRecommendations} checkingRecommendations={checkingRecommendations} recommendationsError={recommendationsError} onRedeemed={() => {
      const version = currentSessionVersion(), identity = identityRef.current
      void loadFolders().catch(() => { if (stillCurrent(version, identity)) setNotice('Las recomendaciones se vincularon, pero no pudimos actualizarlas. Volvé a cargar esta página para intentarlo de nuevo.') })
    }} />
    if (!user && path === '/consumo') {
      return <main id="contenido" className="product-gate content-width"><h1>Ingresá para validar tu visita.</h1><p>El QR del negocio quedó disponible mientras iniciás sesión.</p><ProductLink className="button button-orange" href="/ingresar">Ingresar</ProductLink></main>
    }
    if (!user) {
      return <main id="contenido" className="product-gate content-width"><h1>Ingresá para continuar</h1><p>Así podemos mostrarte solo las recomendaciones autorizadas para tu cuenta.</p><div className="product-hero-actions"><ButtonLink href="/ingresar">Ingresar</ButtonLink><ButtonLink href="/registro" tone="dark">Crear mi cuenta</ButtonLink></div></main>
    }
    if (redirectToRole || path.startsWith('/prestador') || path.startsWith('/colaborador')) return <main id="contenido" className="product-gate content-width"><h1>Esta sección no corresponde a tu rol.</h1><ProductLink href={workspaceHome(user)} className="button button-dark">Ir a mi espacio</ProductLink></main>
    if (pageError) {
      return <main id="contenido" className="product-gate content-width"><h1>No pudimos cargar esta información.</h1><p role="alert">{pageError}</p><button className="button button-orange" onClick={retry}>Volver a intentar</button></main>
    }
    if (path === '/recomendaciones') {
      if (selectedProvider) return <ProviderDetail folderId={selectedFolder} provider={selectedProvider} onAccessRevoked={() => void revokeProviderView()} />
      if (folders.length) return <FolderPage folders={folders} selected={selectedFolder} select={selectFolder} providers={providers} onOpen={id => void openProvider(id)} onAccessRevoked={() => void revokeProviderView()} onProvidersChange={next => updateFolderProviders(selectedFolder, renderedSessionVersion, user.id, renderedRecommendationsGeneration, next)} />
      return <main id="contenido" className="product-gate content-width"><p className="eyebrow">BENEFICIOS PARA VOS</p><h1>Las recomendaciones llegan con un QR.</h1><p>Si recibiste un QR de recomendaciones, abrilo para explorar los beneficios que te compartieron. También podés descubrir negocios y registrar visitas por tu cuenta.</p><ButtonLink href="/referencia">Tengo un QR</ButtonLink></main>
    }
    if (path === '/mi-viaje') return <Trip wallet={wallet} progress={progress} history={history} onRefresh={() => { setPageError(''); void loadTrip().catch(error => setPageError(messageOf(error))) }} />
    if (path === '/consumo') return <ConsumePage key={`${user.id}:${renderedSessionVersion}`} folders={folders} onComplete={() => {
      const version = currentSessionVersion(), identity = identityRef.current
      void Promise.allSettled([loadTrip(), loadFolders()]).then(results => {
        if (stillCurrent(version, identity) && results.some(result => result.status === 'rejected')) setNotice('El resultado del consumo ya fue confirmado. No pudimos actualizar Mi viaje y tus recomendaciones; abrí Mi viaje y usá Actualizar. No hace falta volver a validar la visita.')
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
  return <ProductShell path={path} user={shellUser} hasRecommendations={hasRecommendations} settings={site.settings} settingsError={site.error} retrySettings={site.retry}>{notice && path !== '/verificar' && path !== '/perfil' && <div className="product-notice" role="status">{notice}</div>}{renderContent()}</ProductShell>
}
