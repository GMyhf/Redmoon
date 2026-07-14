import assert from "node:assert/strict";
import test from "node:test";

import {
  canonicalizeDungeonTicket,
  createDungeonTicket,
  DungeonTicketError,
  validateDungeonTicket,
} from "../src/server/dungeon-ticket.js";
import { PROTOCOL_VERSION } from "../src/server/definitions.js";
import { World, WorldError } from "../src/server/world.js";

const SECRET = "dungeon-ticket-test-secret-32";

function ticketOptions(overrides = {}) {
  return {
    secret: SECRET,
    instanceId: "vault-7",
    protocolVersion: PROTOCOL_VERSION,
    averageLevel: 42,
    party: ["host", "guest"],
    issuedAt: 1_000,
    expiresAt: 301_000,
    ...overrides,
  };
}

function ticketError(fn, code) {
  assert.throws(fn, (error) => error instanceof DungeonTicketError && error.code === code);
}

test("dungeon tickets sign canonical fields deterministically", () => {
  const ticket = createDungeonTicket(ticketOptions());
  const unsigned = Object.fromEntries(Object.entries(ticket).filter(([key]) => key !== "signature"));
  const reordered = Object.fromEntries(Object.entries(unsigned).reverse());

  assert.equal(canonicalizeDungeonTicket(unsigned), canonicalizeDungeonTicket(reordered));
  assert.match(ticket.signature, /^[A-Za-z0-9_-]{43}$/);
  assert.deepEqual(validateDungeonTicket(ticket, { secret: SECRET, protocolVersion: PROTOCOL_VERSION, now: 1_001 }), ticket);
});

test("dungeon ticket validation rejects version, time, signature, and shape failures", () => {
  const ticket = createDungeonTicket(ticketOptions());
  ticketError(
    () => validateDungeonTicket({ ...ticket, schemaVersion: 0 }, { secret: SECRET, protocolVersion: PROTOCOL_VERSION, now: 1_001 }),
    "TICKET_SCHEMA_MISMATCH",
  );
  ticketError(
    () => validateDungeonTicket({ ...ticket, protocolVersion: PROTOCOL_VERSION - 1 }, { secret: SECRET, protocolVersion: PROTOCOL_VERSION, now: 1_001 }),
    "TICKET_PROTOCOL_MISMATCH",
  );
  ticketError(
    () => validateDungeonTicket({ ...ticket, averageLevel: 43 }, { secret: SECRET, protocolVersion: PROTOCOL_VERSION, now: 1_001 }),
    "TICKET_SIGNATURE_INVALID",
  );
  ticketError(
    () => validateDungeonTicket(ticket, { secret: SECRET, protocolVersion: PROTOCOL_VERSION, now: 301_000 }),
    "TICKET_EXPIRED",
  );
  ticketError(
    () => validateDungeonTicket(ticket, { secret: SECRET, protocolVersion: PROTOCOL_VERSION, now: 999 }),
    "TICKET_NOT_YET_VALID",
  );
  ticketError(
    () => validateDungeonTicket({ ...ticket, extra: true }, { secret: SECRET, protocolVersion: PROTOCOL_VERSION, now: 1_001 }),
    "TICKET_FIELDS_INVALID",
  );
});

test("World binds tickets to one instance, party seat, and sequence", () => {
  const world = new World({
    dungeonTicketSecret: SECRET,
    rng: () => 0.5,
    spawnMobs: false,
    mobTargetCount: 0,
  });
  const host = world.addPlayer("host", { name: "TicketHost", archetype: "vanguard" });
  const guest = world.addPlayer("guest", { name: "TicketGuest", archetype: "strider" });
  const outsider = world.addPlayer("outsider", { name: "TicketOutsider", archetype: "pyre" });
  world.inviteParty(host.id, guest.id);
  world.acceptParty(guest.id, host.id);
  world.enterDungeon(host.id);

  const dungeon = [...world.dungeons.values()][0];
  const ticket = dungeon.ticket;
  assert.equal(world.validateDungeonTicket(ticket, host.id), dungeon);
  assert.equal(world.validateDungeonTicket(ticket, host.id), dungeon, "ticket replay maps to the same instance");
  ticketError(() => world.validateDungeonTicket(ticket, outsider.id), "TICKET_MEMBER_UNAUTHORIZED");
  const unknownInstanceTicket = createDungeonTicket(ticketOptions({
    instanceId: "vault-unknown",
    party: [host.id],
    issuedAt: 0,
    expiresAt: 10_000,
  }));
  ticketError(() => world.validateDungeonTicket(unknownInstanceTicket, host.id), "TICKET_INSTANCE_UNKNOWN");
  assert.throws(
    () => world.enterDungeon(host.id),
    (error) => error instanceof WorldError && error.code === "DUNGEON_ACTIVE",
  );
  assert.equal(world.dungeons.size, 1, "repeated entry does not create a second instance");

  world.time = ticket.expiresAt / 1000;
  ticketError(() => world.validateDungeonTicket(ticket, host.id), "TICKET_EXPIRED");
});

test("World ticket secret is never included in the ticket", () => {
  const world = new World({
    dungeonTicketSecret: SECRET,
    rng: () => 0.5,
    spawnMobs: false,
    mobTargetCount: 0,
  });
  const player = world.addPlayer("solo", { name: "TicketSolo", archetype: "vanguard" });
  world.enterDungeon(player.id);
  const ticket = [...world.dungeons.values()][0].ticket;
  assert.equal(Object.hasOwn(ticket, "secret"), false);
  assert.equal(JSON.stringify(ticket).includes(SECRET), false);
});
