// The output of an nccl-tests binary, in the format of its print code (src/util.cu), with numbers that agree with
// each other: algbw = size ÷ time, busbw = algbw × 2(n-1)/n (all_reduce_perf). For the tests and the guide of the reader.
export function ncclSample(opts: { test?: string | null; hosts?: number; gpusPerHost?: number; busbwPeak?: number; wrongAt?: number; failed?: boolean; validation?: boolean; extraColumns?: boolean } = {}): string {
  const { test = 'all_reduce_perf', hosts = 2, gpusPerHost = 8, busbwPeak = 671, wrongAt, failed = false, validation = true, extraColumns = false } = opts
  const n = hosts * gpusPerHost
  const factor = (2 * (n - 1)) / n
  const lines: string[] = ['# nccl-tests version 2.13.11 nccl-headers=22105 nccl-library=22105']
  if (test) lines.push(`# Collective test starting: ${test}`)
  lines.push('# nThread 1 nGpus 1 minBytes 8 maxBytes 8589934592 step: 2(factor) warmup iters: 5 iters: 20 agg iters: 1 validation: 1 graph: 0', '#', '# Using devices')
  for (let r = 0; r < n; r++) lines.push(`#  Rank ${String(r).padStart(2)} Group  0 Pid ${String(10000 + r).padStart(6)} on ${`node-${String.fromCharCode(97 + Math.floor(r / gpusPerHost))}`.padStart(10)} device ${String(r % gpusPerHost).padStart(2)} [0000:18:00] NVIDIA B300`)
  lines.push('#', '#                                                              out-of-place                       in-place')
  lines.push(`#       size         count      type   redop    root     time   algbw   busbw #wrong     time   algbw   busbw #wrong${extraColumns ? ' i_min i_max' : ''}`)
  lines.push('#        (B)    (elements)                               (us)  (GB/s)  (GB/s)            (us)  (GB/s)  (GB/s)')
  // The busbw grows with the size and reaches busbwPeak at 8 GiB.
  for (const [size, part] of [[8, 0.001], [1048576, 0.05], [16777216, 0.25], [268435456, 0.8], [1073741824, 0.92], [8589934592, 1]] as const) {
    const busbw = busbwPeak * part
    const algbw = busbw / factor
    const time = size / (algbw * 1e3) // us: bytes ÷ (GB/s × 1e3)
    const wrong = !validation ? 'N/A' : wrongAt === size ? '12' : '0'
    // In-place runs at 97 % of out-of-place, so the two series of the chart are apart.
    const side = (k: number) => `${(time / k).toFixed(2).padStart(8)} ${(algbw * k).toFixed(2).padStart(7)} ${(busbw * k).toFixed(2).padStart(7)} ${wrong.padStart(6)}`
    lines.push(`${String(size).padStart(12)} ${String(size / 4).padStart(13)}     float     sum      -1 ${side(1)} ${side(0.97)}`)
  }
  lines.push(`# Out of bounds values : ${failed ? 3 : 0} ${failed ? 'FAILED' : 'OK'}`, `# Avg bus bandwidth    : ${(busbwPeak * 0.5).toFixed(3)}`, '#')
  if (test) lines.push(`# Collective test concluded: ${test}`)
  return lines.join('\n')
}
