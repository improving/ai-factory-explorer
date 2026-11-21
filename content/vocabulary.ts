// The course codes that the reader must not see, and the words that replace them.
//
// A module (M0 to M11) and a lab (H00 to H20) are codes of the training that the documents were written
// for, and this repository does not carry that training. The runbook ids (RB-01) and the catalogue rows
// (G1, N1) stay, because they are the vocabulary of the operator documents themselves: an operations team
// says "run RB-03".
//
// IB01 to IB20 stay: they are the steps of one lab (the simulated fabric), not a code that the portal
// names, and a document uses them as exercise numbers inside its own text.

// A module: the subject, with no article, so that it reads in a sentence ("the metrics of observability
// and SLOs", "compute fabric lab step 5").
export const MODULE_WORDS: Record<string, string> = {
  M0: 'layer model and method',
  M1: 'accelerator hardware',
  M2: 'GPU health and errors',
  M3: 'compute fabric',
  M4: 'collectives',
  M5: 'observability and SLOs',
  M6: 'performance modelling',
  M7: 'incident operations',
  M8: 'storage and the data path',
  M9: 'platform',
  M10: 'fleet lifecycle',
  M11: 'workloads',
}

// A lab: "the … lab", because a sentence says "see the DCGM and NVLink lab".
export const LAB_WORDS: Record<string, string> = {
  H00: 'the orientation lab',
  H01: 'the GPU profiles lab',
  H02: 'the runtime control lab',
  H03: 'the troubleshooting drills lab',
  H04: 'the node daemon lab',
  H05: 'the device plugin lab',
  H06: 'the DRA driver lab',
  H07: 'the GPU Operator lab',
  H08: 'the failure injection lab',
  H09: 'the node-wide injection lab',
  H10: 'the advanced guides lab',
  H11: 'the DCGM and NVLink lab',
  H12: 'the InfiniBand fabric lab',
  H13: 'the simulated fabric lab',
  H14: 'the KAI Scheduler lab',
  H15: 'the Run:ai lab',
  H16: 'the NICo lifecycle lab',
  H17: 'the DPF lab',
  H18: 'the health validation lab',
  H19: 'the topograph lab',
  H20: 'the final lab',
}

export const moduleWords = (code: string): string | null => MODULE_WORDS[code] ?? null
export const labWords = (code: string): string | null => LAB_WORDS[code] ?? null

// A code, as a whole word: M0 to M11, and H00 to H20. H3x to H9x are not labs: H48 is the height of a rack.
const CODE = /\b(M[0-9]{1,2}|H[0-2][0-9])\b/g

// The course codes that a text still names, outside a code span and outside a fence: the lint of a document,
// and of the text of a panel. `--gpu_type H20` is a tuning profile and not a lab, so a code span protects it.
export function codesIn(text: string): string[] {
  const out: string[] = []
  let fence = false
  for (const line of text.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) {
      fence = !fence
      continue
    }
    if (fence) continue
    outsideCode(line, (part) => {
      for (const m of part.matchAll(CODE)) out.push(m[1]!)
      return part
    })
  }
  return out
}

// A label prefix: "M5 - Observability and SLOs" and "H11 — DCGM and the NVLink fabric" are titles with the
// code in front of them, so the code goes and the title stays.
const PREFIX = /\b(M[0-9]{1,2}|H[0-9]{2})\s*[-–—]\s*/g

// A function of the text of a line, applied outside the code spans. A code in a command, in a version, or in
// a code span is not a reference to our course, so it stays: `nvme0n1` has no module in it.
export function outsideCode(line: string, f: (text: string) => string): string {
  return line
    .split(/(`[^`]*`)/)
    .map((part, i) => (i % 2 === 1 ? part : f(part)))
    .join('')
}

// The words of every course code in a line, outside a code span.
export const withoutCodes = (line: string): string => outsideCode(line, withWords)

function withWords(text: string): string {
  return text
    .replace(PREFIX, '')
    .replace(CODE, (whole, code: string) => moduleWords(code) ?? labWords(code) ?? whole)
}
