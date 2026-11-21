import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CHECKLISTS, CHECKLIST_NOTE, LAYER_LABEL, checklistOf, stepKey } from '../src/catalog/checklists'
import { RUNBOOKS } from '../src/catalog/runbooks'
import { REPO_ROOT, factProblem } from './support/sources'

const lines = (path: string) => readFileSync(resolve(REPO_ROOT, path), 'utf8').split('\n')
const lineOf = (source: string) => {
  const [path, n] = source.split(':') as [string, string]
  return lines(path)[Number(n) - 1]!
}

describe('the runbook checklists', () => {
  it('covers the six runbooks of the saved incidents', () => {
    expect(Object.keys(CHECKLISTS).sort()).toEqual(['RB-01', 'RB-02', 'RB-03', 'RB-04', 'RB-11', 'RB-12'])
  })

  it('has a written runbook for each checklist', () => {
    for (const id of Object.keys(CHECKLISTS)) expect(RUNBOOKS.some((r) => r.id === id), id).toBe(true)
  })

  it('cites a line that says the text of the step', () => {
    for (const [id, steps] of Object.entries(CHECKLISTS)) {
      for (const s of steps!) expect(lineOf(s.source.source), `${id} step ${s.n}`).toContain(s.says)
    }
  })

  it('numbers the steps in order, from one', () => {
    for (const [id, steps] of Object.entries(CHECKLISTS)) expect(steps!.map((s) => s.n), id).toEqual(steps!.map((_, i) => i + 1))
  })

  it('gives every step a gate and an undo', () => {
    for (const steps of Object.values(CHECKLISTS)) for (const s of steps!) {
      expect(s.gate, `${s.command}`).not.toBe('')
      expect(s.undo, `${s.command}`).not.toBe('')
      expect(s.expected, `${s.command}`).not.toBe('')
    }
  })

  it('keeps the read-only steps read-only, and the last step a change with a gate and an undo', () => {
    for (const [id, steps] of Object.entries(CHECKLISTS)) {
      const last = steps!.at(-1)!
      expect(last.gate, id).not.toBe('none: the step is read-only')
      expect(last.undo, id).not.toBe('none')
      expect(last.who, id).not.toContain('read-only')
      expect(['L2', 'L3', 'L4'], id).toContain(last.who)
      for (const s of steps!.slice(0, -1)) {
        expect(s.gate, `${id} step ${s.n}`).toBe('none: the step is read-only')
        expect(s.who, `${id} step ${s.n}`).toBe('L1, read-only')
      }
    }
  })

  it('names the layer of the stack that each step inspects', () => {
    for (const steps of Object.values(CHECKLISTS)) for (const s of steps!) if (s.layer) expect(Object.keys(LAYER_LABEL)).toContain(s.layer)
    expect(LAYER_LABEL.L1).toBe('L1: CPU, OS, and base hardware')
    expect(LAYER_LABEL.L4).toBe('L4: network fabric')
    expect(LAYER_LABEL.L7).toContain('Kubernetes')
  })

  it('takes the layer of the step from the tag of its runbook line', () => {
    for (const [id, steps] of Object.entries(CHECKLISTS)) {
      for (const s of steps!.slice(0, -1)) if (s.layer) expect(lineOf(s.source.source), `${id} step ${s.n}`).toContain(`[C:${s.layer}]`)
    }
    const layers = (id: keyof typeof CHECKLISTS) => CHECKLISTS[id]!.map((s) => s.layer)
    expect(layers('RB-01')).toEqual(['L3', 'L3', null, null])
    expect(layers('RB-03')).toEqual(['L1', 'L2', 'L2', null])
    expect(layers('RB-11')).toEqual(['L7', 'L7', 'L7', null])
  })

  it('gives the key of a step, and no checklist for a runbook without one', () => {
    expect(stepKey('RB-03', 2)).toBe('RB-03.2')
    expect(checklistOf('RB-05')).toBeNull()
  })

  it('says that the Explorer does not run a command', () => {
    expect(CHECKLIST_NOTE.value).toContain('does not run a command')
    expect(factProblem(CHECKLIST_NOTE)).toBeNull()
  })
})
