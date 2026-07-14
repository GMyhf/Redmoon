import { createHmac, timingSafeEqual } from "node:crypto";

export const DUNGEON_TICKET_KIND = "crimson-dungeon";
export const DUNGEON_TICKET_SCHEMA_VERSION = 1;
export const DUNGEON_TICKET_MAX_BYTES = 4 * 1024;

const TICKET_FIELDS = Object.freeze([
  "kind",
  "instanceId",
  "schemaVersion",
  "protocolVersion",
  "averageLevel",
  "party",
  "issuedAt",
  "expiresAt",
  "sequence",
  "keyId",
  "signature",
]);
const SIGNED_FIELDS = TICKET_FIELDS.filter((field) => field !== "signature");

export class DungeonTicketError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "DungeonTicketError";
    this.code = code;
  }
}

export function createDungeonTicket({
  secret,
  instanceId,
  protocolVersion,
  averageLevel,
  party,
  issuedAt,
  expiresAt,
  sequence = 1,
  keyId = "local",
}) {
  requireSecret(secret);
  const ticket = {
    kind: DUNGEON_TICKET_KIND,
    instanceId,
    schemaVersion: DUNGEON_TICKET_SCHEMA_VERSION,
    protocolVersion,
    averageLevel,
    party: [...party],
    issuedAt,
    expiresAt,
    sequence,
    keyId,
  };
  validateShape(ticket, false);
  return Object.freeze({
    ...ticket,
    signature: signTicket(ticket, secret),
  });
}

export function validateDungeonTicket(ticket, {
  secret,
  protocolVersion,
  now,
} = {}) {
  requireSecret(secret);
  validateShape(ticket, true);
  if (ticket.kind !== DUNGEON_TICKET_KIND) fail("TICKET_KIND_MISMATCH", "Unknown dungeon ticket kind.");
  if (ticket.schemaVersion !== DUNGEON_TICKET_SCHEMA_VERSION) {
    fail("TICKET_SCHEMA_MISMATCH", "Unsupported dungeon ticket schema.");
  }
  if (ticket.protocolVersion !== protocolVersion) {
    fail("TICKET_PROTOCOL_MISMATCH", "Dungeon ticket protocol version does not match.");
  }
  if (!Number.isFinite(now)) fail("TICKET_CLOCK_INVALID", "Dungeon ticket validation requires a logical time.");
  if (now < ticket.issuedAt) fail("TICKET_NOT_YET_VALID", "Dungeon ticket is not valid yet.");
  if (now >= ticket.expiresAt) fail("TICKET_EXPIRED", "Dungeon ticket has expired.");
  const expected = signTicket(ticket, secret);
  const actualBuffer = Buffer.from(ticket.signature, "base64url");
  const expectedBuffer = Buffer.from(expected, "base64url");
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) {
    fail("TICKET_SIGNATURE_INVALID", "Dungeon ticket signature is invalid.");
  }
  return ticket;
}

export function canonicalizeDungeonTicket(ticket, includeSignature = false) {
  const fields = includeSignature ? TICKET_FIELDS : SIGNED_FIELDS;
  return JSON.stringify(Object.fromEntries(fields.map((field) => [field, ticket[field]])));
}

function signTicket(ticket, secret) {
  return createHmac("sha256", secret)
    .update(canonicalizeDungeonTicket(ticket), "utf8")
    .digest("base64url");
}

function validateShape(ticket, includeSignature) {
  if (!ticket || typeof ticket !== "object" || Array.isArray(ticket)) {
    fail("TICKET_SHAPE_INVALID", "Dungeon ticket must be an object.");
  }
  if (Buffer.byteLength(JSON.stringify(ticket), "utf8") > DUNGEON_TICKET_MAX_BYTES) {
    fail("TICKET_TOO_LARGE", "Dungeon ticket exceeds the size limit.");
  }
  const expectedFields = includeSignature ? TICKET_FIELDS : SIGNED_FIELDS;
  const actualFields = Object.keys(ticket).sort();
  if (actualFields.join("\0") !== [...expectedFields].sort().join("\0")) {
    fail("TICKET_FIELDS_INVALID", "Dungeon ticket fields are invalid.");
  }
  if (typeof ticket.instanceId !== "string" || !ticket.instanceId || ticket.instanceId.length > 128) {
    fail("TICKET_INSTANCE_INVALID", "Dungeon ticket instanceId is invalid.");
  }
  if (!Number.isSafeInteger(ticket.protocolVersion)
    || !Number.isSafeInteger(ticket.schemaVersion)
    || !Number.isSafeInteger(ticket.averageLevel)
    || !Number.isSafeInteger(ticket.sequence)
    || ticket.sequence < 1
    || ticket.averageLevel < 1) {
    fail("TICKET_NUMERIC_FIELDS_INVALID", "Dungeon ticket numeric fields are invalid.");
  }
  if (!Number.isFinite(ticket.issuedAt) || !Number.isFinite(ticket.expiresAt)
    || ticket.expiresAt <= ticket.issuedAt) {
    fail("TICKET_TIME_FIELDS_INVALID", "Dungeon ticket time fields are invalid.");
  }
  if (!Array.isArray(ticket.party) || ticket.party.length < 1 || ticket.party.length > 4
    || new Set(ticket.party).size !== ticket.party.length
    || ticket.party.some((memberId) => typeof memberId !== "string" || !memberId || memberId.length > 128)) {
    fail("TICKET_PARTY_INVALID", "Dungeon ticket party is invalid.");
  }
  if (typeof ticket.keyId !== "string" || !ticket.keyId || ticket.keyId.length > 64) {
    fail("TICKET_KEY_INVALID", "Dungeon ticket keyId is invalid.");
  }
  if (includeSignature && (typeof ticket.signature !== "string" || !/^[A-Za-z0-9_-]+$/.test(ticket.signature))) {
    fail("TICKET_SIGNATURE_INVALID", "Dungeon ticket signature is invalid.");
  }
}

function requireSecret(secret) {
  if (typeof secret !== "string" || secret.length < 16 || secret.length > 256) {
    throw new TypeError("dungeon ticket secret must be 16-256 characters");
  }
}

function fail(code, message) {
  throw new DungeonTicketError(code, message);
}
