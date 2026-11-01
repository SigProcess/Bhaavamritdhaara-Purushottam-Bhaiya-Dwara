export type TimerCallback = () => void
export type TimerId = number

interface ScheduledTimer {
  readonly id: TimerId
  readonly dueAt: number
  readonly callback: TimerCallback
}

/** Small deterministic clock for timeout-driven domain tests without real waits. */
export class FakeTimer {
  private currentTime = 0
  private nextId = 1
  private readonly scheduled = new Map<TimerId, ScheduledTimer>()

  now(): number {
    return this.currentTime
  }

  pendingCount(): number {
    return this.scheduled.size
  }

  setTimeout(callback: TimerCallback, delayMs: number): TimerId {
    const id = this.nextId++
    this.scheduled.set(id, {
      id,
      dueAt: this.currentTime + Math.max(0, delayMs),
      callback,
    })
    return id
  }

  clearTimeout(id: TimerId): void {
    this.scheduled.delete(id)
  }

  advanceBy(milliseconds: number): void {
    if (!Number.isFinite(milliseconds) || milliseconds < 0) {
      throw new RangeError('FakeTimer can only advance by a finite nonnegative value')
    }

    const targetTime = this.currentTime + milliseconds
    while (true) {
      const next = [...this.scheduled.values()]
        .filter((timer) => timer.dueAt <= targetTime)
        .sort((left, right) => left.dueAt - right.dueAt || left.id - right.id)[0]
      if (!next) break

      this.currentTime = next.dueAt
      this.scheduled.delete(next.id)
      next.callback()
    }
    this.currentTime = targetTime
  }

  reset(): void {
    this.currentTime = 0
    this.nextId = 1
    this.scheduled.clear()
  }
}
