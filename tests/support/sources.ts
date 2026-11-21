import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SITE_REQUIREMENTS, type Fact } from '../../src/catalog/fact'

// tests/support/ → the repository root
export const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url))

export function sourceProblem(source: string, root: string = REPO_ROOT): string | null {
  // The requirements of the site are the customer's own input, and they are not a file of this repository.
  if (source === SITE_REQUIREMENTS) return null
  if (/^https:\/\/\S+$/.test(source)) return null
  const m = /^([\w./-]+?)(?::(\d+)(?:-(\d+))?)?$/.exec(source)
  if (!m) return `bad source format: ${source}`
  const [, path, from, to] = m
  const file = resolve(root, path!)
  if (!existsSync(file)) return `no such file: ${path}`
  const lines = readFileSync(file, 'utf8').split('\n').length
  const last = Number(to ?? from ?? 0)
  if (last > lines) return `${path} has ${lines} lines; the source names line ${last}`
  return null
}

export function factProblem(f: Fact<unknown>): string | null {
  switch (f.status) {
    case 'confirmed':
      return f.source ? sourceProblem(f.source) : 'confirmed fact has no source'
    case 'derived':
      if (!f.formula) return 'derived fact has no formula'
      return f.source ? sourceProblem(f.source) : null
    case 'assumed':
    case 'ask-supplier':
    case 'not-sourced':
      if (!f.note) return `${f.status} fact has no note`
      return f.source ? sourceProblem(f.source) : null
  }
}

type Collected = { facts: [string, Fact<unknown>][]; sources: [string, string][] }

// Walks any catalog object. A Fact is an object with "status" and "value"; any other object with a
// string "source" is a reference (a DocRef) whose source must also resolve.
export function collect(node: unknown, path = '$', out: Collected = { facts: [], sources: [] }): Collected {
  if (Array.isArray(node)) {
    node.forEach((v, i) => collect(v, `${path}[${i}]`, out))
  } else if (node !== null && typeof node === 'object') {
    const o = node as Record<string, unknown>
    if ('status' in o && 'value' in o) out.facts.push([path, o as Fact<unknown>])
    else if (typeof o.source === 'string') out.sources.push([path, o.source])
    for (const [k, v] of Object.entries(o)) collect(v, `${path}.${k}`, out)
  }
  return out
}
