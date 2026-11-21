import type { Config } from '../config/config'
import type { Failure } from '../simulate/failable'
import { traceFactory, type PathId } from './factory'
import { traceGpus, type TraceOptions, type TraceResult } from './trace'

// The trace of the state: a factory path from its source GPU, or a GPU-to-GPU path (null with no destination yet).
export function computeTrace(config: Config, t: { src: string; dst: string | null; options: TraceOptions; path: PathId | null }, failures: Failure[] = []): TraceResult | null {
  if (t.path) return traceFactory(config, t.path, t.src, failures)
  return t.dst === null ? null : traceGpus(config, t.src, t.dst, t.options, failures)
}
