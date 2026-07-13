const NUMBER_FLAGS = Object.freeze({
  "--min-join-ratio": "minJoinRatio",
  "--min-tick-ratio": "minTickRatio",
  "--min-active-ratio": "minActiveRatio",
  "--max-p95-ms": "maxP95Ms",
  "--max-p99-ms": "maxP99Ms",
  "--max-errors": "maxErrors",
});

export function createSeededRandom(seed) {
  let state = hashSeed(seed);
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(seed) {
  let hash = 0x811c9dc5;
  for (const character of String(seed)) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function parseStressArgs(argv, env = {}) {
  const positionals = [];
  const flags = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") {
      flags.help = true;
      continue;
    }
    if (argument === "--require-ready") {
      flags.requireReady = true;
      continue;
    }
    if (argument === "--seed" || argument === "--run-id" || NUMBER_FLAGS[argument]) {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new TypeError(`${argument} requires a value`);
      }
      index += 1;
      if (argument === "--seed") flags.seed = value;
      else if (argument === "--run-id") flags.runId = value;
      else flags[NUMBER_FLAGS[argument]] = parseNonNegative(value, argument);
      continue;
    }
    if (argument.startsWith("--")) throw new TypeError(`unknown option ${argument}`);
    positionals.push(argument);
  }

  const bots = parsePositiveInteger(positionals[0] ?? env.STRESS_BOTS ?? 50, "bots");
  const seconds = parsePositive(positionals[1] ?? env.STRESS_SECONDS ?? 60, "seconds");
  const url = positionals[2] ?? env.STRESS_URL ?? "ws://127.0.0.1:8080/ws";
  if (!/^wss?:\/\//.test(url)) throw new TypeError("url must use ws:// or wss://");
  if (positionals.length > 3) throw new TypeError("too many positional arguments");

  return {
    bots,
    seconds,
    url,
    seed: flags.seed ?? env.STRESS_SEED ?? "crimson-relay",
    runId: flags.runId ?? env.STRESS_RUN_ID,
    help: Boolean(flags.help),
    thresholds: {
      minJoinRatio: flags.minJoinRatio
        ?? optionalNonNegative(env.STRESS_MIN_JOIN_RATIO, "STRESS_MIN_JOIN_RATIO"),
      minTickRatio: flags.minTickRatio
        ?? optionalNonNegative(env.STRESS_MIN_TICK_RATIO, "STRESS_MIN_TICK_RATIO"),
      minActiveRatio: flags.minActiveRatio
        ?? optionalNonNegative(env.STRESS_MIN_ACTIVE_RATIO, "STRESS_MIN_ACTIVE_RATIO"),
      maxP95Ms: flags.maxP95Ms
        ?? optionalNonNegative(env.STRESS_MAX_P95_MS, "STRESS_MAX_P95_MS"),
      maxP99Ms: flags.maxP99Ms
        ?? optionalNonNegative(env.STRESS_MAX_P99_MS, "STRESS_MAX_P99_MS"),
      maxErrors: flags.maxErrors
        ?? optionalNonNegative(env.STRESS_MAX_ERRORS, "STRESS_MAX_ERRORS"),
      requireReady: flags.requireReady || parseBoolean(env.STRESS_REQUIRE_READY),
    },
  };
}

export function evaluateStressThresholds(result, thresholds) {
  const failures = [];
  if (thresholds.minJoinRatio !== undefined && result.joinRatio < thresholds.minJoinRatio) {
    failures.push(`join ratio ${result.joinRatio.toFixed(3)} < ${thresholds.minJoinRatio}`);
  }
  if (thresholds.minTickRatio !== undefined && result.tickRatio < thresholds.minTickRatio) {
    failures.push(`tick ratio ${result.tickRatio.toFixed(3)} < ${thresholds.minTickRatio}`);
  }
  if (thresholds.minActiveRatio !== undefined && result.activeRatio < thresholds.minActiveRatio) {
    failures.push(`active ratio ${result.activeRatio.toFixed(3)} < ${thresholds.minActiveRatio}`);
  }
  if (thresholds.maxP95Ms !== undefined
    && (result.snapshotGapMs === null || result.snapshotGapMs.p95 > thresholds.maxP95Ms)) {
    failures.push(`snapshot p95 ${result.snapshotGapMs?.p95 ?? "missing"} > ${thresholds.maxP95Ms}ms`);
  }
  if (thresholds.maxP99Ms !== undefined
    && (result.snapshotGapMs === null || result.snapshotGapMs.p99 > thresholds.maxP99Ms)) {
    failures.push(`snapshot p99 ${result.snapshotGapMs?.p99 ?? "missing"} > ${thresholds.maxP99Ms}ms`);
  }
  if (thresholds.maxErrors !== undefined && result.errorCount > thresholds.maxErrors) {
    failures.push(`protocol errors ${result.errorCount} > ${thresholds.maxErrors}`);
  }
  if (thresholds.requireReady && result.readyStatus !== 200) {
    failures.push(`readiness returned HTTP ${result.readyStatus}`);
  }
  return failures;
}

function optionalNonNegative(value, label) {
  return value === undefined || value === "" ? undefined : parseNonNegative(value, label);
}

function parseNonNegative(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new TypeError(`${label} must be a non-negative number`);
  }
  return number;
}

function parsePositive(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new TypeError(`${label} must be positive`);
  return number;
}

function parsePositiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) {
    throw new TypeError(`${label} must be a positive integer`);
  }
  return number;
}

function parseBoolean(value) {
  return /^(1|true|yes|on)$/i.test(String(value ?? ""));
}
