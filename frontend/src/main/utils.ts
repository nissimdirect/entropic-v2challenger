/**
 * Parse ZMQ port from Python's stdout output.
 */
export function parseZmqPort(output: string): number | null {
  const match = output.match(/ZMQ_PORT=(\d+)/)
  return match ? parseInt(match[1], 10) : null
}

/**
 * Parse ZMQ ping port from Python's stdout output.
 */
export function parseZmqPingPort(output: string): number | null {
  const match = output.match(/ZMQ_PING_PORT=(\d+)/)
  return match ? parseInt(match[1], 10) : null
}

/**
 * Parse ZMQ auth token from Python's stdout output.
 */
export function parseZmqToken(output: string): string | null {
  const match = output.match(/ZMQ_TOKEN=([0-9a-f-]+)/)
  return match ? match[1] : null
}

/**
 * Counts consecutive misses and signals when threshold is reached.
 */
export class MissCounter {
  private count = 0

  constructor(private readonly maxMisses: number) {}

  /** Record a successful response. Resets counter. */
  hit(): void {
    this.count = 0
  }

  /** Record a missed response. Returns true if threshold reached. */
  miss(): boolean {
    this.count++
    return this.count >= this.maxMisses
  }

  reset(): void {
    this.count = 0
  }

  get current(): number {
    return this.count
  }
}
