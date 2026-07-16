import {
  ARCHETYPES,
  BIOME_RAMPS,
  CLASS_LOOKS,
  DOLL_SLOTS,
  HERO_SPRITES,
  ITEM_NAMES,
  MOB_NAMES,
  RARITY_INFO,
  RENDER_AS,
  SLOT_LABELS,
  STAT_LABELS,
  WEAPON_SHAPES,
  ZONE_LABELS,
  ZONE_TEXTURE,
} from "./data.js";

(() => {
  "use strict";

  const canvas = document.querySelector("#game-canvas");
  const ctx = canvas.getContext("2d", { alpha: false });
  const ui = {
    titleArt: document.querySelector("#title-art"),
    joinPanel: document.querySelector("#join-panel"),
    joinForm: document.querySelector("#join-form"),
    joinButton: document.querySelector("#join-button"),
    recoveryCode: document.querySelector("#recovery-code"),
    recoverButton: document.querySelector("#recover-button"),
    joinError: document.querySelector("#join-error"),
    nameInput: document.querySelector("#operator-name"),
    archetypes: [...document.querySelectorAll(".archetype")],
    hud: document.querySelector("#hud"),
    connection: document.querySelector("#connection"),
    sector: document.querySelector("#sector-label"),
    population: document.querySelector("#population"),
    chatFeed: document.querySelector("#chat-feed"),
    chatForm: document.querySelector("#chat-form"),
    chatChannel: document.querySelector("#chat-channel"),
    chatInput: document.querySelector("#chat-input"),
    leaveButton: document.querySelector("#leave-button"),
    resetHudButton: document.querySelector("#reset-hud-button"),
    lobbyRoster: document.querySelector("#lobby-roster"),
    lobbyRosterList: document.querySelector("#lobby-roster-list"),
    name: document.querySelector("#operator-display-name"),
    className: document.querySelector("#operator-class"),
    sigil: document.querySelector("#operator-sigil"),
    level: document.querySelector("#operator-level"),
    hp: document.querySelector("#health-current"),
    maxHp: document.querySelector("#health-max"),
    hpFill: document.querySelector("#health-fill"),
    energy: document.querySelector("#energy-current"),
    maxEnergy: document.querySelector("#energy-max"),
    energyFill: document.querySelector("#energy-fill"),
    energyMeter: document.querySelector(".energy-meter"),
    xp: document.querySelector("#xp-value"),
    xpFill: document.querySelector("#xp-fill"),
    statPoints: document.querySelector("#stat-points"),
    statRows: [...document.querySelectorAll(".stat-row")],
    questTitle: document.querySelector("#quest-title"),
    questSummary: document.querySelector("#quest-summary"),
    questCurrent: document.querySelector("#quest-current"),
    questTarget: document.querySelector("#quest-target"),
    questFill: document.querySelector("#quest-fill"),
    skillQ: document.querySelector("#skill-q-name"),
    skillE: document.querySelector("#skill-e-name"),
    skillR: document.querySelector("#skill-r-name"),
    skillC: document.querySelector("#skill-c-name"),
    skillF: document.querySelector("#skill-f-name"),
    skillQLevel: document.querySelector("#skill-q-level"),
    skillELevel: document.querySelector("#skill-e-level"),
    skillRLevel: document.querySelector("#skill-r-level"),
    skillCLevel: document.querySelector("#skill-c-level"),
    skillFLevel: document.querySelector("#skill-f-level"),
    skillUpgrades: document.querySelector("#skill-upgrades"),
    skillPoints: document.querySelector("#skill-points"),
    eventFeed: document.querySelector("#event-feed"),
    deathPanel: document.querySelector("#death-panel"),
    respawnTimer: document.querySelector("#respawn-timer"),
    respawnButton: document.querySelector("#respawn-button"),
    rebirthButton: document.querySelector("#rebirth-button"),
    goldAmount: document.querySelector("#gold-amount"),
    dewAmount: document.querySelector("#dew-amount"),
    reviveButton: document.querySelector("#revive-button"),
    shopPanel: document.querySelector("#shop-panel"),
    shopName: document.querySelector("#shop-name"),
    shopGoods: document.querySelector("#shop-goods"),
    socialPanel: document.querySelector("#social-panel"),
    partyState: document.querySelector("#party-state"),
    socialList: document.querySelector("#social-list"),
    alignmentRow: document.querySelector("#alignment-row"),
    alignmentText: document.querySelector("#alignment-text"),
    attuneButton: document.querySelector("#attune-button"),
    autoFightToggle: document.querySelector("#auto-fight-toggle"),
    autoLevelToggle: document.querySelector("#auto-level-toggle"),
    bagCount: document.querySelector("#bag-count"),
    autoEquipButton: document.querySelector("#auto-equip-button"),
    dungeonEnterButton: document.querySelector("#dungeon-enter-button"),
    dungeonLeaveButton: document.querySelector("#dungeon-leave-button"),
    duelForfeitButton: document.querySelector("#duel-forfeit-button"),
    recoveryIssueButton: document.querySelector("#recovery-issue-button"),
    sessionRotateButton: document.querySelector("#session-rotate-button"),
    recoveryDialog: document.querySelector("#recovery-dialog"),
    recoveryCodeValue: document.querySelector("#recovery-code-value"),
    recoveryCodeExpiry: document.querySelector("#recovery-code-expiry"),
    equipmentDoll: document.querySelector("#equipment-doll"),
    inventoryList: document.querySelector("#inventory-list"),
    abilities: [...document.querySelectorAll(".ability")],
  };

  // Protocol version this client speaks; sent with join and compared with
  // the server's welcome. Keep in sync with PROTOCOL_VERSION in
  // src/server/definitions.js.
  const CLIENT_PROTOCOL = 3;
  // Mirrors of src/server/definitions.js — presentation only. The server owns
  // the roll, the cost and the outcome; these just render them.
  const REFINE_MAX_STAGE = 4;
  const REFINE_STEP = 0.15;
  // Mirrors src/server/definitions.js HONOR_TIERS / REFINE_HONOR_GATE.
  const HONOR_TIERS = [
    { at: 800, label: "传颂" },
    { at: 600, label: "威名" },
    { at: 400, label: "信重" },
    { at: 200, label: "闻名" },
    { at: 0, label: "无名" },
  ];
  const REFINE_HONOR_GATE = [0, 0, 200, 400];
  const DUEL_REASONS = {
    defeat: "对手倒下",
    forfeit: "认输",
    timeout: "时限已到",
    disconnect: "对手掉线",
  };







  function gearIcon(slot) {
    const icon = document.createElement("i");
    icon.className = `gear-icon gear-icon-${slot === "ring1" || slot === "ring2" || slot === "ring3" ? "ring" : slot}`;
    icon.setAttribute("aria-hidden", "true");
    return icon;
  }





  const zoneTextureImages = new Map();
  const zoneTexturePatterns = new Map();
  const heroSpriteImages = new Map();


  const hexToRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const BIOME_RGB = Object.fromEntries(
    Object.entries(BIOME_RAMPS).map(([key, [from, to]]) => [key, [hexToRgb(from), hexToRgb(to)]]),
  );
  const shadeCache = new Map();
  function biomeShade(key, value) {
    const step = Math.round(clamp(value, 0, 1) * 23);
    const cacheKey = key + step;
    let shade = shadeCache.get(cacheKey);
    if (!shade) {
      const [from, to] = BIOME_RGB[key] || BIOME_RGB.wastes;
      const t = step / 23;
      shade = `rgb(${Math.round(from[0] + (to[0] - from[0]) * t)},${Math.round(from[1] + (to[1] - from[1]) * t)},${Math.round(from[2] + (to[2] - from[2]) * t)})`;
      shadeCache.set(cacheKey, shade);
    }
    return shade;
  }

  // Bilinearly interpolated value noise over a coarse lattice: smooth
  // large-scale variation instead of per-tile speckle.
  function smoothNoise(x, y) {
    const cx = x / 5;
    const cy = y / 5;
    const x0 = Math.floor(cx);
    const y0 = Math.floor(cy);
    const fx = cx - x0;
    const fy = cy - y0;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const n00 = tileHash(x0, y0);
    const n10 = tileHash(x0 + 1, y0);
    const n01 = tileHash(x0, y0 + 1);
    const n11 = tileHash(x0 + 1, y0 + 1);
    return (n00 * (1 - sx) + n10 * sx) * (1 - sy) + (n01 * (1 - sx) + n11 * sx) * sy;
  }

  // Resolved purely from server data: the safe zone, any district ellipses
  // the server sent, and the map's own theme. The old hardcoded lake and
  // quadrant layout is gone — the server owns the world's shape.
  function biomeAt(worldX, worldY) {
    const zone = state.map.safeZone;
    if (zone) {
      const dx = worldX - zone.x;
      const dy = worldY - zone.y;
      if (dx * dx + dy * dy <= zone.radius * zone.radius) return "town";
    }
    for (const district of state.map.zones || []) {
      const dx = (worldX - district.x) / district.rx;
      const dy = (worldY - district.y) / district.ry;
      if (dx * dx + dy * dy <= 1) return district.theme;
    }
    return state.map.theme || state.activeTheme || "town";
  }



  function rarityInfo(rarity) {
    return RARITY_INFO[String(rarity || "common").toLowerCase()] || RARITY_INFO.common;
  }

  // Refine stage is server-authoritative; the client only renders what the
  // snapshot says. Absent field means stage 0.
  function refineStage(item) {
    const stage = Math.floor(finite(item?.refine, 0));
    return stage > 0 ? Math.min(REFINE_MAX_STAGE, stage) : 0;
  }

  function itemLabel(item) {
    const base = ITEM_NAMES[item.name] || String(item.name || "未知装备");
    const marker = item.dropClass === "uniq" ? "UNIQ·" : item.dropClass === "sunset" ? "SUNSET·" : "";
    const stage = refineStage(item);
    return `${marker}${rarityInfo(item.rarity).prefix}${base}${stage > 0 ? ` +${stage}` : ""}`;
  }

  function itemStatLines(item) {
    const parts = [];
    const bonuses = item.bonuses && typeof item.bonuses === "object" ? item.bonuses : {};
    // Show what the piece actually contributes: the server scales every stored
    // roll by the refine stage, so printing the raw roll would make a refined
    // item look unchanged.
    const stage = refineStage(item);
    const scale = 1 + REFINE_STEP * stage;
    for (const [key, label] of Object.entries(STAT_LABELS)) {
      const value = finite(bonuses[key], 0);
      if (value > 0) parts.push(`${label}+${Math.round(value * scale)}`);
    }
    if (finite(item.damageBonus, 0) > 0) parts.push(`伤害+${Math.round(item.damageBonus * scale * 100)}%`);
    if (finite(item.hpBonus, 0) > 0) parts.push(`生命+${Math.round(item.hpBonus * scale)}`);
    if (finite(item.speedBonus, 0) > 0) parts.push(`移速+${Math.round(item.speedBonus * scale)}`);
    if (finite(item.defenseBonus, 0) > 0) parts.push(`防御+${Math.round(item.defenseBonus * scale * 100)}%`);
    if (stage > 0) parts.push(`精炼 +${stage}（数值 ×${scale.toFixed(2)}）`);
    if (item.attackFormula && typeof item.attackFormula === "object") {
      const formula = item.attackFormula;
      const statName = STAT_LABELS[formula.stat] || formula.stat;
      const divisorText = formula.maxDivisor
        ? `${formula.maxDivisor}~${formula.divisor}`
        : String(formula.divisor);
      const multiplierText = formula.multiplier ? ` ×${formula.multiplier}` : "";
      parts.push(`攻击 = 等级×${statName}÷${divisorText}${multiplierText}`);
    }
    if (finite(item.heal, 0) > 0) parts.push(`使用后恢复 ${item.heal} 生命`);
    return parts;
  }

  // Rough single-number power score so good and bad drops are easy to compare.
  // Mirrors the server's itemPower, refine multiplier included — otherwise the
  // ↑/↓ arrow would tell players to drop a +4 piece for a raw drop.
  function itemScore(item) {
    const bonuses = item.bonuses && typeof item.bonuses === "object" ? item.bonuses : {};
    let score = 0;
    for (const key of Object.keys(STAT_LABELS)) score += finite(bonuses[key], 0) * 10;
    score += finite(item.damageBonus, 0) * 400;
    score += finite(item.hpBonus, 0);
    score += finite(item.speedBonus, 0);
    score += finite(item.defenseBonus, 0) * 600;
    score *= 1 + REFINE_STEP * refineStage(item);
    if (item.attackFormula) score += 300;
    return Math.round(score);
  }

  // Mirrors refineCost in src/server/world.js — display only; the server
  // charges the real thing.
  function refineCost(item) {
    const stage = refineStage(item);
    const level = Math.max(1, Math.floor(finite(item.level, 1)));
    return { will: level * (stage + 1) * 4, gold: level * (stage + 1) * 6 };
  }

  // The forge button, shown only while standing at the smith and only on gear
  // the server would actually accept.
  function refineControl(item, player) {
    if (state.shopId !== "smith") return null;
    if (Number.isFinite(finite(item.heal, NaN))) return null;
    if (finite(item.tier, 1) < 3) return null;
    const stage = refineStage(item);
    const cost = refineCost(item);
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.item = String(item.id);
    if (stage >= REFINE_MAX_STAGE) {
      button.textContent = "满";
      button.title = "已达最高精炼阶数";
      button.disabled = true;
      return button;
    }
    const chance = [90, 70, 50, 30][stage];
    const sigils = Math.floor(finite(player.protections, 0));
    const honor = Math.floor(finite(player.honor, 0));
    const gate = REFINE_HONOR_GATE[stage] ?? 0;
    button.textContent = "炼";
    button.dataset.action = "refine";
    // The gate belongs in the tooltip: the server refuses on standing, and a
    // player should never meet that refusal for the first time as an error.
    button.title = `精炼 +${stage} → +${stage + 1}｜成功率 ${chance}%｜消耗 ${cost.will} 意志 + ${cost.gold} 金`
      + (gate > 0 ? `｜需荣誉 ${gate}（当前 ${honor}）` : "")
      + `\n失败${stage > 0 ? "掉 1 阶" : "不掉阶（已是 +0）"}`
      + `\n按住 Shift 点击可消耗 1 张护炉印保底（持有 ${sigils}）`;
    if (gate > 0 && honor < gate) {
      button.disabled = true;
      button.title += `\n荣誉不足：击杀精英与 Boss 可积累`;
    }
    return button;
  }

  function itemTooltip(item, equipped) {
    const lines = [
      `${itemLabel(item)} // ${SLOT_LABELS[item.slot] || item.slot} · ${rarityInfo(item.rarity).label} · 需要等级 ${Math.max(1, finite(item.level, 1))}`,
      itemStatLines(item).join(" ") || "无加成",
      `强度评分 ${itemScore(item)}`,
    ];
    if (equipped && equipped.id !== item.id) {
      const delta = itemScore(item) - itemScore(equipped);
      const arrow = delta > 0 ? `↑ 提升 ${delta}` : delta < 0 ? `↓ 降低 ${-delta}` : "≈ 持平";
      lines.push(`对比已装备 ${itemLabel(equipped)}：${arrow}`);
    } else if (!equipped) {
      lines.push("该部位为空，装备即生效");
    }
    return lines.join("\n");
  }

  const state = {
    socket: null,
    reconnectTimer: 0,
    reconnectAttempt: 0,
    connected: false,
    joined: false,
    entryRequested: false,
    pendingJoin: false,
    pendingRecovery: null,
    selectedArchetype: "vanguard",
    profile: null,
    id: null,
    tick: 0,
    map: { width: 1600, height: 900, name: "灰港中继站", mapId: "town", theme: "town" },
    players: new Map(),
    enemies: new Map(),
    projectiles: new Map(),
    drops: new Map(),
    gearSignature: "",
    effects: [],
    ambient: [],
    quest: null,
    camera: { x: 800, y: 450 },
    pointer: { x: 0, y: 0, worldX: 800, worldY: 450, down: false, seen: false },
    keys: new Set(),
    pulses: { q: false, e: false, r: false, c: false, f: false, primary: false },
    orders: { moveTo: undefined, target: undefined },
    dragMove: false,
    rebirthLevel: 1000,
    inventoryLimit: 240,
    shopId: null,
    socialSignature: "",
    inputSeq: 0,
    lastInput: 0,
    lastFrame: performance.now(),
    dpr: 1,
    viewWidth: innerWidth,
    viewHeight: innerHeight,
    themeCanvases: new Map(),
    activeTheme: "town",
    themeChangedAt: 0,
  };

  const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
  const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const first = (...values) => values.find((value) => value !== undefined && value !== null);
  const ratio = (value, max) => max > 0 ? clamp(value / max, 0, 1) : 0;
  const asList = (value) => {
    if (Array.isArray(value)) return value;
    if (value && typeof value === "object") {
      return Object.entries(value).map(([id, item]) => ({ id, ...(item || {}) }));
    }
    return [];
  };

  // Tiny synthesized sound effects (original chip-style beeps, no assets).
  let audioCtx = null;
  function initAudio() {
    if (audioCtx) return;
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (_error) {
      audioCtx = null;
    }
  }

  function sfx(freq, duration = 0.08, type = "square", gain = 0.03, slide = 0) {
    if (!audioCtx || audioCtx.state === "suspended") return;
    const osc = audioCtx.createOscillator();
    const amp = audioCtx.createGain();
    const now = audioCtx.currentTime;
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), now + duration);
    amp.gain.setValueAtTime(gain, now);
    amp.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(amp).connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  function setConnection(mode, label) {
    ui.connection.className = `connection is-${mode}`;
    ui.connection.querySelector("b").textContent = label;
  }

  function socketUrl() {
    if (!location.host) return null;
    return `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`;
  }

  function connect() {
    const url = socketUrl();
    if (!url) {
      setConnection("offline", "未连接");
      ui.joinError.textContent = "请通过游戏服务器打开客户端";
      ui.joinError.hidden = false;
      return;
    }

    clearTimeout(state.reconnectTimer);
    setConnection("connecting", state.reconnectAttempt ? "重新连接" : "连接中");

    let socket;
    try {
      socket = new WebSocket(url);
      state.socket = socket;
    } catch (_error) {
      scheduleReconnect();
      return;
    }

    socket.addEventListener("open", () => {
      if (state.socket !== socket) return;
      state.connected = true;
      state.reconnectAttempt = 0;
      setConnection("online", "在线");
      ui.joinError.hidden = true;
      sendClientState();
      if (state.pendingRecovery) sendRecovery();
      else if (state.pendingJoin && state.profile) sendJoin();
    });

    socket.addEventListener("message", (event) => {
      if (state.socket !== socket) return;
      let message;
      try {
        message = JSON.parse(event.data);
      } catch (_error) {
        return;
      }
      if (message && typeof message === "object") handleMessage(message);
    });

    socket.addEventListener("close", () => {
      if (state.socket !== socket) return;
      state.connected = false;
      if (state.profile && (state.joined || state.entryRequested)) {
        state.pendingJoin = true;
      }
      setConnection("offline", "连接中断");
      scheduleReconnect();
    });

    socket.addEventListener("error", () => {
      if (state.socket !== socket) return;
      socket.close();
    });
  }

  function scheduleReconnect() {
    clearTimeout(state.reconnectTimer);
    const delay = Math.min(8000, 700 * 2 ** state.reconnectAttempt);
    state.reconnectAttempt += 1;
    state.reconnectTimer = window.setTimeout(connect, delay);
  }

  function sendClientState() {
    send({ type: "clientState", visible: document.visibilityState !== "hidden" });
  }

  function send(payload) {
    if (state.socket?.readyState !== WebSocket.OPEN) return false;
    state.socket.send(JSON.stringify(payload));
    return true;
  }

  function tokenStorageKey(name) {
    return `crimson-relay-token:${String(name).trim().toLowerCase()}`;
  }

  function pendingTokenStorageKey(name) {
    return `crimson-relay-pending-token:${String(name).trim().toLowerCase()}`;
  }

  function readAccountToken(name) {
    try {
      return localStorage.getItem(tokenStorageKey(name)) || null;
    } catch (_error) {
      return null;
    }
  }

  function storeAccountToken(name, token) {
    try {
      localStorage.setItem(tokenStorageKey(name), token);
      return localStorage.getItem(tokenStorageKey(name)) === token;
    } catch (_error) {
      return false;
    }
  }

  function readPendingAccountToken(name) {
    try {
      const key = pendingTokenStorageKey(name);
      const token = localStorage.getItem(key) || null;
      if (token && !/^[A-Za-z0-9_-]{43,128}$/.test(token)) {
        // A syntactically impossible token cannot be a committed bearer.
        // Repair only this local corruption; server errors never clear a
        // well-formed pending credential because the commit may have landed.
        localStorage.removeItem(key);
        return null;
      }
      return token;
    } catch (_error) {
      return null;
    }
  }

  function createClientToken() {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const binary = String.fromCharCode(...bytes);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }

  function preparePendingAccountToken(name, replace = false) {
    const existing = replace ? null : readPendingAccountToken(name);
    const token = existing || createClientToken();
    try {
      localStorage.setItem(pendingTokenStorageKey(name), token);
      return localStorage.getItem(pendingTokenStorageKey(name)) === token ? token : null;
    } catch (_error) {
      return null;
    }
  }

  function clearPendingAccountToken(name) {
    try {
      localStorage.removeItem(pendingTokenStorageKey(name));
    } catch (_error) {
      // The visible credential warning remains available to the player.
    }
  }

  function sendJoin() {
    if (!state.profile) return;
    const token = readAccountToken(state.profile.name);
    const nextToken = readPendingAccountToken(state.profile.name);
    if (!send({
      type: "join",
      protocol: CLIENT_PROTOCOL,
      ...state.profile,
      ...(token ? { token } : {}),
      ...(nextToken ? { nextToken } : {}),
    })) return;
    state.entryRequested = true;
    state.pendingJoin = false;
    applyProfileToHud();
  }

  function sendRecovery() {
    if (!state.pendingRecovery) return;
    if (!send({
      type: "recover",
      protocol: CLIENT_PROTOCOL,
      ...state.pendingRecovery,
    })) return;
    state.entryRequested = true;
    applyProfileToHud();
  }

  function applyProfileToHud() {
    if (!state.profile) return;
    const archetype = ARCHETYPES[state.profile.archetype] || ARCHETYPES.vanguard;
    ui.name.textContent = state.profile.name.toUpperCase();
    ui.className.textContent = `${archetype.label} · ${archetype.role}`;
    ui.sigil.textContent = "";
    ui.sigil.style.backgroundImage = `url(/assets/heroes/${HERO_SPRITES[state.profile.archetype] || `${state.profile.archetype}.webp`}?v=6)`;
    ui.skillQ.textContent = archetype.q;
    ui.skillE.textContent = archetype.e;
  }

  function handleMessage(message) {
    const type = String(message.type || "").toLowerCase();
    if (type === "welcome") {
      const serverProtocol = finite(message.protocol, CLIENT_PROTOCOL);
      if (serverProtocol !== CLIENT_PROTOCOL) {
        ui.joinError.textContent = "客户端与服务器协议版本不一致，请强制刷新页面（Ctrl+Shift+R）";
        ui.joinError.hidden = false;
      }
      state.id = String(first(message.id, message.playerId, message.clientId, state.id, ""));
      applyMap(first(message.map, message.world));
      const rebirthLevel = finite(message.rebirthLevel, NaN);
      if (Number.isFinite(rebirthLevel) && rebirthLevel > 0) state.rebirthLevel = rebirthLevel;
      const inventoryLimit = finite(message.inventoryLimit, NaN);
      if (Number.isFinite(inventoryLimit) && inventoryLimit > 0) state.inventoryLimit = inventoryLimit;
      if (message.archetypes && typeof message.archetypes === "object") {
        mergeArchetypes(message.archetypes);
      }
      if (Array.isArray(message.roster)) renderLobbyRoster(message.roster);
      return;
    }

    if (type === "roster") {
      if (Array.isArray(message.players)) renderLobbyRoster(message.players);
      return;
    }

    if (type === "session") {
      const name = String(first(message.name, state.profile?.name, ""));
      const archetype = String(first(message.archetype, state.profile?.archetype, "vanguard"));
      state.profile = name ? { name, archetype } : state.profile;
      applyProfileToHud();
      if (name && typeof message.token === "string" && message.token) {
        const pendingToken = readPendingAccountToken(name);
        if (storeAccountToken(name, message.token)) {
          if (pendingToken === message.token) clearPendingAccountToken(name);
        } else {
          ui.recoveryCodeValue.textContent = message.token;
          ui.recoveryCodeExpiry.textContent = "浏览器无法保存新会话令牌，请立即保管；刷新前不要关闭此窗口。";
          ui.recoveryDialog?.showModal?.();
        }
      }
      state.pendingRecovery = null;
      if (!state.joined) {
        state.entryRequested = true;
        state.pendingJoin = true;
      }
      else {
        ui.joinButton.disabled = false;
        if (ui.recoverButton) ui.recoverButton.disabled = false;
      }
      if (ui.sessionRotateButton) ui.sessionRotateButton.disabled = false;
      return;
    }

    if (type === "recovery") {
      ui.recoveryCodeValue.textContent = String(message.code || "");
      ui.recoveryCodeExpiry.textContent = `有效期至 ${String(message.expiresAt || "")}`;
      ui.recoveryDialog?.showModal?.();
      return;
    }

    if (type === "snapshot" || type === "state") {
      applySnapshot(message);
      return;
    }

    if (type === "event") {
      handleEvent(message);
      return;
    }

    if (type === "error") {
      handleError(message);
    }
  }

  // The character screen lists everyone online with level and location.
  function renderLobbyRoster(roster) {
    if (!ui.lobbyRoster || !ui.lobbyRosterList) return;
    ui.lobbyRoster.hidden = roster.length === 0;
    ui.lobbyRosterList.replaceChildren(...roster.map((entry) => {
      const row = document.createElement("li");
      const hero = ARCHETYPES[String(entry.archetype)];
      const map = ZONE_LABELS[String(entry.mapId)] || String(entry.mapId || "");
      row.textContent = `${entry.name} · ${hero?.label ?? entry.archetype} · L${Math.max(1, finite(entry.level, 1))} · ${map}`;
      return row;
    }));
  }

  // Numeric facts (base stats, skill cooldowns/unlock levels) are server
  // truth and overwrite the local copies; the Chinese labels, lore, and
  // descriptions stay client-side as the presentation layer.
  function mergeArchetypes(definitions) {
    for (const [key, definition] of Object.entries(definitions)) {
      if (!ARCHETYPES[key] || !definition || typeof definition !== "object") continue;
      const merged = { ...ARCHETYPES[key], server: definition };
      if (definition.stats && typeof definition.stats === "object") {
        merged.stats = { ...merged.stats, ...definition.stats };
      }
      ARCHETYPES[key] = merged;
    }
    // Refresh anything already rendered from the local table.
    renderHeroDetail(state.selectedArchetype);
  }

  function applyMap(map) {
    if (!map || typeof map !== "object") return;
    state.map.width = clamp(first(map.width, map.w, state.map.width), 8, 8192);
    state.map.height = clamp(first(map.height, map.h, state.map.height), 8, 8192);
    state.map.name = String(first(map.name, map.label, state.map.name));
    state.map.mapId = String(first(map.mapId, state.map.mapId, "town"));
    state.map.theme = String(first(map.theme, state.map.theme, state.map.mapId));
    if (map.safeZone !== undefined) {
      const zone = map.safeZone;
      state.map.safeZone = zone && Number.isFinite(zone.x) && Number.isFinite(zone.y) && Number.isFinite(zone.radius)
        ? { x: zone.x, y: zone.y, radius: zone.radius }
        : null;
    }
    if (Array.isArray(map.portals)) {
      state.map.portals = map.portals.filter(
        (portal) => portal && Number.isFinite(portal.x) && Number.isFinite(portal.y)
          && (!map.mapId || !portal.mapId || portal.mapId === map.mapId),
      );
    }
    if (Array.isArray(map.zones)) {
      state.map.zones = map.zones.filter(
        (zone) => zone && Number.isFinite(zone.x) && Number.isFinite(zone.rx),
      );
    }
    if (Array.isArray(map.shops)) {
      state.map.shops = map.shops.filter(
        (shop) => shop && Number.isFinite(shop.x) && Number.isFinite(shop.y),
      );
    }
    ui.sector.textContent = `节点 // ${state.map.name}`;
  }

  function applySnapshot(snapshot) {
    if (!state.joined && !state.entryRequested) return;
    const world = snapshot.world && typeof snapshot.world === "object" ? snapshot.world : snapshot;
    state.tick = finite(first(snapshot.tick, world.tick), state.tick);
    state.id = String(first(snapshot.selfId, snapshot.playerId, world.selfId, state.id, ""));
    applyMap(first(world.map, world));

    const players = first(snapshot.players, world.players);
    const enemies = first(snapshot.enemies, world.enemies, snapshot.mobs, world.mobs);
    const projectiles = first(snapshot.projectiles, world.projectiles);
    const drops = first(snapshot.drops, world.drops);
    if (players !== undefined) updateEntities(state.players, players, "player");
    if (enemies !== undefined) updateEntities(state.enemies, enemies, "enemy");
    if (projectiles !== undefined) updateEntities(state.projectiles, projectiles, "projectile");
    if (drops !== undefined) updateEntities(state.drops, drops, "drop");

    const local = localPlayer();
    if (local && state.profile
      && (state.profile.name !== local.name || state.profile.archetype !== local.archetype)) {
      state.profile = { name: local.name, archetype: local.archetype };
      applyProfileToHud();
    }
    if (local && !state.joined) {
      state.joined = true;
      state.entryRequested = false;
      state.pendingJoin = false;
      // Snap the camera straight onto the hero — no cross-map pan on entry.
      state.camera.x = local.x;
      state.camera.y = local.y;
      ui.titleArt.classList.add("is-hidden");
      ui.titleArt.hidden = true;
      ui.joinPanel.hidden = true;
      ui.hud.hidden = false;
      // Stored coordinates are installed while the HUD is hidden so reloads
      // do not flash at the defaults. Clamp again now that it has real bounds.
      applyStoredPanelPositions();
      ui.joinButton.disabled = false;
      if (ui.recoverButton) ui.recoverButton.disabled = false;
      if (ui.leaveButton) ui.leaveButton.hidden = false;
      if (ui.resetHudButton) ui.resetHudButton.hidden = false;
    }
    const quest = first(snapshot.quest, world.quest, local?.quest);
    if (quest) state.quest = quest;
    updateHud(local);

    // The players array only carries this map; the server counts everyone.
    ui.population.textContent = `${Math.max(state.players.size, Math.round(finite(snapshot.online, 0)))} 在线`;
    ui.population.hidden = false;
  }

  function updateEntities(store, collection, kind) {
    const seen = new Set();
    const now = performance.now();
    asList(collection).forEach((raw, index) => {
      if (!raw || typeof raw !== "object") return;
      const id = String(first(raw.id, raw.playerId, raw.entityId, `${kind}-${index}`));
      seen.add(id);
      const prior = store.get(id);
      const nextX = finite(first(raw.x, raw.position?.x), prior?.targetX ?? state.camera.x);
      const nextY = finite(first(raw.y, raw.position?.y), prior?.targetY ?? state.camera.y);
      const entity = {
        ...(prior || {}),
        ...raw,
        id,
        kind,
        x: prior ? prior.x : nextX,
        y: prior ? prior.y : nextY,
        targetX: nextX,
        targetY: nextY,
        receivedAt: now,
      };

      // Floating combat text from HP deltas between snapshots.
      if (prior && (kind === "enemy" || kind === "player")) {
        const delta = finite(raw.hp, prior.hp) - finite(prior.hp, 0);
        const isSelf = kind === "player" && id === String(state.id);
        if (delta <= -1) {
          entity.flashUntil = now + 130;
          state.effects.push({
            x: nextX, y: nextY, born: now, duration: 720,
            color: kind === "enemy" ? "#ffd479" : isSelf ? "#ff6b74" : "#e89aa2",
            text: String(Math.round(-delta)),
          });
          // Impact sparks flying out of the hit.
          const sparkColor = kind === "enemy" ? "#ffca6a" : "#ff7a86";
          for (let s = 0; s < 5; s += 1) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 60 + Math.random() * 130;
            state.effects.push({
              type: "spark",
              x: nextX, y: nextY, born: now,
              duration: 320 + Math.random() * 200,
              vx: Math.cos(angle) * speed,
              vy: Math.sin(angle) * speed * 0.55,
              color: sparkColor,
            });
          }
          if (isSelf) sfx(130, 0.09, "sawtooth", 0.05);
        } else if (delta >= 5 && isSelf) {
          state.effects.push({
            x: nextX, y: nextY, born: now, duration: 720,
            color: "#67d69b",
            text: `+${Math.round(delta)}`,
          });
        }
      }
      store.set(id, entity);
    });
    for (const id of store.keys()) {
      if (!seen.has(id)) store.delete(id);
    }
  }

  function localPlayer() {
    if (state.id && state.players.has(state.id)) return state.players.get(state.id);
    return [...state.players.values()].find((player) => player.self || player.isSelf || player.local) || null;
  }

  function updateHud(player) {
    if (!player) return;
    const archetypeKey = String(first(player.archetype, player.class, state.profile?.archetype, "vanguard")).toLowerCase();
    const archetype = ARCHETYPES[archetypeKey] || ARCHETYPES.vanguard;
    const hp = finite(first(player.hp, player.health), 0);
    const maxHp = Math.max(1, finite(first(player.maxHp, player.maxHealth), 100));
    const rawEnergy = first(player.energy, player.mana, player.mp, player.resource);
    const rawMaxEnergy = first(player.maxEnergy, player.maxMana, player.maxMp, player.maxResource);
    const energy = finite(rawEnergy, 0);
    const maxEnergy = Math.max(1, finite(rawMaxEnergy, 1));
    const xp = finite(first(player.xp, player.experience), 0);
    const xpMax = Math.max(1, finite(first(player.xpToNext, player.nextLevelXp, player.maxXp), 100));
    const level = Math.max(1, Math.floor(finite(player.level, 1)));

    const rebirths = Math.max(0, Math.floor(finite(player.rebirths, 0)));
    ui.name.textContent = String(first(player.name, state.profile?.name, "RELAY-07")).toUpperCase();
    ui.className.textContent = `${archetype.label} · ${archetype.role}`;
    ui.sigil.textContent = "";
    ui.level.textContent = `L${String(level).padStart(2, "0")}${rebirths > 0 ? ` ★${rebirths}` : ""}`;
    if (ui.rebirthButton) {
      ui.rebirthButton.hidden = level < state.rebirthLevel;
      ui.rebirthButton.textContent = rebirths > 0 ? `转生 ★${rebirths + 1}` : "转生";
    }
    if (ui.autoFightToggle && player.autoFight !== undefined) {
      ui.autoFightToggle.textContent = player.autoFight ? "自动战斗 · 开" : "自动战斗 · 关";
      ui.autoFightToggle.classList.toggle("is-off", !player.autoFight);
    }
    if (ui.autoLevelToggle && player.autoLevel !== undefined) {
      ui.autoLevelToggle.textContent = player.autoLevel ? "自动加点 · 开" : "自动加点 · 关";
      ui.autoLevelToggle.classList.toggle("is-off", !player.autoLevel);
    }
    if (ui.autoEquipButton && player.autoEquip !== undefined) {
      ui.autoEquipButton.textContent = player.autoEquip ? "自动 · 开" : "自动 · 关";
      ui.autoEquipButton.classList.toggle("is-off", !player.autoEquip);
    }
    if (ui.goldAmount) {
      const sigils = Math.floor(finite(player.protections, 0));
      ui.goldAmount.textContent = `金币 ${Math.floor(finite(player.gold, 0))}`;
      ui.dewAmount.textContent = `复苏露 ${Math.floor(finite(player.dew, 0))}`
        + (sigils > 0 ? ` · 护炉印 ${sigils}` : "");
      const honor = Math.floor(finite(player.honor, 0));
      const tier = HONOR_TIERS.find((entry) => honor >= entry.at) ?? HONOR_TIERS[HONOR_TIERS.length - 1];
      ui.goldAmount.textContent += ` · 荣誉 ${honor}（${tier.label}）`;
    }
    updateShop(player);
    updateSocial(player);
    if (ui.alignmentRow) {
      const isEclipse = archetypeKey === "eclipse";
      ui.alignmentRow.hidden = !isEclipse;
      if (isEclipse) {
        const reputation = Math.round(finite(player.reputation, 0));
        const will = Math.round(finite(player.will, 0));
        const radiant = reputation >= 0;
        const boosted = player.barrier?.boosted ? " · 护障强化中" : "";
        ui.alignmentText.textContent =
          `名誉 ${reputation >= 0 ? "+" : ""}${reputation} · 意志 ${will} · ${radiant ? "光辉线" : "深渊线"}${boosted}`;
        ui.alignmentText.style.color = radiant ? "#ffe9b0" : "#7ac8ff";
        const attuningAbyss = player.attunement !== "abyss";
        ui.attuneButton.textContent = attuningAbyss ? "转向深渊" : "转向光辉";
        ui.attuneButton.dataset.path = attuningAbyss ? "abyss" : "radiant";
      }
    }
    ui.hp.textContent = Math.ceil(hp);
    ui.maxHp.textContent = Math.ceil(maxHp);
    ui.hpFill.style.width = `${ratio(hp, maxHp) * 100}%`;
    ui.energy.textContent = Math.ceil(energy);
    ui.maxEnergy.textContent = Math.ceil(maxEnergy);
    ui.energyFill.style.width = `${ratio(energy, maxEnergy) * 100}%`;
    ui.energyMeter.hidden = rawEnergy === undefined && rawMaxEnergy === undefined;
    ui.xp.textContent = `${Math.floor(ratio(xp, xpMax) * 100)}%`;
    ui.xpFill.style.width = `${ratio(xp, xpMax) * 100}%`;

    const stats = player.stats && typeof player.stats === "object" ? player.stats : player.attributes || {};
    const gearStats = player.gearStats && typeof player.gearStats === "object" ? player.gearStats : {};
    const statPoints = Math.max(0, Math.floor(finite(first(player.statPoints, player.attributePoints, player.points), 0)));
    ui.statPoints.textContent = `${statPoints} 点`;
    for (const row of ui.statRows) {
      const key = row.dataset.stat;
      const base = Math.floor(finite(stats[key], 0));
      const bonus = Math.floor(finite(gearStats[key], 0));
      row.querySelector(".stat-value").innerHTML = bonus > 0
        ? `${base}<i class="stat-bonus">+${bonus}</i>`
        : String(base);
      row.querySelector(".allocate-button").disabled = statPoints < 1;
    }

    const skills = player.skills && typeof player.skills === "object" ? player.skills : {};
    const q = skills.q || skills.Q || {};
    const e = skills.e || skills.E || {};
    const r = skills.r || skills.R || {};
    const c = skills.c || skills.C || {};
    const f = skills.f || skills.F || {};
    const qLevel = Math.max(1, Math.floor(finite(first(q.level, player.qLevel), 1)));
    const eLevel = Math.max(1, Math.floor(finite(first(e.level, player.eLevel), 1)));
    const fLevel = Math.max(1, Math.floor(finite(f.level, 1)));
    ui.skillQ.textContent = archetype.q;
    ui.skillE.textContent = archetype.e;
    // R/C read the local table like Q/E/F: the server owns the canonical
    // English name, the client owns what players read.
    ui.skillR.textContent = archetype.r || r.name || "战术爆发";
    ui.skillC.textContent = archetype.c || c.name || "机动回环";
    if (ui.skillF) ui.skillF.textContent = archetype.f;
    ui.skillQLevel.textContent = String(qLevel);
    ui.skillELevel.textContent = String(eLevel);
    ui.skillRLevel.textContent = String(Math.max(1, Math.floor(finite(r.level, 1))));
    ui.skillCLevel.textContent = String(Math.max(1, Math.floor(finite(c.level, 1))));
    if (ui.skillFLevel) ui.skillFLevel.textContent = String(fLevel);
    const skillPoints = Math.max(0, Math.floor(finite(first(player.skillPoints, skills.points), 0)));
    ui.skillPoints.textContent = `${skillPoints} 技能点`;
    ui.skillUpgrades.hidden = skillPoints < 1;
    updateAbilityCooldown("q", q);
    updateAbilityCooldown("e", e);
    updateAbilityCooldown("r", r);
    updateAbilityCooldown("c", c);
    updateAbilityCooldown("f", f);
    for (const [slot, skill] of [["r", r], ["c", c]]) {
      const button = ui.abilities.find((item) => item.dataset.ability === slot);
      if (!button) continue;
      const unlocked = skill.unlocked !== false;
      button.classList.toggle("is-locked", !unlocked);
      button.hidden = !unlocked;
      button.title = unlocked ? `施放 ${slot.toUpperCase()} 能力` : `${finite(skill.unlockLevel, 1)} 级解锁`;
      button.disabled = !unlocked || finite(skill.remaining, 0) > 0;
    }
    document.querySelectorAll("[data-upgrade]").forEach((button) => {
      const skill = skills[button.dataset.upgrade];
      const unlocked = skill?.unlocked !== false;
      const maxed = Number.isFinite(skill?.level) && Number.isFinite(skill?.maxLevel)
        && skill.level >= skill.maxLevel;
      button.disabled = !unlocked || maxed;
      button.hidden = skill?.unlocked === false;
      if (!unlocked) button.title = `${finite(skill.unlockLevel, 1)} 级解锁`;
      else if (maxed) button.title = "技能已达等级上限";
    });

    updateQuest();
    updateGear(player);
    const alive = first(player.alive, !player.dead, hp > 0);
    const inDungeon = String(player.mapId || state.map.mapId).startsWith("dungeon:");
    if (ui.dungeonEnterButton) ui.dungeonEnterButton.disabled = !alive || inDungeon;
    if (ui.dungeonLeaveButton) ui.dungeonLeaveButton.hidden = !inDungeon;
    // The arena is its own map, so being in one is visible from mapId alone.
    const inDuel = String(player.mapId || state.map.mapId).startsWith("duel:");
    if (ui.duelForfeitButton) ui.duelForfeitButton.hidden = !inDuel;
    if (ui.dungeonEnterButton && inDuel) ui.dungeonEnterButton.disabled = true;
    ui.deathPanel.hidden = Boolean(alive);
    if (!alive) updateRespawn(player);
  }

  function updateGear(player) {
    if (!ui.equipmentDoll || !ui.inventoryList) return;
    const equipment = player.equipment && typeof player.equipment === "object" ? player.equipment : {};
    const inventory = Array.isArray(player.inventory) ? player.inventory : [];
    // Refining mutates an item in place without changing its id, so the stage
    // has to be part of the signature or the panel would never redraw the new
    // "+N" and stats.
    const signature = JSON.stringify([
      DOLL_SLOTS.map((slot) => equipment[slot] ? [equipment[slot].id, refineStage(equipment[slot])] : null),
      inventory.map((item) => [item.id, refineStage(item)]),
      // The smith's presence toggles the refine control. Affordability is left
      // to the server: folding `will` in here would redraw the whole list on
      // every kill.
      state.shopId,
      // Standing gates the last two rungs, so the control's enabled state has
      // to track it — but only as "how many gates are met", which changes twice
      // in a player's life rather than on every elite kill.
      REFINE_HONOR_GATE.filter((gate) => finite(player.honor, 0) >= gate).length,
    ]);
    if (signature === state.gearSignature) return;
    state.gearSignature = signature;

    ui.bagCount.textContent = `${inventory.length}/${state.inventoryLimit}`;

    // Paper-doll: one box per body slot arranged around a figure silhouette.
    ui.equipmentDoll.replaceChildren(...DOLL_SLOTS.map((slot) => {
      const label = SLOT_LABELS[slot];
      // The slot itself stays a plain unequip button; the refine control has to
      // be a sibling rather than a child, since a button cannot nest one. The
      // cell takes the grid area so the doll layout is unchanged.
      const cell = document.createElement("div");
      cell.className = `slot-cell slot-${slot}`;
      const box = document.createElement("button");
      box.type = "button";
      box.className = `slot-box slot-${slot}`;
      const item = equipment[slot];
      if (item) {
        const info = rarityInfo(item.rarity);
        box.classList.add("is-filled");
        box.style.borderColor = info.color;
        box.style.boxShadow = `0 0 7px ${info.color}55 inset`;
        box.title = `${itemTooltip(item)}\n点击卸下`;
        box.dataset.action = "unequip";
        box.dataset.slot = slot;
        box.dataset.item = String(item.id);
        const name = document.createElement("b");
        name.textContent = itemLabel(item).slice(0, 4);
        name.style.color = info.color;
        const level = document.createElement("i");
        // gearIcon() is an <i> too, so this one is named to stay addressable.
        level.className = "slot-level";
        // The name is clipped to four characters to fit the slot, which would
        // swallow itemLabel's "+N" suffix — carry the stage on the level line,
        // where there is room for it.
        const stage = refineStage(item);
        level.textContent = `L${Math.max(1, finite(item.level, 1))}${stage > 0 ? ` +${stage}` : ""}`;
        if (stage > 0) level.style.color = "#f0c15e";
        box.append(gearIcon(item.slot), name, level);
      } else {
        box.disabled = true;
        box.title = `${label}（空）`;
        const empty = document.createElement("span");
        empty.textContent = label;
        box.append(gearIcon(slot), empty);
      }
      cell.append(box);
      // Worn gear refines in place — the server accepts it and the tutorial
      // promises it, so the entry point belongs on the piece itself rather
      // than forcing an unequip first.
      if (item) {
        const refine = refineControl(item, player);
        if (refine) {
          refine.classList.add("slot-refine");
          cell.append(refine);
        }
      }
      return cell;
    }));

    // The comparison target: same key, or the weakest of the three rings.
    const equippedFor = (slot) => {
      if (slot === "ring") {
        const rings = ["ring1", "ring2", "ring3"].map((key) => equipment[key]).filter(Boolean);
        if (rings.length < 3) return null;
        return rings.sort((a, b) => itemScore(a) - itemScore(b))[0];
      }
      return equipment[slot];
    };

    ui.inventoryList.replaceChildren(...inventory.map((item) => {
      const row = document.createElement("div");
      row.className = "gear-row";
      const isPotion = Number.isFinite(finite(item.heal, NaN));
      const equipped = equippedFor(item.slot);
      row.title = isPotion ? itemStatLines(item).join(" ") : itemTooltip(item, equipped);
      const name = document.createElement("b");
      name.textContent = isPotion
        ? itemLabel(item)
        : `${itemLabel(item)} L${Math.max(1, finite(item.level, 1))}`;
      name.style.color = isPotion ? "#e88a94" : rarityInfo(item.rarity).color;
      const trend = document.createElement("span");
      trend.className = "gear-trend";
      if (!isPotion) {
        const delta = equipped ? itemScore(item) - itemScore(equipped) : itemScore(item);
        trend.textContent = delta > 0 ? "↑" : delta < 0 ? "↓" : "＝";
        trend.style.color = delta > 0 ? "#79d99b" : delta < 0 ? "#e0596d" : "rgba(255,255,255,0.35)";
      }
      const mainButton = document.createElement("button");
      mainButton.type = "button";
      mainButton.textContent = isPotion ? "用" : "装";
      mainButton.title = isPotion ? "使用（快捷键 V）" : "装备";
      mainButton.dataset.action = isPotion ? "use" : "equip";
      mainButton.dataset.item = String(item.id);
      const sellButton = document.createElement("button");
      sellButton.type = "button";
      sellButton.textContent = "卖";
      sellButton.title = "折算为金币";
      sellButton.dataset.action = "sell";
      sellButton.dataset.item = String(item.id);
      row.prepend(gearIcon(isPotion ? "potion" : item.slot));
      row.append(name, trend, mainButton, sellButton);
      const refineButton = refineControl(item, player);
      if (refineButton) row.append(refineButton);
      return row;
    }));
  }

  function updateQuest() {
    const quest = state.quest;
    if (!quest || typeof quest !== "object") return;
    const current = Math.max(0, finite(first(quest.current, quest.progress, quest.count), 0));
    const target = Math.max(1, finite(first(quest.target, quest.required, quest.total), 1));
    const chain = Number.isFinite(quest.chainIndex)
      ? `第${quest.chainIndex + 1}环 · `
      : "";
    ui.questTitle.textContent = chain + String(first(quest.title, quest.name, "守住中继站"));
    const reward = quest.rewardGold
      ? `（+${quest.rewardXp}经验 +${quest.rewardGold}金${quest.rewardDew ? ` +${quest.rewardDew}露` : ""}）`
      : "";
    ui.questSummary.textContent = String(first(quest.summary, quest.description, "清除入侵单位")) + reward;
    ui.questCurrent.textContent = Math.floor(current);
    ui.questTarget.textContent = Math.floor(target);
    ui.questFill.style.width = `${ratio(current, target) * 100}%`;
  }

  function updateRespawn(player) {
    const remaining = Math.max(0, Math.ceil(finite(first(player.respawnIn, player.respawnTimer), 0)));
    ui.respawnTimer.textContent = remaining > 0 ? `信号恢复 ${remaining} 秒` : "信号可以重连";
    ui.respawnButton.disabled = remaining > 0;
    if (ui.reviveButton) {
      const dew = Math.floor(finite(player.dew, 0));
      ui.reviveButton.disabled = dew < 1;
      ui.reviveButton.textContent = `复苏露 · 原地复活（剩 ${dew}）`;
    }
  }

  // Shop panel appears while standing near a shopkeeper.
  function updateShop(player) {
    if (!ui.shopPanel) return;
    const near = (state.map.shops || []).find(
      (shop) => Math.hypot(shop.x - player.x, shop.y - player.y) < 120,
    );
    if (!near) {
      ui.shopPanel.hidden = true;
      state.shopId = null;
      return;
    }
    ui.shopPanel.hidden = false;
    if (state.shopId === near.id) return;
    state.shopId = near.id;
    ui.shopName.textContent = near.name;
    ui.shopGoods.replaceChildren(...(near.goods || []).map((good) => {
      const row = document.createElement("div");
      row.className = "gear-row";
      const label = document.createElement("b");
      label.textContent = good.label;
      const price = document.createElement("span");
      price.className = "gear-trend";
      price.style.width = "auto";
      const level = Math.max(1, finite(player.level, 1));
      const goldPrice = Math.floor(finite(good.gold, 0) + finite(good.goldPerLevel, 0) * (level - 1));
      price.textContent = good.dew ? `${good.dew}露` : `${goldPrice}金`;
      price.style.color = good.dew ? "#8fd8ff" : "#f0c15e";
      const buy = document.createElement("button");
      buy.type = "button";
      buy.textContent = "买";
      buy.dataset.shop = near.id;
      buy.dataset.good = good.key;
      row.append(label, price, buy);
      return row;
    }));
  }

  // Social: party members, online players to invite, friends with status.
  function clearSocialPanel() {
    state.socialSignature = "";
    if (ui.socialPanel) ui.socialPanel.hidden = true;
    ui.socialList?.replaceChildren();
    if (ui.partyState) ui.partyState.textContent = "未组队";
  }

  function updateSocial(player) {
    if (!ui.socialPanel) return;
    const others = [...state.players.values()].filter((entry) => String(entry.id) !== String(state.id));
    const party = Array.isArray(player.party) ? player.party : [];
    const friends = Array.isArray(player.friends) ? player.friends : [];
    if (others.length === 0 && party.length === 0 && friends.length === 0) {
      ui.socialPanel.hidden = true;
      return;
    }
    ui.socialPanel.hidden = false;
    const signature = JSON.stringify([
      party,
      friends,
      others.map((entry) => [entry.id, entry.name]),
    ]);
    if (signature === state.socialSignature) return;
    state.socialSignature = signature;

    ui.partyState.textContent = party.length > 0 ? `队伍 ${party.length}/4` : "未组队";
    const nameKey = (name) => String(name || "").trim().toLocaleLowerCase();
    const partyKeys = new Set(party.map(nameKey));
    const friendKeys = new Set(friends.map((friend) => nameKey(friend.name)));
    const rows = [];

    const addSection = (label, count, action = null) => {
      const heading = document.createElement("div");
      heading.className = "social-section";
      const title = document.createElement("strong");
      title.textContent = `${label} ${count}`;
      heading.append(title);
      if (action) heading.append(action);
      rows.push(heading);
    };
    const addRow = (name, status, statusClass, actions = []) => {
      const row = document.createElement("div");
      row.className = "social-row";
      const label = document.createElement("b");
      label.className = "social-name";
      label.textContent = name;
      label.title = name;
      const stateLabel = document.createElement("span");
      stateLabel.className = `social-status ${statusClass}`;
      stateLabel.textContent = status;
      row.append(label, stateLabel);
      if (actions.length > 0) {
        const actionGroup = document.createElement("span");
        actionGroup.className = "social-actions";
        actionGroup.append(...actions);
        row.append(actionGroup);
      }
      rows.push(row);
    };

    if (party.length > 0) {
      const leave = document.createElement("button");
      leave.type = "button";
      leave.textContent = "退";
      leave.title = "离开队伍";
      leave.setAttribute("aria-label", "离开队伍");
      leave.dataset.social = "party-leave";
      addSection("队伍", `${party.length}/4`, leave);
      for (const name of party) {
        addRow(String(name), nameKey(name) === nameKey(player.name) ? "本人" : "队友", "is-party");
      }
    }

    const visibleFriends = friends.filter((friend) => !partyKeys.has(nameKey(friend.name)));
    if (visibleFriends.length > 0) addSection("好友", visibleFriends.length);
    for (const friend of visibleFriends) {
      const onlinePlayer = others.find((other) => nameKey(other.name) === nameKey(friend.name));
      const onlinePlayerId = String(friend.id || onlinePlayer?.id || "");
      const actions = [];
      if (friend.online && onlinePlayerId) {
        const invite = document.createElement("button");
        invite.type = "button";
        invite.textContent = "邀";
        invite.title = "邀请组队";
        invite.setAttribute("aria-label", `邀请 ${friend.name} 组队`);
        invite.dataset.social = "invite";
        invite.dataset.target = onlinePlayerId;
        actions.push(invite);
      }
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "除";
      remove.title = "移除好友";
      remove.setAttribute("aria-label", `移除好友 ${friend.name}`);
      remove.dataset.social = "friend-remove";
      remove.dataset.name = friend.name;
      actions.push(remove);
      addRow(
        String(friend.name),
        friend.online ? "● 在线" : "○ 离线",
        friend.online ? "is-online" : "is-offline",
        actions,
      );
    }

    const available = others.filter((other) => {
      const key = nameKey(other.name);
      return !partyKeys.has(key) && !friendKeys.has(key);
    });
    if (available.length > 0) addSection("同图在线", available.length);
    for (const other of available) {
      const displayName = String(other.name || other.id);
      const invite = document.createElement("button");
      invite.type = "button";
      invite.textContent = "邀";
      invite.title = "邀请组队";
      invite.setAttribute("aria-label", `邀请 ${displayName} 组队`);
      invite.dataset.social = "invite";
      invite.dataset.target = String(other.id);
      const befriend = document.createElement("button");
      befriend.type = "button";
      befriend.textContent = "友";
      befriend.title = "加为好友";
      befriend.setAttribute("aria-label", `添加好友 ${displayName}`);
      befriend.dataset.social = "friend-add";
      befriend.dataset.name = displayName;
      const duel = document.createElement("button");
      duel.type = "button";
      duel.textContent = "决";
      duel.title = "邀请决斗（双方同意后进入独立竞技场，不掉落、不损失经验）";
      duel.setAttribute("aria-label", `邀请 ${displayName} 决斗`);
      duel.dataset.social = "duel";
      duel.dataset.target = String(other.id);
      addRow(displayName, "在线", "is-online", [invite, befriend, duel]);
    }
    ui.socialList.replaceChildren(...rows);
  }

  function updateAbilityCooldown(slot, skill) {
    const button = ui.abilities.find((item) => item.dataset.ability === slot);
    if (!button) return;
    const remaining = Math.max(0, finite(skill.remaining, 0));
    const duration = Math.max(0.01, finite(skill.cooldown, 1));
    button.classList.toggle("is-cooling", remaining > 0);
    button.querySelector(".cooldown").style.setProperty("--cooldown-ratio", ratio(remaining, duration));
    button.disabled = remaining > 0;
  }

  function roman(value) {
    return ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"][clamp(value, 1, 10) - 1];
  }

  function handleEvent(event) {
    const eventName = String(first(event.event, event.name, event.kind, "signal")).toLowerCase();
    const messages = {
      joined: "新信号已接入",
      playerjoined: "新信号已接入",
      playerleft: "一条信号已离开",
      levelup: `同步等级提升至 ${first(event.level, "新阶段")}`,
      kill: `目标已清除${event.target ? ` // ${event.target}` : ""}`,
      enemydefeated: "裂隙体已清除",
      playerdefeated: "操作员信号丢失",
      quest: "目标进度已更新",
      questprogress: "目标进度已更新",
      questcomplete: "中继任务完成",
      questcompleted: "中继任务完成",
      respawn: "操作员信号已恢复",
      playerrespawned: "操作员信号已恢复",
      upgrade: "能力已升级",
      skillupgraded: "能力已升级",
      allocated: "属性已强化",
      statallocated: "属性已强化",
      playerreborn: "转生完成 // 力量得到升华",
      autolevelchanged: "自动加点设置已更新",
      potionused: "使用了修复药剂",
      autofightchanged: "自动战斗设置已更新",
      barriersurged: "魂力护障强化 // 转换效率提升",
      attuned: "已立誓转向 // 名誉将随施法偏移",
    };
    const sounds = {
      enemydefeated: () => sfx(330, 0.09, "square", 0.035, -160),
      lootpickedup: () => sfx(660, 0.07, "triangle", 0.04, 220),
      itemequipped: () => sfx(440, 0.1, "triangle", 0.04, 120),
      levelup: () => { sfx(523, 0.12, "triangle", 0.05, 0); setTimeout(() => sfx(784, 0.16, "triangle", 0.05), 110); },
      playerdefeated: () => sfx(110, 0.4, "sawtooth", 0.05, -60),
      playerreborn: () => { sfx(392, 0.12, "triangle", 0.05); setTimeout(() => sfx(587, 0.18, "triangle", 0.05), 120); },
      bossspawned: () => sfx(98, 0.5, "sawtooth", 0.06, 24),
      bossslain: () => { sfx(659, 0.14, "triangle", 0.05); setTimeout(() => sfx(880, 0.22, "triangle", 0.05), 130); },
      potionused: () => sfx(520, 0.09, "sine", 0.05, 140),
    };
    if (eventName === "enemyattack") {
      const styles = {
        claw: ["#ff755f", "claw"], bite: ["#ffb15f", "bite"], ember: ["#ff6b35", "ember"],
        spike: ["#8fd66f", "spike"], charge: ["#e6d18b", "charge"], frost: ["#86d9ff", "frost"],
        slam: ["#8fc0c8", "slam"], lightning: ["#b8d7ff", "lightning"], void: ["#b875ff", "void"],
      };
      const [color, attackStyle] = styles[event.attackStyle] || [event.boss ? "#ff334f" : "#ff755f", "claw"];
      state.effects.push({
        type: "enemy-attack", born: performance.now(), duration: event.phase === "windup" ? finite(event.duration, .5) * 1000 : event.boss ? 620 : 460,
        x: finite(event.fromX), y: finite(event.fromY),
        toX: finite(event.toX), toY: finite(event.toY), color, attackStyle, boss: event.boss, phase: event.phase,
      });
      sfx(event.boss ? 82 : 118, 0.12, "sawtooth", 0.035, 45);
      return;
    }
    sounds[eventName]?.();
    if (eventName === "skillused" || eventName === "itemdiscarded") return;
    if (eventName === "lootdropped") {
      // Ground sparkle is enough; only announce rare finds.
      const info = rarityInfo(event.rarity);
      if (event.rarity === "rare" || event.rarity === "epic") {
        pushEvent(`${info.label}装备掉落 // ${itemLabel(event)}`);
      }
      return;
    }
    if (eventName === "chatmessage") {
      pushChat(event);
      return;
    }
    if (eventName === "dungeonstarted") {
      pushEvent(`副本开始 // ${event.name || "深红中继密库"} · ${finite(event.enemies, 0)} 个目标`, true);
      return;
    }
    if (eventName === "dungeoncompleted") {
      const reward = event.reward || {};
      pushEvent(`副本完成 // +${finite(reward.xp, 0)}经验 +${finite(reward.gold, 0)}金 +${finite(reward.dew, 0)}露`);
      return;
    }
    if (eventName === "dungeonfailed") {
      pushEvent("副本已超时，队伍返回中继站", true);
      return;
    }
    if (eventName === "dungeonleft") {
      pushEvent("已离开副本");
      return;
    }
    if (eventName === "lootpickedup") {
      // Auto-wear now happens server-side, governed by the 自动装备 toggle.
      pushEvent(event.autoEquipped ? `拾取并装备 ${itemLabel(event)}` : `拾取 ${itemLabel(event)}`);
      return;
    }
    if (eventName === "autoequipchanged") {
      if (String(event.playerId) === String(state.id)) {
        pushEvent(event.enabled ? "自动装备已开启" : "自动装备已关闭");
      }
      return;
    }
    if (eventName === "autoequipped") {
      pushEvent(`自动换装完成 // 更新了 ${finite(event.changed, 0)} 件`);
      return;
    }
    if (eventName === "bossspawned" || eventName === "bossslain") {
      const bossName = MOB_NAMES[String(event.type || "").toLowerCase()] || event.name || "首领";
      pushEvent(
        eventName === "bossspawned"
          ? `警报 // ${bossName}${event.level ? ` Lv${event.level}` : ""} 已现身`
          : `${bossName} 已被击破，遗落了大量装备`,
        eventName === "bossspawned",
      );
      return;
    }
    if (eventName === "alignmentshifted") {
      if (String(event.playerId) === String(state.id)) {
        const radiant = event.branch === "radiant";
        pushEvent(radiant ? "天平倒向光辉 // 技能已切换至光辉线" : "天平倒向深渊 // 技能已切换至深渊线", !radiant);
        sfx(radiant ? 660 : 180, 0.25, "triangle", 0.05, radiant ? 220 : -80);
      }
      return;
    }
    if (eventName === "teleported") {
      if (String(event.playerId) === String(state.id)) {
        pushEvent(`传送完成 // ${ZONE_LABELS[event.zone] || "目的地"}`);
        sfx(880, 0.14, "sine", 0.05, -520);
      }
      return;
    }
    if (eventName === "questcompleted") {
      pushEvent(`任务完成 // ${event.title || ""} +${finite(event.rewardXp, 0)}经验 +${finite(event.rewardGold, 0)}金${event.rewardDew ? ` +${event.rewardDew}露` : ""}`);
      sfx(587, 0.15, "triangle", 0.05, 180);
      return;
    }
    if (eventName === "purchased") {
      pushEvent(`购入 ${ITEM_NAMES[event.name] || event.name}`);
      sfx(740, 0.08, "triangle", 0.05, 120);
      return;
    }
    if (eventName === "itemsold") {
      pushEvent(`售出 ${ITEM_NAMES[event.name] || event.name} +${finite(event.gold, 0)}金`);
      return;
    }
    if (eventName === "playerrevived") {
      if (String(event.playerId) === String(state.id)) {
        pushEvent("复苏露生效 // 原地复活");
        sfx(523, 0.2, "triangle", 0.06, 240);
      }
      return;
    }
    if (eventName === "partyinvited") {
      if (String(event.playerId) === String(state.id)) {
        const existing = [...ui.eventFeed.querySelectorAll("[data-party-invite-from]")]
          .find((entry) => entry.dataset.partyInviteFrom === String(event.from));
        if (existing) return;
        const item = document.createElement("div");
        item.className = "event-message";
        item.dataset.partyInviteFrom = String(event.from);
        item.textContent = `${event.fromName} 邀请你组队 `;
        const accept = document.createElement("button");
        accept.type = "button";
        accept.className = "mini-command";
        accept.textContent = "接受";
        accept.addEventListener("click", () => {
          send({ type: "partyAccept", from: event.from });
          item.remove();
        });
        item.append(accept);
        ui.eventFeed.prepend(item);
        window.setTimeout(() => item.remove(), 30000);
        sfx(660, 0.12, "triangle", 0.05);
      }
      return;
    }
    if (eventName === "duelinvited") {
      if (String(event.playerId) !== String(state.id)) return;
      const existing = [...ui.eventFeed.querySelectorAll("[data-duel-invite-from]")]
        .find((entry) => entry.dataset.duelInviteFrom === String(event.from));
      if (existing) return;
      const item = document.createElement("div");
      item.className = "event-message";
      item.dataset.duelInviteFrom = String(event.from);
      item.textContent = `${event.fromName} 邀你决斗 `;
      // A challenge is answered either way: silence would leave the other side
      // waiting out the full window.
      const accept = document.createElement("button");
      accept.type = "button";
      accept.className = "mini-command";
      accept.textContent = "应战";
      accept.addEventListener("click", () => {
        send({ type: "duelAccept", from: event.from });
        item.remove();
      });
      const decline = document.createElement("button");
      decline.type = "button";
      decline.className = "mini-command";
      decline.textContent = "回绝";
      decline.addEventListener("click", () => {
        send({ type: "duelDecline", from: event.from });
        item.remove();
      });
      item.append(accept, decline);
      ui.eventFeed.prepend(item);
      window.setTimeout(() => item.remove(), 30000);
      sfx(440, 0.14, "sawtooth", 0.05);
      return;
    }
    if (eventName === "honorchanged") {
      if (String(event.playerId) !== String(state.id)) return;
      const delta = finite(event.delta, 0);
      if (delta > 0) pushEvent(`荣誉 +${delta} // 共 ${finite(event.honor, 0)}`);
      return;
    }
    if (eventName === "dueldeclined") {
      pushEvent(`${event.fromName} 回绝了决斗`);
      return;
    }
    if (eventName === "duelstarted") {
      const names = Array.isArray(event.names) ? event.names.join(" vs ") : "决斗";
      pushEvent(`决斗开始 // ${names}`);
      state.socialSignature = "";
      sfx(880, 0.2, "square", 0.06, 320);
      return;
    }
    if (eventName === "duelended") {
      const me = String(state.id);
      const line = event.winner === null
        ? "决斗平局 // 时限已到"
        : event.winner === me
          ? `决斗胜利 // ${DUEL_REASONS[event.reason] || ""}`
          : `决斗失败 // ${DUEL_REASONS[event.reason] || ""}`;
      pushEvent(line);
      state.socialSignature = "";
      return;
    }
    if (eventName === "partyjoined" || eventName === "partyleft") {
      pushEvent(eventName === "partyjoined" ? `${event.name} 加入了队伍` : `${event.name} 离开了队伍`);
      state.socialSignature = "";
      return;
    }
    if (eventName === "friendadded" || eventName === "friendremoved") {
      state.socialSignature = "";
      pushEvent(eventName === "friendadded" ? `已添加好友 ${event.friend}` : `已移除好友 ${event.friend}`);
      return;
    }
    if (eventName === "itemequipped") {
      pushEvent(`已装备 ${itemLabel(event)}`);
      return;
    }
    if (eventName === "itemrefined") {
      if (String(event.playerId) !== String(state.id)) return;
      const name = ITEM_NAMES[event.name] || String(event.name || "装备");
      if (event.success) {
        pushEvent(`精炼成功 ${name} +${event.previousStage} → +${event.stage}`);
      } else if (event.warded) {
        pushEvent(`精炼失败 ${name}：护炉印挡下，保持 +${event.stage}`);
      } else if (event.stage < event.previousStage) {
        pushEvent(`精炼失败 ${name} +${event.previousStage} → +${event.stage}`);
      } else {
        pushEvent(`精炼失败 ${name}：仍为 +${event.stage}`);
      }
      return;
    }
    if (eventName === "itemunequipped") {
      pushEvent(`已卸下 ${ITEM_NAMES[event.name] || event.name}`);
      return;
    }
    const text = String(first(event.message, messages[eventName], "中继信号已更新"));
    pushEvent(text, eventName === "playerdefeated" || eventName.includes("death") || eventName.includes("error"));

    const x = finite(first(event.x, event.position?.x), NaN);
    const y = finite(first(event.y, event.position?.y), NaN);
    if (Number.isFinite(x) && Number.isFinite(y)) {
      state.effects.push({
        x,
        y,
        born: performance.now(),
        duration: finite(event.duration, 650),
        color: eventName.includes("heal") ? "#67d69b" : "#ee5968",
        text: event.amount ? String(Math.abs(Math.round(event.amount))) : "",
      });
    }
  }

  function handleError(error) {
    const translated = {
      INVALID_NAME: "呼号不符合中继规范",
      INVALID_ARCHETYPE: "所选职业不可用",
      ALREADY_JOINED: "操作员已接入中继",
      NOT_JOINED: "操作员尚未接入",
      NAME_IN_USE: "该呼号已在线，请换一个呼号",
      INVALID_TOKEN: "该呼号已在其他设备注册，本机凭证不符",
      NAME_TAKEN: "该呼号已绑定另一职业的角色，请换呼号或选择原职业",
      RATE_LIMITED: "指令过于频繁，请稍候",
      CHAT_TOO_FAST: "发言太快，稍等片刻",
      INVALID_CHANNEL: "无效的聊天频道",
      NO_PARTY: "尚未加入队伍，无法使用组队频道",
      PROTOCOL_MISMATCH: "客户端版本过旧，请强制刷新页面（Ctrl+Shift+R）",
      NO_STAT_POINTS: "没有可用属性点",
      NO_SKILL_POINTS: "没有可用技能点",
      RESPAWN_NOT_READY: "信号尚未恢复",
      RESPAWN_PENDING: "信号尚未恢复",
      REBIRTH_LEVEL_TOO_LOW: "等级不足，无法转生",
      DUEL_ACTIVE: "对方（或你）正在决斗中",
      DUEL_CAPACITY: "竞技场已满，稍后再来",
      DUEL_NOT_READY: "双方都必须存活且不在副本中",
      NO_DUEL: "你不在决斗中",
      NO_DUEL_INVITE: "没有来自该玩家的决斗邀请（或已超时）",
      REFINE_MAX_STAGE: "该装备已达最高精炼阶数",
      REFINE_TIER_TOO_LOW: "只有稀有及以上的装备可以精炼",
      NOT_ENOUGH_WILL: "意志不足",
      NOT_ENOUGH_HONOR: "荣誉不足（击杀精英与 Boss 可积累）",
      NO_PROTECTION: "没有护炉印（可向黑市商人·影三购买）",
      PLAYER_DEAD: "阵亡状态下无法执行该操作",
      INVALID_ITEM: "背包中没有该装备",
      INVALID_SLOT: "无效的装备部位",
      INVENTORY_FULL: "背包已满",
      ITEM_LEVEL_TOO_HIGH: "等级不足，无法穿戴该装备",
      SKILL_LOCKED: "角色等级不足，该技能尚未解锁",
      INVALID_RECOVERY: "恢复码无效或已过期",
      DUNGEON_ACTIVE: "当前已经在副本中",
      DUNGEON_CAPACITY: "当前副本实例已满，请稍后重试",
      DUNGEON_LEADER_ONLY: "需要由队伍首位成员开启副本",
      DUNGEON_PARTY_NOT_READY: "队伍成员尚未全部准备好",
    };
    const message = String(first(translated[error.code], error.message, error.error, "中继请求失败"));
    pushEvent(message, true);
    if (!state.joined) {
      ui.joinError.textContent = message;
      ui.joinError.hidden = false;
      ui.joinButton.disabled = false;
      if (ui.recoverButton) ui.recoverButton.disabled = false;
    }
    if (error.requestType === "join" || error.requestType === "recover") {
      state.pendingRecovery = null;
      showCharacterScreen();
    }
    if (error.requestType === "sessionRotate" || error.requestType === "sessionrotate") {
      if (ui.sessionRotateButton) ui.sessionRotateButton.disabled = false;
    }
  }

  // Back to the character screen: clear world state and show the roster.
  function showCharacterScreen() {
    state.joined = false;
    state.entryRequested = false;
    state.pendingJoin = false;
    state.pendingRecovery = null;
    for (const store of [state.players, state.enemies, state.projectiles, state.drops]) store.clear();
    state.effects.length = 0;
    clearSocialPanel();
    ui.titleArt.classList.remove("is-hidden");
    ui.titleArt.hidden = false;
    ui.joinPanel.hidden = false;
    ui.hud.hidden = true;
    ui.joinButton.disabled = false;
    if (ui.recoverButton) ui.recoverButton.disabled = false;
    if (ui.leaveButton) ui.leaveButton.hidden = true;
    if (ui.resetHudButton) ui.resetHudButton.hidden = true;
    ui.population.hidden = true;
  }

  const CHANNEL_LABELS = { global: "全服", map: "本图", party: "组队" };

  function pushChat(event) {
    if (!ui.chatFeed) return;
    const channel = String(event.channel || "global");
    const row = document.createElement("div");
    row.className = `chat-${channel}`;
    row.textContent = `[${CHANNEL_LABELS[channel] || channel}] ${event.name}: ${event.text}`;
    ui.chatFeed.append(row);
    while (ui.chatFeed.children.length > 8) ui.chatFeed.firstElementChild.remove();
  }

  function pushEvent(text, alert = false) {
    const item = document.createElement("div");
    item.className = `event-message${alert ? " is-alert" : ""}`;
    item.textContent = text;
    ui.eventFeed.prepend(item);
    while (ui.eventFeed.children.length > 4) ui.eventFeed.lastElementChild.remove();
    window.setTimeout(() => item.remove(), 4600);
  }

  function resizeCanvas() {
    state.viewWidth = Math.max(320, innerWidth);
    state.viewHeight = Math.max(480, innerHeight);
    state.dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(state.viewWidth * state.dpr);
    canvas.height = Math.round(state.viewHeight * state.dpr);
    canvas.style.width = `${state.viewWidth}px`;
    canvas.style.height = `${state.viewHeight}px`;
    // Theme layers are keyed by viewport size; stale sizes are dead weight.
    state.themeCanvases.clear();
  }

  const TILE_W = 96;
  const TILE_H = 48;
  const WORLD_CELL = 48;

  function worldToScreen(x, y, z = 0) {
    return {
      x: state.viewWidth * 0.5 + (((x - state.camera.x) - (y - state.camera.y)) / WORLD_CELL) * TILE_W * 0.5,
      y: state.viewHeight * 0.43 + (((x - state.camera.x) + (y - state.camera.y)) / WORLD_CELL) * TILE_H * 0.5 - z,
    };
  }

  function screenToWorld(x, y) {
    const dx = (x - state.viewWidth * 0.5) / (TILE_W * 0.5);
    const dy = (y - state.viewHeight * 0.43) / (TILE_H * 0.5);
    return {
      x: state.camera.x + (dx + dy) * 0.5 * WORLD_CELL,
      y: state.camera.y + (dy - dx) * 0.5 * WORLD_CELL,
    };
  }

  function tileHash(x, y) {
    let value = (x * 374761393 + y * 668265263) ^ (x * y * 69069);
    value = (value ^ (value >> 13)) * 1274126177;
    return ((value ^ (value >> 16)) >>> 0) / 4294967295;
  }

  function drawWorld(time) {
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    drawThemeCanvas(time);

    drawAtmosphere(time);
    drawTiles(time);
    drawLandmarks(time);
    drawPlayerLight();
    drawObjects(time);
    drawAmbient(time);
    drawGrading();
    drawMinimap();
    drawCursor(time);
  }

  function drawThemeCanvas(time) {
    const local = localPlayer();
    const theme = state.map.theme || (local ? biomeAt(local.x, local.y) : state.activeTheme);
    if (theme !== state.activeTheme) {
      state.activeTheme = theme;
      state.themeChangedAt = time;
    }
    const key = `${theme}:${state.viewWidth}x${state.viewHeight}`;
    let layer = state.themeCanvases.get(key);
    if (!layer) {
      layer = document.createElement("canvas");
      layer.width = Math.max(1, Math.floor(state.viewWidth));
      layer.height = Math.max(1, Math.floor(state.viewHeight));
      const layerCtx = layer.getContext("2d");
      const ramp = BIOME_RAMPS[theme] || BIOME_RAMPS.grass;
      const gradient = layerCtx.createLinearGradient(0, 0, layer.width, layer.height);
      gradient.addColorStop(0, ramp[0]);
      gradient.addColorStop(1, ramp[1]);
      layerCtx.fillStyle = gradient;
      layerCtx.fillRect(0, 0, layer.width, layer.height);
      const asset = ZONE_TEXTURE[theme];
      const image = asset ? zoneTextureImages.get(asset) : null;
      if (image?.complete && image.naturalWidth) {
        layerCtx.globalAlpha = 0.28;
        layerCtx.drawImage(image, 0, 0, layer.width, layer.height);
      }
      state.themeCanvases.set(key, layer);
    }
    ctx.drawImage(layer, 0, 0, state.viewWidth, state.viewHeight);
    if (time - state.themeChangedAt < 420) {
      ctx.save();
      ctx.globalAlpha = 1 - (time - state.themeChangedAt) / 420;
      ctx.fillStyle = "#f3e4cf";
      ctx.fillRect(0, 0, state.viewWidth, state.viewHeight);
      ctx.restore();
    }
  }

  // Pre-rendered radial glow sprites replace per-draw shadowBlur, which is
  // one of the most expensive canvas operations when repeated per frame.
  const glowSprites = new Map();
  const GLOW_SPRITE_RADIUS = 16;

  function colorWithAlpha(color, alpha) {
    const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(color));
    if (!hex) return `rgba(255, 255, 255, ${alpha})`;
    let digits = hex[1];
    if (digits.length === 3) digits = digits.replace(/./g, (c) => c + c);
    const value = parseInt(digits, 16);
    return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
  }

  function glowSprite(color) {
    let sprite = glowSprites.get(color);
    if (!sprite) {
      sprite = document.createElement("canvas");
      sprite.width = GLOW_SPRITE_RADIUS * 2;
      sprite.height = GLOW_SPRITE_RADIUS * 2;
      const g = sprite.getContext("2d");
      const gradient = g.createRadialGradient(
        GLOW_SPRITE_RADIUS, GLOW_SPRITE_RADIUS, 0,
        GLOW_SPRITE_RADIUS, GLOW_SPRITE_RADIUS, GLOW_SPRITE_RADIUS,
      );
      gradient.addColorStop(0, colorWithAlpha(color, 0.95));
      gradient.addColorStop(0.35, colorWithAlpha(color, 0.5));
      gradient.addColorStop(1, colorWithAlpha(color, 0));
      g.fillStyle = gradient;
      g.fillRect(0, 0, sprite.width, sprite.height);
      glowSprites.set(color, sprite);
    }
    return sprite;
  }

  // Warm pool of light around the player so the hero anchors the frame.
  function drawPlayerLight() {
    const local = localPlayer();
    if (!local) return;
    const point = worldToScreen(local.x, local.y);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const light = ctx.createRadialGradient(point.x, point.y - 10, 20, point.x, point.y - 10, 340);
    light.addColorStop(0, "rgba(255, 214, 170, 0.16)");
    light.addColorStop(0.6, "rgba(255, 190, 150, 0.06)");
    light.addColorStop(1, "rgba(255, 190, 150, 0)");
    ctx.fillStyle = light;
    ctx.fillRect(point.x - 340, point.y - 350, 680, 680);
    ctx.restore();
  }

  const AMBIENT_COLORS = {
    town: "#f0c15e",
    grass: "#a8d88a",
    mountain: "#cfd8e2",
    scrapyard: "#e8a35c",
    spaceport: "#7ad2ff",
    wastes: "#e0596d",
    lake: "#8fd8ff",
    residential: "#f0c15e",
    downtown: "#e878c8",
    desert: "#e8c887",
    snow: "#ffffff",
    castle: "#b8a8d8",
    skycity: "#9fc8ff",
  };

  // Drifting motes (spores, embers, dust) tinted by the biome they float in.
  function updateAmbient(delta) {
    const now = performance.now();
    state.ambient = state.ambient.filter((mote) => now - mote.born < mote.life);
    while (state.ambient.length < 34) {
      state.ambient.push({
        x: state.camera.x + (Math.random() - 0.5) * 1500,
        y: state.camera.y + (Math.random() - 0.5) * 1000,
        z: Math.random() * 30,
        vx: (Math.random() - 0.5) * 10,
        vy: (Math.random() - 0.5) * 10,
        vz: 5 + Math.random() * 9,
        size: 1 + Math.random() * 1.6,
        born: now,
        life: 4000 + Math.random() * 4000,
      });
    }
    for (const mote of state.ambient) {
      mote.x += mote.vx * delta / 1000;
      mote.y += mote.vy * delta / 1000;
      mote.z += mote.vz * delta / 1000;
    }
  }

  function drawAmbient(time) {
    const now = performance.now();
    ctx.save();
    for (const mote of state.ambient) {
      const point = worldToScreen(mote.x, mote.y, mote.z);
      if (point.x < -20 || point.x > state.viewWidth + 20 || point.y < -20 || point.y > state.viewHeight + 20) continue;
      const age = (now - mote.born) / mote.life;
      const fade = age < 0.2 ? age / 0.2 : age > 0.75 ? (1 - age) / 0.25 : 1;
      const color = AMBIENT_COLORS[biomeAt(mote.x, mote.y)] || "#d9a2a8";
      ctx.globalAlpha = 0.4 * fade;
      const drawSize = mote.size * 5;
      ctx.drawImage(glowSprite(color), point.x - drawSize * 0.5, point.y - drawSize * 0.5, drawSize, drawSize);
    }
    ctx.restore();
  }

  const GRADING_TINTS = {
    town: "rgba(240, 193, 94, 0.035)",
    grass: "rgba(120, 190, 110, 0.05)",
    mountain: "rgba(150, 175, 210, 0.05)",
    scrapyard: "rgba(230, 140, 70, 0.045)",
    spaceport: "rgba(100, 160, 240, 0.05)",
    wastes: "rgba(220, 70, 90, 0.06)",
    lake: "rgba(90, 170, 230, 0.06)",
    residential: "rgba(240, 193, 94, 0.04)",
    downtown: "rgba(220, 110, 200, 0.05)",
    desert: "rgba(240, 200, 120, 0.06)",
    snow: "rgba(200, 225, 255, 0.07)",
    castle: "rgba(170, 150, 210, 0.05)",
    skycity: "rgba(140, 190, 255, 0.06)",
  };

  // Per-biome colour cast plus a soft vignette for depth.
  function drawGrading() {
    const tint = GRADING_TINTS[state.map.theme || state.activeTheme];
    if (tint) {
      ctx.fillStyle = tint;
      ctx.fillRect(0, 0, state.viewWidth, state.viewHeight);
    }
    const vignette = ctx.createRadialGradient(
      state.viewWidth * 0.5,
      state.viewHeight * 0.46,
      Math.min(state.viewWidth, state.viewHeight) * 0.42,
      state.viewWidth * 0.5,
      state.viewHeight * 0.52,
      Math.max(state.viewWidth, state.viewHeight) * 0.72,
    );
    vignette.addColorStop(0, "rgba(6, 4, 7, 0)");
    vignette.addColorStop(1, "rgba(6, 4, 7, 0.28)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, state.viewWidth, state.viewHeight);
  }

  function drawLandmarks(time) {
    const theme = state.map.theme || state.activeTheme;
    if (theme === "town") drawTownStructures(time);
    if (theme === "spaceport") drawColonyShip(time);
    if (theme === "castle") drawFallenKeep(time);
    if (theme === "skycity") drawSkySpire(time);
  }

  // A ruined keep watches over the western castle grounds (original design).
  function drawFallenKeep(time) {
    const district = (state.map.zones || []).find((zone) => zone.theme === "castle");
    if (!district) return;
    const point = worldToScreen(district.x, district.y - 40);
    if (point.x < -260 || point.x > state.viewWidth + 260 || point.y < -240 || point.y > state.viewHeight + 160) return;
    ctx.save();
    propShadow(point.x, point.y + 26, 96);
    // Curtain wall.
    ctx.fillStyle = "#4a4550";
    ctx.fillRect(point.x - 90, point.y - 40, 180, 62);
    ctx.strokeStyle = "#5e5866";
    ctx.lineWidth = 1.6;
    ctx.strokeRect(point.x - 90, point.y - 40, 180, 62);
    // Battlements.
    ctx.fillStyle = "#544e5c";
    for (let index = -4; index <= 4; index += 1) {
      ctx.fillRect(point.x + index * 20 - 6, point.y - 48, 12, 9);
    }
    // Two towers; the left one is snapped off at the top.
    ctx.fillStyle = "#524c5a";
    ctx.fillRect(point.x - 112, point.y - 88, 34, 110);
    ctx.beginPath();
    ctx.moveTo(point.x - 112, point.y - 88);
    ctx.lineTo(point.x - 100, point.y - 100);
    ctx.lineTo(point.x - 92, point.y - 84);
    ctx.lineTo(point.x - 78, point.y - 88);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(point.x + 78, point.y - 66, 34, 88);
    ctx.fillStyle = "#3c3844";
    ctx.beginPath();
    ctx.moveTo(point.x + 78, point.y - 66);
    ctx.lineTo(point.x + 95, point.y - 84);
    ctx.lineTo(point.x + 112, point.y - 66);
    ctx.closePath();
    ctx.fill();
    // Gate and windows.
    ctx.fillStyle = "#241f28";
    ctx.beginPath();
    ctx.arc(point.x, point.y + 22, 18, Math.PI, 0);
    ctx.rect(point.x - 18, point.y + 22, 36, 0.1);
    ctx.fill();
    ctx.fillStyle = `rgba(224, 89, 109, ${0.5 + Math.sin(time * 0.003) * 0.2})`;
    ctx.fillRect(point.x - 101, point.y - 74, 8, 12);
    ctx.fillRect(point.x + 89, point.y - 52, 8, 12);
    ctx.restore();
  }

  // The floating spire at the heart of the sky terrace (original design).
  function drawSkySpire(time) {
    const district = (state.map.zones || []).find((zone) => zone.theme === "skycity");
    if (!district) return;
    const hover = Math.sin(time * 0.0016) * 5;
    const point = worldToScreen(district.x, district.y - 20);
    if (point.x < -220 || point.x > state.viewWidth + 220 || point.y < -280 || point.y > state.viewHeight + 160) return;
    ctx.save();
    ctx.translate(0, hover);
    // Floating base rock with nothing beneath it.
    ctx.fillStyle = "#3a4a6e";
    ctx.beginPath();
    ctx.moveTo(point.x - 70, point.y);
    ctx.lineTo(point.x + 70, point.y);
    ctx.lineTo(point.x + 30, point.y + 38);
    ctx.lineTo(point.x - 24, point.y + 42);
    ctx.closePath();
    ctx.fill();
    // Spire.
    const spire = ctx.createLinearGradient(point.x, point.y - 170, point.x, point.y);
    spire.addColorStop(0, "#8fb2e8");
    spire.addColorStop(1, "#4a5c88");
    ctx.fillStyle = spire;
    ctx.beginPath();
    ctx.moveTo(point.x - 26, point.y);
    ctx.lineTo(point.x, point.y - 168);
    ctx.lineTo(point.x + 26, point.y);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#a9c6f0";
    ctx.lineWidth = 1.4;
    ctx.stroke();
    // Halo rings.
    for (const [ry, alpha] of [[-120, 0.5], [-78, 0.35]]) {
      ctx.strokeStyle = `rgba(159, 200, 255, ${alpha + Math.sin(time * 0.003 + ry) * 0.15})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(point.x, point.y + ry, 40 - Math.abs(ry) * 0.12, 9, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Beacon.
    ctx.fillStyle = "#cfe2ff";
    ctx.shadowColor = "#9fc8ff";
    ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.arc(point.x, point.y - 172, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // The relay town: a beacon tower, lamp posts, and huts on the plaza.
  function drawTownStructures(time) {
    const zone = state.map.safeZone;
    if (!zone) return;
    const onScreen = (point, pad) =>
      point.x > -pad && point.x < state.viewWidth + pad && point.y > -pad && point.y < state.viewHeight + pad;

    // Lamp posts ring the plaza.
    for (let index = 0; index < 6; index += 1) {
      const angle = (index / 6) * Math.PI * 2 + Math.PI / 12;
      const point = worldToScreen(zone.x + Math.cos(angle) * 120, zone.y + Math.sin(angle) * 120);
      if (!onScreen(point, 90)) continue;
      const glow = 0.75 + Math.sin(time * 0.004 + index) * 0.2;
      ctx.save();
      const pool = ctx.createRadialGradient(point.x, point.y, 4, point.x, point.y, 46);
      pool.addColorStop(0, `rgba(255, 205, 130, ${0.1 * glow})`);
      pool.addColorStop(1, "rgba(255, 205, 130, 0)");
      ctx.fillStyle = pool;
      ctx.fillRect(point.x - 46, point.y - 24, 92, 48);
      propShadow(point.x, point.y, 6);
      ctx.fillStyle = "#2c2621";
      ctx.fillRect(point.x - 1.5, point.y - 34, 3, 34);
      ctx.fillRect(point.x - 6, point.y - 34, 12, 2.5);
      ctx.fillStyle = "#ffcd82";
      ctx.shadowColor = "#ffcd82";
      ctx.shadowBlur = 10 * glow;
      ctx.beginPath();
      ctx.arc(point.x, point.y - 38, 3.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Three original huts between the lamps and the gates.
    for (const [angle, tint] of [[2.1, "#54423a"], [3.6, "#4c3e36"], [5.2, "#584438"]]) {
      const point = worldToScreen(zone.x + Math.cos(angle) * 158, zone.y + Math.sin(angle) * 158);
      if (!onScreen(point, 120)) continue;
      ctx.save();
      propShadow(point.x, point.y + 6, 26);
      ctx.fillStyle = tint;
      ctx.fillRect(point.x - 20, point.y - 22, 40, 28);
      ctx.fillStyle = "#6b4a36";
      ctx.beginPath();
      ctx.moveTo(point.x - 25, point.y - 20);
      ctx.lineTo(point.x, point.y - 40);
      ctx.lineTo(point.x + 25, point.y - 20);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#7e5a42";
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.fillStyle = "#241d18";
      ctx.fillRect(point.x - 5, point.y - 10, 10, 16);
      ctx.fillStyle = `rgba(255, 205, 130, ${0.6 + Math.sin(time * 0.003 + angle) * 0.25})`;
      ctx.fillRect(point.x + 9, point.y - 16, 7, 6);
      ctx.restore();
    }

    // Shopkeepers stand at their stalls (simple original figures).
    for (const shop of state.map.shops || []) {
      const point = worldToScreen(shop.x, shop.y);
      if (!onScreen(point, 80)) continue;
      ctx.save();
      propShadow(point.x, point.y + 2, 12);
      // Stall awning behind the keeper.
      ctx.fillStyle = "#3c332c";
      ctx.fillRect(point.x - 16, point.y - 30, 32, 4);
      ctx.fillRect(point.x - 15, point.y - 30, 3, 26);
      ctx.fillRect(point.x + 12, point.y - 30, 3, 26);
      ctx.fillStyle = shop.id === "blackmarket" ? "#4a3a58" : shop.id === "smith" ? "#5a4030" : "#4a5236";
      ctx.beginPath();
      ctx.moveTo(point.x - 20, point.y - 28);
      ctx.lineTo(point.x, point.y - 40);
      ctx.lineTo(point.x + 20, point.y - 28);
      ctx.closePath();
      ctx.fill();
      // The keeper.
      ctx.fillStyle = "#e0b890";
      ctx.fillRect(point.x - 4, point.y - 22, 8, 7);
      ctx.fillStyle = shop.id === "blackmarket" ? "#5a4a70" : shop.id === "smith" ? "#6e4a30" : "#5a6a3e";
      ctx.fillRect(point.x - 6, point.y - 15, 12, 13);
      ctx.fillStyle = "#2c2621";
      ctx.fillRect(point.x - 5, point.y - 2, 4, 4);
      ctx.fillRect(point.x + 1, point.y - 2, 4, 4);
      // Nameplate.
      ctx.font = "600 10px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
      ctx.fillRect(point.x - 38, point.y - 58, 76, 14);
      ctx.fillStyle = "#ffd479";
      ctx.fillText(shop.name, point.x, point.y - 48);
      ctx.restore();
    }

    // The relay beacon tower at the exact centre of town.
    const center = worldToScreen(zone.x, zone.y);
    if (onScreen(center, 160)) {
      const pulse = 0.7 + Math.sin(time * 0.0035) * 0.3;
      ctx.save();
      propShadow(center.x, center.y + 4, 30);
      ctx.fillStyle = "#3a3236";
      ctx.beginPath();
      ctx.moveTo(center.x - 22, center.y + 2);
      ctx.lineTo(center.x - 7, center.y - 78);
      ctx.lineTo(center.x + 7, center.y - 78);
      ctx.lineTo(center.x + 22, center.y + 2);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#584a50";
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(center.x - 15, center.y - 26);
      ctx.lineTo(center.x + 15, center.y - 26);
      ctx.moveTo(center.x - 11, center.y - 52);
      ctx.lineTo(center.x + 11, center.y - 52);
      ctx.stroke();
      ctx.fillStyle = "#2c2529";
      ctx.fillRect(center.x - 10, center.y - 84, 20, 7);
      // Crimson beacon and its upward beam.
      const beam = ctx.createLinearGradient(center.x, center.y - 150, center.x, center.y - 84);
      beam.addColorStop(0, "rgba(224, 89, 109, 0)");
      beam.addColorStop(1, `rgba(224, 89, 109, ${0.24 * pulse})`);
      ctx.fillStyle = beam;
      ctx.fillRect(center.x - 7, center.y - 150, 14, 66);
      ctx.fillStyle = "#ff5f70";
      ctx.shadowColor = "#ff5f70";
      ctx.shadowBlur = 16 * pulse;
      ctx.beginPath();
      ctx.arc(center.x, center.y - 90, 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // A single derelict colony ship rests in the southern spaceport fields.
  function drawColonyShip(time) {
    const shipX = state.map.width * 0.5;
    const shipY = state.map.height * 0.88;
    const point = worldToScreen(shipX, shipY);
    if (point.x < -320 || point.x > state.viewWidth + 320 || point.y < -220 || point.y > state.viewHeight + 220) return;

    ctx.save();
    ctx.translate(point.x, point.y);
    ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
    ctx.beginPath();
    ctx.ellipse(0, 12, 150, 26, 0, 0, Math.PI * 2);
    ctx.fill();

    // Hull, listing to one side where it dug into the ground.
    ctx.rotate(-0.06);
    const hull = ctx.createLinearGradient(0, -70, 0, 16);
    hull.addColorStop(0, "#4a5470");
    hull.addColorStop(1, "#272c3c");
    ctx.fillStyle = hull;
    ctx.beginPath();
    ctx.ellipse(0, -22, 140, 40, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#5d6a8e";
    ctx.lineWidth = 2;
    ctx.stroke();
    // Broken bow section.
    ctx.fillStyle = "#232838";
    ctx.beginPath();
    ctx.moveTo(96, -46);
    ctx.lineTo(150, -30);
    ctx.lineTo(118, -6);
    ctx.closePath();
    ctx.fill();
    // Dorsal fin.
    ctx.fillStyle = "#39415a";
    ctx.beginPath();
    ctx.moveTo(-44, -52);
    ctx.lineTo(-20, -104);
    ctx.lineTo(-2, -54);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#59668c";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // Window row, a few still flickering.
    for (let i = 0; i < 7; i += 1) {
      const alive = (i * 37) % 3 === 0;
      ctx.fillStyle = alive
        ? `rgba(130, 200, 255, ${0.5 + Math.sin(time * 0.003 + i) * 0.3})`
        : "rgba(20, 24, 34, 0.9)";
      ctx.fillRect(-96 + i * 26, -34, 9, 6);
    }
    // Hull breach with ember glow.
    ctx.fillStyle = "#141019";
    ctx.beginPath();
    ctx.ellipse(-64, -6, 26, 14, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `rgba(224, 122, 79, ${0.35 + Math.sin(time * 0.005) * 0.15})`;
    ctx.beginPath();
    ctx.ellipse(-64, -4, 14, 7, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawMinimap() {
    if (!state.joined) return;
    const width = 156;
    const height = Math.max(60, Math.round(width * state.map.height / state.map.width));
    const originX = state.viewWidth - width - 16;
    const originY = state.viewHeight - height - 16;
    const scaleX = width / state.map.width;
    const scaleY = height / state.map.height;

    ctx.save();
    ctx.fillStyle = "rgba(8, 6, 8, 0.78)";
    ctx.fillRect(originX, originY, width, height);
    ctx.strokeStyle = "rgba(226, 168, 122, 0.35)";
    ctx.lineWidth = 1;
    ctx.strokeRect(originX + 0.5, originY + 0.5, width - 1, height - 1);

    // District outlines so the world reads as regions at a glance.
    for (const district of state.map.zones || []) {
      if (state.map.mapId !== "town" && district.id !== state.map.mapId) continue;
      ctx.strokeStyle = "rgba(160, 190, 230, 0.3)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(
        originX + district.x * scaleX,
        originY + district.y * scaleY,
        district.rx * scaleX,
        district.ry * scaleY,
        0, 0, Math.PI * 2,
      );
      ctx.stroke();
    }
    const zone = state.map.safeZone;
    if (zone) {
      ctx.strokeStyle = "rgba(240, 193, 94, 0.7)";
      ctx.beginPath();
      ctx.ellipse(
        originX + zone.x * scaleX,
        originY + zone.y * scaleY,
        zone.radius * scaleX,
        zone.radius * scaleY,
        0, 0, Math.PI * 2,
      );
      ctx.stroke();
    }

    for (const portal of state.map.portals || []) {
      ctx.fillStyle = "#7ad2ff";
      ctx.fillRect(originX + portal.x * scaleX - 1.5, originY + portal.y * scaleY - 1.5, 3, 3);
    }
    for (const drop of state.drops.values()) {
      ctx.fillStyle = rarityInfo(drop.rarity).color;
      ctx.fillRect(originX + drop.x * scaleX - 1, originY + drop.y * scaleY - 1, 2, 2);
    }
    for (const enemy of state.enemies.values()) {
      const x = originX + enemy.x * scaleX;
      const y = originY + enemy.y * scaleY;
      if (enemy.boss) {
        ctx.fillStyle = "#ff5f70";
        ctx.fillRect(x - 3, y - 3, 6, 6);
      } else {
        ctx.fillStyle = enemy.elite ? "#f0c15e" : "#c4485a";
        ctx.fillRect(x - 1.2, y - 1.2, 2.5, 2.5);
      }
    }
    for (const player of state.players.values()) {
      const isSelf = String(player.id) === String(state.id);
      ctx.fillStyle = isSelf ? "#ffffff" : "#54cbbd";
      const size = isSelf ? 4 : 3;
      ctx.fillRect(
        originX + player.x * scaleX - size / 2,
        originY + player.y * scaleY - size / 2,
        size,
        size,
      );
    }
    ctx.restore();
  }

  function drawAtmosphere(time) {
    const glow = ctx.createRadialGradient(
      state.viewWidth * 0.56,
      state.viewHeight * 0.43,
      20,
      state.viewWidth * 0.56,
      state.viewHeight * 0.43,
      Math.max(state.viewWidth, state.viewHeight) * 0.7,
    );
    glow.addColorStop(0, "#32282c");
    glow.addColorStop(0.52, "#1c1519");
    glow.addColorStop(1, "#0a0709");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, state.viewWidth, state.viewHeight);

    // The crimson moon that gives the relay its name.
    const moonX = state.viewWidth * 0.82;
    const moonY = state.viewHeight * 0.16;
    const moonRadius = Math.min(state.viewWidth, state.viewHeight) * 0.09;
    ctx.save();
    const halo = ctx.createRadialGradient(moonX, moonY, moonRadius * 0.4, moonX, moonY, moonRadius * 3.2);
    halo.addColorStop(0, "rgba(216, 64, 78, 0.34)");
    halo.addColorStop(1, "rgba(216, 64, 78, 0)");
    ctx.fillStyle = halo;
    ctx.fillRect(moonX - moonRadius * 3.2, moonY - moonRadius * 3.2, moonRadius * 6.4, moonRadius * 6.4);
    const disc = ctx.createRadialGradient(
      moonX - moonRadius * 0.3,
      moonY - moonRadius * 0.3,
      moonRadius * 0.2,
      moonX,
      moonY,
      moonRadius,
    );
    disc.addColorStop(0, "#e8646f");
    disc.addColorStop(0.65, "#b03040");
    disc.addColorStop(1, "#701c2c");
    ctx.fillStyle = disc;
    ctx.beginPath();
    ctx.arc(moonX, moonY, moonRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.24;
    ctx.fillStyle = "#5c1826";
    ctx.beginPath();
    ctx.ellipse(moonX + moonRadius * 0.32, moonY + moonRadius * 0.12, moonRadius * 0.3, moonRadius * 0.2, 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(moonX - moonRadius * 0.3, moonY + moonRadius * 0.4, moonRadius * 0.22, moonRadius * 0.13, -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // A distant blue planet and its grey moon — this battlefield is not home.
    const planetX = state.viewWidth * 0.12;
    const planetY = state.viewHeight * 0.12;
    const planetRadius = Math.min(state.viewWidth, state.viewHeight) * 0.05;
    ctx.save();
    ctx.globalAlpha = 0.85;
    const planet = ctx.createRadialGradient(
      planetX - planetRadius * 0.3, planetY - planetRadius * 0.3, planetRadius * 0.2,
      planetX, planetY, planetRadius,
    );
    planet.addColorStop(0, "#7fb2d9");
    planet.addColorStop(0.6, "#3c6e9e");
    planet.addColorStop(1, "#1d3a55");
    ctx.fillStyle = planet;
    ctx.beginPath();
    ctx.arc(planetX, planetY, planetRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = "#cfe8d8";
    ctx.beginPath();
    ctx.ellipse(planetX - planetRadius * 0.2, planetY, planetRadius * 0.55, planetRadius * 0.3, 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.9;
    const moonlet = ctx.createRadialGradient(
      planetX + planetRadius * 1.9, planetY - planetRadius * 0.9, 1,
      planetX + planetRadius * 2, planetY - planetRadius * 0.8, planetRadius * 0.32,
    );
    moonlet.addColorStop(0, "#c9c4bd");
    moonlet.addColorStop(1, "#6e6a64");
    ctx.fillStyle = moonlet;
    ctx.beginPath();
    ctx.arc(planetX + planetRadius * 2, planetY - planetRadius * 0.8, planetRadius * 0.32, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = "#d9a2a8";
    const drift = (time * 0.006) % 220;
    for (let i = -1; i < 7; i += 1) {
      ctx.beginPath();
      ctx.ellipse(i * 220 + drift, 120 + (i % 3) * 94, 170, 23, -0.32, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // The base ground (diamond fills + clipped texture) is static in world
  // space, so it renders into an offscreen layer padded by a margin and the
  // frame loop just blits it at the projected camera offset. It only
  // re-renders when the camera drifts past the margin, the theme flips, the
  // viewport resizes, or the terrain texture finishes loading. Animated
  // accents and decorations still draw live on top.
  const GROUND_MARGIN_X = 256;
  const GROUND_MARGIN_Y = 192;
  let groundCache = null;

  // worldToScreen is linear in (world - camera): a camera delta shifts the
  // whole cached layer by its isometric projection.
  function groundCacheOffset() {
    const dcx = (state.camera.x - groundCache.camX) / WORLD_CELL;
    const dcy = (state.camera.y - groundCache.camY) / WORLD_CELL;
    return {
      x: -(dcx - dcy) * TILE_W * 0.5,
      y: -(dcx + dcy) * TILE_H * 0.5,
    };
  }

  function forEachVisibleTile(padX, padY, visit) {
    const radiusX = Math.ceil((state.viewWidth + padX * 2) / TILE_W) + 5;
    const radiusY = Math.ceil((state.viewHeight + padY * 2) / TILE_H) + 7;
    const tileMapWidth = Math.ceil(state.map.width / WORLD_CELL);
    const tileMapHeight = Math.ceil(state.map.height / WORLD_CELL);
    const cameraTileX = state.camera.x / WORLD_CELL;
    const cameraTileY = state.camera.y / WORLD_CELL;
    const minX = Math.max(0, Math.floor(cameraTileX - radiusX));
    const maxX = Math.min(tileMapWidth - 1, Math.ceil(cameraTileX + radiusX));
    const minY = Math.max(0, Math.floor(cameraTileY - radiusY));
    const maxY = Math.min(tileMapHeight - 1, Math.ceil(cameraTileY + radiusY));
    for (let sum = minX + minY; sum <= maxX + maxY; sum += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const y = sum - x;
        if (y < minY || y > maxY) continue;
        const point = worldToScreen((x + 0.5) * WORLD_CELL, (y + 0.5) * WORLD_CELL);
        if (point.x < -TILE_W - padX || point.x > state.viewWidth + TILE_W + padX
          || point.y < -TILE_H - padY || point.y > state.viewHeight + TILE_H + padY) continue;
        visit(x, y, point, tileHash(x, y));
      }
    }
  }

  function rebuildGroundCache(pattern) {
    const cssWidth = state.viewWidth + GROUND_MARGIN_X * 2;
    const cssHeight = state.viewHeight + GROUND_MARGIN_Y * 2;
    if (!groundCache
      || groundCache.viewWidth !== state.viewWidth
      || groundCache.viewHeight !== state.viewHeight
      || groundCache.dpr !== state.dpr) {
      const layer = document.createElement("canvas");
      layer.width = Math.ceil(cssWidth * state.dpr);
      layer.height = Math.ceil(cssHeight * state.dpr);
      groundCache = {
        canvas: layer,
        ctx: layer.getContext("2d"),
        viewWidth: state.viewWidth,
        viewHeight: state.viewHeight,
        cssWidth,
        cssHeight,
        dpr: state.dpr,
      };
    }
    groundCache.camX = state.camera.x;
    groundCache.camY = state.camera.y;
    groundCache.theme = state.activeTheme;
    groundCache.textured = Boolean(pattern);

    const g = groundCache.ctx;
    g.setTransform(state.dpr, 0, 0, state.dpr, GROUND_MARGIN_X * state.dpr, GROUND_MARGIN_Y * state.dpr);
    g.clearRect(-GROUND_MARGIN_X, -GROUND_MARGIN_Y, cssWidth, cssHeight);
    const theme = groundCache.theme;
    forEachVisibleTile(GROUND_MARGIN_X, GROUND_MARGIN_Y, (x, y, point, noise) => {
      let fill;
      if (theme === "town") {
        // Concentric paving bands around the relay plaza.
        const zone = state.map.safeZone;
        const worldX = (x + 0.5) * WORLD_CELL;
        const worldY = (y + 0.5) * WORLD_CELL;
        const distance = zone ? Math.hypot(worldX - zone.x, worldY - zone.y) / zone.radius : 1;
        fill = distance < 0.14
          ? "#5a463c"
          : Math.floor(distance * 6) % 2 === 0
            ? "#48392f"
            : "#3f322a";
      } else {
        const value = clamp(smoothNoise(x, y) * 0.78 + noise * 0.22, 0, 1);
        fill = biomeShade(theme, value);
      }
      g.beginPath();
      g.moveTo(point.x, point.y - (TILE_H + 1) * 0.5);
      g.lineTo(point.x + (TILE_W + 1) * 0.5, point.y);
      g.lineTo(point.x, point.y + (TILE_H + 1) * 0.5);
      g.lineTo(point.x - (TILE_W + 1) * 0.5, point.y);
      g.closePath();
      g.fillStyle = fill;
      g.fill();
      if (pattern) {
        g.save();
        g.beginPath();
        g.moveTo(point.x, point.y - TILE_H * 0.5);
        g.lineTo(point.x + TILE_W * 0.5, point.y);
        g.lineTo(point.x, point.y + TILE_H * 0.5);
        g.lineTo(point.x - TILE_W * 0.5, point.y);
        g.closePath();
        g.clip();
        g.globalAlpha = 0.8;
        g.fillStyle = pattern;
        g.fillRect(point.x - TILE_W * 0.5, point.y - TILE_H * 0.5, TILE_W, TILE_H);
        g.restore();
      }
    });
  }

  function drawTiles(time) {
    const pattern = terrainTexturePattern(state.activeTheme);
    const stale = !groundCache
      || groundCache.theme !== state.activeTheme
      || groundCache.viewWidth !== state.viewWidth
      || groundCache.viewHeight !== state.viewHeight
      || groundCache.dpr !== state.dpr
      || groundCache.textured !== Boolean(pattern);
    let offset = stale ? null : groundCacheOffset();
    if (stale
      || Math.abs(offset.x) > GROUND_MARGIN_X - TILE_W
      || Math.abs(offset.y) > GROUND_MARGIN_Y - TILE_H) {
      rebuildGroundCache(pattern);
      offset = { x: 0, y: 0 };
    }
    ctx.drawImage(
      groundCache.canvas,
      offset.x - GROUND_MARGIN_X,
      offset.y - GROUND_MARGIN_Y,
      groundCache.cssWidth,
      groundCache.cssHeight,
    );

    forEachVisibleTile(0, 0, (x, y, point, noise) => {
      drawGroundAccent(state.activeTheme, point, noise, time);
      drawBiomeDecoration(state.activeTheme, point, noise, time);
    });
    drawSafeZoneRing(time);
  }

  function terrainTexturePattern(biomeKey) {
    const asset = ZONE_TEXTURE[biomeKey];
    if (!asset) return null;
    let image = zoneTextureImages.get(asset);
    if (!image) {
      image = new Image();
      image.src = `/assets/textures/${asset}.webp?v=6`;
      zoneTextureImages.set(asset, image);
    }
    if (!image.complete || !image.naturalWidth) return null;
    let pattern = zoneTexturePatterns.get(asset);
    if (!pattern) {
      pattern = ctx.createPattern(image, "repeat");
      if (!pattern) return null;
      zoneTexturePatterns.set(asset, pattern);
    }
    const origin = worldToScreen(0, 0);
    // Keep the on-screen repeat at ~426px (the look tuned on the original
    // 1254px sources) regardless of the shipped texture resolution.
    const scale = 426 / image.naturalWidth;
    pattern.setTransform({ a: scale, b: 0, c: 0, d: scale, e: origin.x, f: origin.y });
    return pattern;
  }

  // Small mid-frequency accents that give each biome ground its texture.
  function drawGroundAccent(biomeKey, point, noise, time) {
    if (noise < 0.62 || noise > 0.86) return;
    ctx.save();
    if (biomeKey === "grass") {
      if (noise > 0.8) {
        ctx.fillStyle = noise > 0.83 ? "#e0a8c8" : "#ecd98a";
        ctx.fillRect(point.x - 1, point.y - 2, 3, 3);
        ctx.fillStyle = "#3a5c2e";
        ctx.fillRect(point.x, point.y + 1, 1.5, 4);
      } else {
        ctx.strokeStyle = "rgba(110, 160, 90, 0.55)";
        ctx.lineWidth = 1.3;
        const sway = Math.sin(time * 0.0018 + noise * 30) * 1.5;
        for (const offset of [-5, 0, 5]) {
          ctx.beginPath();
          ctx.moveTo(point.x + offset, point.y + 3);
          ctx.quadraticCurveTo(point.x + offset + sway, point.y - 3, point.x + offset + sway * 1.5, point.y - 7);
          ctx.stroke();
        }
      }
    } else if (biomeKey === "mountain") {
      if (noise > 0.78) {
        ctx.globalAlpha = 0.5 + Math.sin(time * 0.003 + noise * 40) * 0.3;
        ctx.fillStyle = "#9fd6e2";
        ctx.fillRect(point.x - 1, point.y, 2.5, 2.5);
      } else {
        ctx.fillStyle = "rgba(90, 100, 115, 0.6)";
        ctx.fillRect(point.x - 3, point.y - 1, 6, 3);
        ctx.fillRect(point.x + 6, point.y + 3, 4, 2);
      }
    } else if (biomeKey === "scrapyard") {
      if (noise > 0.76) {
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = "#150e09";
        ctx.beginPath();
        ctx.ellipse(point.x, point.y + 2, 12, 4.5, 0, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = "rgba(150, 100, 60, 0.5)";
        ctx.fillRect(point.x - 4, point.y, 7, 2);
        ctx.fillRect(point.x + 5, point.y - 3, 3, 3);
      }
    } else if (biomeKey === "spaceport") {
      ctx.globalAlpha = 0.45;
      ctx.strokeStyle = "#55628a";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(point.x - 12, point.y);
      ctx.lineTo(point.x + 12, point.y);
      if (noise > 0.75) {
        ctx.moveTo(point.x, point.y - 6);
        ctx.lineTo(point.x, point.y + 6);
      }
      ctx.stroke();
    } else if (biomeKey === "wastes") {
      ctx.globalAlpha = 0.6 + Math.sin(time * 0.004 + noise * 50) * 0.3;
      ctx.fillStyle = noise > 0.76 ? "#e0596d" : "#8a4a58";
      ctx.fillRect(point.x - 1, point.y - 1, 3, 3);
    } else if (biomeKey === "lake") {
      // Moving glints on the water.
      const shimmer = Math.sin(time * 0.0035 + noise * 60 + point.x * 0.02);
      ctx.globalAlpha = 0.25 + shimmer * 0.2;
      ctx.strokeStyle = "#bfe6ff";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(point.x - 9, point.y + shimmer * 2);
      ctx.quadraticCurveTo(point.x, point.y - 2 + shimmer, point.x + 9, point.y + shimmer * 2);
      ctx.stroke();
    } else if (biomeKey === "residential") {
      ctx.globalAlpha = 0.4;
      ctx.strokeStyle = "#6a5c48";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(point.x - 11, point.y);
      ctx.lineTo(point.x + 11, point.y);
      ctx.stroke();
    } else if (biomeKey === "downtown") {
      if (noise > 0.76) {
        // Stray neon glow puddles on the asphalt.
        const hue = noise > 0.81 ? "#e878c8" : "#7ad2ff";
        ctx.globalAlpha = 0.18 + Math.sin(time * 0.003 + noise * 40) * 0.08;
        ctx.fillStyle = hue;
        ctx.beginPath();
        ctx.ellipse(point.x, point.y + 2, 10, 4, 0, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = "#5a5468";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(point.x - 6, point.y);
        ctx.lineTo(point.x + 6, point.y);
        ctx.stroke();
      }
    } else if (biomeKey === "desert") {
      // Wind ripples in the sand.
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = "#a58a5c";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(point.x - 12, point.y + 2);
      ctx.quadraticCurveTo(point.x, point.y - 3, point.x + 12, point.y + 2);
      ctx.stroke();
    } else if (biomeKey === "snow") {
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = "#e8f2fa";
      ctx.fillRect(point.x - 2, point.y - 1, 3, 3);
      if (noise > 0.74) ctx.fillRect(point.x + 8, point.y + 3, 2, 2);
    } else if (biomeKey === "castle") {
      // Cracked flagstones.
      ctx.globalAlpha = 0.45;
      ctx.strokeStyle = "#6e6878";
      ctx.lineWidth = 1;
      ctx.strokeRect(point.x - 9, point.y - 4, 18, 8);
    } else if (biomeKey === "skycity") {
      // Faintly glowing circuit seams in the sky platform.
      ctx.globalAlpha = 0.3 + Math.sin(time * 0.002 + noise * 50) * 0.15;
      ctx.strokeStyle = "#9fc8ff";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(point.x - 10, point.y);
      ctx.lineTo(point.x, point.y + 4);
      ctx.lineTo(point.x + 10, point.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function propShadow(x, y, rx) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
    ctx.beginPath();
    ctx.ellipse(x, y + 2, rx, rx * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawBiomeDecoration(biomeKey, point, noise, time) {
    if (biomeKey === "town" || biomeKey === "lake") return;
    if (biomeKey === "grass") {
      if (noise > 0.945) {
        propShadow(point.x, point.y + 1, 13);
        drawTree(point.x, point.y);
      } else if (noise > 0.865) drawGrassTuft(point.x, point.y, noise, time);
      return;
    }
    if (biomeKey === "mountain") {
      if (noise > 0.945) {
        propShadow(point.x - 2, point.y + 3, 17);
        drawPeak(point.x, point.y, noise);
      } else if (noise > 0.875) {
        propShadow(point.x, point.y + 2, 9);
        drawRock(point.x, point.y, noise);
      }
      return;
    }
    if (biomeKey === "scrapyard") {
      if (noise > 0.945) {
        propShadow(point.x, point.y + 3, 17);
        drawWreckedCar(point.x, point.y, noise);
      } else if (noise > 0.88) drawDebris(point.x, point.y, noise);
      return;
    }
    if (biomeKey === "spaceport") {
      if (noise > 0.95) {
        propShadow(point.x, point.y + 3, 15);
        drawHullPlate(point.x, point.y, noise, time);
      } else if (noise > 0.9) drawDebris(point.x, point.y, noise);
      return;
    }
    if (biomeKey === "residential") {
      if (noise > 0.955) {
        propShadow(point.x, point.y + 6, 24);
        drawHouse(point.x, point.y, noise);
      } else if (noise > 0.9) drawHedge(point.x, point.y);
      return;
    }
    if (biomeKey === "downtown") {
      if (noise > 0.95) {
        propShadow(point.x, point.y + 2, 8);
        drawNeonSign(point.x, point.y, noise, time);
      } else if (noise > 0.9) drawDebris(point.x, point.y, noise);
      return;
    }
    if (biomeKey === "desert") {
      if (noise > 0.955) {
        propShadow(point.x, point.y + 1, 10);
        drawSucculent(point.x, point.y);
      } else if (noise > 0.89) {
        propShadow(point.x, point.y + 2, 9);
        drawRock(point.x, point.y, noise);
      }
      return;
    }
    if (biomeKey === "snow") {
      if (noise > 0.945) {
        propShadow(point.x - 2, point.y + 3, 17);
        drawPeak(point.x, point.y, noise, true);
      } else if (noise > 0.885) {
        propShadow(point.x, point.y + 1, 8);
        drawCrystal(point.x, point.y - 4, noise, time, "#bfe6ff");
      }
      return;
    }
    if (biomeKey === "castle") {
      if (noise > 0.94) {
        propShadow(point.x, point.y + 3, 12);
        drawColumn(point.x, point.y, noise);
      } else if (noise > 0.88) drawDebris(point.x, point.y, noise);
      return;
    }
    if (biomeKey === "skycity") {
      if (noise > 0.95) {
        drawSkyPylon(point.x, point.y, time);
      } else if (noise > 0.9) {
        // Drifting cloud wisps across the platforms.
        ctx.save();
        ctx.globalAlpha = 0.16;
        ctx.fillStyle = "#dfeaff";
        ctx.beginPath();
        ctx.ellipse(point.x + Math.sin(time * 0.0008 + noise * 20) * 12, point.y, 26, 7, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      return;
    }
    // Crystal wastes around the boss lair.
    if (noise > 0.92) {
      propShadow(point.x, point.y + 1, 8);
      drawCrystal(point.x, point.y - 4, noise, time);
    } else if (noise > 0.88) drawDebris(point.x, point.y, noise);
  }

  function drawHouse(x, y, seed) {
    ctx.save();
    const tint = seed > 0.975 ? "#5c4a3c" : "#544438";
    ctx.fillStyle = tint;
    ctx.fillRect(x - 18, y - 20, 36, 25);
    ctx.fillStyle = "#71503a";
    ctx.beginPath();
    ctx.moveTo(x - 23, y - 18);
    ctx.lineTo(x, y - 36);
    ctx.lineTo(x + 23, y - 18);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#84604a";
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.fillStyle = "#241d18";
    ctx.fillRect(x - 4, y - 9, 8, 14);
    ctx.fillStyle = "rgba(255, 205, 130, 0.75)";
    ctx.fillRect(x + 8, y - 15, 6, 6);
    ctx.restore();
  }

  function drawHedge(x, y) {
    ctx.save();
    ctx.fillStyle = "#31502a";
    ctx.beginPath();
    ctx.ellipse(x - 6, y - 3, 8, 5, 0, 0, Math.PI * 2);
    ctx.ellipse(x + 5, y - 4, 7, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawNeonSign(x, y, seed, time) {
    const palette = ["#e878c8", "#7ad2ff", "#8affc2", "#ffd479"];
    const color = palette[Math.floor(seed * 40) % palette.length];
    ctx.save();
    ctx.fillStyle = "#2a2731";
    ctx.fillRect(x - 2, y - 30, 4, 30);
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 12 * (0.7 + Math.sin(time * 0.005 + seed * 30) * 0.3);
    ctx.fillRect(x - 9, y - 44, 18, 13);
    ctx.fillStyle = "#16141c";
    ctx.fillRect(x - 6, y - 41, 12, 7);
    ctx.restore();
  }

  function drawSucculent(x, y) {
    ctx.save();
    ctx.fillStyle = "#4a6a3a";
    ctx.fillRect(x - 3, y - 22, 6, 23);
    ctx.fillRect(x - 12, y - 15, 5, 9);
    ctx.fillRect(x - 12, y - 15, 9, 4);
    ctx.fillRect(x + 7, y - 19, 5, 10);
    ctx.fillRect(x + 3, y - 19, 9, 4);
    ctx.strokeStyle = "#628a4c";
    ctx.lineWidth = 1;
    ctx.strokeRect(x - 3, y - 22, 6, 23);
    ctx.restore();
  }

  function drawColumn(x, y, seed) {
    ctx.save();
    ctx.fillStyle = "#5e5866";
    ctx.fillRect(x - 5, y - 26 + seed * 8, 10, 26 - seed * 8);
    ctx.fillRect(x - 8, y - 30 + seed * 8, 16, 5);
    ctx.fillStyle = "#48434f";
    ctx.fillRect(x - 5, y - 8, 10, 3);
    ctx.restore();
  }

  function drawSkyPylon(x, y, time) {
    ctx.save();
    propShadow(x, y + 1, 7);
    ctx.fillStyle = "#3c4c70";
    ctx.fillRect(x - 2, y - 26, 4, 26);
    const glow = 0.7 + Math.sin(time * 0.004 + x) * 0.3;
    ctx.fillStyle = "#9fc8ff";
    ctx.shadowColor = "#9fc8ff";
    ctx.shadowBlur = 12 * glow;
    ctx.beginPath();
    ctx.moveTo(x, y - 36);
    ctx.lineTo(x + 5, y - 28);
    ctx.lineTo(x, y - 20);
    ctx.lineTo(x - 5, y - 28);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawGrassTuft(x, y, seed, time) {
    ctx.save();
    ctx.strokeStyle = "#4d7a44";
    ctx.lineWidth = 1.4;
    const sway = Math.sin(time * 0.002 + seed * 20) * 1.5;
    for (const offset of [-4, 0, 4]) {
      ctx.beginPath();
      ctx.moveTo(x + offset, y + 3);
      ctx.quadraticCurveTo(x + offset + sway, y - 4, x + offset + sway * 1.6, y - 9);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawTree(x, y) {
    ctx.save();
    ctx.fillStyle = "#3b2d1e";
    ctx.fillRect(x - 2, y - 14, 4, 15);
    ctx.fillStyle = "#2c4a28";
    ctx.beginPath();
    ctx.moveTo(x, y - 42);
    ctx.lineTo(x + 14, y - 14);
    ctx.lineTo(x - 14, y - 14);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#386030";
    ctx.beginPath();
    ctx.moveTo(x, y - 50);
    ctx.lineTo(x + 10, y - 28);
    ctx.lineTo(x - 10, y - 28);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawRock(x, y, seed) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(seed * 2);
    ctx.fillStyle = "#3b4148";
    ctx.beginPath();
    ctx.moveTo(-8, 3);
    ctx.lineTo(-4, -6);
    ctx.lineTo(5, -5);
    ctx.lineTo(9, 3);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#525a64";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  function drawPeak(x, y, seed, snowy = false) {
    ctx.save();
    ctx.fillStyle = snowy ? "#6c7d8f" : "#40474f";
    ctx.beginPath();
    ctx.moveTo(x - 20, y + 4);
    ctx.lineTo(x - 4, y - 34 - seed * 10);
    ctx.lineTo(x + 16, y + 4);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = snowy ? "#f0f6fc" : "#c9d2dc";
    ctx.beginPath();
    ctx.moveTo(x - (snowy ? 12 : 9), y - 20 - seed * 8);
    ctx.lineTo(x - 4, y - 34 - seed * 10);
    ctx.lineTo(x + (snowy ? 7 : 3), y - 18 - seed * 8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawWreckedCar(x, y, seed) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((seed - 0.97) * 6);
    ctx.fillStyle = "#5a3a28";
    ctx.fillRect(-16, -8, 32, 9);
    ctx.fillStyle = "#6e4a30";
    ctx.fillRect(-8, -14, 15, 7);
    ctx.fillStyle = "#1a1512";
    ctx.fillRect(-6, -13, 5, 4);
    ctx.fillStyle = "#242021";
    ctx.beginPath();
    ctx.arc(-9, 2, 3.4, 0, Math.PI * 2);
    ctx.arc(9, 2, 3.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#8a5a34";
    ctx.lineWidth = 1;
    ctx.strokeRect(-16, -8, 32, 9);
    ctx.restore();
  }

  function drawHullPlate(x, y, seed, time) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = "#39415a";
    ctx.fillRect(-14, -6, 28, 10);
    ctx.strokeStyle = "#59668c";
    ctx.lineWidth = 1;
    ctx.strokeRect(-14, -6, 28, 10);
    ctx.beginPath();
    ctx.moveTo(-14, -1);
    ctx.lineTo(14, -1);
    ctx.stroke();
    ctx.fillStyle = `rgba(130, 200, 255, ${0.4 + Math.sin(time * 0.004 + seed * 30) * 0.3})`;
    ctx.fillRect(8, -4, 3, 2);
    ctx.restore();
  }

  function drawSafeZoneRing(time) {
    const zone = state.map.safeZone;
    if (!zone) return;
    ctx.save();
    ctx.strokeStyle = `rgba(240, 193, 94, ${0.35 + Math.sin(time * 0.002) * 0.12})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    const segments = 72;
    for (let i = 0; i <= segments; i += 1) {
      const angle = (i / segments) * Math.PI * 2;
      const point = worldToScreen(
        zone.x + Math.cos(angle) * zone.radius,
        zone.y + Math.sin(angle) * zone.radius,
      );
      if (i === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawCrystal(x, y, seed, time, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha = 0.64 + Math.sin(time * 0.002 + seed * 8) * 0.12;
    ctx.shadowColor = color || "#4dd1c0";
    ctx.shadowBlur = 12;
    ctx.fillStyle = color || "#4da79f";
    ctx.beginPath();
    ctx.moveTo(0, -17);
    ctx.lineTo(7, -4);
    ctx.lineTo(2, 2);
    ctx.lineTo(-6, -4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawDebris(x, y, seed) {
    ctx.save();
    ctx.translate(x, y - 2);
    ctx.rotate(seed * 5);
    ctx.fillStyle = "#343e3f";
    ctx.fillRect(-7, -4, 14, 7);
    ctx.fillStyle = "#111719";
    ctx.fillRect(-4, -5, 5, 2);
    ctx.restore();
  }

  function drawObjects(time) {
    const objects = [];
    for (const player of state.players.values()) objects.push(player);
    for (const enemy of state.enemies.values()) objects.push(enemy);
    objects.sort((a, b) => (a.y + a.x) - (b.y + b.x));

    if (!state.joined && objects.length === 0) {
      const orbit = time * 0.0003;
      const centerX = state.map.width * 0.5;
      const centerY = state.map.height * 0.5;
      objects.push(
        { id: "preview", kind: "player", name: "RELAY-07", archetype: state.selectedArchetype, x: centerX, y: centerY, hp: 100, maxHp: 100 },
        { id: "preview-enemy-1", kind: "enemy", type: "riftling", name: "Riftling", x: centerX - 115 + Math.cos(orbit) * 18, y: centerY + 72 + Math.sin(orbit) * 18, hp: 62, maxHp: 100 },
        { id: "preview-enemy-2", kind: "enemy", type: "duskfang", name: "Duskfang", x: centerX + 122, y: centerY - 104, hp: 100, maxHp: 100 },
      );
      objects.sort((a, b) => (a.y + a.x) - (b.y + b.x));
    }

    drawPortals(time);
    for (const drop of state.drops.values()) drawDrop(drop, time);

    const local = localPlayer();
    if (local?.moveTarget) drawMoveMarker(local.moveTarget, time);
    if (local?.targetId && state.enemies.has(String(local.targetId))) {
      drawTargetRing(state.enemies.get(String(local.targetId)), time);
    }

    for (const object of objects) {
      if (object.kind === "enemy") drawEnemy(object, time);
      else drawPlayer(object, time);
    }

    for (const projectile of state.projectiles.values()) drawProjectile(projectile, time);
    drawEffects(time);
  }

  function drawDrop(drop, time) {
    const point = worldToScreen(drop.x, drop.y);
    if (point.x < -40 || point.x > state.viewWidth + 40 || point.y < -60 || point.y > state.viewHeight + 40) return;
    const info = rarityInfo(drop.rarity);
    const bob = Math.sin(time * 0.004 + finite(drop.x)) * 2.5;
    ctx.save();
    ctx.strokeStyle = "rgba(0, 0, 0, 0.4)";
    ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
    ctx.beginPath();
    ctx.ellipse(point.x, point.y + 2, 9, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    if (drop.rarity === "epic" || drop.rarity === "rare" || drop.dropClass === "uniq" || drop.dropClass === "sunset") {
      // Rare finds throw a short light pillar so they read from far away.
      const beam = ctx.createLinearGradient(point.x, point.y - 46, point.x, point.y);
      beam.addColorStop(0, "rgba(0,0,0,0)");
      beam.addColorStop(1, info.color + "66");
      ctx.fillStyle = beam;
      ctx.fillRect(point.x - 3, point.y - 46, 6, 44);
    }
    if (drop.dropClass === "sunset") {
      ctx.strokeStyle = "rgba(255, 154, 92, 0.75)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(point.x, point.y - 12 + bob, 16 + Math.sin(time * 0.004) * 2, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.translate(point.x, point.y - 12 + bob);
    ctx.shadowColor = info.color;
    ctx.shadowBlur = 11;
    if (drop.slot === "weapon") {
      // Slanted blade with a bright guard.
      ctx.rotate(-0.6);
      ctx.fillStyle = info.color;
      ctx.fillRect(-1.5, -10, 3, 14);
      ctx.fillStyle = "#e8e2d2";
      ctx.fillRect(-4, 2, 8, 2);
      ctx.fillStyle = "#2a2024";
      ctx.fillRect(-1.5, 4, 3, 4);
    } else if (drop.slot === "armor") {
      // Chestpiece silhouette with shoulder notches.
      ctx.fillStyle = info.color;
      ctx.fillRect(-7, -6, 14, 11);
      ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
      ctx.fillRect(-3, -6, 6, 3);
      ctx.fillRect(-5, -1, 10, 4);
    } else if (drop.slot === "potion") {
      // Little flask with a red draught.
      ctx.fillStyle = "rgba(220, 228, 232, 0.5)";
      ctx.fillRect(-2, -9, 4, 3);
      ctx.beginPath();
      ctx.moveTo(-2, -6);
      ctx.lineTo(-5, 2);
      ctx.lineTo(5, 2);
      ctx.lineTo(2, -6);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#e0596d";
      ctx.beginPath();
      ctx.moveTo(-3.4, -2);
      ctx.lineTo(-5, 2);
      ctx.lineTo(5, 2);
      ctx.lineTo(3.4, -2);
      ctx.closePath();
      ctx.fill();
    } else {
      // Amulet: ring on a short chain with a bright core.
      ctx.strokeStyle = info.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -10);
      ctx.lineTo(0, -5);
      ctx.stroke();
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 0, 5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = info.color;
      ctx.beginPath();
      ctx.arc(0, 0, 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawPortals(time) {
    for (const portal of state.map.portals || []) {
      const point = worldToScreen(portal.x, portal.y);
      if (point.x < -80 || point.x > state.viewWidth + 80 || point.y < -100 || point.y > state.viewHeight + 80) continue;
      const spin = time * 0.0022 + finite(portal.x);
      ctx.save();
      // Swirling ground ring.
      ctx.strokeStyle = "rgba(122, 210, 255, 0.75)";
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.ellipse(point.x, point.y, 24, 11, 0, spin, spin + Math.PI * 1.6);
      ctx.stroke();
      ctx.strokeStyle = "rgba(122, 210, 255, 0.35)";
      ctx.beginPath();
      ctx.ellipse(point.x, point.y, 16, 7.5, 0, -spin, -spin + Math.PI * 1.4);
      ctx.stroke();
      // Light pillar.
      const beam = ctx.createLinearGradient(point.x, point.y - 66, point.x, point.y);
      beam.addColorStop(0, "rgba(122, 210, 255, 0)");
      beam.addColorStop(1, `rgba(122, 210, 255, ${0.28 + Math.sin(time * 0.004 + finite(portal.x)) * 0.1})`);
      ctx.fillStyle = beam;
      ctx.fillRect(point.x - 9, point.y - 66, 18, 64);
      // Destination tag.
      const label = `⇒ ${ZONE_LABELS[portal.zone] || portal.zone}`;
      ctx.font = "600 10px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
      ctx.fillRect(point.x - 30, point.y - 84, 60, 14);
      ctx.fillStyle = "#9fdcff";
      ctx.fillText(label, point.x, point.y - 74);
      ctx.restore();
    }
  }

  function drawMoveMarker(target, time) {
    const point = worldToScreen(target.x, target.y);
    const pulse = 1 + Math.sin(time * 0.008) * 0.18;
    ctx.save();
    ctx.strokeStyle = "rgba(240, 193, 94, 0.85)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(point.x, point.y, 14 * pulse, 7 * pulse, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(point.x, point.y, 5, 2.5, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawTargetRing(enemy, time) {
    const point = worldToScreen(enemy.x, enemy.y);
    const pulse = 1 + Math.sin(time * 0.01) * 0.1;
    ctx.save();
    ctx.strokeStyle = "rgba(223, 70, 88, 0.9)";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(point.x, point.y + 2, 22 * pulse, 10 * pulse, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawPlayer(player, time) {
    const point = worldToScreen(player.x, player.y);
    if (point.x < -80 || point.x > state.viewWidth + 80 || point.y < -100 || point.y > state.viewHeight + 80) return;
    const key = String(first(player.archetype, player.class, "vanguard")).toLowerCase();
    const archetype = ARCHETYPES[key] || ARCHETYPES.vanguard;
    const isSelf = String(player.id) === String(state.id) || player.id === "preview" || player.self;
    const bob = Math.sin(time * 0.004 + finite(player.x) * 2) * 1.2;
    const running = player.running === true;

    // Walk cycle driven by how far the interpolated sprite actually moved.
    const moved = Math.hypot(player.x - (player.lastDrawX ?? player.x), player.y - (player.lastDrawY ?? player.y));
    player.lastDrawX = player.x;
    player.lastDrawY = player.y;
    player.walkPhase = (player.walkPhase || 0) + Math.min(moved, 7) * 0.24;
    const legSwing = moved > 0.08 ? Math.sin(player.walkPhase) * (running ? 5 : 3) : 0;
    const facing = player.facing && Number.isFinite(player.facing.x) ? player.facing : { x: 1, y: 0 };
    const flip = (facing.x - facing.y) < -0.001;

    ctx.save();
    ctx.translate(point.x, point.y);
    ctx.fillStyle = "rgba(0, 0, 0, 0.43)";
    ctx.beginPath();
    ctx.ellipse(0, 3, 22, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    if (running) {
      ctx.save();
      ctx.globalAlpha = 0.18;
      ctx.strokeStyle = ARCHETYPES[key]?.accent || "#54d3c2";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-30, 5);
      ctx.lineTo(-12, 5);
      ctx.moveTo(-27, 10);
      ctx.lineTo(-9, 10);
      ctx.stroke();
      ctx.restore();
    }

    ctx.translate(0, bob - 12);
    ctx.scale(flip ? -1 : 1, 1);
    const portraitDrawn = drawHeroPortrait(key, player, time);
    if (!portraitDrawn) {
      ctx.scale(1.6, 1.6);
      drawHumanoid(key, player, legSwing, time);
    }
    ctx.restore();

    if (!isSelf) {
      drawEntityLabel(point.x, point.y - 86 + bob, String(first(player.name, "操作员")), player, "#d7dddb");
    }
  }

  function drawHeroPortrait(key, player, time) {
    let image = heroSpriteImages.get(key);
    if (!image) {
      image = new Image();
      image.src = `/assets/heroes/${HERO_SPRITES[key] || `${key}.webp`}?v=6`;
      heroSpriteImages.set(key, image);
    }
    if (!image.complete || !image.naturalWidth) return false;
    const level = Math.max(1, finite(player.level, 1));
    const stage = level >= 20 ? 1.18 : level >= 10 ? 1.08 : 1;
    const equipment = player.equipment && typeof player.equipment === "object" ? player.equipment : {};
    const weapon = equipment.weapon;
    const weaponColor = weapon ? rarityInfo(weapon.rarity).color : (ARCHETYPES[key]?.accent || "#54d3c2");
    const portraitWidth = 58 * stage;
    const portraitHeight = 84 * stage;
    const cx = 0;
    const cy = -29 * stage;
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.drawImage(image, cx - portraitWidth * 0.5, cy - portraitHeight * 0.5, portraitWidth, portraitHeight);
    ctx.restore();

    if (weapon) {
      ctx.save();
      ctx.translate(18 * stage, -18 * stage);
      ctx.scale(0.72 * stage, 0.72 * stage);
      drawHeldWeapon(WEAPON_SHAPES[weapon.name] || ARCHETYPES[key]?.defaultWeapon || "blade", weaponColor, ARCHETYPES[key]?.accent || "#fff");
      ctx.restore();
    }
    if (level >= 10) {
      ctx.save();
      ctx.globalAlpha = 0.2 + Math.sin(time * 0.004) * 0.06;
      ctx.fillStyle = level >= 20 ? "#ffd479" : weaponColor;
      ctx.beginPath();
      ctx.ellipse(0, 29 * stage, 22 * stage, 4 * stage, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    return true;
  }

  function drawHumanoid(key, player, legSwing, time) {
    const look = CLASS_LOOKS[key] || CLASS_LOOKS.vanguard;
    const gear = player.equipment && typeof player.equipment === "object" ? player.equipment : {};
    const weaponShape = gear.weapon
      ? WEAPON_SHAPES[gear.weapon.name] || look.defaultWeapon
      : look.defaultWeapon;
    const weaponColor = gear.weapon ? rarityInfo(gear.weapon.rarity).color : look.weaponColor;
    const armorColor = gear.chest ? rarityInfo(gear.chest.rarity).color : null;
    const firstRing = gear.ring1 || gear.ring2 || gear.ring3;

    // Back arm.
    ctx.fillStyle = look.skin;
    ctx.fillRect(-9, -7, 3, 9);

    // Legs and boots, swinging while walking; equipped boots take the rarity color.
    ctx.fillStyle = look.legs;
    ctx.fillRect(-6, 3, 4, 11 + legSwing);
    ctx.fillRect(2, 3, 4, 11 - legSwing);
    ctx.fillStyle = gear.boots ? rarityInfo(gear.boots.rarity).color : "#191418";
    ctx.fillRect(-7, 12 + legSwing, 6, 3);
    ctx.fillRect(1, 12 - legSwing, 6, 3);

    if (look.robe) {
      // Long robe over the legs; hem stays above the boots.
      ctx.fillStyle = look.torso;
      ctx.beginPath();
      ctx.moveTo(-7, -8);
      ctx.lineTo(7, -8);
      ctx.lineTo(10, 10);
      ctx.lineTo(-10, 10);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = look.accent;
      ctx.fillRect(-10, 8, 20, 2);
    } else {
      ctx.fillStyle = look.torso;
      ctx.fillRect(-7, -8, 14, 12);
      ctx.fillStyle = look.torsoShade;
      ctx.fillRect(-7, 0, 14, 4);
      ctx.fillStyle = look.accent;
      ctx.fillRect(-7, 2, 14, 2);
    }

    // Equipped armor reads as glowing pauldrons and a chest core.
    if (armorColor) {
      ctx.fillStyle = armorColor;
      ctx.fillRect(-10, -10, 6, 5);
      ctx.fillRect(4, -10, 6, 5);
      ctx.fillRect(-2, -6, 4, 3);
    }

    // Front arm.
    ctx.fillStyle = look.skin;
    ctx.fillRect(6, -7, 3, 9);

    // Head, hair or hood, and an eye on the facing side.
    ctx.fillStyle = look.skin;
    ctx.fillRect(-4, -19, 9, 9);
    ctx.fillStyle = look.hair;
    if (look.hood) {
      ctx.fillRect(-6, -21, 13, 5);
      ctx.fillRect(-6, -19, 3, 8);
      ctx.fillRect(4, -19, 3, 8);
    } else if (look.ponytail) {
      ctx.fillRect(-5, -22, 11, 5);
      ctx.fillRect(-5, -19, 3, 4);
      ctx.fillRect(-8, -20, 3, 9);
    } else {
      ctx.fillRect(-5, -22, 11, 5);
      ctx.fillRect(-5, -19, 3, 5);
      ctx.fillRect(-2, -24, 3, 3);
      ctx.fillRect(2, -23, 3, 2);
    }
    ctx.fillStyle = "#1c1518";
    ctx.fillRect(2, -15, 2, 2);
    ctx.fillStyle = "#d98a70";
    ctx.fillRect(2, -12, 2, 1);

    // Equipped helm sits over the hair as a banded cap.
    if (gear.helm) {
      const helmColor = rarityInfo(gear.helm.rarity).color;
      ctx.fillStyle = "#3a3440";
      ctx.fillRect(-6, -23, 13, 5);
      ctx.fillStyle = helmColor;
      ctx.fillRect(-6, -20, 13, 2);
    }
    // Necklace: pendant at the collar.
    if (gear.necklace) {
      ctx.fillStyle = rarityInfo(gear.necklace.rarity).color;
      ctx.fillRect(-1, -9, 3, 3);
    }
    // Ring: a glint on the front hand.
    if (firstRing) {
      ctx.fillStyle = rarityInfo(firstRing.rarity).color;
      ctx.fillRect(6.5, -1, 2, 2);
    }
    // Shield: a small buckler on the off-hand side.
    if (gear.shield) {
      const shieldColor = rarityInfo(gear.shield.rarity).color;
      ctx.fillStyle = "#3a3440";
      ctx.beginPath();
      ctx.arc(-10, -3, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = shieldColor;
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.fillStyle = shieldColor;
      ctx.beginPath();
      ctx.arc(-10, -3, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    drawHeldWeapon(weaponShape, weaponColor, look.accent);
  }

  function drawHeldWeapon(shape, color, accent) {
    if (shape === "staff") {
      ctx.fillStyle = "#6b5236";
      ctx.fillRect(8, -25, 3, 35);
      ctx.save();
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 9;
      ctx.beginPath();
      ctx.arc(9.5, -27, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }
    if (shape === "bow") {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(5, -3, 11, -1.15, 1.15);
      ctx.stroke();
      ctx.strokeStyle = "#d8d3c8";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(9.5, -13);
      ctx.lineTo(9.5, 7);
      ctx.stroke();
      ctx.fillStyle = accent;
      ctx.fillRect(14, -5, 3, 5);
      return;
    }
    // Blade held forward at an angle.
    ctx.save();
    ctx.translate(8, -3);
    ctx.rotate(-0.5);
    ctx.fillStyle = color;
    ctx.fillRect(-1.5, -18, 3, 18);
    ctx.fillStyle = accent;
    ctx.fillRect(-4, -1, 8, 2);
    ctx.fillStyle = "#2a2024";
    ctx.fillRect(-1.5, 1, 3, 5);
    ctx.restore();
  }

  function drawEnemy(enemy, time) {
    const point = worldToScreen(enemy.x, enemy.y);
    if (point.x < -70 || point.x > state.viewWidth + 70 || point.y < -90 || point.y > state.viewHeight + 70) return;
    const pulse = 1 + Math.sin(time * 0.006 + finite(enemy.x)) * 0.04;
    const trueSpecies = String(first(enemy.type, "riftling")).toLowerCase();
    const species = RENDER_AS[trueSpecies] || trueSpecies;
    const scale = enemy.boss ? 2.5 : enemy.elite ? 1.65 : 1.3;
    if (enemy.combatState === "windup") drawEnemyWindup(enemy, point, time);
    ctx.save();
    ctx.translate(point.x, point.y);
    ctx.fillStyle = "rgba(0, 0, 0, 0.48)";
    ctx.beginPath();
    ctx.ellipse(0, 2, (species.includes("ashwing") ? 11 : 15) * scale, 6 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    if (enemy.elite || enemy.boss) {
      // Threat aura so dangerous targets read instantly.
      ctx.strokeStyle = enemy.boss ? "rgba(224, 89, 109, 0.8)" : "rgba(240, 193, 94, 0.6)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, 2, 19 * scale, 8.5 * scale, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    drawMonsterSignature(enemy, time, scale);
    if (species.includes("warden")) {
      ctx.translate(0, -20);
      ctx.scale(pulse * scale, pulse * scale);
      drawWarden(time);
    } else if (species.includes("duskfang")) {
      ctx.translate(0, -9 * scale);
      ctx.scale(pulse * scale, pulse * scale);
      drawDuskfang(time, enemy);
    } else if (species.includes("ashwing")) {
      ctx.translate(0, (-26 + Math.sin(time * 0.005 + finite(enemy.x)) * 3) * scale * 0.8);
      ctx.scale(pulse * scale, pulse * scale);
      drawAshwing(time);
    } else if (species.includes("stonehorn")) {
      ctx.translate(0, -12 * scale);
      ctx.scale(pulse * scale * 1.35, pulse * scale * 1.35);
      drawStonehorn(time, enemy);
    } else if (species.includes("scraphulk")) {
      ctx.translate(0, -18 * scale);
      ctx.scale(pulse * scale * 1.6, pulse * scale * 1.6);
      drawScraphulk(time, enemy);
    } else if (species.includes("voidmaw")) {
      ctx.translate(0, (-24 + Math.sin(time * 0.004 + finite(enemy.x)) * 4) * scale);
      ctx.scale(pulse * scale * 1.6, pulse * scale * 1.6);
      drawVoidmaw(time, enemy);
    } else {
      ctx.translate(0, -11 * scale);
      ctx.scale(pulse * scale, pulse * scale);
      drawRiftling(time, enemy);
    }
    // Hit flash when a snapshot showed this enemy losing health.
    if (enemy.flashUntil && enemy.flashUntil > performance.now()) {
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(0, -2, 13, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    const localizedName = MOB_NAMES[trueSpecies] || String(first(enemy.name, enemy.type, "裂隙体"));
    const prefix = enemy.boss ? "" : enemy.elite ? "精英·" : "";
    const label = `${prefix}${localizedName} Lv${Math.floor(finite(enemy.level, 1))}`;
    drawEntityLabel(
      point.x,
      point.y - (enemy.boss ? 112 : enemy.elite ? 82 : 64),
      label,
      enemy,
      enemy.boss ? "#ff5f70" : enemy.elite ? "#f0c15e" : "#f18a95",
      enemy.boss ? 96 : 58,
    );
  }

  function drawMonsterSignature(enemy, time, scale) {
    const colors = {
      claw: "#ff755f", bite: "#ffb15f", ember: "#ff6b35", spike: "#8fd66f",
      charge: "#e6d18b", frost: "#86d9ff", slam: "#8fc0c8", lightning: "#b8d7ff", void: "#b875ff",
    };
    const color = colors[enemy.attackStyle] || "#ff755f";
    ctx.save();
    ctx.globalAlpha = 0.42 + Math.sin(time * 0.004 + finite(enemy.x)) * 0.1;
    ctx.strokeStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = enemy.boss ? 16 : 8;
    ctx.lineWidth = enemy.boss ? 2.5 : 1.2;
    if (["ember", "frost", "lightning", "void"].includes(enemy.attackStyle)) {
      ctx.beginPath();
      ctx.arc(0, -8 * scale, (14 + Math.sin(time * 0.006) * 2) * scale, 0, Math.PI * 2);
      ctx.stroke();
    } else if (["charge", "slam"].includes(enemy.attackStyle)) {
      ctx.beginPath();
      ctx.moveTo(-18 * scale, 5 * scale);
      ctx.lineTo(0, -18 * scale);
      ctx.lineTo(18 * scale, 5 * scale);
      ctx.stroke();
    } else {
      for (let index = 0; index < 3; index += 1) {
        const angle = time * 0.001 + index * Math.PI * 2 / 3;
        ctx.beginPath();
        ctx.arc(Math.cos(angle) * 17 * scale, Math.sin(angle) * 6 * scale, 3 * scale, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawEnemyWindup(enemy, point, time) {
    const target = state.players.get(String(enemy.attackTargetId));
    if (!target) return;
    const targetPoint = worldToScreen(target.x, target.y);
    const total = Math.max(0.1, finite(enemy.attackWindup, 0.6));
    const charge = 1 - ratio(finite(enemy.attackRemaining, total), total);
    const colors = {
      claw: "#ff755f", bite: "#ffb15f", ember: "#ff6b35", spike: "#8fd66f",
      charge: "#e6d18b", frost: "#86d9ff", slam: "#8fc0c8", lightning: "#b8d7ff", void: "#b875ff",
    };
    const color = colors[enemy.attackStyle] || "#ff755f";
    ctx.save();
    ctx.globalAlpha = 0.58 + Math.sin(time * 0.025) * 0.18;
    ctx.strokeStyle = color;
    ctx.fillStyle = `${color}22`;
    ctx.shadowColor = color;
    ctx.shadowBlur = 12 + charge * 16;
    ctx.lineWidth = 2 + charge * 3;
    ctx.setLineDash([7, 5]);
    ctx.beginPath();
    ctx.moveTo(point.x, point.y - 18);
    ctx.lineTo(targetPoint.x, targetPoint.y - 10);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.ellipse(targetPoint.x, targetPoint.y + 5, 20 + charge * 18, 9 + charge * 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(point.x, point.y - 18, 9 + charge * 13, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawWarden(time) {
    // The Crimson Warden: a horned sentinel with a burning core (original design).
    const breathe = Math.sin(time * 0.003) * 1.5;
    ctx.fillStyle = "#3d1420";
    ctx.fillRect(-9, 6, 6, 12);
    ctx.fillRect(3, 6, 6, 12);
    ctx.fillStyle = "#5a1c2c";
    ctx.beginPath();
    ctx.moveTo(-14, 8);
    ctx.lineTo(-10, -14 - breathe);
    ctx.lineTo(10, -14 - breathe);
    ctx.lineTo(14, 8);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#c73b52";
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.fillStyle = "#802637";
    ctx.fillRect(-17, -12 - breathe, 6, 9);
    ctx.fillRect(11, -12 - breathe, 6, 9);
    ctx.fillStyle = "#2c0f18";
    ctx.fillRect(-6, -24 - breathe, 12, 11);
    ctx.strokeStyle = "#c73b52";
    ctx.beginPath();
    ctx.moveTo(-6, -24 - breathe);
    ctx.lineTo(-12, -33 - breathe);
    ctx.moveTo(6, -24 - breathe);
    ctx.lineTo(12, -33 - breathe);
    ctx.stroke();
    ctx.save();
    ctx.fillStyle = "#ff5f70";
    ctx.shadowColor = "#ff5f70";
    ctx.shadowBlur = 12;
    ctx.fillRect(-4, -20 - breathe, 8, 3);
    ctx.beginPath();
    ctx.arc(0, -2 - breathe * 0.5, 3.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawRiftling(time, enemy) {
    // Spiny little rift-creature: round body, crystal spikes, stubby legs.
    ctx.fillStyle = "#2a1a20";
    ctx.fillRect(-6, 7, 3, 4);
    ctx.fillRect(3, 7, 3, 4);
    ctx.fillStyle = "#711f30";
    ctx.beginPath();
    ctx.arc(0, 0, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#dc5261";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = "#dc5261";
    for (const [sx, sy, w] of [[-8, -4, 4], [-3, -9, 5], [4, -7, 4]]) {
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + w * 0.5, sy - 6);
      ctx.lineTo(sx + w, sy);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = "#f2b758";
    ctx.fillRect(-5, -2, 3, 3);
    ctx.fillRect(2, -2, 3, 3);
  }

  function drawDuskfang(time, enemy) {
    // Low four-legged beast with bared fangs and a whip tail.
    const trot = Math.sin(time * 0.012 + finite(enemy.x)) * 1.5;
    ctx.fillStyle = "#231622";
    ctx.fillRect(-10, 4, 3, 6 + trot);
    ctx.fillRect(-4, 4, 3, 6 - trot);
    ctx.fillRect(2, 4, 3, 6 + trot);
    ctx.fillRect(7, 4, 3, 6 - trot);
    ctx.strokeStyle = "#6d3a5c";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-12, 1);
    ctx.quadraticCurveTo(-19, -2, -18, -8);
    ctx.stroke();
    ctx.fillStyle = "#452038";
    ctx.beginPath();
    ctx.ellipse(-1, 0, 12, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#b04a72";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = "#452038";
    ctx.beginPath();
    ctx.arc(11, -3, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#b04a72";
    ctx.beginPath();
    ctx.moveTo(8, -8);
    ctx.lineTo(9.5, -12);
    ctx.lineTo(11, -8);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#efe6da";
    ctx.beginPath();
    ctx.moveTo(9, 1);
    ctx.lineTo(10, 4.5);
    ctx.lineTo(11, 1);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(12, 1);
    ctx.lineTo(13, 4.5);
    ctx.lineTo(14, 1);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#f2b758";
    ctx.fillRect(11, -5, 3, 2);
  }

  function drawAshwing(time) {
    // Hovering ember-eyed creature with flapping ash-grey wings.
    const flap = Math.sin(time * 0.014) * 5;
    ctx.fillStyle = "rgba(122, 106, 100, 0.85)";
    ctx.beginPath();
    ctx.moveTo(-4, -2);
    ctx.lineTo(-17, -8 - flap);
    ctx.lineTo(-14, 2);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(4, -2);
    ctx.lineTo(17, -8 - flap);
    ctx.lineTo(14, 2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#5c4f4c";
    ctx.beginPath();
    ctx.ellipse(0, 0, 6, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#8a7770";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.save();
    ctx.fillStyle = "#f2a13e";
    ctx.shadowColor = "#f2a13e";
    ctx.shadowBlur = 7;
    ctx.beginPath();
    ctx.arc(0, -1, 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawStonehorn(time, enemy) {
    // Boulder-backed quadruped with a single jutting horn (original design).
    const trot = Math.sin(time * 0.009 + finite(enemy.x)) * 1.4;
    ctx.fillStyle = "#2c2a26";
    ctx.fillRect(-11, 5, 4, 7 + trot);
    ctx.fillRect(-3, 5, 4, 7 - trot);
    ctx.fillRect(5, 5, 4, 7 + trot);
    ctx.fillStyle = "#4a463e";
    ctx.beginPath();
    ctx.ellipse(-1, -1, 14, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#6a655a";
    ctx.lineWidth = 1.6;
    ctx.stroke();
    // Rocky plates on the back.
    ctx.fillStyle = "#5c574c";
    ctx.beginPath();
    ctx.moveTo(-9, -6);
    ctx.lineTo(-4, -13);
    ctx.lineTo(1, -6);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, -12);
    ctx.lineTo(9, -6);
    ctx.closePath();
    ctx.fill();
    // Head and horn.
    ctx.fillStyle = "#4a463e";
    ctx.beginPath();
    ctx.arc(13, -4, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#d8cfb8";
    ctx.beginPath();
    ctx.moveTo(16, -8);
    ctx.lineTo(24, -16);
    ctx.lineTo(19, -6);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#f2b758";
    ctx.fillRect(13, -6, 3, 2);
  }

  function drawScraphulk(time, enemy) {
    // Shambling golem welded together from wreck parts (original design).
    const sway = Math.sin(time * 0.006 + finite(enemy.x)) * 1.5;
    ctx.fillStyle = "#2a2018";
    ctx.fillRect(-10, 8, 6, 8);
    ctx.fillRect(4, 8, 6, 8);
    ctx.fillStyle = "#5a3a28";
    ctx.fillRect(-13, -12 + sway * 0.4, 26, 21);
    ctx.strokeStyle = "#8a5a34";
    ctx.lineWidth = 1.6;
    ctx.strokeRect(-13, -12 + sway * 0.4, 26, 21);
    // Mismatched armor plates.
    ctx.fillStyle = "#6e4a30";
    ctx.fillRect(-13, -12 + sway * 0.4, 12, 9);
    ctx.fillStyle = "#39415a";
    ctx.fillRect(2, -6 + sway * 0.4, 11, 8);
    // Shoulder wheel and pipe.
    ctx.fillStyle = "#242021";
    ctx.beginPath();
    ctx.arc(-15, -8 + sway * 0.4, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#4a4646";
    ctx.stroke();
    ctx.fillStyle = "#4a4646";
    ctx.fillRect(12, -18 + sway * 0.4, 4, 10);
    // Head slit glowing.
    ctx.fillStyle = "#1a1512";
    ctx.fillRect(-6, -20 + sway * 0.4, 12, 9);
    ctx.save();
    ctx.fillStyle = "#ff8a4a";
    ctx.shadowColor = "#ff8a4a";
    ctx.shadowBlur = 8;
    ctx.fillRect(-4, -17 + sway * 0.4, 8, 2.4);
    ctx.restore();
  }

  function drawVoidmaw(time, enemy) {
    // A drifting maw ringed with teeth around a void core (original design).
    const gape = 1 + Math.sin(time * 0.005 + finite(enemy.x)) * 0.08;
    ctx.save();
    ctx.scale(gape, gape);
    ctx.fillStyle = "#2a1d33";
    ctx.beginPath();
    ctx.arc(0, 0, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#7a4a9e";
    ctx.lineWidth = 2;
    ctx.stroke();
    // Ring of teeth pointing inward.
    ctx.fillStyle = "#d8cfe4";
    for (let i = 0; i < 8; i += 1) {
      const angle = (i / 8) * Math.PI * 2 + time * 0.0012;
      const outerX = Math.cos(angle) * 12;
      const outerY = Math.sin(angle) * 12;
      ctx.beginPath();
      ctx.moveTo(outerX * 1.05, outerY * 1.05);
      ctx.lineTo(outerX * 0.55 - Math.sin(angle) * 2, outerY * 0.55 + Math.cos(angle) * 2);
      ctx.lineTo(outerX * 0.55 + Math.sin(angle) * 2, outerY * 0.55 - Math.cos(angle) * 2);
      ctx.closePath();
      ctx.fill();
    }
    // Void core.
    ctx.save();
    ctx.fillStyle = "#0a0610";
    ctx.beginPath();
    ctx.arc(0, 0, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#b06adf";
    ctx.shadowColor = "#b06adf";
    ctx.shadowBlur = 10;
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.restore();
    ctx.restore();
  }

  function drawEntityLabel(x, y, name, entity, color, barWidth = 58) {
    const hp = finite(first(entity.hp, entity.health), 1);
    const maxHp = Math.max(1, finite(first(entity.maxHp, entity.maxHealth), 1));
    const half = barWidth / 2;
    ctx.save();
    ctx.font = "600 10px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(0, 0, 0, 0.58)";
    ctx.fillRect(x - half - 4, y - 12, barWidth + 8, 18);
    ctx.fillStyle = color;
    ctx.fillText(name.slice(0, 18), x, y - 2);
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.fillRect(x - half, y + 2, barWidth, 2);
    ctx.fillStyle = entity.kind === "enemy" ? "#df4658" : "#54cbbd";
    ctx.fillRect(x - half, y + 2, barWidth * ratio(hp, maxHp), 2);
    if (entity.kind === "enemy" && (entity.boss || entity.elite || String(entity.id) === String(localPlayer()?.targetId))) {
      ctx.fillStyle = "rgba(218,225,222,.72)";
      ctx.font = "600 7px ui-monospace, monospace";
      ctx.fillText(`攻 ${Math.round(finite(entity.damage))}  防 ${Math.round(finite(entity.defense))}  速 ${Math.round(finite(entity.speed))}`, x, y + 13);
    }
    ctx.restore();
  }

  function drawProjectile(projectile, time) {
    const point = worldToScreen(projectile.x, projectile.y, finite(projectile.z, 18));
    const color = String(first(projectile.color, projectile.team === "enemy" ? "#ef5365" : "#65e1d0"));
    const size = Math.max(3, finite(projectile.radius, 6) * 0.7);

    // Streak from last drawn position; bolts read as motion, not shapes.
    const prevX = finite(projectile.drawPrevX, projectile.x);
    const prevY = finite(projectile.drawPrevY, projectile.y);
    const tail = worldToScreen(prevX, prevY, finite(projectile.z, 18));
    projectile.drawPrevX = projectile.x;
    projectile.drawPrevY = projectile.y;

    ctx.save();
    const streakLength = Math.hypot(point.x - tail.x, point.y - tail.y);
    if (streakLength > 2) {
      const stretchX = point.x + (tail.x - point.x) * 2.4;
      const stretchY = point.y + (tail.y - point.y) * 2.4;
      const streak = ctx.createLinearGradient(stretchX, stretchY, point.x, point.y);
      streak.addColorStop(0, "rgba(0, 0, 0, 0)");
      streak.addColorStop(1, color);
      ctx.strokeStyle = streak;
      ctx.lineCap = "round";
      ctx.lineWidth = size * 1.2;
      ctx.beginPath();
      ctx.moveTo(stretchX, stretchY);
      ctx.lineTo(point.x, point.y);
      ctx.stroke();
    }
    // Bright core with a glowing halo.
    const glowSize = size * 5;
    ctx.drawImage(glowSprite(color), point.x - glowSize * 0.5, point.y - glowSize * 0.5, glowSize, glowSize);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(point.x, point.y, size, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
    ctx.beginPath();
    ctx.arc(point.x, point.y, size * 0.45, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawEffects(time) {
    state.effects = state.effects.filter((effect) => time - effect.born < effect.duration);
    // A big AoE landing on a crowd can burst dozens of effects per snapshot;
    // cap the pool so the frame loop never drowns, dropping the oldest first.
    if (state.effects.length > 160) state.effects.splice(0, state.effects.length - 160);
    for (const effect of state.effects) {
      const progress = clamp((time - effect.born) / effect.duration, 0, 1);
      if (effect.type === "enemy-attack") {
        const from = worldToScreen(effect.x, effect.y, 18);
        const to = worldToScreen(effect.toX, effect.toY, 18);
        ctx.save();
        ctx.globalAlpha = Math.sin(progress * Math.PI);
        ctx.strokeStyle = effect.color;
        ctx.shadowColor = effect.color;
        ctx.shadowBlur = 18;
        ctx.lineWidth = (effect.attackStyle === "slam" ? 14 : effect.attackStyle === "charge" ? 10 : 8) - progress * 5;
        ctx.lineCap = "round";
        ctx.beginPath();
        if (effect.attackStyle === "slam") {
          ctx.ellipse(to.x, to.y + 8, 12 + progress * 42, 5 + progress * 18, 0, 0, Math.PI * 2);
        } else if (effect.attackStyle === "void") {
          ctx.arc(to.x, to.y, 10 + progress * 28, progress * 5, progress * 5 + Math.PI * 1.55);
        } else {
          ctx.moveTo(from.x, from.y);
          const lift = effect.attackStyle === "ember" ? 64 : effect.attackStyle === "bite" ? 22 : 38;
          ctx.quadraticCurveTo((from.x + to.x) / 2, Math.min(from.y, to.y) - lift, to.x, to.y);
        }
        ctx.stroke();
        ctx.fillStyle = "#fff0d5";
        ctx.beginPath();
        ctx.arc(to.x, to.y, 4 + progress * 13, 0, Math.PI * 2);
        ctx.fill();
        if (effect.attackStyle === "claw" || effect.attackStyle === "bite") {
          ctx.globalAlpha *= 0.6;
          ctx.translate(6, 0);
          ctx.stroke();
        }
        ctx.restore();
        continue;
      }
      if (effect.type === "spark") {
        const elapsed = (time - effect.born) / 1000;
        const point = worldToScreen(effect.x + effect.vx * elapsed, effect.y + effect.vy * elapsed, 14 - progress * 20);
        ctx.save();
        ctx.globalAlpha = 1 - progress;
        const sparkSize = 9 * (1 - progress * 0.6);
        ctx.drawImage(glowSprite(effect.color), point.x - sparkSize * 0.5, point.y - sparkSize * 0.5, sparkSize, sparkSize);
        ctx.restore();
        continue;
      }
      const point = worldToScreen(effect.x, effect.y, 10 + progress * 22);
      ctx.save();
      ctx.globalAlpha = 1 - progress;
      ctx.strokeStyle = effect.color;
      ctx.lineWidth = 3 * (1 - progress);
      ctx.beginPath();
      ctx.ellipse(point.x, point.y + 10, 8 + progress * 30, 4 + progress * 14, 0, 0, Math.PI * 2);
      ctx.stroke();
      if (effect.text) {
        ctx.fillStyle = effect.color;
        ctx.font = "700 13px ui-monospace, monospace";
        ctx.textAlign = "center";
        ctx.fillText(effect.text, point.x, point.y - 13);
      }
      ctx.restore();
    }
  }

  function drawCursor(time) {
    if (!state.joined) return;
    const point = worldToScreen(state.pointer.worldX, state.pointer.worldY);
    ctx.save();
    ctx.translate(point.x, point.y);
    ctx.rotate(time * 0.001);
    ctx.strokeStyle = state.pointer.down ? "#e75b69" : "rgba(212, 226, 222, 0.55)";
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 4; i += 1) {
      ctx.rotate(Math.PI * 0.5);
      ctx.beginPath();
      ctx.moveTo(10, 0);
      ctx.lineTo(17, 0);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Local-player prediction: our own movement is driven directly by held
  // input at the server-authoritative moveSpeed, with a gentle pull toward
  // the latest snapshot to absorb drift — so walking starts and stops the
  // instant a key changes instead of a round trip later. The server still
  // owns the real position; a large disagreement (teleport, respawn,
  // rejected move) snaps immediately.
  const SPRINT_FACTOR = 1.42; // mirrors SPRINT_FACTOR in src/server/world.js
  const PREDICTION_SNAP_DISTANCE = 240;

  function predictLocalPlayer(local, delta) {
    const easeFactor = 1 - Math.exp(-delta * 0.014);
    const speed = finite(local.moveSpeed, 0);
    if (local.alive === false || speed <= 0) {
      local.x += (local.targetX - local.x) * easeFactor;
      local.y += (local.targetY - local.y) * easeFactor;
      return;
    }
    const move = currentMove();
    const keyboardMoving = move.x !== 0 || move.y !== 0;
    const dt = delta / 1000;
    if (keyboardMoving) {
      const sprinting = state.keys.has("ShiftLeft") || state.keys.has("ShiftRight");
      const step = speed * (sprinting ? SPRINT_FACTOR : 1) * dt;
      local.x = clamp(local.x + move.x * step, 0, state.map.width);
      local.y = clamp(local.y + move.y * step, 0, state.map.height);
    } else if (local.moveTarget) {
      // March orders echo back in snapshots; walk the same straight line
      // the server walks.
      const dx = local.moveTarget.x - local.x;
      const dy = local.moveTarget.y - local.y;
      const distance = Math.hypot(dx, dy);
      if (distance > 6) {
        const step = Math.min(distance, speed * dt);
        local.x += (dx / distance) * step;
        local.y += (dy / distance) * step;
      }
    } else {
      local.x += (local.targetX - local.x) * easeFactor;
      local.y += (local.targetY - local.y) * easeFactor;
      return;
    }
    // While predicting, only a weak correction toward the server position.
    const pull = 1 - Math.exp(-delta * 0.004);
    local.x += (local.targetX - local.x) * pull;
    local.y += (local.targetY - local.y) * pull;
    if (Math.hypot(local.targetX - local.x, local.targetY - local.y) > PREDICTION_SNAP_DISTANCE) {
      local.x = local.targetX;
      local.y = local.targetY;
    }
  }

  function interpolateEntities(delta) {
    const factor = 1 - Math.exp(-delta * 0.014);
    const local = localPlayer();
    for (const store of [state.players, state.enemies, state.projectiles, state.drops]) {
      for (const entity of store.values()) {
        if (entity === local) continue;
        entity.x += (entity.targetX - entity.x) * factor;
        entity.y += (entity.targetY - entity.y) * factor;
      }
    }
    if (local) predictLocalPlayer(local, delta);
    const targetX = local?.x ?? state.map.width * 0.5;
    const targetY = local?.y ?? state.map.height * 0.5;
    const cameraFactor = 1 - Math.exp(-delta * 0.005);
    state.camera.x += (targetX - state.camera.x) * cameraFactor;
    state.camera.y += (targetY - state.camera.y) * cameraFactor;
  }

  function currentMove() {
    let screenX = 0;
    let screenY = 0;
    if (state.keys.has("KeyA") || state.keys.has("ArrowLeft")) screenX -= 1;
    if (state.keys.has("KeyD") || state.keys.has("ArrowRight")) screenX += 1;
    if (state.keys.has("KeyW") || state.keys.has("ArrowUp")) screenY -= 1;
    if (state.keys.has("KeyS") || state.keys.has("ArrowDown")) screenY += 1;
    const length = Math.hypot(screenX, screenY) || 1;
    screenX /= length;
    screenY /= length;
    return {
      x: (screenY + screenX) / Math.SQRT2,
      y: (screenY - screenX) / Math.SQRT2,
    };
  }

  function sendInput(time) {
    if (!state.joined || time - state.lastInput < 50) return;
    state.lastInput = time;
    if (state.pointer.seen) {
      const aim = screenToWorld(state.pointer.x, state.pointer.y);
      state.pointer.worldX = clamp(aim.x, 0, state.map.width);
      state.pointer.worldY = clamp(aim.y, 0, state.map.height);
    }
    const move = currentMove();
    send({
      type: "input",
      seq: ++state.inputSeq,
      move,
      aim: { x: state.pointer.worldX, y: state.pointer.worldY },
      sprint: state.keys.has("ShiftLeft") || state.keys.has("ShiftRight"),
      // moveTo/target are only present when a new order was clicked;
      // JSON.stringify drops undefined fields and the server keeps prior orders.
      moveTo: state.orders.moveTo,
      target: state.orders.target,
      primary: state.pulses.primary,
      q: state.pulses.q,
      e: state.pulses.e,
      r: state.pulses.r,
      c: state.pulses.c,
      f: state.pulses.f,
    });
    state.orders.moveTo = undefined;
    state.orders.target = undefined;
    state.pulses.primary = false;
    state.pulses.q = false;
    state.pulses.e = false;
    state.pulses.r = false;
    state.pulses.c = false;
    state.pulses.f = false;
  }

  function frame(time) {
    const delta = Math.min(50, time - state.lastFrame);
    state.lastFrame = time;
    interpolateEntities(delta);
    updateAmbient(delta);
    sendInput(time);
    drawWorld(time);
    requestAnimationFrame(frame);
  }

  function triggerAbility(ability) {
    if (!state.joined) return;
    const button = ui.abilities.find((item) => item.dataset.ability === ability);
    if (button?.disabled || button?.classList.contains("is-cooling") || button?.classList.contains("is-locked")) return;
    if (ability === "primary") state.pulses.primary = true;
    else state.pulses[ability] = true;
    if (button) {
      button.classList.remove("is-active");
      void button.offsetWidth;
      button.classList.add("is-active");
      window.setTimeout(() => button.classList.remove("is-active"), 140);
    }
  }

  // Selected-hero detail: large portrait, lore, stat bars, and skill preview.
  const heroDetail = document.querySelector("#hero-detail");
  function renderHeroDetail(id) {
    if (!heroDetail) return;
    const hero = ARCHETYPES[id] || ARCHETYPES.vanguard;

    const portrait = document.createElement("img");
    portrait.className = "hero-detail-portrait";
    portrait.src = `/assets/heroes/${HERO_SPRITES[id] || `${id}.webp`}?v=6`;
    portrait.alt = hero.label;

    const info = document.createElement("div");
    info.className = "hero-detail-info";
    const heading = document.createElement("strong");
    heading.textContent = `${hero.label} · ${hero.role}`;
    heading.style.color = hero.accent;
    const lore = document.createElement("p");
    lore.className = "hero-detail-lore";
    lore.textContent = hero.lore;

    const stats = document.createElement("div");
    stats.className = "hero-detail-stats";
    for (const [key, label] of Object.entries(STAT_LABELS)) {
      const row = document.createElement("div");
      row.className = "hero-stat";
      const tag = document.createElement("span");
      tag.textContent = label;
      const track = document.createElement("i");
      const fill = document.createElement("b");
      fill.style.width = `${(finite(hero.stats?.[key], 0) / 10) * 100}%`;
      fill.style.background = hero.body;
      track.append(fill);
      row.append(tag, track);
      stats.append(row);
    }
    info.append(heading, lore, stats);

    const skills = document.createElement("div");
    skills.className = "hero-detail-skills";
    // R and C are class-defining, not shared filler, so a player choosing an
    // archetype sees all six actions. Their unlock levels come from the
    // server's own definitions rather than being restated here.
    const unlockOf = (slot) => {
      const level = Number(hero.server?.skills?.[slot]?.unlockLevel);
      return Number.isFinite(level) && level > 1 ? `${level} 级解锁 · ` : "";
    };
    for (const [keyLabel, name, desc, slot] of [
      ["普攻", hero.primaryName, hero.primaryDesc, null],
      ["Q", hero.q, hero.qDesc, "q"],
      ["E", hero.e, hero.eDesc, "e"],
      ["R", hero.r, hero.rDesc, "r"],
      ["C", hero.c, hero.cDesc, "c"],
      ["F", hero.f, hero.fDesc, "f"],
    ]) {
      if (!name) continue;
      const chip = document.createElement("div");
      chip.className = "hero-skill";
      const head = document.createElement("b");
      head.innerHTML = `<kbd>${keyLabel}</kbd> ${name}`;
      const body = document.createElement("small");
      body.textContent = `${slot ? unlockOf(slot) : ""}${desc}`;
      chip.append(head, body);
      skills.append(chip);
    }

    heroDetail.replaceChildren(portrait, info, skills);
  }

  // Build the seven hero cards on the join screen.
  const archetypeList = document.querySelector("#archetype-list");
  if (archetypeList) {
    archetypeList.replaceChildren(...Object.entries(ARCHETYPES).map(([id, hero]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `archetype${id === state.selectedArchetype ? " is-selected" : ""}`;
      button.setAttribute("role", "radio");
      button.setAttribute("aria-checked", String(id === state.selectedArchetype));
      button.dataset.archetype = id;
      const portrait = document.createElement("img");
      portrait.src = `/assets/heroes/${id}.webp?v=6`;
      portrait.alt = "";
      const copy = document.createElement("span");
      copy.className = "archetype-copy";
      const name = document.createElement("strong");
      name.textContent = hero.label;
      const role = document.createElement("small");
      role.textContent = hero.role;
      copy.append(name, role);
      const trait = document.createElement("span");
      trait.className = "archetype-trait";
      trait.textContent = hero.trait;
      button.append(portrait, copy, trait);
      return button;
    }));
    ui.archetypes = [...archetypeList.querySelectorAll(".archetype")];
  }

  ui.archetypes.forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedArchetype = button.dataset.archetype;
      renderHeroDetail(state.selectedArchetype);
      ui.archetypes.forEach((item) => {
        const selected = item === button;
        item.classList.toggle("is-selected", selected);
        item.setAttribute("aria-checked", String(selected));
      });
    });
  });
  renderHeroDetail(state.selectedArchetype);

  ui.joinForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const name = ui.nameInput.value.trim().replace(/\s+/g, " ");
    if (name.length < 2) {
      ui.joinError.textContent = "呼号至少需要 2 个字符";
      ui.joinError.hidden = false;
      return;
    }
    state.profile = { name: name.slice(0, 16), archetype: state.selectedArchetype };
    if (!readAccountToken(state.profile.name)
      && !preparePendingAccountToken(state.profile.name)) {
      ui.joinError.textContent = "浏览器无法安全保存会话凭据，请允许本站存储后重试";
      ui.joinError.hidden = false;
      return;
    }
    state.pendingRecovery = null;
    state.pendingJoin = true;
    ui.joinButton.disabled = true;
    if (ui.recoverButton) ui.recoverButton.disabled = true;
    if (state.connected) sendJoin();
    else {
      ui.joinError.textContent = "正在等待中继连接";
      ui.joinError.hidden = false;
      if (!state.socket || state.socket.readyState >= WebSocket.CLOSING) connect();
    }
  });

  function requestRecovery() {
    const name = ui.nameInput.value.trim().replace(/\s+/g, " ").slice(0, 16);
    const code = ui.recoveryCode.value.trim();
    if (name.length < 2 || !code) {
      ui.joinError.textContent = "请输入呼号和一次性恢复码";
      ui.joinError.hidden = false;
      return;
    }
    state.profile = { name, archetype: state.selectedArchetype };
    const nextToken = preparePendingAccountToken(name);
    if (!nextToken) {
      ui.joinError.textContent = "浏览器无法安全保存新会话凭据，请允许本站存储后重试";
      ui.joinError.hidden = false;
      return;
    }
    state.pendingJoin = false;
    state.pendingRecovery = { name, code, nextToken };
    ui.joinButton.disabled = true;
    ui.recoverButton.disabled = true;
    if (state.connected) sendRecovery();
    else {
      ui.joinError.textContent = "正在等待中继连接";
      ui.joinError.hidden = false;
      if (!state.socket || state.socket.readyState >= WebSocket.CLOSING) connect();
    }
  }

  ui.recoverButton?.addEventListener("click", requestRecovery);
  ui.recoveryCode?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    requestRecovery();
  });

  ui.statRows.forEach((row) => {
    row.querySelector("button").addEventListener("click", () => {
      send({ type: "allocate", stat: row.dataset.stat });
    });
  });

  document.querySelectorAll("[data-upgrade]").forEach((button) => {
    button.addEventListener("click", () => send({ type: "upgrade", skill: button.dataset.upgrade }));
  });

  ui.abilities.forEach((button) => {
    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      triggerAbility(button.dataset.ability);
    });
  });

  ui.respawnButton.addEventListener("click", () => send({ type: "respawn" }));
  ui.reviveButton?.addEventListener("click", () => send({ type: "revive" }));
  ui.shopGoods?.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-good]");
    if (!button) return;
    send({ type: "buy", shop: button.dataset.shop, good: button.dataset.good });
  });
  ui.socialList?.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-social]");
    if (!button) return;
    const kind = button.dataset.social;
    if (kind === "party-leave") send({ type: "partyLeave" });
    if (kind === "invite") send({ type: "partyInvite", target: button.dataset.target });
    if (kind === "duel") send({ type: "duelInvite", target: button.dataset.target });
    if (kind === "friend-add") send({ type: "friendAdd", name: button.dataset.name });
    if (kind === "friend-remove") send({ type: "friendRemove", name: button.dataset.name });
    state.socialSignature = "";
  });
  ui.rebirthButton?.addEventListener("click", () => send({ type: "rebirth" }));
  ui.dungeonEnterButton?.addEventListener("click", () => send({ type: "dungeonEnter" }));
  ui.dungeonLeaveButton?.addEventListener("click", () => send({ type: "dungeonLeave" }));
  ui.duelForfeitButton?.addEventListener("click", () => send({ type: "duelForfeit" }));
  ui.recoveryIssueButton?.addEventListener("click", () => send({ type: "recoveryIssue" }));
  ui.sessionRotateButton?.addEventListener("click", () => {
    const name = state.profile?.name;
    if (!name) return;
    const nextToken = preparePendingAccountToken(name, true);
    if (!nextToken) {
      pushEvent("浏览器无法安全保存新会话凭据，轮换已取消", true);
      return;
    }
    ui.sessionRotateButton.disabled = true;
    send({ type: "sessionRotate", nextToken });
  });
  ui.leaveButton?.addEventListener("click", () => {
    if (!state.joined) return;
    send({ type: "leave" });
    showCharacterScreen();
  });
  ui.autoEquipButton?.addEventListener("click", () => {
    const local = localPlayer();
    if (!local) return;
    send({ type: "setAutoEquip", enabled: local.autoEquip === false });
  });
  function toggleAutoFight() {
    const local = localPlayer();
    if (!local) return;
    send({ type: "setAuto", enabled: local.autoFight === false });
  }
  ui.autoFightToggle?.addEventListener("click", toggleAutoFight);
  ui.autoLevelToggle?.addEventListener("click", () => {
    const local = localPlayer();
    if (!local) return;
    send({ type: "setAutoLevel", enabled: local.autoLevel === false });
  });
  ui.attuneButton?.addEventListener("click", () => {
    send({ type: "attune", path: ui.attuneButton.dataset.path || "abyss" });
  });
  ui.inventoryList?.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-item]");
    if (!button || !button.dataset.action) return;
    if (button.dataset.action === "refine") {
      // Shift-click spends a ward sigil. Opt-in per attempt: a sigil is scarce
      // (one revival dew) and stage 0 has nothing to insure.
      send({ type: "refine", item: button.dataset.item, useProtection: event.shiftKey === true });
      return;
    }
    send({ type: button.dataset.action, item: button.dataset.item });
  });
  ui.equipmentDoll?.addEventListener("click", (event) => {
    // Refine sits on top of the slot, so it has to win the hit test.
    const refine = event.target.closest('button[data-action="refine"]');
    if (refine) {
      send({ type: "refine", item: refine.dataset.item, useProtection: event.shiftKey === true });
      return;
    }
    const box = event.target.closest("button[data-slot]");
    if (!box) return;
    send({ type: "unequip", slot: box.dataset.slot });
  });

  // HUD panels can be rearranged for different screen sizes and collapsed
  // without changing the underlying game layout. Positions and collapsed
  // state persist in localStorage and are clamped back on-screen whenever
  // the viewport shrinks.
  const HUD_LAYOUT_KEY = "crimson-relay-hud-layout";
  const HUD_LAYOUT_VERSION = 2;
  const mobileLayout = window.matchMedia("(max-width: 760px)");
  const mobileAccordionPanels = new Set([
    "stats-panel",
    "gear-panel",
    "quest-panel",
    "social-panel",
  ]);

  function layoutProfile(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  function loadHudLayouts() {
    try {
      const stored = JSON.parse(localStorage.getItem(HUD_LAYOUT_KEY));
      if (!stored || typeof stored !== "object" || Array.isArray(stored)) {
        return { version: HUD_LAYOUT_VERSION, desktop: {}, mobile: {} };
      }
      if (stored.version === HUD_LAYOUT_VERSION) {
        return {
          version: HUD_LAYOUT_VERSION,
          desktop: layoutProfile(stored.desktop),
          mobile: layoutProfile(stored.mobile),
        };
      }
      // Version 1 was a flat desktop-only panel map. Keep that arrangement
      // while giving mobile its own clean collapse/layout profile.
      return { version: HUD_LAYOUT_VERSION, desktop: stored, mobile: {} };
    } catch (_error) {
      return { version: HUD_LAYOUT_VERSION, desktop: {}, mobile: {} };
    }
  }

  const hudLayouts = loadHudLayouts();

  function currentHudLayout() {
    return mobileLayout.matches ? hudLayouts.mobile : hudLayouts.desktop;
  }

  function saveHudLayouts() {
    try {
      if (Object.keys(hudLayouts.desktop).length === 0
        && Object.keys(hudLayouts.mobile).length === 0) {
        localStorage.removeItem(HUD_LAYOUT_KEY);
      } else {
        localStorage.setItem(HUD_LAYOUT_KEY, JSON.stringify(hudLayouts));
      }
    } catch (_error) {
      // Storage unavailable: layout just resets next reload.
    }
  }

  function panelKey(panel) {
    return panel.id || panel.classList[0];
  }

  function clampPanel(panel) {
    if (!panel.style.left && !panel.style.top) return; // still CSS-anchored
    const hudWidth = ui.hud.clientWidth;
    const hudHeight = ui.hud.clientHeight;
    if (hudWidth <= 0 || hudHeight <= 0) return; // hidden HUD has no usable bounds
    const maxX = Math.max(0, hudWidth - panel.offsetWidth);
    const maxY = Math.max(0, hudHeight - 36);
    panel.style.left = `${clamp(parseFloat(panel.style.left) || 0, 0, maxX)}px`;
    panel.style.top = `${clamp(parseFloat(panel.style.top) || 0, 0, maxY)}px`;
  }

  function setPanelCollapsed(panel, collapsed) {
    panel.classList.toggle("is-collapsed", collapsed);
    const toggle = panel.querySelector("[data-panel-toggle]");
    if (!toggle) return;
    toggle.textContent = collapsed ? "+" : "−";
    toggle.title = collapsed ? "展开窗口" : "折叠窗口";
    toggle.setAttribute("aria-expanded", String(!collapsed));
  }

  function applyStoredPanelState() {
    const profile = currentHudLayout();
    document.querySelectorAll(".hud > aside").forEach((panel) => {
      const key = panelKey(panel);
      const stored = profile[key]?.collapsed;
      const mobileDefault = mobileLayout.matches && mobileAccordionPanels.has(key);
      setPanelCollapsed(panel, stored === undefined ? mobileDefault : Boolean(stored));
    });
  }

  function applyStoredPanelPositions() {
    const profile = currentHudLayout();
    document.querySelectorAll(".hud > aside").forEach((panel) => {
      const stored = profile[panelKey(panel)];
      if (mobileLayout.matches
        || !stored || !Number.isFinite(stored.left) || !Number.isFinite(stored.top)) return;
      panel.style.left = `${stored.left}px`;
      panel.style.top = `${stored.top}px`;
      panel.style.right = "auto";
      panel.style.bottom = "auto";
      clampPanel(panel);
    });
  }

  function clearPanelPositions() {
    document.querySelectorAll(".hud > aside").forEach((panel) => {
      panel.style.left = "";
      panel.style.top = "";
      panel.style.right = "";
      panel.style.bottom = "";
      panel.style.zIndex = "";
    });
  }

  let draggedPanel = null;
  let dragOffsetX = 0;
  let dragOffsetY = 0;
  const handleLayoutModeChange = () => {
    draggedPanel = null;
    clearPanelPositions();
    applyStoredPanelState();
    if (!mobileLayout.matches) applyStoredPanelPositions();
  };
  mobileLayout.addEventListener?.("change", handleLayoutModeChange);

  document.querySelectorAll(".hud > aside").forEach((panel) => {
    const handle = panel.querySelector("[data-drag-handle]");
    const toggle = panel.querySelector("[data-panel-toggle]");
    if (toggle) {
      toggle.addEventListener("click", (event) => {
        event.stopPropagation();
        const collapsed = panel.classList.toggle("is-collapsed");
        setPanelCollapsed(panel, collapsed);
        const profile = currentHudLayout();
        const key = panelKey(panel);
        profile[key] = { ...profile[key], collapsed };
        if (mobileLayout.matches && !collapsed && mobileAccordionPanels.has(key)) {
          document.querySelectorAll(".hud > aside").forEach((otherPanel) => {
            const otherKey = panelKey(otherPanel);
            if (otherKey === key || !mobileAccordionPanels.has(otherKey)) return;
            setPanelCollapsed(otherPanel, true);
            profile[otherKey] = { ...profile[otherKey], collapsed: true };
          });
        }
        saveHudLayouts();
      });
    }
    if (!handle) return;
    handle.addEventListener("pointerdown", (event) => {
      if (mobileLayout.matches) return;
      if (event.target.closest("button")) return;
      const rect = panel.getBoundingClientRect();
      const hudRect = ui.hud.getBoundingClientRect();
      panel.style.left = `${rect.left - hudRect.left}px`;
      panel.style.top = `${rect.top - hudRect.top}px`;
      panel.style.right = "auto";
      panel.style.bottom = "auto";
      panel.style.zIndex = "30";
      draggedPanel = panel;
      dragOffsetX = event.clientX - rect.left;
      dragOffsetY = event.clientY - rect.top;
      handle.setPointerCapture?.(event.pointerId);
      event.preventDefault();
    });
  });
  applyStoredPanelState();
  applyStoredPanelPositions();

  ui.resetHudButton?.addEventListener("click", () => {
    const profile = currentHudLayout();
    for (const key of Object.keys(profile)) delete profile[key];
    saveHudLayouts();
    clearPanelPositions();
    applyStoredPanelState();
  });
  window.addEventListener("pointermove", (event) => {
    if (!draggedPanel) return;
    const hudRect = ui.hud.getBoundingClientRect();
    const maxX = Math.max(0, ui.hud.clientWidth - draggedPanel.offsetWidth);
    const maxY = Math.max(0, ui.hud.clientHeight - 36);
    draggedPanel.style.left = `${clamp(event.clientX - hudRect.left - dragOffsetX, 0, maxX)}px`;
    draggedPanel.style.top = `${clamp(event.clientY - hudRect.top - dragOffsetY, 0, maxY)}px`;
  });
  window.addEventListener("pointerup", () => {
    if (!draggedPanel) return;
    draggedPanel.style.zIndex = "";
    const profile = currentHudLayout();
    profile[panelKey(draggedPanel)] = {
      ...profile[panelKey(draggedPanel)],
      left: parseFloat(draggedPanel.style.left) || 0,
      top: parseFloat(draggedPanel.style.top) || 0,
    };
    saveHudLayouts();
    draggedPanel = null;
  });
  window.addEventListener("resize", () => {
    document.querySelectorAll(".hud > aside").forEach(clampPanel);
  }, { passive: true });

  ui.chatForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    const text = ui.chatInput.value.trim();
    if (!text || !state.joined) return;
    send({ type: "chat", channel: ui.chatChannel.value, text });
    ui.chatInput.value = "";
  });

  window.addEventListener("keydown", (event) => {
    const control = event.target instanceof Element
      ? event.target.closest("input, textarea, select, button, a[href], [contenteditable]:not([contenteditable='false']), [role='button'], [role='textbox'], [role='combobox'], [role='slider']")
      : null;
    if (control) {
      // Esc leaves a focused control and returns keys to the game. All other
      // keys retain their native form/button behavior instead of firing play.
      if (event.code === "Escape" && control instanceof HTMLElement) control.blur();
      return;
    }
    if (event.code === "Enter" && state.joined && ui.chatInput) {
      event.preventDefault();
      ui.chatInput.focus();
      return;
    }
    if (["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "ShiftLeft", "ShiftRight"].includes(event.code)) {
      event.preventDefault();
      state.keys.add(event.code);
    }
    if (!event.repeat && event.code === "KeyQ") triggerAbility("q");
    if (!event.repeat && event.code === "KeyE") triggerAbility("e");
    if (!event.repeat && event.code === "KeyR") triggerAbility("r");
    if (!event.repeat && event.code === "KeyC") triggerAbility("c");
    if (!event.repeat && event.code === "KeyF") triggerAbility("f");
    if (!event.repeat && event.code === "KeyV") {
      const local = localPlayer();
      const potion = (local?.inventory || []).find((item) => Number.isFinite(finite(item.heal, NaN)));
      if (potion) send({ type: "use", item: potion.id });
    }
    if (!event.repeat && event.code === "KeyT") toggleAutoFight();
    if (!event.repeat && event.code === "Space") {
      event.preventDefault();
      triggerAbility("primary");
    }
  });

  window.addEventListener("keyup", (event) => state.keys.delete(event.code));
  window.addEventListener("blur", () => {
    state.keys.clear();
    state.pointer.down = false;
  });
  document.addEventListener("visibilitychange", sendClientState);

  canvas.addEventListener("pointermove", (event) => {
    const rect = canvas.getBoundingClientRect();
    state.pointer.x = event.clientX - rect.left;
    state.pointer.y = event.clientY - rect.top;
    state.pointer.seen = true;
    const world = screenToWorld(state.pointer.x, state.pointer.y);
    state.pointer.worldX = clamp(world.x, 0, state.map.width);
    state.pointer.worldY = clamp(world.y, 0, state.map.height);
  });

  function pickEnemy(screenX, screenY) {
    let best = null;
    let bestDistance = 30;
    for (const enemy of state.enemies.values()) {
      const point = worldToScreen(enemy.x, enemy.y);
      const distance = Math.hypot(point.x - screenX, point.y - screenY - 18);
      if (distance < bestDistance) {
        best = enemy;
        bestDistance = distance;
      }
    }
    return best;
  }

  canvas.addEventListener("pointerdown", (event) => {
    initAudio();
    audioCtx?.resume?.();
    const rect = canvas.getBoundingClientRect();
    const screenX = event.clientX - rect.left;
    const screenY = event.clientY - rect.top;

    if (event.button === 2) {
      // Right click: fire the primary attack toward the cursor.
      triggerAbility("primary");
      return;
    }
    if (event.button !== 0) return;
    canvas.setPointerCapture?.(event.pointerId);
    state.pointer.down = true;

    const enemy = pickEnemy(screenX, screenY);
    if (enemy) {
      state.dragMove = false;
      state.orders.target = String(enemy.id);
      state.orders.moveTo = undefined;
    } else {
      state.dragMove = true;
      const world = screenToWorld(screenX, screenY);
      state.orders.moveTo = {
        x: clamp(world.x, 0, state.map.width),
        y: clamp(world.y, 0, state.map.height),
      };
      state.orders.target = null;
    }
  });

  canvas.addEventListener("pointermove", (event) => {
    // Dragging from a ground click keeps updating the march order.
    if (!state.pointer.down || !state.dragMove) return;
    const rect = canvas.getBoundingClientRect();
    const world = screenToWorld(event.clientX - rect.left, event.clientY - rect.top);
    state.orders.moveTo = {
      x: clamp(world.x, 0, state.map.width),
      y: clamp(world.y, 0, state.map.height),
    };
  });

  canvas.addEventListener("pointerup", (event) => {
    state.pointer.down = false;
    state.dragMove = false;
    canvas.releasePointerCapture?.(event.pointerId);
  });
  canvas.addEventListener("pointercancel", () => {
    state.pointer.down = false;
    state.dragMove = false;
  });
  canvas.addEventListener("contextmenu", (event) => event.preventDefault());
  window.addEventListener("resize", resizeCanvas, { passive: true });

  // The whole art set is ~1.3 MB as WebP, so warm every terrain texture and
  // hero sprite while the player sits on the join screen — no pop-in later.
  function warmAssets() {
    for (const asset of Object.values(ZONE_TEXTURE)) {
      if (zoneTextureImages.has(asset)) continue;
      const image = new Image();
      image.src = `/assets/textures/${asset}.webp?v=6`;
      zoneTextureImages.set(asset, image);
    }
    for (const [key, file] of Object.entries(HERO_SPRITES)) {
      if (heroSpriteImages.has(key)) continue;
      const image = new Image();
      image.src = `/assets/heroes/${file}?v=6`;
      heroSpriteImages.set(key, image);
    }
  }

  resizeCanvas();
  applyProfileToHud();
  updateQuest();
  connect();
  requestAnimationFrame(frame);
  window.setTimeout(warmAssets, 400);

  // Debug affordance: open with #autojoin (optionally #autojoin=heroId) to
  // enter the world automatically (used by headless screenshot checks).
  if (location.hash.includes("autojoin")) {
    const requested = location.hash.split("=")[1];
    if (requested && ARCHETYPES[requested]) {
      state.selectedArchetype = requested;
      renderHeroDetail(requested);
      ui.archetypes.forEach((item) => {
        item.classList.toggle("is-selected", item.dataset.archetype === requested);
      });
    }
    window.setTimeout(() => ui.joinForm.requestSubmit(), 1200);
  }
})();
