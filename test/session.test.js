import test from "node:test";
import assert from "node:assert/strict";

import {
  RECOVERY_TTL_MS,
  createRecoveryCode,
  createSessionToken,
  hashSecret,
  normalizeNextToken,
  recoveryMatches,
  secretMatches,
} from "../src/server/session.js";

test("session tokens are high-entropy values persisted only as hashes", () => {
  const first = createSessionToken();
  const second = createSessionToken();
  assert.notEqual(first, second);
  assert.ok(first.length >= 40);
  const hash = hashSecret(first);
  assert.notEqual(hash, first);
  assert.equal(secretMatches(first, hash), true);
  assert.equal(secretMatches(second, hash), false);
});

test("client-generated next tokens must be full-length base64url secrets", () => {
  const token = createSessionToken();
  assert.equal(normalizeNextToken(token), token);
  assert.equal(normalizeNextToken(undefined), null);
  assert.throws(() => normalizeNextToken("short"), /43-128/);
  assert.throws(() => normalizeNextToken("!".repeat(43)), /base64url/);
});

test("recovery codes are single-record secrets with an explicit expiry", () => {
  const now = Date.parse("2026-07-13T00:00:00Z");
  const { code, record } = createRecoveryCode(now);
  assert.equal(record.expiresAt, new Date(now + RECOVERY_TTL_MS).toISOString());
  assert.equal(recoveryMatches(code, record, now + 1000), true);
  assert.equal(recoveryMatches("wrong", record, now + 1000), false);
  assert.equal(recoveryMatches(code, record, now + RECOVERY_TTL_MS + 1), false);
});
