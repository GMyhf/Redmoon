import { randomUUID } from "node:crypto";
import path from "node:path";

import { connectPostgresAccountStore } from "../src/server/postgres-store.js";
import { loadAccountStore } from "../src/server/server.js";

const args = process.argv.slice(2);
const merge = args.includes("--merge");
const unknownOption = args.find((entry) => entry.startsWith("--") && entry !== "--merge");
if (unknownOption) throw new Error(`Unknown option: ${unknownOption}. Supported option: --merge.`);
const sourceArgs = args.filter((entry) => !entry.startsWith("--"));
if (sourceArgs.length > 1) throw new Error("Provide at most one JSON source path.");
const [sourceArg] = sourceArgs;
const source = path.resolve(sourceArg ?? process.env.PERSIST_PATH ?? "data/accounts.json");
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("Set DATABASE_URL before running the PostgreSQL migration.");
}

const accounts = loadAccountStore(source);
const count = Object.keys(accounts).length;
if (count === 0) throw new Error(`No valid accounts found in ${source}.`);

const repository = await connectPostgresAccountStore(databaseUrl);
try {
  const existing = await repository.loadAccounts();
  const existingCount = Object.keys(existing).length;
  if (!merge && existingCount > 0) {
    throw new Error(
      "PostgreSQL already contains accounts; rerun with --merge only after reviewing backups.",
    );
  }
  await repository.saveAccounts(accounts, [{
    id: randomUUID(),
    accountKey: null,
    action: "json_store_imported",
    detail: { accounts: count, source },
    at: new Date().toISOString(),
  }]);
  const outcome = existingCount > 0
    ? "Matching account keys were overwritten; target-only accounts were preserved."
    : "The target account table was empty.";
  console.log(`Imported ${count} account(s) from ${source} into PostgreSQL. ${outcome}`);
} finally {
  await repository.close();
}
