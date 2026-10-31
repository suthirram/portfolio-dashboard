// @vitest-environment node
// Behaviour of the CI naming gate (`npm run lint:changed`) against a real
// throwaway git repo: which files it hands ESLint, and the exit code it returns.
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { UNRESOLVED_BASE_EXIT, changedSourceFiles, lintChanged } from './lint-changed.mjs'

let repoRoot
let frontendRoot

function git(...args) {
  execFileSync('git', ['-c', 'user.name=test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false',
    '-c', 'core.hooksPath=/dev/null', ...args], { cwd: repoRoot, stdio: 'ignore' })
}

function write(path, content = 'export const value = 1\n') {
  const fullPath = join(repoRoot, path)
  mkdirSync(dirname(fullPath), { recursive: true })
  writeFileSync(fullPath, content)
}

function commitAll(message) {
  git('add', '-A')
  git('commit', '-q', '-m', message)
}

beforeEach(() => {
  repoRoot = mkdtempSync(join(tmpdir(), 'lint-changed-'))
  frontendRoot = join(repoRoot, 'frontend')
  git('init', '-q', '-b', 'main')
  write('frontend/src/modified.tsx')
  write('frontend/src/untouched.ts')
  write('frontend/src/deleted.ts')
  write('frontend/src/renamed-before.ts', 'export const renamedValue = 1\n')
  write('frontend/src/lib/api/schema.gen.ts')
  commitAll('base')
  git('checkout', '-q', '-b', 'feature')
})

afterEach(() => {
  rmSync(repoRoot, { recursive: true, force: true })
})

describe('changedSourceFiles', () => {
  it('selects added, modified and renamed sources and skips deleted, generated and non-source files', () => {
    write('frontend/src/added.ts')
    write('frontend/src/modified.tsx', 'export const value = 2\n')
    git('mv', 'frontend/src/renamed-before.ts', 'frontend/src/renamed-after.ts')
    git('rm', '-q', 'frontend/src/deleted.ts')
    write('frontend/src/lib/api/schema.gen.ts', 'export const value = 2\n')
    write('frontend/src/styles.css', 'body {}\n')
    write('frontend/scripts/tool.ts')
    write('backend/main.ts')
    commitAll('feature')

    expect(changedSourceFiles('main', repoRoot, frontendRoot).sort())
      .toEqual(['src/added.ts', 'src/modified.tsx', 'src/renamed-after.ts'])
  })

  it('ignores changes made on the base after the branch point', () => {
    git('checkout', '-q', 'main')
    write('frontend/src/untouched.ts', 'export const value = 2\n')
    commitAll('base moves on')
    git('checkout', '-q', 'feature')

    expect(changedSourceFiles('main', repoRoot, frontendRoot)).toEqual([])
  })
})

describe('lintChanged', () => {
  const quiet = { log: () => {}, error: () => {} }

  it('fails with the unresolved-base status and never lints when the base cannot be diffed', () => {
    const lint = vi.fn(() => 0)
    const error = vi.fn()

    expect(lintChanged({ base: 'origin/missing', repoRoot, frontendRoot, lint, ...quiet, error }))
      .toBe(UNRESOLVED_BASE_EXIT)
    expect(lint).not.toHaveBeenCalled()
    expect(error).toHaveBeenCalledWith(expect.stringContaining('cannot diff against origin/missing'))
  })

  it('passes without running ESLint when no frontend source changed', () => {
    write('frontend/src/lib/api/schema.gen.ts', 'export const value = 2\n')
    commitAll('only generated')
    const lint = vi.fn(() => 1)

    expect(lintChanged({ base: 'main', repoRoot, frontendRoot, lint, ...quiet })).toBe(0)
    expect(lint).not.toHaveBeenCalled()
  })

  it('hands ESLint the changed files and returns its passing status', () => {
    write('frontend/src/added.ts')
    commitAll('feature')
    const lint = vi.fn(() => 0)

    expect(lintChanged({ base: 'main', repoRoot, frontendRoot, lint, ...quiet })).toBe(0)
    expect(lint).toHaveBeenCalledWith(['src/added.ts'], frontendRoot)
  })

  it('propagates an ESLint failure status', () => {
    write('frontend/src/added.ts')
    commitAll('feature')

    expect(lintChanged({ base: 'main', repoRoot, frontendRoot, lint: () => 1, ...quiet })).toBe(1)
  })

  it('fails when ESLint exits without a status (killed or not started)', () => {
    write('frontend/src/added.ts')
    commitAll('feature')

    expect(lintChanged({ base: 'main', repoRoot, frontendRoot, lint: () => null, ...quiet })).toBe(1)
  })
})
