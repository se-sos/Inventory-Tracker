import assert from "node:assert/strict";
import test from "node:test";
import {
  createLoginRateLimiter,
  loginRateLimitKey,
} from "./login-rate-limit.ts";

test("five failed attempts pause sign-in for the configured block period", () => {
  const limiter = createLoginRateLimiter({
    maxFailures: 5,
    windowMs: 60_000,
    blockMs: 120_000,
  });

  for (let attempt = 0; attempt < 4; attempt += 1) {
    assert.equal(limiter.recordFailure("ip:one", attempt * 1_000).limited, false);
  }

  const blocked = limiter.recordFailure("ip:one", 4_000);
  assert.equal(blocked.limited, true);
  assert.equal(blocked.retryAfterSeconds, 120);
  assert.equal(limiter.check("ip:one", 123_999).limited, true);
  assert.equal(limiter.check("ip:one", 124_000).limited, false);
});

test("successful login resets failures without affecting another address", () => {
  const limiter = createLoginRateLimiter({ maxFailures: 2 });

  limiter.recordFailure("ip:one", 1_000);
  limiter.recordFailure("ip:two", 1_000);
  limiter.reset("ip:one");

  assert.equal(limiter.recordFailure("ip:one", 2_000).limited, false);
  assert.equal(limiter.recordFailure("ip:two", 2_000).limited, true);
});

test("client address prefers the hosting provider address", () => {
  const headers = new Headers({
    "cf-connecting-ip": "203.0.113.10",
    "x-forwarded-for": "198.51.100.2, 198.51.100.3",
  });

  assert.equal(loginRateLimitKey(headers), "ip:203.0.113.10");
  assert.equal(loginRateLimitKey(new Headers()), "ip:unknown");
});
