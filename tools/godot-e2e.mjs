import { spawn } from "node:child_process";
import process from "node:process";

import { GameServer } from "../src/server/server.js";

const server = new GameServer({
  persistPath: "",
  worldOptions: { rng: () => 0.5, spawnMobs: false, mobTargetCount: 0, safeZoneRadius: 0 },
});
const address = await server.listen(0, "127.0.0.1");
const url = `ws://127.0.0.1:${address.port}/ws`;
const godot = spawn("godot", [
  "--headless", "--path", "clients/godot", "--script", "scripts/e2e.gd", "--", "--url", url,
], { stdio: ["ignore", "pipe", "pipe"] });

let output = "";
godot.stdout.on("data", (chunk) => { output += chunk; process.stdout.write(chunk); });
godot.stderr.on("data", (chunk) => { output += chunk; process.stderr.write(chunk); });
const promote = setInterval(() => {
  for (const player of server.world.players.values()) {
    player.level = 30;
    player.honor = 100;
    player.gold = 10000;
  }
}, 10);

const code = await new Promise((resolve) => godot.once("exit", (status) => resolve(status ?? 1)));
clearInterval(promote);
await server.close();
if (code !== 0) {
  throw new Error(`Godot e2e failed with ${code}: ${output}`);
}
