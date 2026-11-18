import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { evaluateAudit } from '../scripts/check-audit-report.mjs'

const beforeExpiry = new Date('2026-11-18T00:00:00Z')
const advisory = (overrides = {}) => ({
  module_name: 'picomatch',
  severity: 'high',
  url: 'https://github.com/advisories/GHSA-fc5q-39xc-vjpf',
  vulnerable_versions: '<=4.0.7',
  patched_versions: '>=4.0.8',
  findings: [{ version: '4.0.7', paths: ['.>vite>picomatch', '.>vitest>vite>fdir>picomatch'] }],
  ...overrides,
})
const report = (items = []) => {
  const vulnerabilities = { info: 0, low: 0, moderate: 0, high: 0, critical: 0 }
  for (const item of items) vulnerabilities[item.severity] += 1
  return { advisories: Object.fromEntries(items.map((item, i) => [String(i), item])), metadata: { vulnerabilities } }
}

test('clean audit passes without any exception', () => {
  assert.deepEqual(evaluateAudit(report(), 0, beforeExpiry), { exceptions: [], blocked: [] })
})

test('the exact tooling advisory is explicit and time-limited', () => {
  const result = evaluateAudit(report([advisory()]), 1, beforeExpiry)
  assert.equal(result.blocked.length, 0)
  assert.equal(result.exceptions.length, 1)
  assert.equal(result.exceptions[0].url, advisory().url)
})

test('the observed TypeScript ESLint chain is also build tooling', () => {
  const finding = { version: '4.0.7', paths: ['.>typescript-eslint>@typescript-eslint/typescript-estree>tinyglobby>picomatch'] }
  const result = evaluateAudit(report([advisory({ findings: [finding] })]), 1, beforeExpiry)
  assert.equal(result.exceptions.length, 1)
  assert.equal(result.blocked.length, 0)
})

test('the known advisory blocks at and after the absolute deadline', () => {
  for (const date of ['2026-11-25T00:00:00Z', '2027-01-01T00:00:00Z']) {
    const result = evaluateAudit(report([advisory()]), 1, new Date(date))
    assert.equal(result.exceptions.length, 0)
    assert.equal(result.blocked.length, 1)
  }
})

for (const severity of ['moderate', 'high', 'critical']) {
  test(`an additional ${severity} advisory still blocks`, () => {
    const other = advisory({ url: 'https://github.com/advisories/GHSA-aaaa-bbbb-cccc', severity })
    const result = evaluateAudit(report([advisory(), other]), 1, beforeExpiry)
    assert.equal(result.exceptions.length, 1)
    assert.equal(result.blocked.length, 1)
  })
}

for (const [name, change] of [
  ['package', { module_name: 'other-package' }],
  ['version', { findings: [{ version: '4.0.6', paths: ['.>vite>picomatch'] }] }],
  ['severity', { severity: 'critical' }],
  ['affected range', { vulnerable_versions: '<=4.0.8' }],
  ['patched range', { patched_versions: '>=4.0.9' }],
  ['advisory URL', { url: 'https://example.test/GHSA-fc5q-39xc-vjpf' }],
  ['application path', { findings: [{ version: '4.0.7', paths: ['.>vite>picomatch', '.>server>picomatch'] }] }],
  ['application importing tooling', { findings: [{ version: '4.0.7', paths: ['.>server>vite>picomatch'] }] }],
  ['empty paths', { findings: [{ version: '4.0.7', paths: [] }] }],
  ['empty findings', { findings: [] }],
  ['malformed dependency chain', { findings: [{ version: '4.0.7', paths: ['.>vite>>picomatch'] }] }],
  ['invalid package token', { findings: [{ version: '4.0.7', paths: ['.>vite>invalid package>picomatch'] }] }],
]) {
  test(`a different ${name} does not inherit the exception`, () => {
    const result = evaluateAudit(report([advisory(change)]), 1, beforeExpiry)
    assert.equal(result.exceptions.length, 0)
    assert.equal(result.blocked.length, 1)
  })
}

test('low advisories retain the original moderate threshold', () => {
  for (const exitCode of [0, 1]) {
    const result = evaluateAudit(report([advisory({ severity: 'low' })]), exitCode, beforeExpiry)
    assert.equal(result.blocked.length, 0)
    assert.equal(result.exceptions.length, 0)
  }
})

test('malformed, incomplete, transport-error and inconsistent reports fail closed', () => {
  const inconsistent = report()
  inconsistent.metadata.vulnerabilities.high = 1
  for (const value of [null, {}, [], { error: { code: 'ECONNRESET' } }, { ...report(), error: { message: 'Registry failed' } }, inconsistent]) {
    assert.throws(() => evaluateAudit(value, 1, beforeExpiry))
  }
  assert.throws(() => evaluateAudit(report([advisory({ severity: 'unexpected' })]), 1, beforeExpiry))
})

test('unexpected command statuses and a suppressed audit fail closed', () => {
  for (const code of [2, 127, null, '1', NaN]) assert.throws(() => evaluateAudit(report(), code, beforeExpiry))
  assert.throws(() => evaluateAudit(report(), 1, beforeExpiry))
  assert.throws(() => evaluateAudit(report([advisory()]), 0, beforeExpiry))
  assert.throws(() => evaluateAudit(report([advisory()]), 1, new Date('invalid')))
})

test('unrecognized severity buckets are never treated as a clean report', () => {
  for (const count of [0, 1]) {
    const value = report()
    value.metadata.vulnerabilities.unknown = count
    assert.throws(() => evaluateAudit(value, 0, beforeExpiry))
  }
})

test('CLI succeeds only for a valid accepted report and rejects malformed JSON', () => {
  const scratch = mkdtempSync(join(tmpdir(), 'llaveextra-audit-test-'))
  const input = join(scratch, 'audit.json')
  const script = fileURLToPath(new URL('../scripts/check-audit-report.mjs', import.meta.url))
  try {
    writeFileSync(input, JSON.stringify(report()))
    assert.equal(spawnSync(process.execPath, [script, input, '0']).status, 0)
    assert.equal(spawnSync(process.execPath, [script, input, '1']).status, 1)
    writeFileSync(input, '{')
    assert.equal(spawnSync(process.execPath, [script, input, '0']).status, 1)
    assert.equal(spawnSync(process.execPath, [script, input, 'invalid']).status, 1)
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
})
