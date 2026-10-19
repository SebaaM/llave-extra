import assert from 'node:assert/strict'
import test from 'node:test'
import { demoCodes, isPrivatePath, validateDemoQr } from './model.ts'

test('el QR demo válido requiere coincidencia exacta y el deshabilitado no concede acceso', () => {
  assert.equal(validateDemoQr(`  ${demoCodes.valid.toLowerCase()} `), 'valid')
  assert.equal(validateDemoQr(demoCodes.disabled), 'disabled')
  assert.equal(validateDemoQr(`${demoCodes.valid}-OTRO`), 'invalid')
  assert.equal(validateDemoQr(''), 'invalid')
})

test('las rutas privadas distinguen carpeta y fichas de portadas públicas', () => {
  assert.equal(isPrivatePath('/prototipos/guia'), false)
  assert.equal(isPrivatePath('/prototipos/beneficios/registro'), false)
  for (const variant of ['guia', 'pasaporte', 'beneficios']) {
    assert.equal(isPrivatePath(`/prototipos/${variant}/carpeta`), true)
    assert.equal(isPrivatePath(`/prototipos/${variant}/prestador/kuar`), true)
  }
})
