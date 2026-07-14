const ALGORITHM = "mulberry32";
const UINT32_MAX = 0xffffffff;

export function hashSeed(seed) {
  let hash = 0x811c9dc5;
  for (const character of String(seed)) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function createSeededRandom(seed) {
  return createRandomFromState({ algorithm: ALGORITHM, state: hashSeed(seed) });
}

export function createRandomFromState(snapshot) {
  validateState(snapshot);
  let state = snapshot.state;

  const random = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };

  random.getState = () => ({ algorithm: ALGORITHM, state });
  random.setState = (nextSnapshot) => {
    validateState(nextSnapshot);
    state = nextSnapshot.state;
  };
  return random;
}

function validateState(snapshot) {
  if (!snapshot || snapshot.algorithm !== ALGORITHM
    || !Number.isInteger(snapshot.state) || snapshot.state < 0 || snapshot.state > UINT32_MAX) {
    throw new TypeError("invalid random state");
  }
}
