import assert from "node:assert/strict";
import { scryptSync } from "node:crypto";
import test from "node:test";
import {
  createSessionToken,
  parseSessionToken,
  verifyCredentialHash,
} from "./auth-core.ts";

const ownerEmail = "owner@example.com";
const password = ["correct", "horse", "battery", "staple"].join("-");
const salt = "0123456789abcdef0123456789abcdef";
const storedPasswordHash = `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;

test("credential verification accepts only the configured email and password", () => {
  assert.equal(verifyCredentialHash({
    email: " OWNER@example.com ",
    password,
    expectedEmail: ownerEmail,
    storedPasswordHash,
  }), true);

  assert.equal(verifyCredentialHash({
    email: ownerEmail,
    password: ["wrong", "password"].join("-"),
    expectedEmail: ownerEmail,
    storedPasswordHash,
  }), false);

  assert.equal(verifyCredentialHash({
    email: "someone-else@example.com",
    password,
    expectedEmail: ownerEmail,
    storedPasswordHash,
  }), false);
});

test("credential verification rejects a malformed stored hash", () => {
  assert.throws(() => verifyCredentialHash({
    email: ownerEmail,
    password,
    expectedEmail: ownerEmail,
    storedPasswordHash: "not-a-valid-hash",
  }), /not configured correctly/);
});

test("session tokens reject tampering, expiration, and owner changes", () => {
  const sessionKey = "test-session-key-".repeat(3);
  const token = createSessionToken({
    email: ownerEmail,
    secret: sessionKey,
    durationSeconds: 60,
    nowSeconds: 1_000,
  });

  assert.deepEqual(parseSessionToken({
    token,
    secret: sessionKey,
    expectedEmail: ownerEmail,
    nowSeconds: 1_030,
  }), { email: ownerEmail, expiresAt: 1_060 });

  assert.equal(parseSessionToken({
    token: `${token.slice(0, -1)}x`,
    secret: sessionKey,
    expectedEmail: ownerEmail,
    nowSeconds: 1_030,
  }), null);

  assert.equal(parseSessionToken({
    token: `${token}.extra`,
    secret: sessionKey,
    expectedEmail: ownerEmail,
    nowSeconds: 1_030,
  }), null);

  assert.equal(parseSessionToken({
    token,
    secret: sessionKey,
    expectedEmail: ownerEmail,
    nowSeconds: 1_060,
  }), null);

  assert.equal(parseSessionToken({
    token,
    secret: sessionKey,
    expectedEmail: "new-owner@example.com",
    nowSeconds: 1_030,
  }), null);
});
