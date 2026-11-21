// Moves each cited line number in the code to the line that now has the text in tests/citations.lock.json.
// Use it after an edit of a cited file (tests/citations.test.ts fails). It prints each citation that it
// cannot move, and each move that it had to guess: check those by hand.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const LOCK = join(ROOT, 'tests/citations.lock.json')

// A string argument (it can hold parentheses), a comma, or a space: the arguments before the line number.
const ARGS = String.raw`(?:'[^']*'|"[^"]*"|\x60[^\x60]*\x60|\s|,)*?`

// The helpers that make a citation from a line number. Group 1 of each regex is the text before the line
// number; the line number is group 2 (or group `line`); `path` gives the cited file from the match.
const HELPERS = [
  { re: new RegExp(String.raw`(\brb\(${ARGS},\s*)(\d+)(?=\))`, 'g'), path: () => 'handbook/runbook-catalog.md' },
  { re: new RegExp(String.raw`(\bcr\(${ARGS},\s*)(\d+)(?=\))`, 'g'), path: () => 'handbook/command-reference.md' },
  { re: /(\bsd\()(\d+)(?=\))/g, path: () => 'handbook/shift-discipline.md' },
  { re: /(\bsec\()(\d+)(?=\))/g, path: () => 'handbook/security-operations.md' },
]
// A source string: 'handbook/x.md:12' or 'handbook/x.md:12-14', in any quotes.
const LITERAL = /(['"`])([\w-]+\/[\w./+-]+\.\w+):(\d+)(?:-(\d+))?\1/g

const lock = JSON.parse(readFileSync(LOCK, 'utf8'))
const files = new Map()
const linesOf = (path) => {
  if (!files.has(path)) files.set(path, readFileSync(join(ROOT, path), 'utf8').split('\n'))
  return files.get(path)
}

// path:line → the new line, for each cited line whose text moved.
const move = new Map()
const problems = []
for (const [key, texts] of Object.entries(lock)) {
  const [, path, a, b] = /^(.+?):(\d+)(?:-(\d+))?$/.exec(key)
  const lines = linesOf(path)
  ;(b ? [Number(a), Number(b)] : [Number(a)]).forEach((n, i) => {
    const want = texts[i]
    if (lines[n - 1] === want) return
    const hits = lines.flatMap((l, j) => (l === want ? [j + 1] : []))
    if (hits.length === 0) return problems.push(`${key}: no line has the text: ${want}`)
    const best = hits.reduce((x, y) => (Math.abs(y - n) < Math.abs(x - n) ? y : x))
    if (hits.length > 1) problems.push(`${key}: ${hits.length} lines have the text; took line ${best}, check it`)
    move.set(`${path}:${n}`, best)
  })
}
const to = (path, n) => move.get(`${path}:${n}`) ?? Number(n)

// Rewrite the code. Not the tests: a source string in a test is a fixture (for example, the input of a link test).
const SOURCES = readdirSync(join(ROOT, 'src'), { recursive: true })
  .filter((f) => /\.tsx?$/.test(f))
  .map((f) => join(ROOT, 'src', f))
let changed = 0
for (const file of SOURCES) {
  const old = readFileSync(file, 'utf8')
  let text = old.replace(LITERAL, (_, q, path, a, b) => `${q}${path}:${to(path, a)}${b ? `-${to(path, b)}` : ''}${q}`)
  for (const h of HELPERS) {
    text = text.replace(h.re, (...m) => m[1] + to(h.path(m), m[h.line ?? 2]))
  }
  if (text !== old) {
    writeFileSync(file, text)
    changed++
  }
}

const relinked = Object.fromEntries(
  Object.entries(lock).map(([key, texts]) => {
    const [, path, a, b] = /^(.+?):(\d+)(?:-(\d+))?$/.exec(key)
    return [`${path}:${to(path, a)}${b ? `-${to(path, b)}` : ''}`, texts]
  }),
)
writeFileSync(LOCK, JSON.stringify(relinked, null, 2) + '\n')

console.log(`${move.size} cited lines moved; ${changed} files changed.`)
for (const p of problems) console.log(`CHECK ${p}`)
