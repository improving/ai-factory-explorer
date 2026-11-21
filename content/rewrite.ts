// The structural rewrite of a document, before the browser renders it.
//
// It runs in node, at build time (content/plugin.ts), so the portal ships no rewrite code and a test can
// cover the whole set. It removes what belongs to the training programme (the YAML front
// matter of a runbook, the role-path block), it sets the reader-facing title, and it turns a relative link into
// a link inside the portal or into plain text.
//
// The rewrite never adds or removes a line inside the body, so the line of an original heading survives it:
// a citation such as "runbooks/RB-03-….md:50" finds the section that holds line 50 of the file.

import { slugify } from '../src/docs/slug.ts'
import { sectionOfLine } from '../src/docs/section.ts'
import { outsideCode, withoutCodes } from './vocabulary.ts'
import { docOfPath, type DocEntry } from './docs.ts'

export type Heading = { level: number; text: string; slug: string; line: number }

export type Rewritten = {
  markdown: string
  headings: Heading[] // the H1 is the reader-facing title; a line is the line of the original file
}

// A link in a line of Markdown: the text, the target, and an optional title.
const LINK = /\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g
const FENCE = /^\s*(```|~~~)/
const PATHS_BLOCK = /^\s*<!--\s*paths:start\s*-->/
const PATHS_END = /^\s*<!--\s*paths:end\s*-->/
const HTML_COMMENT = /^\s*<!--.*-->\s*$/
const H1 = /^#\s+(.*)$/
// A gap of the training material, in the register of the programme: "the step exists, the runbook does not".
// A reader of the portal must not see it. The stack-layer tag [C:L7] and the sourced tag [R] stay: they mark a command, and the reader
// explains them.
// The tag is often in a code span (`[GAP:G30]`), so the strip takes the backticks with it.
const REVIEW_TAG = / ?`?\[GAP:[^\]]*\]`?/g
const MODULE_COLUMN = /^module$/i
// The sentence that names the column, on the line that says what a row shows.
const COLUMN_SENTENCE = / ?(?:The|This) module column[^.]*\./gi
const ROW = /^\s*\|/
const DELIMITER = /^\s*\|(\s*:?-+:?\s*\|)+\s*$/

// The path of a relative target, from the root of the repository.
export function resolvePath(from: string, target: string): string {
  const out = from.split('/').slice(0, -1)
  for (const part of target.split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') out.pop()
    else out.push(part)
  }
  return out.join('/')
}

// The target of a link, in the portal: a link to a document of the set becomes doc and sec, a vendor page
// stays, and a document that the portal does not carry becomes null (the caller keeps the text only).
export function rewriteTarget(entry: DocEntry, target: string): string | null {
  if (/^(https?:\/\/|mailto:)/.test(target)) return target
  if (target.startsWith('#')) return `#doc=${entry.id}&sec=${slugify(target.slice(1))}`
  const hash = target.indexOf('#')
  const path = resolvePath(entry.path, (hash < 0 ? target : target.slice(0, hash)).replace(/^\.\//, ''))
  const doc = docOfPath(path)
  if (!doc) return null
  return hash < 0 ? `#doc=${doc.id}` : `#doc=${doc.id}&sec=${slugify(target.slice(hash + 1))}`
}

// The line with each link that the portal carries, and the text of each link that it does not.
function linksOf(entry: DocEntry, line: string): string {
  return line.replace(LINK, (whole, text: string, target: string) => {
    const href = rewriteTarget(entry, target)
    return href === null ? text : `[${text}](${href})`
  })
}

export function rewrite(entry: DocEntry, text: string): Rewritten {
  const lines = text.split('\n')
  const out: string[] = []
  const origin: number[] = [] // the line of the original file for each line of the output
  let fence = false
  let title = false
  let front = lines[0]?.trimEnd() === '---'
  let paths = false
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    // The YAML front matter of a runbook: our ids, our severities, our gap register.
    if (front) {
      if (i > 0 && line.trimEnd() === '---') front = false
      continue
    }
    // The role-path block of a handbook page: the levels of our programme.
    if (PATHS_BLOCK.test(line)) {
      paths = true
      continue
    }
    if (paths) {
      if (PATHS_END.test(line)) paths = false
      continue
    }
    if (HTML_COMMENT.test(line)) continue
    const fenced = FENCE.test(line)
    if (fenced) fence = !fence
    // The title of the document is the reader-facing title, and its code goes with it.
    const h1 = !fence && !title ? H1.exec(line) : null
    if (h1) {
      title = true
      out.push(`# ${entry.title}`)
    } else {
      out.push(!fence && !fenced ? withoutCodes(linksOf(entry, line)).replace(REVIEW_TAG, '') : line)
    }
    origin.push(i + 1)
  }
  // The body starts at the title and ends at its last line of text.
  const from = out.findIndex((l) => l.trim() !== '')
  const to = out.length - 1 - [...out].reverse().findIndex((l) => l.trim() !== '')
  const body = dropModuleColumns(from < 0 ? [] : out.slice(from, to + 1))
  const bodyOrigin = from < 0 ? [] : origin.slice(from, to + 1)
  return { markdown: body.join('\n'), headings: headingsOf(body, bodyOrigin) }
}

// A table column whose header is "Module" says where one of the training labs uses a row, and the portal has no
// labs. The column goes, with its cells, and the table keeps its other columns.
function dropModuleColumns(lines: string[]): string[] {
  const out = [...lines]
  let dropped = false
  for (let i = 0; i < out.length - 1; i++) {
    if (!ROW.test(out[i]!) || !DELIMITER.test(out[i + 1]!)) continue
    const at = splitRow(out[i]!).findIndex((cell) => MODULE_COLUMN.test(cell.trim()))
    if (at < 0) continue
    dropped = true
    for (let j = i; j < out.length && ROW.test(out[j]!); j++) out[j] = dropCell(out[j]!, at)
  }
  // The sentence that describes the column goes with it, or the text describes a column that is not there.
  return dropped ? out.map((line) => line.replace(COLUMN_SENTENCE, '')) : out
}

// The cells of a row of a table: a pipe inside a code span or after a backslash does not split it.
export function splitRow(row: string): string[] {
  const cells: string[] = []
  let cell = ''
  let tick = false
  for (let i = 0; i < row.length; i++) {
    const ch = row[i]!
    if (ch === '\\' && row[i + 1] === '|') {
      cell += '\\|'
      i++
      continue
    }
    if (ch === '`') tick = !tick
    if (ch === '|' && !tick) {
      cells.push(cell)
      cell = ''
      continue
    }
    cell += ch
  }
  cells.push(cell)
  if (cells.length > 1 && cells[0]!.trim() === '') cells.shift()
  if (cells.length > 0 && cells[cells.length - 1]!.trim() === '') cells.pop()
  return cells
}

function dropCell(row: string, at: number): string {
  const cells = splitRow(row)
  if (at >= cells.length) return row
  cells.splice(at, 1)
  return `|${cells.join('|')}|`
}

// The headings of the rewritten text, with the line that each one has in the original file.
function headingsOf(lines: string[], origin: number[]): Heading[] {
  const out: Heading[] = []
  const seen = new Map<string, number>()
  let fence = false
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    if (FENCE.test(line)) {
      fence = !fence
      continue
    }
    if (fence) continue
    const m = /^(#{1,6})\s+(.*?)\s*$/.exec(line)
    if (!m) continue
    const text = m[2]!
    const base = slugify(text)
    const n = seen.get(base) ?? 0
    seen.set(base, n + 1)
    out.push({ level: m[1]!.length, text, slug: n === 0 ? base : `${base}-${n + 1}`, line: origin[i] ?? i + 1 })
  }
  return out
}

