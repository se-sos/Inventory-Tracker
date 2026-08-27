import assert from "node:assert/strict";
import test from "node:test";
import {
  dashboardWritesAreAllowed,
  writesAreEnabled,
} from "./mutation-policy.ts";

test("dashboard writes remain disabled unless explicitly set to lowercase true", () => {
  assert.equal(writesAreEnabled(undefined), false);
  assert.equal(writesAreEnabled("false"), false);
  assert.equal(writesAreEnabled("TRUE"), false);
  assert.equal(writesAreEnabled(" true "), false);
  assert.equal(writesAreEnabled("true"), true);
});

test("demo mode blocks writes even if live writes are enabled", () => {
  assert.equal(dashboardWritesAreAllowed("true", "true"), false);
  assert.equal(dashboardWritesAreAllowed("true", "false"), true);
  assert.equal(dashboardWritesAreAllowed("false", "false"), false);
});
