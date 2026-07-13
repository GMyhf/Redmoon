import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const RECOVERY_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function createSessionToken() {
  return randomBytes(32).toString("base64url");
}

export function normalizeNextToken(value) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{43,128}$/.test(value)) {
    throw new TypeError("nextToken must be 43-128 base64url characters");
  }
  return value;
}

export function createRecoveryCode(now = Date.now()) {
  const code = randomBytes(18).toString("base64url");
  return {
    code,
    record: {
      hash: hashSecret(code),
      expiresAt: new Date(now + RECOVERY_TTL_MS).toISOString(),
    },
  };
}

export function hashSecret(secret) {
  if (typeof secret !== "string" || secret.length === 0) return null;
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

export function secretMatches(secret, expectedHash) {
  const actual = hashSecret(secret);
  if (!actual || typeof expectedHash !== "string" || !/^[0-9a-f]{64}$/i.test(expectedHash)) {
    return false;
  }
  return timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expectedHash, "hex"));
}

export function recoveryMatches(secret, record, now = Date.now()) {
  if (!record || typeof record !== "object") return false;
  const expiry = Date.parse(record.expiresAt);
  return Number.isFinite(expiry) && expiry >= now && secretMatches(secret, record.hash);
}
