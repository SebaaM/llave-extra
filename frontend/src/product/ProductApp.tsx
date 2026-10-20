import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, AuthCoordinationError, api, currentSessionVersion, hasPendingLogout, restoreSession, signOut, verifyEmailToken } from './api'
import type { Consumption, Folder, Progress, Provider, User, Wallet } from './api'
import { messageOf } from './shared'
import { consumptionToken, referralToken, setReferralToken, verifyToken, setVerifyToken } from './qr-intent'
import { ProductShell, ButtonLink } from './Layout'
import { Auth } from './PublicPages'
import { HomePage } from './HomePage'
import { BenefitDetail, CatalogPage } from './CatalogPages'
import { CreditsPage } from './CreditsPage'
import { FolderPage, ProviderDetail } from './BenefitsPages'
import { QrPage } from './ReferencePage'
import { Trip } from './JourneyPage'
import { ConsumePage } from './ConsumptionPage'
import { ProductLink } from './navigation'

const logoutNotice = 'La sesión se quitó de este dispositivo, pero no pudimos confirmar su revocación en el servidor. Iniciá sesión de nuevo solo si querés continuar.'

export default function ProductApp() {
  const [path, setPath] = useState(window.location.pathname)
  const [user, setUser] = useState<User | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [notice, setNotice] = useState(() => hasPendingLogout() ? logoutNotice : '')
  const [folders, setFolders] = useState<Folder[]>([])
  const [selectedFolder, setSelectedFolder] = useState('')
  const [providers, setProviders] = useState<Provider[]>([])
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null)
  const [wallet, setWallet] = useState<Wallet | null>(null)
  const [progress, setProgress] = useState<Progress | null>(null)
  const [history, setHistory] = useState<Consumption[]>([])
  const [pageError, setPageError] = useState('')
  const identityRef = useRef<number | null>(null)
  const selectedFolderRef = useRef('')

  const stillCurrent = useCallback(
    (version: number, identity: number | null) => version === currentSessionVersion()
      && identity !== null
      && identityRef.current === identity,
    [],
  )

  const clearPrivateData = useCallback(() => {
    setFolders([])
    setSelectedFolder('')
    selectedFolderRef.current = ''
    setProviders([])
    setSelectedProvider(null)
    setWallet(null)
    setProgress(null)
    setHistory([])
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
  }, [stillCurrent])

  const loadFolders = useCallback(async () => {
    const version = currentSessionVersion()
    const identity = identityRef.current
    const result = await api<{ folders: Folder[] }>('/api/v1/me/folders/')
    if (!stillCurrent(version, identity)) return
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
  }, [stillCurrent])

  const loadProviders = useCallback(async (folderId: string) => {
    const version = currentSessionVersion()
    const identity = identityRef.current
    if (!folderId) {
      setProviders([])
      return
    }
    const result = await api<Provider[]>(`/api/v1/folders/${folderId}/providers/`)
    if (!stillCurrent(version, identity) || selectedFolderRef.current !== folderId) return
    setProviders(result)
  }, [stillCurrent])

  const selectFolder = useCallback((folderId: string) => {
    selectedFolderRef.current = folderId
    setSelectedFolder(folderId)
    setProviders([])
    setSelectedProvider(null)
    setPageError('')
  }, [])

  const clearAccount = useCallback(() => {
    identityRef.current = null
    setUser(null)
    clearPrivateData()
  }, [clearPrivateData])

  useEffect(() => {
    const update = () => {
      setPath(window.location.pathname)
      setSelectedProvider(null)
      setPageError('')
    }
    const route = (event: Event) => {
      const target = (event as CustomEvent<string>).detail
      window.history.pushState({}, '', target)
      update()
    }
    window.addEventListener('popstate', update)
    window.addEventListener('llave:navigate', route)
    return () => {
      window.removeEventListener('popstate', update)
      window.removeEventListener('llave:navigate', route)
    }
  }, [])

  useEffect(() => {
    const heading = document.querySelector<HTMLElement>('#contenido h1')
    const title = heading?.textContent?.replace(/\s+/g, ' ').trim() || 'Beneficios para tu viaje'
    document.title = `${title} · Llave Extra`
  }, [path, selectedProvider, authReady, user])

  useEffect(() => {
    let active = true
    restoreSession().then(async current => {
      if (!active) return
      identityRef.current = current?.id ?? null
      setUser(current)
      if (current?.role === 'TOURIST') {
        await Promise.all([loadFolders(), loadTrip()]).catch(error => {
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
  }, [clearAccount])

  useEffect(() => {
    if (user?.role !== 'TOURIST' || !referralToken) return
    const version = currentSessionVersion()
    const identity = user.id
    api('/api/v1/referrals/redeem/', { method: 'POST', body: { token: referralToken } })
      .then(async () => {
        if (!stillCurrent(version, identity)) return
        setReferralToken(null)
        setNotice('La referencia se vinculó a tu cuenta.')
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
    if (authReady && user?.role === 'ADMIN' && (path === '/espacio' || path === '/admin')) window.location.replace('/admin/')
  }, [authReady, user, path])

  const openProvider = async (providerId: string) => {
    const folderId = selectedFolderRef.current
    const version = currentSessionVersion()
    const identity = identityRef.current
    if (!folderId || !identity) return
    setPageError('')
    setSelectedProvider(null)
    try {
      const provider = await api<Provider>(`/api/v1/folders/${folderId}/providers/${providerId}/`)
      if (!stillCurrent(version, identity) || selectedFolderRef.current !== folderId) return
      setSelectedProvider(provider)
    } catch (error) {
      if (!stillCurrent(version, identity) || selectedFolderRef.current !== folderId) return
      setPageError(messageOf(error))
      await loadFolders()
      await loadProviders(folderId).catch(() => setProviders([]))
    }
  }

  const revokeProviderView = async () => {
    setSelectedProvider(null)
    setProviders([])
    try {
      await loadFolders()
      const folderId = selectedFolderRef.current
      if (folderId) await loadProviders(folderId)
    } catch (error) {
      setPageError(messageOf(error))
    }
  }

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
      void Promise.all([loadFolders(), loadTrip()]).catch(error => {
        if (identityRef.current === current.id) setPageError(messageOf(error))
      })
    }
    const target = current.role === 'TOURIST'
      ? consumptionToken ? '/consumo' : referralToken ? '/referencia' : '/mi-viaje'
      : current.role === 'ADMIN' ? '/admin/' : '/espacio'
    window.history.pushState({}, '', target)
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
    if (isProductPublic) return <HomePage />
    if (path === '/beneficios') return <CatalogPage />
    if (path.startsWith('/beneficios/')) return <BenefitDetail id={path.slice('/beneficios/'.length)} />
    if (path === '/creditos-imagenes') return <CreditsPage />
    if (!authReady) return <main id="contenido" className="product-loading" role="status">Preparando tu viaje…</main>
    if (path === '/espacio' || (user && user.role !== 'TOURIST')) {
      return <main id="contenido" className="product-empty content-width"><h1>Tu espacio de trabajo</h1><p>La gestión de Colaborador y Prestador forma parte de la siguiente etapa de Llave Extra.</p><a className="button button-orange" href="/">Volver a beneficios</a></main>
    }
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
    if (path === '/referencia') return <QrPage signedIn={!!user} folders={folders} onRedeemed={() => void loadFolders()} />
    if (!user && path === '/consumo') {
      return <main id="contenido" className="product-gate content-width"><h1>Ingresá para validar tu visita.</h1><p>El QR del prestador quedó disponible mientras iniciás sesión.</p><ProductLink className="button button-orange" href="/ingresar">Ingresar</ProductLink></main>
    }
    if (!user) {
      return <main id="contenido" className="product-gate content-width"><h1>Ingresá para continuar</h1><p>Así podemos mostrarte solo las recomendaciones autorizadas para tu cuenta.</p><div className="product-hero-actions"><ButtonLink href="/ingresar">Ingresar</ButtonLink><ButtonLink href="/registro" tone="dark">Crear mi cuenta</ButtonLink></div></main>
    }
    if (redirectToRole) return <main id="contenido" className="product-loading" role="status">Abriendo tu espacio…</main>
    if (pageError) {
      return <main id="contenido" className="product-gate content-width"><h1>No pudimos cargar esta información.</h1><p role="alert">{pageError}</p><button className="button button-orange" onClick={retry}>Volver a intentar</button></main>
    }
    if (path === '/recomendaciones') {
      if (selectedProvider) return <ProviderDetail folderId={selectedFolder} provider={selectedProvider} onAccessRevoked={() => void revokeProviderView()} />
      if (folders.length) return <FolderPage folders={folders} selected={selectedFolder} select={selectFolder} providers={providers} onOpen={id => void openProvider(id)} onAccessRevoked={() => void revokeProviderView()} />
      return <main id="contenido" className="product-gate content-width"><p className="eyebrow">BENEFICIOS PARA VOS</p><h1>Tu primera carpeta empieza con un QR.</h1><p>Pedile a un colaborador el QR de referencia para abrir sus recomendaciones privadas. Ese código da acceso a una carpeta y no acredita una visita.</p><ButtonLink href="/referencia">Tengo un QR</ButtonLink></main>
    }
    if (path === '/mi-viaje') return <Trip wallet={wallet} progress={progress} history={history} onRefresh={() => { setPageError(''); void loadTrip().catch(error => setPageError(messageOf(error))) }} />
    if (path === '/consumo') return <ConsumePage folders={folders} onComplete={() => { void Promise.all([loadTrip(), loadFolders()]).catch(error => setPageError(messageOf(error))) }} />
    if (path === '/perfil') {
      return <main id="contenido" className="product-gate content-width"><p className="eyebrow">MI CUENTA</p><h1>{user.email}</h1><p>Email {user.email_verified ? 'verificado' : 'pendiente de verificación'}</p>{!user.email_verified && <form onSubmit={async event => { event.preventDefault(); try { await api('/api/v1/auth/resend-verification/', { method: 'POST', auth: false, body: { email: user.email } }); setNotice('Si corresponde, recibirás un email para verificar tu cuenta.') } catch (error) { setPageError(messageOf(error)) } }}><button className="button button-orange">Reenviar email de verificación</button></form>}<p>{notice}</p></main>
    }
    return <main id="contenido" className="product-gate content-width"><h1>Esta sección no está disponible.</h1><a href="/">Volver a inicio</a></main>
  }

  return <ProductShell user={shellUser}>{notice && path !== '/verificar' && <div className="product-notice" role="status">{notice}</div>}{renderContent()}</ProductShell>
}
