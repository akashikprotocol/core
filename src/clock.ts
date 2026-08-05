/**
 * A Lamport logical clock.
 *
 * Send rule:    tick() before creating a local event.
 * Receive rule: observe(n) when an event with lamport n is seen from elsewhere.
 *
 * In a single process where every event passes through one clock, tick()
 * produces 1, 2, 3, … — identical to a monotonic counter. Divergence only
 * occurs when two clocks create events without observing each other, which
 * is precisely the multi-process case a monotonic counter cannot handle.
 */
export type LamportClock = {
  /** Advance and return the next value for a local event. */
  tick(): number;
  /** Advance past an observed remote value. Does not produce a new value. */
  observe(observed: number): void;
  /** Current value without advancing. For diagnostics and projection loading. */
  current(): number;
};

export function createLamportClock(initial = 0): LamportClock {
  let value = initial;

  return {
    tick(): number {
      value += 1;
      return value;
    },

    observe(observed: number): void {
      if (observed > value) value = observed;
    },

    current(): number {
      return value;
    },
  };
}
