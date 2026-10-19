import assert from 'node:assert/strict'
import { test } from 'node:test'
import { loadConfigFromFile } from 'vite'

test('las rutas Django comparten destino y saneamiento de cabeceras', async () => {
  const loaded = await loadConfigFromFile({ command: 'serve', mode: 'development' }, 'vite.config.ts')
  assert.ok(loaded)
  const routes = ['/api', '/admin', '/static/admin', '/media']
  assert.deepEqual(Object.keys(loaded.config.server.proxy).sort(), routes.sort())

  for (const route of routes) {
    const rule = loaded.config.server.proxy[route]
    assert.equal(rule.target, 'http://backend:8000', route)
    assert.equal(rule.xfwd, false, route)
    let proxyRequestHandler
    rule.configure({ on: (event, handler) => {
      assert.equal(event, 'proxyReq')
      proxyRequestHandler = handler
    } })
    assert.equal(typeof proxyRequestHandler, 'function', route)

    const headers = new Map([
      ['x-forwarded-for', '203.0.113.10'],
      ['x-real-ip', '203.0.113.11'],
      ['x-llave-client-ip', '203.0.113.12'],
    ])
    const proxyRequest = {
      removeHeader: (name) => headers.delete(name),
      setHeader: (name, value) => headers.set(name, value),
    }
    proxyRequestHandler(proxyRequest, { socket: { remoteAddress: '198.51.100.1' } })
    assert.equal(headers.has('x-forwarded-for'), false, route)
    assert.equal(headers.has('x-real-ip'), false, route)
    assert.equal(headers.get('x-llave-client-ip'), '198.51.100.1', route)

    proxyRequestHandler(proxyRequest, { socket: {} })
    assert.equal(headers.has('x-llave-client-ip'), false, route)
  }
})
