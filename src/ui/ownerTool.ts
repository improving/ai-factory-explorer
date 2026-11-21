import type { BlockRole } from '../catalog/factory'
import type { DocKind } from '../catalog/kinds'
import { L1_RULE, TOOL_LAYERS, escalationOf, layersOf, ownerOf, type PartRef } from '../catalog/ownership'
import type { Config } from '../config/config'
import { rackOf } from '../topology/racks'
import type { SpecRow } from './inspect'

// The Owner/Tool tab: who owns the part, where to escalate a hardware defect, which tools show it,
// and who operates those tools (the proposed column of the requirements map).
export function ownerToolRows(config: Config, info: { id: string; kind: DocKind }): SpecRow[] {
  const part: PartRef = { kind: info.kind }
  if (info.id.startsWith('blk-')) part.role = info.id.slice('blk-'.length) as BlockRole
  if (info.kind === 'rack') part.rackRole = rackOf(config, info.id)?.role ?? 'compute'
  const rows: SpecRow[] = [{ label: 'Owner', fact: ownerOf(config, part).fact }]
  const escalation = escalationOf(part)
  if (escalation) rows.push({ label: 'Escalation', fact: escalation })
  for (const key of layersOf(config, part)) {
    const layer = TOOL_LAYERS[key]
    rows.push({ label: `${layer.label}: seen in`, fact: layer.tools }, { label: `${layer.label}: operated by`, fact: layer.operatedBy })
  }
  rows.push({ label: 'L1', fact: L1_RULE })
  return rows
}
