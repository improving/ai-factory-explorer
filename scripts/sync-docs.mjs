#!/usr/bin/env node
// Sync the operator documents and the sourcing notes from the training repository.
//
// This file is NOT checked in yet. Review it first.
//
// Usage:
//   node scripts/sync-docs.mjs                      # dry run: show what would change
//   node scripts/sync-docs.mjs --write              # apply the sync
//   node scripts/sync-docs.mjs --source ../other    # another source repository
//   node scripts/sync-docs.mjs --delete --write     # also remove files absent in the source
//   node scripts/sync-docs.mjs --with-design        # write the design doc to *.synced for review
//   node scripts/sync-docs.mjs --no-relink --write  # do not run the citation relink
//
// What it syncs:
//   runbooks/  handbook/  handson/                  the whole trees
//   docs/superpowers/specs/*ai-factory-explorer*sourcing*.md
//   docs/superpowers/specs/*collectives*design*.md
//   docs/superpowers/specs/*explorer-guides-design*.md
//                                                   into docs/design/
//
// It then unwraps every relative link whose target is not in this repository, so the
// Markdown has no dead links, and it runs `npm run citations:relink` because a moved
// line changes tests/citations.lock.json.
//
// The main design document is curated for the open-source repository: its audience,
// hosting, and coverage sections differ from the source. It is not overwritten by
// default. `--with-design` writes the source version to
// docs/design/2026-10-12-ai-factory-explorer-design.md.synced, so you can diff it.

import { execFileSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))

const TREES = ['runbooks', 'handbook', 'handson']
const DESIGN = 'docs/design'
const SPECS = 'docs/superpowers/specs'
const DESIGN_DOC = '2026-10-12-ai-factory-explorer-design.md'

// The sourcing notes and the mode designs. The interview scenarios are a training
// feature, not the explorer, so they stay out.
const SPEC = /(ai-factory-explorer.*sourcing|collectives.*design|explorer-guides-design)\.md$/

// A relative link whose target is not in this repository becomes its text.
const LINK = /\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g
const FENCE = /^\s*(```|~~~)/
const EXTERNAL = /^(https?:\/\/|mailto:|#)/

const args = new Set(process.argv.slice(2))
if (args.has('--help') || args.has('-h')) {
  const self = readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n')
  console.log(self.slice(0, self.findIndex((line) => line.startsWith('import '))).join('\n').trimEnd())
  process.exit(0)
}
const valueOf = (flag, fallback) => {
  const i = process.argv.indexOf(flag)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}
const WRITE = args.has('--write')
const DELETE = args.has('--delete')
const WITH_DESIGN = args.has('--with-design')
const RELINK = !args.has('--no-relink')
const ALLOW_DIRTY = args.has('--allow-dirty')
const SOURCE = resolve(ROOT, valueOf('--source', '../ai-platform-sre-training'))

const log = (...parts) => console.log(...parts)
const rel = (path) => relative(ROOT, path).split(sep).join('/')

function fail(message) {
  console.error(`error: ${message}`)
  process.exit(1)
}

function checkSource() {
  if (!existsSync(SOURCE)) fail(`source repository not found: ${SOURCE}`)
  for (const tree of TREES) {
    if (!existsSync(join(SOURCE, tree))) fail(`source repository has no ${tree}/: ${SOURCE}`)
  }
  if (!existsSync(join(SOURCE, SPECS))) fail(`source repository has no ${SPECS}/: ${SOURCE}`)
}

function checkClean() {
  if (ALLOW_DIRTY) return
  const dirty = execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: ROOT, encoding: 'utf8' }).trim()
  if (dirty) fail('the working tree has tracked changes; commit or stash them, or pass --allow-dirty')
}

function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full))
    else if (entry.isFile()) out.push(full)
  }
  return out
}

// Replace a link only outside a code span. The split keeps the backtick spans at odd indexes.
function outsideCode(line, fn) {
  return line
    .split(/(`[^`]*`)/)
    .map((part, i) => (i % 2 === 1 ? part : fn(part)))
    .join('')
}

// The source path of a link, mapped to the file that carries it here. The specs move
// from docs/superpowers/specs/ to docs/design/, and a link to a sibling spec follows
// them; a link to handbook/ or runbooks/ stays at the root.
function mapSourceToDest(resolved) {
  const specs = join(SOURCE, SPECS) + sep
  if (resolved.startsWith(specs)) return join(ROOT, DESIGN, relative(join(SOURCE, SPECS), resolved))
  if (resolved.startsWith(SOURCE + sep)) return join(ROOT, relative(SOURCE, resolved))
  return null
}

// A link whose target this repository does not carry becomes its text. A link that it
// does carry is rewritten for the destination folder, because the specs move.
function unwrapLinks(text, dest, source) {
  const out = []
  let fence = false
  for (const line of text.split('\n')) {
    if (FENCE.test(line)) {
      fence = !fence
      out.push(line)
      continue
    }
    if (fence) {
      out.push(line)
      continue
    }
    out.push(
      outsideCode(line, (part) =>
        part.replace(LINK, (whole, label, target) => {
          if (EXTERNAL.test(target)) return whole
          const at = target.indexOf('#')
          const path = at < 0 ? target : target.slice(0, at)
          const hash = at < 0 ? '' : target.slice(at)
          if (!path || !/[/.]/.test(path)) return whole
          // A link that already works from the destination stays exactly as it is.
          const current = resolve(dirname(dest), path)
          if (current.startsWith(ROOT + sep) && existsSync(current)) return whole
          // A link that works only in the source (a sibling spec, or a file at the
          // repository root) is rewritten for the destination.
          const mapped = mapSourceToDest(resolve(dirname(source), path))
          if (mapped && existsSync(mapped)) {
            const next = relative(dirname(dest), mapped).split(sep).join('/')
            return `[${label}](${next}${hash})`
          }
          return label
        }),
      ),
    )
  }
  return out.join('\n')
}

// The source paths that name the old viz/ folder become paths of this repository.
function rewriteDesign(text) {
  return text
    .replaceAll('`viz/src/', '`src/')
    .replaceAll('`viz/README.md`', '`README.md`')
    .replaceAll('go into `viz/`, a commit message, or a pull request.', 'go into the repository, a commit message, or a pull request.')
    .replaceAll('the in-app guides of the AI Factory Explorer (`viz/`)', 'the in-app guides of the AI Factory Explorer')
}

function read(path) {
  return readFileSync(path, 'utf8')
}

function same(dest, content) {
  if (!existsSync(dest)) return false
  const current = readFileSync(dest)
  return typeof content === 'string' ? current.toString('utf8') === content : current.equals(content)
}

function write(dest, content, mode) {
  mkdirSync(dirname(dest), { recursive: true })
  writeFileSync(dest, content)
  if (mode !== undefined) chmodSync(dest, mode & 0o777)
}

function syncFile(src, dest, transform) {
  // A Markdown file is rewritten; any other file is copied as bytes, so an image or a
  // tarball in the source cannot be damaged by a UTF-8 round trip.
  const content = transform ? transform(read(src)) : readFileSync(src)
  if (same(dest, content)) return 'same'
  const existed = existsSync(dest)
  if (WRITE) write(dest, content, statSync(src).mode)
  return existed ? 'M' : 'A'
}

const changes = []
const notes = []

// The Library reads only the documents in content/docs.ts. A new runbook, reference
// page, or lab in the source does not reach the portal until it joins that list.
function allowlist() {
  const file = join(ROOT, 'content/docs.ts')
  if (!existsSync(file)) return new Set()
  return new Set([...read(file).matchAll(/path:\s*'([^']+)'/g)].map((m) => m[1]))
}

function plan(src, dest, transform) {
  const state = syncFile(src, dest, transform)
  if (state !== 'same') changes.push(`${state} ${rel(dest)}`)
}

function main() {
  checkSource()
  checkClean()

  log(`source: ${SOURCE}`)
  log(`target: ${ROOT}`)
  log(WRITE ? 'mode:   write' : 'mode:   dry run (pass --write to apply)')
  log('')

  for (const tree of TREES) {
    const from = join(SOURCE, tree)
    const to = join(ROOT, tree)
    for (const src of walk(from)) {
      const dest = join(to, relative(from, src))
      plan(src, dest, src.endsWith('.md') ? (text) => unwrapLinks(text, dest, src) : undefined)
    }
    if (DELETE) {
      for (const dest of walk(to)) {
        const src = join(from, relative(to, dest))
        if (existsSync(src)) continue
        changes.push(`D ${rel(dest)}`)
        if (WRITE) unlinkSync(dest)
      }
    }
  }

  const specs = readdirSync(join(SOURCE, SPECS)).filter((name) => SPEC.test(name))
  for (const name of specs) {
    const src = join(SOURCE, SPECS, name)
    const dest = join(ROOT, DESIGN, name)
    plan(src, dest, (text) => rewriteDesign(unwrapLinks(text, dest, src)))
  }

  const design = join(SOURCE, SPECS, DESIGN_DOC)
  const designDest = join(ROOT, DESIGN, `${DESIGN_DOC}.synced`)
  if (WITH_DESIGN) {
    plan(design, designDest, (text) => rewriteDesign(unwrapLinks(text, designDest, design)))
    notes.push(`the design doc goes to ${rel(designDest)}: diff it and copy the changes that belong in the open-source version`)
  } else {
    notes.push(`the design doc is curated and was not synced; pass --with-design to write ${rel(designDest)} for review`)
  }

  const listed = allowlist()
  for (const change of changes) {
    const [state, path] = change.split(' ')
    if (!path?.endsWith('.md')) continue
    if (state === 'A' && !listed.has(path) && /^(runbooks|handbook|handson)\//.test(path)) {
      notes.push(`new document not in content/docs.ts: ${path}`)
    }
    if (state === 'D' && listed.has(path)) {
      notes.push(`removed document still in content/docs.ts: ${path}`)
    }
  }

  log('')
  if (changes.length === 0) log('up to date: no file changes')
  else {
    for (const change of changes) log(change)
    log('')
    log(`${changes.length} file${changes.length === 1 ? '' : 's'} ${WRITE ? 'changed' : 'would change'}`)
  }
  for (const note of notes) log(`note: ${note}`)

  if (!WRITE) {
    log('')
    log('nothing written; pass --write to apply')
    return
  }

  if (RELINK) {
    log('')
    log('npm run citations:relink')
    try {
      execFileSync('npm', ['run', 'citations:relink'], { cwd: ROOT, stdio: 'inherit' })
    } catch {
      fail('the citation relink failed; check the output above')
    }
    log('')
    log('npx vitest run tests/citations.test.ts')
    try {
      execFileSync('npx', ['vitest', 'run', 'tests/citations.test.ts'], { cwd: ROOT, stdio: 'inherit' })
    } catch {
      notes.push('the citation check failed; if a new citation was added, run `npm run citations:lock` and review the lock')
    }
  }

  log('')
  log('git status:')
  execFileSync('git', ['status', '--short'], { cwd: ROOT, stdio: 'inherit' })
  log('')
  log('git diff --stat:')
  execFileSync('git', ['diff', '--stat'], { cwd: ROOT, stdio: 'inherit' })
  for (const note of notes) log(`note: ${note}`)
}

main()
