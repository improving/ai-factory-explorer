import { KEYS, type Config } from './config'

// The switches that a change also changed (the rules move the switches after the one that the user changed).
export function alsoChanged(before: Config, after: Config, asked: (keyof Config)[]): (keyof Config)[] {
  return KEYS.filter((k) => before[k] !== after[k] && !asked.includes(k))
}
