import { platformFor } from '../catalog/platforms'
import type { Config } from '../config/config'
import { validAlgorithms } from './algorithms'
import { busbwChannels } from './busbw'
import { channelsOf } from './channels'
import { schedule, type Algorithm, type Collective } from './schedule'
import { availableScopes, scopeRanks, type Scope } from './scope'

export type NcclSide = { timeUs: number; algbw: number; busbw: number; wrong: number | null }
export type NcclRow = { size: number; count: number; type: string; redop: string; root: number; out: NcclSide; inp: NcclSide }
export type NcclRun = {
  testName: string | null
  collective: Collective | null
  ranks: number
  hosts: string[]
  gpusPerHost: number
  rows: NcclRow[]
  outOfBounds: { count: number; ok: boolean } | null
  avgBusbw: number | null
}
export type ParseResult = { ok: true; run: NcclRun } | { ok: false; reason: string }

const TESTS: Record<string, Collective> = {
  all_reduce_perf: 'allreduce',
  all_gather_perf: 'allgather',
  reduce_scatter_perf: 'reducescatter',
  alltoall_perf: 'alltoall',
  broadcast_perf: 'broadcast',
}
// The collective of a test binary; a build can add a suffix to the name (for example all_reduce_perf_mpi).
const collectiveOf = (name: string): Collective | null => TESTS[/^([a-z_]+?_perf)/.exec(name)?.[1] ?? ''] ?? null
// The default columns of the result table (sourcing note, section 2); "cputime" can replace "time".
const COLUMNS = ['size', 'count', 'type', 'redop', 'root', 'time', 'algbw', 'busbw', '#wrong', 'time', 'algbw', 'busbw', '#wrong']

// Reads the output of an nccl-tests binary: the test name, the rank lines, the rows of the result table, and the
// footer. Only the default columns: an output with other columns gets a clear message.
export function parseNcclTests(text: string): ParseResult {
  let testName: string | null = null
  const hosts = new Map<string, number>()
  let ranks = 0
  let table = false
  const rows: NcclRow[] = []
  let outOfBounds: NcclRun['outOfBounds'] = null
  let avgBusbw: number | null = null
  for (const raw of text.split(/\r?\n/)) {
    // A launcher can add a prefix to each line: mpirun --tag-output ("[1,0]<stdout>:") or srun -l ("0: ").
    const line = raw.trim().replace(/^\[\d+,\d+\]<std(?:out|err)>:\s*/, '').replace(/^\d+:\s+/, '')
    if (line === '') continue
    let m: RegExpExecArray | null
    if ((m = /^#\s*Collective test starting:\s*(\S+)/.exec(line))) testName = m[1]!
    else if ((m = /^#\s*Rank\s+\d+\s+(?:Group\s+\d+\s+)?Pid\s+\d+\s+on\s+(\S+)\s+device\s+\d+/.exec(line))) {
      ranks++
      hosts.set(m[1]!, (hosts.get(m[1]!) ?? 0) + 1)
    } else if ((m = /^#\s*Out of bounds values\s*:\s*(\d+)\s+(OK|FAILED)/.exec(line))) outOfBounds = { count: Number(m[1]), ok: m[2] === 'OK' }
    else if ((m = /^#\s*Avg bus bandwidth\s*:\s*([\d.eE+-]+)/.exec(line))) avgBusbw = Number(m[1])
    else if (line.startsWith('#')) {
      const words = line.slice(1).trim().split(/\s+/).map((w) => (w === 'cputime' ? 'time' : w))
      if (words[0] !== 'size' || !words.includes('busbw')) continue
      const extra = words.filter((w) => !COLUMNS.includes(w))
      if (extra.length > 0 || words.join(' ') !== COLUMNS.join(' ')) {
        return { ok: false, reason: `The reader reads the default columns only (size, count, type, redop, root, time, algbw, busbw, #wrong). This output also has: ${extra.join(', ') || 'the columns in another order'}.` }
      }
      table = true
    } else if (table && /^\d/.test(line)) {
      const t = line.split(/\s+/)
      if (t.length !== COLUMNS.length) continue
      const side = (i: number): NcclSide => ({ timeUs: Number(t[i]), algbw: Number(t[i + 1]), busbw: Number(t[i + 2]), wrong: t[i + 3] === 'N/A' ? null : Number(t[i + 3]) })
      const row: NcclRow = { size: Number(t[0]), count: Number(t[1]), type: t[2]!, redop: t[3]!, root: Number(t[4]), out: side(5), inp: side(9) }
      // A row of size 0 has no data: the count is rounded down to a multiple of the ranks.
      if ([row.size, row.out.busbw, row.inp.busbw].every(Number.isFinite) && row.size > 0) rows.push(row)
    }
  }
  if (new Set(rows.map((r) => r.size)).size !== rows.length) {
    return { ok: false, reason: 'This output has more than one result table (a size is repeated: more than one test, data type, or operation). Paste one test at a time.' }
  }
  if (rows.length === 0) {
    return { ok: false, reason: table ? 'The result table has no rows.' : 'No result table: paste the full output of the test, with its header line (size count type redop root time algbw busbw #wrong …).' }
  }
  return {
    ok: true,
    run: { testName, collective: testName ? collectiveOf(testName) : null, ranks, hosts: [...hosts.keys()], gpusPerHost: Math.max(0, ...hosts.values()), rows, outOfBounds, avgBusbw },
  }
}

export type Assessment = { wrong: NcclRow[]; failed: boolean; largest: NcclRow; best: number; percent: number | null; below: boolean }

// The marks of a run: the rows with data errors (#wrong > 0), the FAILED footer, and the busbw of the largest size
// against the threshold (a percentage of the limit). The busbw of a row is the better of out-of-place and in-place.
export function assess(run: NcclRun, limitGBps: number | null, thresholdPct: number): Assessment {
  const wrong = run.rows.filter((r) => (r.out.wrong ?? 0) > 0 || (r.inp.wrong ?? 0) > 0)
  const largest = run.rows.reduce((a, b) => (b.size > a.size ? b : a))
  const best = Math.max(largest.out.busbw, largest.inp.busbw)
  const percent = limitGBps !== null && limitGBps > 0 ? (best / limitGBps) * 100 : null
  return { wrong, failed: run.outOfBounds !== null && !run.outOfBounds.ok, largest, best, percent, below: percent !== null && percent < thresholdPct }
}

// A size in binary units, as people read nccl-tests sizes: 8 B, 1.5 KiB, 256 MiB, 8 GiB.
export function formatSize(bytes: number): string {
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB']
  let v = bytes
  let u = 0
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024
    u++
  }
  return `${Number.isInteger(v) ? v : v.toFixed(1)} ${units[u]}`
}

// The scope of the app that has the ranks of the run: 1 node or 1 tray (one host with all the GPUs of a server), 2 nodes,
// 4 trays, or N nodes or trays with 1 GPU each; null when no scope fits.
export function runScope(run: NcclRun, gpusPerServer: number, nvl72: boolean): Scope | null {
  const h = run.hosts.length
  if (h === 1 && run.ranks === gpusPerServer) return nvl72 ? '1t' : '1n'
  if (run.gpusPerHost === gpusPerServer && run.ranks === h * gpusPerServer) return !nvl72 && h === 2 ? '2n' : nvl72 && h === 4 ? '4t' : null
  if (run.gpusPerHost === 1) return run.ranks === 4 ? 'n4' : run.ranks === 8 ? 'n8' : run.ranks === 16 ? 'n16' : null
  return null
}

// The limit of the model for a run: the first valid algorithm (Ring, or the send/receive of AlltoAll) on the scope that
// has the ranks of the run, with all channels. Null when the configuration has no such scope.
export function readerLimit(config: Config, run: NcclRun, collective: Collective): { scope: Scope; algorithm: Algorithm; limitGBps: number } | null {
  const p = platformFor(config)
  const scope = runScope(run, p.gpusPerServer.value, p.form === 'nvl72-tray')
  if (!scope || !availableScopes(config).includes(scope)) return null
  const algorithm = validAlgorithms(collective, scope)[0]!
  const sc = schedule(collective, algorithm, scopeRanks(config, scope)!)
  const r = busbwChannels(channelsOf(config, scope, sc), 2 ** 30)
  return r.ok ? { scope, algorithm, limitGBps: r.bw.limitGBps } : null
}
