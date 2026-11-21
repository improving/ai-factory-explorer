import type { Algorithm, Collective } from './schedule'

// The scopes of Collectives mode (scope.ts gives their ranks). On an HGX design: 1 node, 2 nodes, 2 nodes in
// different SU groups, and N nodes with 1 GPU each. On an NVL72 rack: 1 tray, 4 trays, and N trays with 1 GPU each.
// "group": the GPUs of one group of the parallelism plan (the state keeps them).
export type Scope = '1n' | '2n' | '2s' | '1t' | '4t' | 'n4' | 'n8' | 'n16' | 'group'
export const isPerNode = (s: Scope): boolean => s === 'n4' || s === 'n8' || s === 'n16'

// The valid algorithms of each collective and scope (design, section 4.1): NVLS is for one node; Tree and PAT are for
// one GPU on each node. The first one is the default.
export function validAlgorithms(c: Collective, scope: Scope): Algorithm[] {
  const perNode = isPerNode(scope)
  switch (c) {
    case 'allreduce':
      return ['ring', ...(scope === '1n' ? (['nvls'] as const) : []), ...(perNode ? (['tree'] as const) : [])]
    case 'allgather':
    case 'reducescatter':
      return ['ring', ...(perNode ? (['pat'] as const) : [])]
    case 'alltoall':
      return ['p2p']
    case 'broadcast':
      return ['ring']
  }
}
