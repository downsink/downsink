/**
 * Rate limiter for progress events: emitting on every chunk floods the main
 * thread, so callers check the gate per chunk and always emit the final state.
 */
export function createProgressGate(intervalMs: number, now: () => number = Date.now) {
  let last = Number.NEGATIVE_INFINITY
  return {
    shouldEmit(): boolean {
      const t = now()
      if (t - last < intervalMs) {
        return false
      }
      last = t
      return true
    },
  }
}
