import { assumed, type Fact } from './fact'
import { HEALTH_CLASSES_URL, HEALTH_VALIDATION_URL } from './urls'
import type { NodeState } from '../topology/assign'

// The five severities of a node verdict (M2, "the verdict").
export type Severity = 'PASS' | 'INFO' | 'WARNING' | 'CRITICAL' | 'UNKNOWN'

export type SeverityInfo = { id: Severity; label: string; meaning: string; action: string; source: string }

export const SEVERITIES: SeverityInfo[] = [
  { id: 'PASS', label: 'Pass', meaning: 'No condition detected. The node is eligible for the next workload.', action: 'Nothing.', source: HEALTH_VALIDATION_URL },
  { id: 'INFO', label: 'Info', meaning: 'An anomaly within safe operating bounds. Monitor the trend.', action: 'Record it; do not drain.', source: HEALTH_VALIDATION_URL },
  { id: 'WARNING', label: 'Warning', meaning: 'A condition that degrades performance or increases the risk of failure.', action: 'Watch it; drain at the next safe point.', source: HEALTH_VALIDATION_URL },
  { id: 'CRITICAL', label: 'Critical', meaning: 'An imminent risk of failure, data corruption, or an unrecoverable state.', action: 'Remove the host from service.', source: HEALTH_VALIDATION_URL },
  { id: 'UNKNOWN', label: 'Unknown', meaning: 'The check could not complete, so eligibility cannot be assessed. It is not a soft PASS.', action: 'Find the check that could not run, and run it out of band.', source: HEALTH_VALIDATION_URL },
]

// The classifications that a health report carries (M10, "Health classifications").
export type ClassificationId =
  | 'PreventAllocations'
  | 'PreventInstanceDeletion'
  | 'PreventHostStateChanges'
  | 'SuppressExternalAlerting'
  | 'ExcludeFromStateMachineSla'
  | 'StopRebootForAutomaticRecoveryFromStateMachine'
  | 'Hardware'
  | 'SensorWarning'
  | 'SensorCritical'
  | 'SensorFatal'
  | 'SensorFailure'
  | 'TrayLeak'
  | 'RackLeak'

export type ClassificationInfo = { id: ClassificationId; label: string; effect: string; source: string }

export const CLASSIFICATIONS: ClassificationInfo[] = [
  { id: 'PreventAllocations', label: 'Prevent allocations', effect: 'No instance can use the host.', source: 'runbooks/RB-12-host-not-allocatable-lifecycle.md:28' },
  { id: 'PreventInstanceDeletion', label: 'Prevent instance deletion', effect: 'A tenant cannot release the instance until the class is cleared.', source: HEALTH_CLASSES_URL },
  { id: 'PreventHostStateChanges', label: 'Prevent host state changes', effect: 'The host does not move between states.', source: HEALTH_CLASSES_URL },
  { id: 'SuppressExternalAlerting', label: 'Suppress external alerting', effect: 'The host is not counted in the site fleet-health rollup.', source: HEALTH_CLASSES_URL },
  { id: 'ExcludeFromStateMachineSla', label: 'Exclude from the state-machine SLA', effect: 'The host is not counted in the state-machine SLA.', source: HEALTH_CLASSES_URL },
  { id: 'StopRebootForAutomaticRecoveryFromStateMachine', label: 'Stop automatic recovery', effect: 'The state machine does not reboot the host for recovery.', source: HEALTH_CLASSES_URL },
  { id: 'Hardware', label: 'Hardware', effect: 'A hardware or BMC problem.', source: HEALTH_CLASSES_URL },
  { id: 'SensorWarning', label: 'Sensor warning', effect: 'A sensor crossed a caution threshold.', source: HEALTH_CLASSES_URL },
  { id: 'SensorCritical', label: 'Sensor critical', effect: 'A sensor crossed a critical threshold.', source: HEALTH_CLASSES_URL },
  { id: 'SensorFatal', label: 'Sensor fatal', effect: 'A sensor crossed a fatal threshold.', source: HEALTH_CLASSES_URL },
  { id: 'SensorFailure', label: 'Sensor failure', effect: 'A reading is outside the valid range of the sensor.', source: HEALTH_CLASSES_URL },
  { id: 'TrayLeak', label: 'Tray leak', effect: 'An active leak in a tray; it also carries PreventAllocations.', source: 'runbooks/RB-12-host-not-allocatable-lifecycle.md:70' },
  { id: 'RackLeak', label: 'Rack leak', effect: 'An active rack-level leak; it also carries PreventAllocations.', source: 'runbooks/RB-12-host-not-allocatable-lifecycle.md:70' },
]

export const CLASSIFICATION_BY_ID = new Map(CLASSIFICATIONS.map((c) => [c.id, c] as const))

// A host in maintenance receives these three classes automatically (confirmed by the NICo documentation).
export const MAINTENANCE_CLASSES: ClassificationId[] = ['PreventAllocations', 'SuppressExternalAlerting', 'ExcludeFromStateMachineSla']

export type VerdictAction = 'none' | 'drain'

export type Verdict = {
  severity: Severity
  classes: ClassificationId[]
  action: VerdictAction
  probe: string
  note: string
  fact: Fact<Severity>
}

const MAP_NOTE = 'The verdict is a mapping from the node state, not a check result. The real verdict comes from the check catalogue of the health validation lab.'

// The verdict of a host, from the node state that the site counts give. Null for maintenance: a state is not a verdict.
export function verdictOf(state: NodeState): Verdict | null {
  switch (state) {
    case 'available':
    case 'allocated':
      return { severity: 'PASS', classes: [], action: 'none', probe: 'all checks', note: 'No failed check.', fact: assumed('PASS', undefined, MAP_NOTE) }
    case 'degraded':
      return {
        severity: 'WARNING',
        classes: ['SensorWarning'],
        action: 'none',
        probe: 'gpu_sensor_throttle',
        note: 'The host still runs. The site watches it and drains it at the next safe point.',
        fact: assumed('WARNING', undefined, MAP_NOTE),
      }
    case 'quarantined':
      return {
        severity: 'CRITICAL',
        classes: ['Hardware', 'PreventAllocations'],
        action: 'drain',
        probe: 'the check on the machine record',
        note: 'The host is out of the pool until the gate passes.',
        fact: assumed('CRITICAL', undefined, MAP_NOTE),
      }
    case 'maintenance':
      return null
  }
}

// The colour class of the health overlay: the severity, or the neutral class for a host in maintenance.
export const healthClass = (state: NodeState): string => {
  const v = verdictOf(state)
  return v ? `ov-hl-${v.severity.toLowerCase()}` : 'ov-hl-none'
}
