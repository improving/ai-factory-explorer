export type Collective = 'allreduce' | 'allgather' | 'reducescatter' | 'alltoall' | 'broadcast'
export type Algorithm = 'ring' | 'tree' | 'nvls' | 'pat' | 'p2p'
export type Op = 'copy' | 'reduce'
export type Phase = 'reduce-scatter' | 'all-gather' | 'reduce' | 'broadcast' | 'switch-reduce' | 'multicast' | 'exchange'
// toChunk: the slot that the receiver writes (the default is `chunk`). via: an NVLS send through the NVSwitch chips.
export type Send = { from: number; to: number; chunk: number; op: Op; toChunk?: number; via?: 'reduce' | 'multicast' }
export type Step = { phase: Phase; sends: Send[] }
// ranks: the GPU ids in the order of the algorithm; chunks: the columns of the buffers.
export type Schedule = { collective: Collective; algorithm: Algorithm; ranks: string[]; chunks: number; steps: Step[] }
// [rank][chunk]: a bit mask of the ranks whose data the cell holds (bit r is rank r).
export type Buffers = number[][]

export const COLLECTIVES: Collective[] = ['allreduce', 'allgather', 'reducescatter', 'alltoall', 'broadcast']
export const COLLECTIVE_LABEL: Record<Collective, string> = { allreduce: 'AllReduce', allgather: 'AllGather', reducescatter: 'ReduceScatter', alltoall: 'AlltoAll', broadcast: 'Broadcast' }
export const ALGORITHMS: Algorithm[] = ['ring', 'tree', 'nvls', 'pat', 'p2p']
export const ALGORITHM_LABEL: Record<Algorithm, string> = { ring: 'Ring', tree: 'Tree', nvls: 'NVLS', pat: 'PAT', p2p: 'Send/receive' }
export const MAX_RANKS = 16 // the bit masks of the buffers
export const BROADCAST_CHUNKS = 8 // the chunks of the Broadcast pipeline (COLL_FACTS.broadcastChunks)

const mod = (a: number, n: number) => ((a % n) + n) % n
const range = (n: number) => Array.from({ length: n }, (_, i) => i)

// n - 1 steps. Reduce-scatter: at step s, rank r sends chunk r - s - 1, so rank r has chunk r fully reduced at the
// end. All-gather: at step s, rank r sends chunk r - s (at step 0, its own chunk).
function ringPhase(n: number, phase: 'reduce-scatter' | 'all-gather'): Step[] {
  return range(n - 1).map((s): Step => ({
    phase,
    sends: range(n).map((r): Send => ({
      from: r,
      to: mod(r + 1, n),
      chunk: phase === 'reduce-scatter' ? mod(r - s - 1, n) : mod(r - s, n),
      op: phase === 'reduce-scatter' ? 'reduce' : 'copy',
    })),
  }))
}

// Broadcast: a chain from rank 0, pipelined: at step s, rank r sends chunk s - r to rank r + 1.
function ringBroadcast(n: number, k: number): Step[] {
  return range(n - 1 + k - 1).map((s): Step => ({
    phase: 'broadcast',
    sends: range(n - 1)
      .filter((r) => s - r >= 0 && s - r < k)
      .map((r): Send => ({ from: r, to: r + 1, chunk: s - r, op: 'copy' })),
  }))
}

// AlltoAll: at step s (1 to n - 1), rank r sends its chunk for rank r + s to that rank, which writes it in slot r.
function p2pAlltoAll(n: number): Step[] {
  return range(n - 1).map((i): Step => ({
    phase: 'exchange',
    sends: range(n).map((r): Send => ({ from: r, to: mod(r + i + 1, n), chunk: mod(r + i + 1, n), toChunk: r, op: 'copy' })),
  }))
}

// NVLS: the NVSwitch chips add chunk r from all ranks for rank r; then they copy the sum of rank r to all ranks.
function nvlsAllReduce(n: number): Step[] {
  const pairs = range(n).flatMap((r) => range(n).filter((s) => s !== r).map((s) => [r, s] as const))
  return [
    { phase: 'switch-reduce', sends: pairs.map(([r, s]): Send => ({ from: s, to: r, chunk: r, op: 'reduce', via: 'reduce' })) },
    { phase: 'multicast', sends: pairs.map(([r, s]): Send => ({ from: r, to: s, chunk: r, op: 'copy', via: 'multicast' })) },
  ]
}

// Two binary trees: the parent of each rank, -1 for the root. Tree 1 uses the positions i = n - r: the parent of i
// clears the lowest set bit of i and sets the next bit; a parent above n is skipped. The odd positions are the leaves
// (the odd ranks, for an even n). Tree 2 is the mirror of tree 1 (rank r becomes n - 1 - r): COLL_FACTS.treeShape.
export function treeParents(n: number): [number[], number[]] {
  const up = (i: number) => {
    const b = i & -i
    return (i ^ b) | (b << 1)
  }
  const parentOf = (i: number): number | null => {
    let p = up(i)
    while (p > n) {
      if ((p & (p - 1)) === 0) return null // a power of two above n: i is the root
      p = up(p)
    }
    return p
  }
  const t1 = range(n).map((r) => {
    const p = parentOf(n - r)
    return p === null ? -1 : n - p
  })
  const t2 = range(n).map((r) => {
    const p = t1[n - 1 - r]!
    return p < 0 ? -1 : n - 1 - p
  })
  return [t1, t2]
}

export function treeDepth(parents: number[], r: number): number {
  let d = 0
  for (let x = r; parents[x]! >= 0; x = parents[x]!) d++
  return d
}

// Tree AllReduce: chunk t goes on tree t. Reduce: the deepest ranks send first, one level in each step. Broadcast: the
// root sends first. NCCL pipelines the two phases; the app shows them one after the other (COLL_FACTS.treePipeline).
function treeAllReduce(n: number): Step[] {
  const trees = treeParents(n)
  const depth = Math.max(...trees.flatMap((p) => range(n).map((r) => treeDepth(p, r))))
  const level = (d: number, up: boolean): Send[] =>
    trees.flatMap((p, t) =>
      range(n)
        .filter((r) => p[r]! >= 0 && treeDepth(p, r) === d)
        .map((r): Send => (up ? { from: r, to: p[r]!, chunk: t, op: 'reduce' } : { from: p[r]!, to: r, chunk: t, op: 'copy' })),
    )
  return [...range(depth).map((j): Step => ({ phase: 'reduce', sends: level(depth - j, true) })), ...range(depth).map((j): Step => ({ phase: 'broadcast', sends: level(j + 1, false) }))]
}

// PAT, shown as the Bruck algorithm (COLL_FACTS.patSteps): at the step of distance d (1, 2, 4, …), each rank sends up
// to d chunks. AllGather: rank r sends chunks r to r + d - 1 to rank r - d. ReduceScatter: the same steps in reverse,
// and rank r sends the chunks r + d onwards to rank r + d, which adds them.
function bruck(n: number, phase: 'all-gather' | 'reduce-scatter'): Step[] {
  const steps: Step[] = []
  for (let d = 1; d < n; d *= 2) {
    const count = Math.min(d, n - d)
    steps.push({
      phase,
      sends: range(n).flatMap((r) =>
        range(count).map((j): Send =>
          phase === 'all-gather' ? { from: r, to: mod(r - d, n), chunk: mod(r + j, n), op: 'copy' } : { from: r, to: mod(r + d, n), chunk: mod(r + d + j, n), op: 'reduce' },
        ),
      ),
    })
  }
  return phase === 'all-gather' ? steps : steps.reverse()
}

// The schedule of a collective with one algorithm. algorithms.ts says which algorithm is valid for a scope.
export function schedule(collective: Collective, algorithm: Algorithm, ranks: string[]): Schedule {
  const n = ranks.length
  if (n < 2 || n > MAX_RANKS) throw new Error(`A ring needs 2 to ${MAX_RANKS} ranks, not ${n}.`)
  const make = (chunks: number, steps: Step[]): Schedule => ({ collective, algorithm, ranks, chunks, steps })
  if (algorithm === 'ring') {
    if (collective === 'allreduce') return make(n, [...ringPhase(n, 'reduce-scatter'), ...ringPhase(n, 'all-gather')])
    if (collective === 'reducescatter') return make(n, ringPhase(n, 'reduce-scatter'))
    if (collective === 'allgather') return make(n, ringPhase(n, 'all-gather'))
    if (collective === 'broadcast') return make(BROADCAST_CHUNKS, ringBroadcast(n, BROADCAST_CHUNKS))
  }
  if (algorithm === 'tree' && collective === 'allreduce') return make(2, treeAllReduce(n))
  if (algorithm === 'nvls' && collective === 'allreduce') return make(n, nvlsAllReduce(n))
  if (algorithm === 'pat' && (collective === 'allgather' || collective === 'reducescatter')) return make(n, bruck(n, collective === 'allgather' ? 'all-gather' : 'reduce-scatter'))
  if (algorithm === 'p2p' && collective === 'alltoall') return make(n, p2pAlltoAll(n))
  throw new Error(`${ALGORITHM_LABEL[algorithm]} does not run ${COLLECTIVE_LABEL[collective]}.`)
}

export const fullMask = (n: number): number => (1 << n) - 1

export function countOf(mask: number): number {
  let k = 0
  for (let m = mask; m !== 0; m &= m - 1) k++
  return k
}

// The rank of a cell that holds the data of one rank only.
export const sourceOf = (mask: number): number => 31 - Math.clz32(mask)

// AlltoAll and Broadcast move data, they do not add it: a cell shows the rank whose data it holds.
export const showsSource = (c: Collective): boolean => c === 'alltoall' || c === 'broadcast'

// The start: AllGather has its own chunk only; Broadcast has the data on rank 0 only; the others have the data of
// their own rank in each chunk.
function startBuffers(s: Schedule): Buffers {
  return range(s.ranks.length).map((r) =>
    range(s.chunks).map((c) => {
      if (s.collective === 'allgather') return c === r ? 1 << r : 0
      if (s.collective === 'broadcast') return r === 0 ? 1 : 0
      return 1 << r
    }),
  )
}

// The buffers after `step` steps (0 is the start). The sends of a step happen at the same time: each one reads the
// buffers of the step before. A send to another slot (`toChunk`, AlltoAll) reads the send buffer, which keeps the
// start data: its receives write a separate receive buffer, so a later send does not read a received chunk.
export function buffersAt(s: Schedule, step: number): Buffers {
  const start = startBuffers(s)
  let b = start
  for (const st of s.steps.slice(0, Math.max(0, step))) {
    const next = b.map((row) => [...row])
    for (const x of st.sends) {
      const to = x.toChunk ?? x.chunk
      const src = x.toChunk === undefined ? b : start
      next[x.to]![to] = x.op === 'reduce' ? next[x.to]![to]! | src[x.from]![x.chunk]! : src[x.from]![x.chunk]!
    }
    b = next
  }
  return b
}

// The cells that step `step` writes ("rank:chunk"); step 1 is the first step.
export function changedAt(s: Schedule, step: number): Set<string> {
  const st = s.steps[step - 1]
  return new Set(st ? st.sends.map((x) => `${x.to}:${x.toChunk ?? x.chunk}`) : [])
}

const END: Record<Collective, string> = {
  allreduce: 'Each rank now has the full sum of all chunks.',
  allgather: 'Each rank now has all the chunks.',
  reducescatter: 'Each rank now has one chunk, fully reduced: rank r has chunk r.',
  alltoall: 'Each rank now has one chunk from each rank.',
  broadcast: 'Each rank now has all the chunks of the root.',
}

function phaseText(a: Algorithm, p: Phase): string {
  if (a === 'pat') {
    return p === 'all-gather'
      ? 'Each rank sends all the chunks that it has to the rank at the distance of this step (1, 2, 4, …) before it.'
      : 'Each rank sends the chunks of the rank at the distance of this step to that rank, which adds them.'
  }
  switch (p) {
    case 'reduce-scatter':
      return 'Each rank sends one chunk to the next rank. The next rank adds it to its own copy of that chunk.'
    case 'all-gather':
      return 'Each rank sends one chunk to the next rank. The next rank keeps a copy of it.'
    case 'reduce':
      return 'In each tree, the ranks of one level send their half to their parent. The parent adds it to its own half.'
    case 'broadcast':
      return a === 'tree' ? 'In each tree, the parents of one level send the sum to their children. The children keep a copy.' : 'Each rank sends the chunk that it got to the next rank; the root sends the next chunk.'
    case 'switch-reduce':
      return 'Each rank gets one chunk, added from all ranks by the NVSwitch chips.'
    case 'multicast':
      return 'Each rank sends its chunk once; the NVSwitch chips copy it to all ranks.'
    case 'exchange':
      return 'Each rank sends one chunk to another rank: the chunk for that rank.'
  }
}

// One sentence about the step, for the inspector.
export function stepText(s: Schedule, step: number): string {
  const n = s.ranks.length
  if (step <= 0) {
    if (s.collective === 'allgather') return `Start: each rank has only its own chunk, 1 of ${n}.`
    if (s.collective === 'alltoall') return `Start: each rank has ${n} chunks, one for each rank.`
    if (s.collective === 'broadcast') return `Start: only the root, rank 0, has the data, cut into ${s.chunks} chunks.`
    return `Start: each rank has its own data, cut into ${s.chunks} chunks.`
  }
  const what = phaseText(s.algorithm, s.steps[Math.min(step, s.steps.length) - 1]!.phase)
  return step < s.steps.length ? what : `${what} ${END[s.collective]}`
}
