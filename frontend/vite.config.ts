import { defineConfig } from 'vitest/config'
import type { ProxyOptions } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

type ProxyRequest = {
  removeHeader: (name: string) => void
  setHeader: (name: string, value: string) => void
}
type ClientRequest = { socket: { remoteAddress?: string } }
type ProxyEvents = { on: (event: 'proxyReq', listener: (proxyReq: ProxyRequest, req: ClientRequest) => void) => void }

function djangoProxy(): ProxyOptions {
  return {
    target: 'http://backend:8000',
    xfwd: false,
    configure(proxy) {
      const events = proxy as unknown as ProxyEvents
      events.on('proxyReq', (proxyReq, req) => {
        // Nunca retransmitir una IP declarada por el navegador.
        for (const header of ['x-forwarded-for', 'x-real-ip', 'x-llave-client-ip']) {
          proxyReq.removeHeader(header)
        }
        const clientIp = req.socket.remoteAddress
        if (clientIp) {
          proxyReq.setHeader('x-llave-client-ip', clientIp)
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: { environment: 'jsdom', include: ['src/**/*.test.tsx'] },
  server: {
    // Windows Docker bind mounts do not reliably emit filesystem events to
    // Vite's watcher; polling keeps local preview changes and fixes live.
    watch: { usePolling: true, interval: 1000 },
    proxy: {
      '/api': djangoProxy(),
      '/admin': djangoProxy(),
      '/static/admin': djangoProxy(),
      '/media': djangoProxy(),
    },
  },
})
