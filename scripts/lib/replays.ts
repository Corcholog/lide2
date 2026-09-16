import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/** Every .rofl under a file or folder, sorted, skipping the test fixtures. */
export function collectReplays(target: string): string[] {
  const stats = statSync(target)
  if (!stats.isDirectory()) return target.toLowerCase().endsWith('.rofl') ? [target] : []

  return readdirSync(target)
    .flatMap((entry) => collectReplays(join(target, entry)))
    .filter((path) => !path.includes('.fixture.'))
    .sort()
}
