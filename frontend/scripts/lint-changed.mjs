// lint-changed runs ESLint on the frontend source files a branch adds or
// modifies relative to a base ref (default origin/main), so the naming rule
// applies to touched files without failing on untouched legacy code.
//
//   npm run lint:changed               # vs origin/main
//   npm run lint:changed -- origin/x   # vs another base (CI passes the PR base)
import { execFileSync, spawnSync } from 'node:child_process'
import { relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

// Exit status for a base ref git cannot diff against.
export const UNRESOLVED_BASE_EXIT = 2

export class UnresolvedBaseError extends Error {}

// changedSourceFiles lists the .ts/.tsx files under frontend/src that HEAD
// adds, copies, modifies or renames vs base (deleted and generated files are
// skipped), as paths relative to frontendRoot. Throws UnresolvedBaseError
// when base cannot be resolved.
export function changedSourceFiles(base, repoRoot, frontendRoot) {
  let changed
  try {
    changed = execFileSync('git', ['diff', '--name-only', '--diff-filter=ACMR', `${base}...HEAD`, '--', 'frontend/src'],
      { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  } catch {
    throw new UnresolvedBaseError(base)
  }
  return changed.split('\n')
    .filter(path => /\.(ts|tsx)$/.test(path) && !path.endsWith('.gen.ts'))
    .map(path => relative(frontendRoot, resolve(repoRoot, path)))
}

function runEslint(files, frontendRoot) {
  return spawnSync('npx', ['eslint', ...files], { cwd: frontendRoot, stdio: 'inherit' }).status
}

// lintChanged returns the process exit code: 0 when nothing changed or ESLint
// passes, ESLint's own status when it fails (1 when it reports none, e.g. it
// could not start), UNRESOLVED_BASE_EXIT when base cannot be diffed.
export function lintChanged({ base, repoRoot, frontendRoot, lint = runEslint, log = console.log, error = console.error }) {
  let files
  try {
    files = changedSourceFiles(base, repoRoot, frontendRoot)
  } catch (err) {
    if (!(err instanceof UnresolvedBaseError)) throw err
    // An unresolvable base must fail, not lint nothing (same rule as the PR guard).
    error(`lint:changed: cannot diff against ${base}; fetch it first (git fetch origin).`)
    return UNRESOLVED_BASE_EXIT
  }
  if (files.length === 0) {
    log(`lint:changed: no frontend source changes vs ${base}`)
    return 0
  }
  log(`lint:changed: ${files.length} file(s) vs ${base}`)
  return lint(files, frontendRoot) ?? 1
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(lintChanged({
    base: process.argv[2] ?? 'origin/main',
    repoRoot: execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim(),
    frontendRoot: resolve(import.meta.dirname, '..'),
  }))
}
