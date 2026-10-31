// lint-changed runs ESLint on the frontend source files a branch adds or
// modifies relative to a base ref (default origin/main), so the naming rule
// applies to touched files without failing on untouched legacy code.
//
//   npm run lint:changed               # vs origin/main
//   npm run lint:changed -- origin/x   # vs another base (CI passes the PR base)
import { execFileSync, spawnSync } from 'node:child_process'
import { relative, resolve } from 'node:path'

const base = process.argv[2] ?? 'origin/main'
const repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()
const frontendRoot = resolve(import.meta.dirname, '..')

let changed
try {
  changed = execFileSync('git', ['diff', '--name-only', '--diff-filter=ACMR', `${base}...HEAD`, '--', 'frontend/src'],
    { cwd: repoRoot, encoding: 'utf8' })
} catch {
  // An unresolvable base must fail, not lint nothing (same rule as the PR guard).
  console.error(`lint:changed: cannot diff against ${base}; fetch it first (git fetch origin).`)
  process.exit(2)
}

const files = changed.split('\n')
  .filter(path => /\.(ts|tsx)$/.test(path) && !path.endsWith('.gen.ts'))
  .map(path => relative(frontendRoot, resolve(repoRoot, path)))

if (files.length === 0) {
  console.log(`lint:changed: no frontend source changes vs ${base}`)
  process.exit(0)
}
console.log(`lint:changed: ${files.length} file(s) vs ${base}`)
const result = spawnSync('npx', ['eslint', ...files], { cwd: frontendRoot, stdio: 'inherit' })
process.exit(result.status ?? 1)
