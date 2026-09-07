/**
 * Repetition detector for process-level failures.
 *
 * The policy this serves is that a single unhandled rejection is one broken
 * request, not a broken process, and terminating on it converts a per-request
 * defect into an outage anyone can trigger. What a single failure cannot tell
 * you is whether the process is *stuck* — a connection pool that will never
 * recover, a loop that fails identically forever — and that is what this
 * measures: the same kind of failure, N times, inside one window.
 *
 * Three properties are load-bearing, and each of them is a way this could
 * otherwise be turned against the process it protects.
 */

/** The bucket everything past the key ceiling counts against. */
export const OVERFLOW_KIND = 'other';

/** Key used when a rejection carries nothing usable to classify it by. */
const UNCLASSIFIED_KIND = 'unclassified';

/**
 * Key components are constrained the way rate-limit client keys are.
 *
 * `name` and `code` are ordinarily library constants, but nothing guarantees it:
 * an error can be constructed with any `name` at all, and a key derived from one
 * ends up in a process-wide map and in logs. So a component that is not
 * key-shaped is not stored, it is discarded.
 */
const KEY_COMPONENT = /^[A-Za-z0-9_.-]{1,64}$/;

/** One kind's count for the window it started in. */
interface KindState {
  windowStartedAt: number;
  count: number;
}

export interface FailureTripwireOptions {
  /** Occurrences of one kind, within one window, that are survived. */
  max: number;
  /** Length of the fixed window, in milliseconds. */
  windowMs: number;
  /** Hard cap on how many distinct kinds are tracked. */
  maxKinds: number;
  /** Clock source. A parameter so the window can be tested without waiting. */
  now?: () => number;
}

/** Reads one key component, or `undefined` if it is not usable as one. */
function component(value: unknown): string | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return undefined;
  }
  const text = String(value);
  return KEY_COMPONENT.test(text) ? text : undefined;
}

/**
 * The kind of a failure: what it is, never what it said.
 *
 * `name` and `code` and nothing else. The message is excluded on purpose and it
 * is the single most important decision in this file — a tripwire keyed on the
 * message is evadable by anyone who can influence the message, because two
 * occurrences of the same failure never land in the same bucket and the count
 * never reaches the threshold. It would also be an unbounded-cardinality map fed
 * by remote input.
 *
 * @param reason - Whatever the process handed to `unhandledRejection`.
 * @returns A stable, bounded, key-shaped classification.
 */
export function failureKind(reason: unknown): string {
  const err = reason as {name?: unknown; code?: unknown} | undefined;
  const name = component(err?.name);
  const code = component(err?.code);
  if (!name && !code) {
    return UNCLASSIFIED_KIND;
  }
  return `${name ?? '-'}:${code ?? '-'}`;
}

/**
 * Counts failures by kind and says when one has repeated enough to act on.
 */
export class FailureTripwire {
  private readonly kindStates = new Map<string, KindState>();
  private readonly now: () => number;

  constructor(private readonly options: FailureTripwireOptions) {
    this.now = options.now ?? (() => Date.now());
  }

  /** The kinds currently being counted. Bounded by `maxKinds` plus the overflow bucket. */
  get kinds(): string[] {
    return [...this.kindStates.keys()];
  }

  /**
   * Records one failure.
   *
   * @param reason - Whatever the process handed to `unhandledRejection`.
   * @returns `true` when this kind has now exceeded its allowance inside the
   *   current window — the evidence of a degraded process that the caller acts
   *   on. `false` otherwise, which is the ordinary answer.
   */
  record(reason: unknown): boolean {
    const now = this.now();
    const kind = this.keyFor(failureKind(reason));
    const state = this.kindStates.get(kind);
    if (!state || now - state.windowStartedAt >= this.options.windowMs) {
      this.kindStates.set(kind, {windowStartedAt: now, count: 1});
      return this.options.max < 1;
    }
    state.count += 1;
    return state.count > this.options.max;
  }

  /** Forgets every kind. Intended for tests; the tripwire is process-wide. */
  reset(): void {
    this.kindStates.clear();
  }

  /**
   * The key this kind actually counts against.
   *
   * A control that allocates per distinct input is a control an attacker can
   * turn into the outage — the lesson `RATE_LIMIT_MAX_TRACKED_CLIENTS` exists
   * for. Past the ceiling everything shares one bucket, which keeps the map
   * bounded *and* keeps counting: silently ignoring the overflow would let a
   * flood of distinct kinds switch the tripwire off, which is worse than not
   * having one.
   */
  private keyFor(kind: string): string {
    if (this.kindStates.has(kind)) {
      return kind;
    }
    return this.kindStates.size >= this.options.maxKinds ? OVERFLOW_KIND : kind;
  }
}
