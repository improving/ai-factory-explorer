import { assumed, confirmed, type Fact } from './fact'
import type { Dim } from '../parallel/plan'

const MEGATRON = 'https://github.com/NVIDIA/Megatron-LM/blob/86edf3d3cfe9553ce3e7b75d8f3e30558d10f2a8/megatron/core/parallel_state.py#L641'
const PLAYBOOK = 'https://huggingface.co/spaces/nanotron/ultrascale-playbook'

// The facts of the parallelism mapper (sourcing note: docs/superpowers/specs/2026-10-14-ai-factory-explorer-m11-sourcing.md,
// sections 10 and 11). A confirmed fact says only what its source says.
export const PAR_FACTS = {
  order: confirmed('the default order of the parallel groups is tp-cp-ep-dp-pp; the first group in the order varies fastest', undefined, MEGATRON),
  rankOrder: assumed(
    'rank r is GPU r mod g of server r ÷ g',
    undefined,
    'The launcher (torchrun or Slurm) gives consecutive ranks to the GPUs of one server. Another launcher order moves the groups to other GPUs.',
  ),
  epRule: assumed(
    'an EP group is EP consecutive ranks of DP × CP, with the same TP and PP rank',
    undefined,
    'Megatron-LM has a second rank order for the expert layers (expert TP, EP, expert DP, PP). The app uses expert TP = TP, so the expert groups are cut from the DP × CP ranks.',
  ),
  collective: {
    tp: confirmed('AllReduce; with sequence parallelism, AllGather and ReduceScatter', undefined, PLAYBOOK),
    cp: confirmed('ring send and receive of the keys and values, or AllGather', undefined, PLAYBOOK),
    ep: confirmed('AlltoAll', undefined, PLAYBOOK),
    dp: confirmed('AllReduce; with ZeRO-1, ReduceScatter and AllGather', undefined, PLAYBOOK),
    pp: confirmed('send and receive between neighbour stages', undefined, PLAYBOOK),
  } satisfies Record<Dim, Fact<string>>,
  lesson: assumed(
    'in the usual plan, TP stays in the NVLink domain, and DP and PP cross the fabric',
    undefined,
    'This is the usual plan: TP sends on each layer, so it uses the fastest links. The table gives the network of each group of this plan.',
  ),
  failure: assumed(
    'a collective waits for each member; one lost GPU stops its groups, and so the full job',
    undefined,
    'NCCL does not continue a collective without a member. The job stops and restarts from a checkpoint.',
  ),
  playCap: assumed('a group of more than 16 GPUs plays its first 16 GPUs', undefined, 'The buffers of the app hold 16 ranks.'),
}
