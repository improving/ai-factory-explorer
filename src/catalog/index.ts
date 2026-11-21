import { FAIL_RULES, SIM_FACTS } from './failures'
import { SIM_SCENARIOS } from '../simulate/scenarios'
import { COMPONENT_DOCS, RACK_DOCS, SCALE_UP_BLAST } from './component-docs'
import { DESIGNS } from './designs'
import { COLL_FACTS, COLL_LEARN } from './collectives'
import { BLOCK_FACTS } from './factory'
import { NVL72 } from './nvl72'
import { L1_RULE, OWNERS, TOOL_LAYERS } from './ownership'
import { FACTORY_CHECKS, FACTORY_FACTS, HOP_CHECKS, IMEX_CHECK, PATH_FACTS, VIRTUAL_PARTS } from './paths'
import { NODE_SERVICES } from './services'
import { PIX_NOTE, TOPO_CODES } from './topoCodes'
import { PLATFORMS } from './platforms'
import { NETWORK_RACK, PORT_FACES, RACKS, RACK_LAYOUT, SWITCH_PORTS } from './racks'
import { PART_RUNBOOKS, RUNBOOKS } from './runbooks'
import { SWITCHES } from './switches'

// Everything the app knows, in one tree, so one test can check every source.
export const CATALOG = {
  runbooks: RUNBOOKS,
  partRunbooks: PART_RUNBOOKS,
  designs: DESIGNS,
  platforms: PLATFORMS,
  nvl72: NVL72,
  switches: SWITCHES,
  docs: COMPONENT_DOCS,
  factory: BLOCK_FACTS,
  racks: RACKS,
  networkRack: NETWORK_RACK,
  rackLayout: RACK_LAYOUT,
  switchPorts: SWITCH_PORTS,
  portFaces: PORT_FACES,
  rackDocs: RACK_DOCS,
  owners: OWNERS,
  toolLayers: TOOL_LAYERS,
  l1Rule: L1_RULE,
  services: NODE_SERVICES,
  topoCodes: TOPO_CODES,
  pixNote: PIX_NOTE,
  scaleUpBlast: SCALE_UP_BLAST,
  paths: PATH_FACTS,
  hopChecks: HOP_CHECKS,
  imexCheck: IMEX_CHECK,
  factoryFacts: FACTORY_FACTS,
  factoryChecks: FACTORY_CHECKS,
  virtualParts: VIRTUAL_PARTS,
  failRules: FAIL_RULES,
  simFacts: SIM_FACTS,
  simScenarios: SIM_SCENARIOS,
  collectives: COLL_FACTS,
  collLearn: COLL_LEARN,
}
