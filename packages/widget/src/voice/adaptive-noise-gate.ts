/** Amplitude heuristic for microphone activity, not a speech classifier. */
export class AdaptiveNoiseGate {
  private floor = 0.006
  private quiet: number[] = []
  private aboveMs = 0
  private belowMs = 0
  private active = false

  get pending(): boolean { return !this.active && this.aboveMs > 0 }

  sample(rms: number, elapsedMs = 50): boolean {
    const level = Math.max(0, Math.min(1, Number.isFinite(rms) ? rms : 0))
    const duration = Math.max(0, Math.min(100, elapsedMs))
    const threshold = Math.max(0.008, this.floor * 2.5 + 0.003)
    if (!this.active) {
      this.aboveMs = level >= threshold ? this.aboveMs + duration : 0
      if (this.aboveMs >= 150) {
        this.active = true
        this.belowMs = 0
      }
    } else {
      this.belowMs = level < threshold * 0.65 ? this.belowMs + duration : 0
      if (this.belowMs >= 250) {
        this.active = false
        this.aboveMs = 0
        this.quiet = []
      }
    }
    if (level < threshold) {
      this.quiet.push(level)
      if (this.quiet.length > 40) this.quiet.shift()
      const sorted = [...this.quiet].sort((a, b) => a - b)
      const target = Math.min(0.02, sorted[Math.floor((sorted.length - 1) * 0.2)])
      this.floor += (target - this.floor) * (target < this.floor ? 0.1 : 0.04)
    }
    return this.active
  }
}
