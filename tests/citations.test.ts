import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { lineSources, textsOf } from './support/citations'
import { REPO_ROOT } from './support/sources'

// The text of each cited line when its citation was checked. An edit of a cited file moves its lines, and the
// line number then names other text; sourceProblem() checks only that the line exists.
// A moved line: `npm run citations:relink` moves the number in the code to the line that has the old text.
// A new citation: check its line, then `npm run citations:lock` adds it with the text that the line has now.
const LOCK = fileURLToPath(new URL('./citations.lock.json', import.meta.url))
const ROOT = process.env.CITATIONS_ROOT ?? REPO_ROOT
type Lock = Record<string, string[]>

const used = lineSources(import.meta.glob('../src/**/*.ts', { eager: true }), fileURLToPath(new URL('../src/', import.meta.url)))
const read = (): Lock => (existsSync(LOCK) ? (JSON.parse(readFileSync(LOCK, 'utf8')) as Lock) : {})

// Adds the new citations and removes the unused ones. It does not change the text of a citation in the lock.
if (process.env.UPDATE_CITATIONS) {
  const old = read()
  writeFileSync(LOCK, JSON.stringify(Object.fromEntries(used.map((s) => [s, old[s] ?? textsOf(ROOT, s)])), null, 2) + '\n')
}
const lock = read()

describe('the cited lines', () => {
  it('finds the citations of the app', () => {
    expect(used.length).toBeGreaterThan(150)
  })

  it('has a lock entry for each citation, and no other entry (npm run citations:lock)', () => {
    expect(used.filter((s) => !(s in lock))).toEqual([])
    expect(Object.keys(lock).filter((s) => !used.includes(s))).toEqual([])
  })

  it('each cited line has the text that it had when the citation was checked (npm run citations:relink)', () => {
    const moved = used.filter((s) => s in lock && textsOf(ROOT, s).some((t, i) => t !== lock[s]![i]))
    expect(moved.map((s) => `${s} was: ${lock[s]![0]}`)).toEqual([])
  })
})
