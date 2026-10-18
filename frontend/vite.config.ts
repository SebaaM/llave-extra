import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

type ProxyRequest = {
  removeHeader: (name: string) => void
  setHeader: (name: string, value: string) => void
}
type ClientRequest = { socket: { remoteAddress?: string } }
type ProxyEvents = { on: (event: 'proxyReq', listener: (proxyReq: ProxyRequest, req: ClientRequest) => void) => void }

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': {
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
      },
    },
  },
})
