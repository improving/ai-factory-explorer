import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { collect } from './sources'

// A repository source with a line or a line range: 'handbook/x.md:12' or 'handbook/x.md:12-14'.
const LINE_SOURCE = /^([\w./-]+?):(\d+)(?:-(\d+))?$/

// The file and the lines that a source names: one line, or the first and the last line of a range.
export function endsOf(source: string): { path: string; lines: number[] } | null {
  const m = LINE_SOURCE.exec(source)
  if (!m || source.startsWith('http')) return null
  return { path: m[1]!, lines: m[3] ? [Number(m[2]), Number(m[3])] : [Number(m[2])] }
}

// Each source with a line that the app can show: the sources of the exported values of all modules,
// and the source strings in the code (a fact that a function makes is not exported).
export function lineSources(modules: Record<string, unknown>, srcDir: string): string[] {
  const out = new Set<string>()
  for (const m of Object.values(modules)) {
    const { facts, sources } = collect(m)
    for (const [, s] of sources) out.add(s)
    for (const [, f] of facts) if (f.source) out.add(f.source)
  }
  for (const file of readdirSync(srcDir, { recursive: true }) as string[]) {
    if (!/\.tsx?$/.test(file)) continue
    for (const m of readFileSync(join(srcDir, file), 'utf8').matchAll(/['"`]([\w-]+\/[\w./+-]+\.\w+:\d+(?:-\d+)?)['"`]/g)) out.add(m[1]!)
  }
  return [...out].filter((s) => endsOf(s) !== null).sort()
}

// The text of the cited lines of a source (one text for each end).
export function textsOf(root: string, source: string): string[] {
  const { path, lines } = endsOf(source)!
  const all = readFileSync(resolve(root, path), 'utf8').split('\n')
  return lines.map((n) => all[n - 1] ?? '')
}
