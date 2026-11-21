import { existsSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { BYTES } from 'virtual:docs'

// The single file carries the operator documents, and a build inlines all of them. The budget makes the next
// growth a decision and not an accident.
const CONTENT_LIMIT = 1_000_000
const FILE_LIMIT = 2_500_000
const DIST = fileURLToPath(new URL('../dist/index.html', import.meta.url))

describe('the size of the portal', () => {
  it('keeps the documents of the set under 1 MB of Markdown', () => {
    expect(BYTES).toBeLessThan(CONTENT_LIMIT)
  })

  // The unit tests run before the build in CI, so the file is checked when a build is there.
  it.runIf(existsSync(DIST))('keeps the single file under 2.5 MB', () => {
    const bytes = statSync(DIST).size
    expect(bytes).toBeLessThan(FILE_LIMIT)
  })
})
