export type FactStatus = 'confirmed' | 'derived' | 'assumed' | 'ask-supplier' | 'not-sourced'

// The source of a value that comes from the requirements of the site. It is not a path: the document is the
// customer's own input, the portal does not carry it, and the artifact must not name our internal files.
export const SITE_REQUIREMENTS = 'site-requirements'

// One number or name, with where it comes from. The UI shows a different mark for each status.
export type Fact<T> = {
  value: T
  unit?: string
  status: FactStatus
  source?: string // an https URL, or a repository "path", "path:line", or "path:from-to"
  formula?: string // only for status 'derived'
  note?: string
}

export const confirmed = <T>(value: T, unit: string | undefined, source: string, note?: string): Fact<T> => ({
  value,
  unit,
  status: 'confirmed',
  source,
  note,
})

export const derived = <T>(value: T, unit: string | undefined, formula: string, source?: string): Fact<T> => ({
  value,
  unit,
  status: 'derived',
  formula,
  source,
})

export const assumed = <T>(value: T, unit: string | undefined, note: string, source?: string): Fact<T> => ({
  value,
  unit,
  status: 'assumed',
  note,
  source,
})

export const notSourced = (note: string): Fact<null> => ({ value: null, status: 'not-sourced', note })

export function formatFact(f: Fact<unknown>): string {
  if (f.value === null) return 'not sourced'
  const value = Array.isArray(f.value) ? JSON.stringify(f.value) : String(f.value)
  return f.unit ? `${value} ${f.unit}` : value
}
