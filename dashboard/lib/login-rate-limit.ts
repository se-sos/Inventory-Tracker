type AttemptState = {
  failures: number[];
  blockedUntil: number;
  lastSeen: number;
};

export type LoginRateLimitResult = {
  limited: boolean;
  retryAfterSeconds: number;
};

const DEFAULT_MAX_FAILURES = 5;
const DEFAULT_WINDOW_MS = 15 * 60 * 1000;
const DEFAULT_BLOCK_MS = 15 * 60 * 1000;
const DEFAULT_MAX_KEYS = 1_000;

export function createLoginRateLimiter({
  maxFailures = DEFAULT_MAX_FAILURES,
  windowMs = DEFAULT_WINDOW_MS,
  blockMs = DEFAULT_BLOCK_MS,
  maxKeys = DEFAULT_MAX_KEYS,
}: {
  maxFailures?: number;
  windowMs?: number;
  blockMs?: number;
  maxKeys?: number;
} = {}) {
  const attempts = new Map<string, AttemptState>();

  function normalizedKey(key: string): string {
    return key.trim().slice(0, 200) || "unknown";
  }

  function trimStore(now: number) {
    for (const [key, state] of attempts) {
      if (
        state.blockedUntil <= now
        && state.lastSeen < now - Math.max(windowMs, blockMs)
      ) {
        attempts.delete(key);
      }
    }

    while (attempts.size >= maxKeys) {
      const oldestKey = attempts.keys().next().value as string | undefined;
      if (!oldestKey) {
        break;
      }
      attempts.delete(oldestKey);
    }
  }

  function resultFor(state: AttemptState | undefined, now: number) {
    const retryAfterMs = Math.max(0, (state?.blockedUntil ?? 0) - now);
    return {
      limited: retryAfterMs > 0,
      retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
    } satisfies LoginRateLimitResult;
  }

  return {
    check(key: string, now = Date.now()): LoginRateLimitResult {
      const state = attempts.get(normalizedKey(key));
      return resultFor(state, now);
    },

    recordFailure(key: string, now = Date.now()): LoginRateLimitResult {
      trimStore(now);
      const safeKey = normalizedKey(key);
      const previous = attempts.get(safeKey);
      const failures = (previous?.failures ?? []).filter(
        (attemptedAt) => attemptedAt > now - windowMs,
      );

      failures.push(now);
      const blockedUntil = failures.length >= maxFailures
        ? now + blockMs
        : Math.max(previous?.blockedUntil ?? 0, 0);

      const state = { failures, blockedUntil, lastSeen: now };
      attempts.delete(safeKey);
      attempts.set(safeKey, state);
      return resultFor(state, now);
    },

    reset(key: string) {
      attempts.delete(normalizedKey(key));
    },
  };
}

export function loginRateLimitKey(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const address = headers.get("cf-connecting-ip")
    ?? headers.get("x-real-ip")
    ?? forwarded
    ?? "unknown";

  return `ip:${address}`;
}

export const ownerLoginRateLimiter = createLoginRateLimiter();
