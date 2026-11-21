import { describe, expect, it } from 'vitest'
import { DOCS } from 'virtual:docs'
import { codesIn, LAB_WORDS, MODULE_WORDS, outsideCode, withoutCodes } from '../content/vocabulary'
import { splitRow } from '../content/rewrite'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../', import.meta.url))

describe('the table', () => {
  it('names every lab of the repository', () => {
    const labs = readdirSync(join(ROOT, 'handson')).filter((d) => /^\d\d-/.test(d))
    expect(labs.filter((d) => LAB_WORDS[`H${d.slice(0, 2)}`] === undefined)).toEqual([])
  })

  it('gives a module a subject and a lab the words "the … lab"', () => {
    expect(MODULE_WORDS['M5']).toBe('observability and SLOs')
    expect(LAB_WORDS['H11']).toBe('the DCGM and NVLink lab')
    expect(Object.values(MODULE_WORDS).filter((w) => /\b(M|H)[0-9]{1,2}\b/.test(w))).toEqual([])
  })
})

describe('withoutCodes', () => {
  it('gives the words of a module', () => {
    expect(withoutCodes('the metrics of M5 are the contract metrics')).toBe('the metrics of observability and SLOs are the contract metrics')
  })

  it('gives the words of a lab, with the article that a sentence needs', () => {
    expect(withoutCodes('Record it from the lab (H14, Part D).')).toBe('Record it from the lab (the KAI Scheduler lab, Part D).')
  })

  it('drops the code in front of a title, and keeps the title', () => {
    expect(withoutCodes('**M7 - Incident operations, lab 1:** review')).toBe('**Incident operations, lab 1:** review')
    expect(withoutCodes('H11 - DCGM and the NVLink fabric (hands-on)')).toBe('DCGM and the NVLink fabric (hands-on)')
  })

  it('leaves a code in a code span: a command, a version, or a tuning profile', () => {
    expect(withoutCodes('`--gpu_type H20` is a tuning profile')).toBe('`--gpu_type H20` is a tuning profile')
    expect(withoutCodes('`nvidia-smi` and M2')).toBe('`nvidia-smi` and GPU health and errors')
  })

  it('leaves a code with no entry in the table, so that a new module shows up in the lint', () => {
    expect(withoutCodes('the module M12')).toBe('the module M12')
  })
})

describe('outsideCode', () => {
  it('applies a function to the text and not to the code spans', () => {
    expect(outsideCode('a `b` c', (t) => t.toUpperCase())).toBe('A `b` C')
  })
})

describe('the documents of the set', () => {
  it('names no course code outside a code span or a fence', () => {
    const left = DOCS.flatMap((d) => codesIn(d.markdown).map((c) => `${d.id}: ${c}`))
    expect(left).toEqual([])
  })

  it('drops the column whose header is Module, and keeps the other columns of the table', () => {
    const command = DOCS.find((d) => d.id === 'hb-command-reference')!
    expect(command.markdown).not.toMatch(/^\|.*\| *Module *\|/m)
    const row = command.markdown.split('\n').find((line: string) => line.startsWith('| `nvidia-smi` |'))!
    expect(row).toContain('First on every GPU alert')
    expect(row.endsWith('|')).toBe(true)
    // The four columns of the original table are three now.
    expect(splitRow(row).length).toBe(3)
  })

  it('drops the gap register of our own material, and keeps the stack layer and the sourced marks', () => {
    const runbook = DOCS.find((d) => d.id === 'rb-01')!
    expect(runbook.markdown).not.toContain('[GAP:')
    expect(runbook.markdown).toContain('[C:L7]')
    expect(runbook.markdown).toContain('[R]')
  })

  it('keeps a table of a runbook with the same number of cells in every row', () => {
    const bad: string[] = []
    for (const d of DOCS) {
      const lines = d.markdown.split('\n')
      for (let i = 0; i < lines.length - 1; i++) {
        if (!/^\s*\|/.test(lines[i]!) || !/^\s*\|(\s*:?-+:?\s*\|)+\s*$/.test(lines[i + 1]!)) continue
        const width = splitRow(lines[i]!).length
        for (let j = i; j < lines.length && /^\s*\|/.test(lines[j]!); j++) {
          if (splitRow(lines[j]!).length !== width) bad.push(`${d.id}:${j + 1}`)
        }
      }
    }
    expect(bad.slice(0, 10)).toEqual([])
  })
})

describe('the text of the app', () => {
  // The labels and the sentences of a panel, outside the comments: a comment can name a module.
  it('names no course code in a string that a panel renders', () => {
    const src = fileURLToPath(new URL('../src/', import.meta.url))
    const files = readdirSync(src, { recursive: true, withFileTypes: true })
      .filter((d) => d.isFile() && /\.tsx?$/.test(d.name))
      .map((d) => join(d.parentPath, d.name))
    const bad: string[] = []
    for (const file of files) {
      for (const [i, line] of readFileSync(file, 'utf8').split('\n').entries()) {
        if (/^\s*(\/\/|\*|\/\*)/.test(line)) continue
        if (/d="M/.test(line)) continue // an SVG path, not a code
        const codes = codesIn(line)
        if (codes.length > 0) bad.push(`${file.slice(src.length)}:${i + 1}: ${codes.join(', ')}`)
      }
    }
    expect(bad.slice(0, 20)).toEqual([])
  })
})
