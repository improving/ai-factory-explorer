import type { Runbook } from '../catalog/runbooks'
import { runbooksOfRows } from '../catalog/runbooks'
import { CLASS_INFO, clockOf, type DiagClass, type DiagEvent, type Incident, type SubDomain, type TerminalState } from './incidents'

export type VerdictSub = SubDomain | 'ambiguous' | 'unattributed'
export type ChainRow = DiagEvent & { i: number; clock: string }
export type Verdict = {
  sub: VerdictSub
  cls: DiagClass | null
  node: string | null
  terminal: TerminalState | null
  confidence: 'high' | 'low'
  votes: Record<SubDomain, number>
  why: string
}
export type Chain = { id: string; label: string; start: string; rows: ChainRow[]; verdict: Verdict; subjects: string[] }

export const SUB_LABEL: Record<VerdictSub, string> = {
  hardware: 'hardware',
  system_software: 'system software',
  ambiguous: 'ambiguous',
  unattributed: 'unattributed',
}

const votesOf = (events: DiagEvent[]): Record<SubDomain, number> => {
  const votes: Record<SubDomain, number> = { hardware: 0, system_software: 0 }
  for (const e of events) if (e.cls) votes[CLASS_INFO[e.cls].sub]++
  return votes
}

const terminalOf = (events: DiagEvent[]): TerminalState | null => {
  const states = events.filter((e) => e.state)
  return states.length === 0 ? null : states[states.length - 1]!.state!
}

// The collapse of the chain to one verdict. The rule: an event with a class votes for the sub_domain of that
// class; a tie, or a difference of one vote, is `ambiguous`; no vote is `unattributed`; else the larger side
// wins, at high confidence from two votes. The responsible node is the node of the first event that votes for
// the winning side: the first cause, not the last consequence.
export function verdictOf(events: DiagEvent[]): Verdict {
  const votes = votesOf(events)
  const { hardware: h, system_software: s } = votes
  const terminal = terminalOf(events)
  const base = { votes, terminal }
  if (h + s === 0) {
    return {
      ...base,
      sub: 'unattributed',
      cls: null,
      node: null,
      confidence: 'low',
      why: 'No event names a cause: the evidence is insufficient. The verdict is unattributed, not an error.',
    }
  }
  if (h > 0 && s > 0 && Math.abs(h - s) <= 1) {
    return {
      ...base,
      sub: 'ambiguous',
      cls: null,
      node: null,
      confidence: 'low',
      why: `The events vote ${h} for hardware and ${s} for system software. A difference of one vote does not choose between them.`,
    }
  }
  const sub: SubDomain = h > s ? 'hardware' : 'system_software'
  const first = events.find((e) => e.cls && CLASS_INFO[e.cls].sub === sub)!
  const count = votes[sub]
  return {
    ...base,
    sub,
    cls: first.cls!,
    node: first.node ?? null,
    confidence: count >= 2 ? 'high' : 'low',
    why:
      count >= 2
        ? `${count} events vote for ${SUB_LABEL[sub]}, and the first one is the ${CLASS_INFO[first.cls!].label} signal of this chain.`
        : `One event votes for ${SUB_LABEL[sub]}: ${CLASS_INFO[first.cls!].label}. One signal is one signal; check the context before you act on it.`,
  }
}

// The events in time order, with the clock of each one, and the verdict of the set.
export function chainOf(incident: Incident): Chain {
  const rows: ChainRow[] = [...incident.events]
    .sort((a, b) => a.t - b.t)
    .map((e, i) => ({ ...e, i, clock: clockOf(incident.start, e.t) }))
  const subjects = [...new Set(rows.map((r) => r.subject).filter((x): x is string => x !== undefined))]
  return { id: incident.id, label: incident.label, start: incident.start, rows, verdict: verdictOf(rows), subjects }
}

// The written runbooks of the rows that the chain names: the next checks of an ambiguous or an unattributed
// verdict, and the runbook of each event in the panel.
export function settleOf(chain: Chain): Runbook[] {
  return runbooksOfRows(chain.rows.map((r) => r.row))
}

export const VERDICT_RULE =
  'An event that carries a class votes for the sub-domain of that class. A tie, or a difference of one vote, is ambiguous; no vote is unattributed; else the larger side wins, at high confidence from two votes. The responsible node is the node of the first event that votes for the winning side.'
