import assert from 'node:assert/strict'
import { test } from 'node:test'
import { loadConfigFromFile } from 'vite'

test('el proxy descarta cabeceras de IP del navegador y usa la dirección del socket', async () => {
  const loaded = await loadConfigFromFile({ command: 'serve', mode: 'development' }, 'vite.config.ts')
  assert.ok(loaded)
  const rule = loaded.config.server.proxy['/api']
  assert.equal(rule.xfwd, false)
  let proxyRequestHandler
  rule.configure({ on: (event, handler) => {
    assert.equal(event, 'proxyReq')
    proxyRequestHandler = handler
  } })
  assert.equal(typeof proxyRequestHandler, 'function')

  const headers = new Map([
    ['x-forwarded-for', '203.0.113.10'],
    ['x-real-ip', '203.0.113.11'],
    ['x-llave-client-ip', '203.0.113.12'],
  ])
  proxyRequestHandler({
    removeHeader: (name) => headers.delete(name),
    setHeader: (name, value) => headers.set(name, value),
  }, { socket: { remoteAddress: '198.51.100.1' } })
  assert.equal(headers.has('x-forwarded-for'), false)
  assert.equal(headers.has('x-real-ip'), false)
  assert.equal(headers.get('x-llave-client-ip'), '198.51.100.1')
})
