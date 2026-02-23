import { execSync } from 'child_process'

/**
 * Global setup: kill orphan processes from previous test runs.
 * Runs once before all test suites.
 */
export default async function globalSetup(): Promise<void> {
  // Kill orphan Electron processes from previous runs
  try {
    execSync('pkill -f "entropic-v2challenger" 2>/dev/null || true', {
      stdio: 'ignore',
    })
  } catch {
    // No orphans — fine
  }

  // Kill orphan Python sidecar processes
  try {
    execSync('pkill -f "backend/src/main.py" 2>/dev/null || true', {
      stdio: 'ignore',
    })
  } catch {
    // No orphans — fine
  }

  // Clean up mmap / temp files if any
  try {
    execSync('rm -f /tmp/entropic-*.mmap 2>/dev/null || true', {
      stdio: 'ignore',
    })
  } catch {
    // Nothing to clean
  }

  // Small delay to let OS reclaim ports
  await new Promise((resolve) => setTimeout(resolve, 500))
}
