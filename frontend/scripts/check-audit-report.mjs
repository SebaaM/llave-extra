import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const levels = ['info', 'low', 'moderate', 'high', 'critical']
const advisoryUrl = 'https://github.com/advisories/GHSA-fc5q-39xc-vjpf'
const expiresAt = Date.parse('2026-11-25T00:00:00Z')
const toolingRoots = new Set(['vite', 'vitest', '@vitejs/plugin-react', '@tailwindcss/vite', 'typescript-eslint'])
const packageName = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value)

function isTemporaryToolingException(advisory, now) {
  return now.getTime() < expiresAt
    && advisory.url === advisoryUrl
    && advisory.module_name === 'picomatch'
    && advisory.severity === 'high'
    && advisory.vulnerable_versions === '<=4.0.7'
    && advisory.patched_versions === '>=4.0.8'
    && Array.isArray(advisory.findings)
    && advisory.findings.length > 0
    && advisory.findings.every(finding => isObject(finding)
      && finding.version === '4.0.7'
      && Array.isArray(finding.paths)
      && finding.paths.length > 0
      && finding.paths.every(path => {
        if (typeof path !== 'string') return false
        const parts = path.split('>')
        return parts[0] === '.'
          && parts.slice(1).every(part => packageName.test(part))
          && toolingRoots.has(parts[1])
          && parts.at(-1) === 'picomatch'
          && parts.some(part => ['vite', 'vitest', '@typescript-eslint/typescript-estree'].includes(part))
      }))
}

export function evaluateAudit(report, auditExit, now = new Date()) {
  if (![0, 1].includes(auditExit) || !(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw new Error('Invalid audit exit code or clock.')
  }
  if (!isObject(report) || Object.hasOwn(report, 'error') || !isObject(report.advisories)
    || !isObject(report.metadata) || !isObject(report.metadata.vulnerabilities)) {
    throw new Error('Audit failed or returned an unsupported report.')
  }
  const advisories = Object.values(report.advisories)
  if (Object.keys(report.metadata.vulnerabilities).some(level => !levels.includes(level))) {
    throw new Error('Audit report contains an unrecognized severity bucket.')
  }
  for (const advisory of advisories) {
    if (!isObject(advisory) || !levels.includes(advisory.severity)
      || typeof advisory.module_name !== 'string' || !advisory.module_name
      || typeof advisory.url !== 'string' || !advisory.url) {
      throw new Error('Invalid advisory in audit report.')
    }
  }
  for (const level of levels) {
    const count = report.metadata.vulnerabilities[level]
    if (!Number.isSafeInteger(count) || count < 0
      || count !== advisories.filter(advisory => advisory.severity === level).length) {
      throw new Error('Audit vulnerability counts are missing or inconsistent.')
    }
  }
  const actionable = advisories.filter(advisory => levels.indexOf(advisory.severity) >= levels.indexOf('moderate'))
  // Some pnpm JSON versions report exit 1 even for below-threshold advisories.
  if ((actionable.length > 0 && auditExit !== 1) || (advisories.length === 0 && auditExit !== 0)) {
    throw new Error('Audit status disagrees with the report; refusing a suppressed or failed audit.')
  }
  return {
    exceptions: actionable.filter(advisory => isTemporaryToolingException(advisory, now)),
    blocked: actionable.filter(advisory => !isTemporaryToolingException(advisory, now)),
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 4 || !/^[01]$/.test(process.argv[3])) {
      throw new Error('Usage: node scripts/check-audit-report.mjs <report.json> <audit-exit-code>')
    }
    const report = JSON.parse(readFileSync(process.argv[2], 'utf8').replace(/^\uFEFF/, ''))
    const result = evaluateAudit(report, Number(process.argv[3]))
    console.log(JSON.stringify({ vulnerabilities: report.metadata.vulnerabilities }))
    for (const advisory of result.exceptions) {
      console.warn(`::warning title=Temporary picomatch risk exception::${advisory.url} remains HIGH and UNPATCHED. Only picomatch 4.0.7 through approved Vite/Vitest/TypeScript ESLint tooling is accepted until 2026-11-25T00:00:00Z. This is not a vulnerability fix.`)
    }
    if (result.blocked.length) {
      console.error(JSON.stringify({ blocked: result.blocked.map(({ module_name, severity, url }) => ({ module_name, severity, url })) }))
      process.exitCode = 1
    } else {
      console.log(`Audit policy accepted with ${result.exceptions.length} temporary exception(s).`)
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Audit policy evaluation failed.')
    process.exitCode = 1
  }
}
