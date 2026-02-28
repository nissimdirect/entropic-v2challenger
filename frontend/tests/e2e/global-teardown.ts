/**
 * Global teardown — kills orphan sidecar processes after the test suite completes (or crashes).
 * Prevents zombie Python processes from accumulating on CI or local dev.
 */
import { execSync } from 'child_process'

export default function globalTeardown(): void {
  try {
    execSync('pkill -f "backend/src/main.py"', { stdio: 'ignore' })
  } catch {
    // No matching processes — expected when sidecar shut down cleanly
  }
}
