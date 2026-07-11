(() => {
  "use strict";

  const canvas = document.querySelector("#game-canvas");
  const ctx = canvas.getContext("2d", { alpha: false });
  const ui = {
    joinPanel: document.querySelector("#join-panel"),
    joinForm: document.querySelector("#join-form"),
    joinButton: document.querySelector("#join-button"),
    joinError: document.querySelector("#join-error"),
    nameInput: document.querySelector("#operator-name"),
    archetypes: [...document.querySelectorAll(".archetype")],
    hud: document.querySelector("#hud"),
    connection: document.querySelector("#connection"),
    sector: document.querySelector("#sector-label"),
    population: document.querySelector("#population"),
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
    skillQLevel: document.querySelector("#skill-q-level"),
    skillELevel: document.querySelector("#skill-e-level"),
    skillUpgrades: document.querySelector("#skill-upgrades"),
    skillPoints: document.querySelector("#skill-points"),
    eventFeed: document.querySelector("#event-feed"),
    deathPanel: document.querySelector("#death-panel"),
    respawnTimer: document.querySelector("#respawn-timer"),
    respawnButton: document.querySelector("#respawn-button"),
    rebirthButton: document.querySelector("#rebirth-button"),
    bagCount: document.querySelector("#bag-count"),
    equipmentList: document.querySelector("#equipment-list"),
    inventoryList: document.querySelector("#inventory-list"),
    abilities: [...document.querySelectorAll(".ability")],
  };

  const ARCHETYPES = {
    vanguard: {
      label: "先锋",
      sigil: "V",
      body: "#d74d5e",
      accent: "#f0c15e",
      q: "震荡环",
      e: "壁垒冲锋",
    },
    channeler: {
      label: "谐振者",
      sigil: "C",
      body: "#52c9bd",
      accent: "#83d4ff",
      q: "中继爆发",
      e: "相位结界",
    },
    strider: {
      label: "游击者",
      sigil: "S",
      body: "#e2a64f",
      accent: "#e86969",
      q: "裂光飞刃",
      e: "相位疾步",
    },
  };

  const STAT_LABELS = {
    power: "力量",
    agility: "敏捷",
    spirit: "精神",
    vitality: "体魄",
  };

  const RARITY_INFO = {
    common: { label: "普通", prefix: "", color: "#c3cbcd" },
    fine: { label: "精制", prefix: "精制·", color: "#79d99b" },
    rare: { label: "谐振", prefix: "谐振·", color: "#63aef0" },
    epic: { label: "赤月", prefix: "赤月·", color: "#e0596d" },
  };

  const ITEM_NAMES = {
    "Pulse Edge": "脉冲刃",
    "Starrift Bow": "裂星弓",
    "Resonant Staff": "谐振杖",
    "Weave Plate": "织钢甲",
    "Phase Guard": "相位护盾",
    "Moonthread Robe": "月纹罩袍",
    "Crimson Locket": "赤月坠饰",
    "Echo Ring": "回响指环",
    "Stardust Sigil": "星屑护符",
  };

  const SLOT_LABELS = { weapon: "武器", armor: "护甲", charm: "饰品" };

  // Original pixel-figure looks for each archetype (skin/hair/outfit palettes).
  const CLASS_LOOKS = {
    vanguard: {
      skin: "#e9b98d", hair: "#43302a", torso: "#b6404e", torsoShade: "#8e3140",
      legs: "#2c3138", accent: "#f0c15e", defaultWeapon: "blade", weaponColor: "#ccd5da",
    },
    channeler: {
      skin: "#ecc79d", hair: "#2b4a46", torso: "#2f7d74", torsoShade: "#25635c",
      legs: "#233a37", accent: "#83d4ff", robe: true, hood: true,
      defaultWeapon: "staff", weaponColor: "#69e0cf",
    },
    strider: {
      skin: "#e5b287", hair: "#c9873f", torso: "#a3742f", torsoShade: "#7f5a24",
      legs: "#3c3830", accent: "#e86969", defaultWeapon: "bow", weaponColor: "#caa25c",
    },
  };

  const WEAPON_SHAPES = {
    "Pulse Edge": "blade",
    "Starrift Bow": "bow",
    "Resonant Staff": "staff",
  };

  function rarityInfo(rarity) {
    return RARITY_INFO[String(rarity || "common").toLowerCase()] || RARITY_INFO.common;
  }

  function itemLabel(item) {
    const base = ITEM_NAMES[item.name] || String(item.name || "未知装备");
    return `${rarityInfo(item.rarity).prefix}${base}`;
  }

  function itemTooltip(item) {
    const parts = [];
    const bonuses = item.bonuses && typeof item.bonuses === "object" ? item.bonuses : {};
    for (const [key, label] of Object.entries(STAT_LABELS)) {
      const value = finite(bonuses[key], 0);
      if (value > 0) parts.push(`${label}+${value}`);
    }
    if (finite(item.damageBonus, 0) > 0) parts.push(`伤害+${Math.round(item.damageBonus * 100)}%`);
    if (finite(item.hpBonus, 0) > 0) parts.push(`生命+${item.hpBonus}`);
    if (finite(item.speedBonus, 0) > 0) parts.push(`移速+${item.speedBonus}`);
    return parts.join(" ") || "无加成";
  }

  const state = {
    socket: null,
    reconnectTimer: 0,
    reconnectAttempt: 0,
    connected: false,
    joined: false,
    pendingJoin: false,
    selectedArchetype: "vanguard",
    profile: null,
    id: null,
    tick: 0,
    map: { width: 1600, height: 900, name: "灰港中继站" },
    players: new Map(),
    enemies: new Map(),
    projectiles: new Map(),
    drops: new Map(),
    gearSignature: "",
    effects: [],
    quest: null,
    camera: { x: 800, y: 450 },
    pointer: { x: 0, y: 0, worldX: 800, worldY: 450, down: false, seen: false },
    keys: new Set(),
    pulses: { q: false, e: false, primary: false },
    orders: { moveTo: undefined, target: undefined },
    dragMove: false,
    rebirthLevel: 10,
    inputSeq: 0,
    lastInput: 0,
    lastFrame: performance.now(),
    dpr: 1,
    viewWidth: innerWidth,
    viewHeight: innerHeight,
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

    try {
      state.socket = new WebSocket(url);
    } catch (_error) {
      scheduleReconnect();
      return;
    }

    state.socket.addEventListener("open", () => {
      state.connected = true;
      state.reconnectAttempt = 0;
      setConnection("online", "在线");
      ui.joinError.hidden = true;
      if (state.pendingJoin && state.profile) sendJoin();
    });

    state.socket.addEventListener("message", (event) => {
      let message;
      try {
        message = JSON.parse(event.data);
      } catch (_error) {
        return;
      }
      if (message && typeof message === "object") handleMessage(message);
    });

    state.socket.addEventListener("close", () => {
      state.connected = false;
      if (state.joined && state.profile) state.pendingJoin = true;
      setConnection("offline", "连接中断");
      scheduleReconnect();
    });

    state.socket.addEventListener("error", () => {
      state.socket?.close();
    });
  }

  function scheduleReconnect() {
    clearTimeout(state.reconnectTimer);
    const delay = Math.min(8000, 700 * 2 ** state.reconnectAttempt);
    state.reconnectAttempt += 1;
    state.reconnectTimer = window.setTimeout(connect, delay);
  }

  function send(payload) {
    if (state.socket?.readyState !== WebSocket.OPEN) return false;
    state.socket.send(JSON.stringify(payload));
    return true;
  }

  function sendJoin() {
    if (!state.profile || !send({ type: "join", ...state.profile })) return;
    state.pendingJoin = false;
    applyProfileToHud();
  }

  function applyProfileToHud() {
    if (!state.profile) return;
    const archetype = ARCHETYPES[state.profile.archetype] || ARCHETYPES.vanguard;
    ui.name.textContent = state.profile.name.toUpperCase();
    ui.className.textContent = archetype.label;
    ui.sigil.textContent = archetype.sigil;
    ui.skillQ.textContent = archetype.q;
    ui.skillE.textContent = archetype.e;
  }

  function handleMessage(message) {
    const type = String(message.type || "").toLowerCase();
    if (type === "welcome") {
      state.id = String(first(message.id, message.playerId, message.clientId, state.id, ""));
      applyMap(first(message.map, message.world));
      const rebirthLevel = finite(message.rebirthLevel, NaN);
      if (Number.isFinite(rebirthLevel) && rebirthLevel > 0) state.rebirthLevel = rebirthLevel;
      if (message.archetypes && typeof message.archetypes === "object") {
        mergeArchetypes(message.archetypes);
      }
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

  function mergeArchetypes(definitions) {
    for (const [key, definition] of Object.entries(definitions)) {
      if (!ARCHETYPES[key] || !definition || typeof definition !== "object") continue;
      ARCHETYPES[key] = { ...ARCHETYPES[key], server: definition };
    }
  }

  function applyMap(map) {
    if (!map || typeof map !== "object") return;
    state.map.width = clamp(first(map.width, map.w, state.map.width), 8, 8192);
    state.map.height = clamp(first(map.height, map.h, state.map.height), 8, 8192);
    state.map.name = String(first(map.name, map.label, state.map.name));
    if (map.safeZone !== undefined) {
      const zone = map.safeZone;
      state.map.safeZone = zone && Number.isFinite(zone.x) && Number.isFinite(zone.y) && Number.isFinite(zone.radius)
        ? { x: zone.x, y: zone.y, radius: zone.radius }
        : null;
    }
    ui.sector.textContent = `节点 // ${state.map.name}`;
  }

  function applySnapshot(snapshot) {
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
    if (local && !state.joined) {
      state.joined = true;
      ui.joinPanel.hidden = true;
      ui.hud.hidden = false;
      ui.joinButton.disabled = false;
    }
    const quest = first(snapshot.quest, world.quest, local?.quest);
    if (quest) state.quest = quest;
    updateHud(local);

    ui.population.textContent = `${state.players.size} 在线`;
    ui.population.hidden = false;
  }

  function updateEntities(store, collection, kind) {
    const seen = new Set();
    asList(collection).forEach((raw, index) => {
      if (!raw || typeof raw !== "object") return;
      const id = String(first(raw.id, raw.playerId, raw.entityId, `${kind}-${index}`));
      seen.add(id);
      const prior = store.get(id);
      const nextX = finite(first(raw.x, raw.position?.x), prior?.targetX ?? state.camera.x);
      const nextY = finite(first(raw.y, raw.position?.y), prior?.targetY ?? state.camera.y);
      store.set(id, {
        ...(prior || {}),
        ...raw,
        id,
        kind,
        x: prior ? prior.x : nextX,
        y: prior ? prior.y : nextY,
        targetX: nextX,
        targetY: nextY,
        receivedAt: performance.now(),
      });
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
    const rawEnergy = first(player.energy, player.mana, player.resource);
    const rawMaxEnergy = first(player.maxEnergy, player.maxMana, player.maxResource);
    const energy = finite(rawEnergy, 0);
    const maxEnergy = Math.max(1, finite(rawMaxEnergy, 1));
    const xp = finite(first(player.xp, player.experience), 0);
    const xpMax = Math.max(1, finite(first(player.xpToNext, player.nextLevelXp, player.maxXp), 100));
    const level = Math.max(1, Math.floor(finite(player.level, 1)));

    const rebirths = Math.max(0, Math.floor(finite(player.rebirths, 0)));
    ui.name.textContent = String(first(player.name, state.profile?.name, "RELAY-07")).toUpperCase();
    ui.className.textContent = archetype.label;
    ui.sigil.textContent = archetype.sigil;
    ui.level.textContent = `L${String(level).padStart(2, "0")}${rebirths > 0 ? ` ★${rebirths}` : ""}`;
    if (ui.rebirthButton) {
      ui.rebirthButton.hidden = level < state.rebirthLevel;
      ui.rebirthButton.textContent = rebirths > 0 ? `转生 ★${rebirths + 1}` : "转生";
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
    const statPoints = Math.max(0, Math.floor(finite(first(player.statPoints, player.attributePoints, player.points), 0)));
    ui.statPoints.textContent = `${statPoints} 点`;
    for (const row of ui.statRows) {
      const key = row.dataset.stat;
      row.querySelector(".stat-value").textContent = Math.floor(finite(stats[key], 0));
      row.querySelector(".allocate-button").disabled = statPoints < 1;
    }

    const skills = player.skills && typeof player.skills === "object" ? player.skills : {};
    const q = skills.q || skills.Q || {};
    const e = skills.e || skills.E || {};
    const qLevel = Math.max(1, Math.floor(finite(first(q.level, player.qLevel), 1)));
    const eLevel = Math.max(1, Math.floor(finite(first(e.level, player.eLevel), 1)));
    ui.skillQ.textContent = archetype.q;
    ui.skillE.textContent = archetype.e;
    ui.skillQLevel.textContent = roman(qLevel);
    ui.skillELevel.textContent = roman(eLevel);
    const skillPoints = Math.max(0, Math.floor(finite(first(player.skillPoints, skills.points), 0)));
    ui.skillPoints.textContent = `${skillPoints} 技能点`;
    ui.skillUpgrades.hidden = skillPoints < 1;
    updateAbilityCooldown("q", q);
    updateAbilityCooldown("e", e);

    updateQuest();
    updateGear(player);
    const alive = first(player.alive, !player.dead, hp > 0);
    ui.deathPanel.hidden = Boolean(alive);
    if (!alive) updateRespawn(player);
  }

  function updateGear(player) {
    if (!ui.equipmentList || !ui.inventoryList) return;
    const equipment = player.equipment && typeof player.equipment === "object" ? player.equipment : {};
    const inventory = Array.isArray(player.inventory) ? player.inventory : [];
    const signature = JSON.stringify([
      Object.entries(SLOT_LABELS).map(([slot]) => equipment[slot]?.id ?? null),
      inventory.map((item) => item.id),
    ]);
    if (signature === state.gearSignature) return;
    state.gearSignature = signature;

    ui.bagCount.textContent = `${inventory.length}/12`;
    ui.equipmentList.replaceChildren(...Object.entries(SLOT_LABELS).map(([slot, label]) => {
      const row = document.createElement("div");
      row.className = "gear-row";
      const item = equipment[slot];
      const name = document.createElement("b");
      if (item) {
        name.textContent = itemLabel(item);
        name.style.color = rarityInfo(item.rarity).color;
        row.title = itemTooltip(item);
      } else {
        name.textContent = "—";
        name.style.color = "rgba(255,255,255,0.28)";
      }
      const slotLabel = document.createElement("span");
      slotLabel.textContent = label;
      row.append(slotLabel, name);
      return row;
    }));

    ui.inventoryList.replaceChildren(...inventory.map((item) => {
      const row = document.createElement("div");
      row.className = "gear-row";
      row.title = itemTooltip(item);
      const name = document.createElement("b");
      name.textContent = itemLabel(item);
      name.style.color = rarityInfo(item.rarity).color;
      const equipButton = document.createElement("button");
      equipButton.type = "button";
      equipButton.textContent = "装";
      equipButton.title = "装备";
      equipButton.dataset.action = "equip";
      equipButton.dataset.item = String(item.id);
      const discardButton = document.createElement("button");
      discardButton.type = "button";
      discardButton.textContent = "弃";
      discardButton.title = "丢弃";
      discardButton.dataset.action = "discard";
      discardButton.dataset.item = String(item.id);
      row.append(name, equipButton, discardButton);
      return row;
    }));
  }

  function updateQuest() {
    const quest = state.quest;
    if (!quest || typeof quest !== "object") return;
    const current = Math.max(0, finite(first(quest.current, quest.progress, quest.count), 0));
    const target = Math.max(1, finite(first(quest.target, quest.required, quest.total), 1));
    const isFringeQuest = quest.id === "stabilize-the-fringe";
    ui.questTitle.textContent = isFringeQuest ? "稳定边缘区" : String(first(quest.title, quest.name, "守住中继站"));
    ui.questSummary.textContent = isFringeQuest ? "清除裂隙体" : String(first(quest.summary, quest.description, quest.objective, "清除入侵单位"));
    ui.questCurrent.textContent = Math.floor(current);
    ui.questTarget.textContent = Math.floor(target);
    ui.questFill.style.width = `${ratio(current, target) * 100}%`;
  }

  function updateRespawn(player) {
    const remaining = Math.max(0, Math.ceil(finite(first(player.respawnIn, player.respawnTimer), 0)));
    ui.respawnTimer.textContent = remaining > 0 ? `信号恢复 ${remaining} 秒` : "信号可以重连";
    ui.respawnButton.disabled = remaining > 0;
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
    };
    if (eventName === "skillused" || eventName === "itemdiscarded") return;
    if (eventName === "lootdropped") {
      // Ground sparkle is enough; only announce rare finds.
      const info = rarityInfo(event.rarity);
      if (event.rarity === "rare" || event.rarity === "epic") {
        pushEvent(`${info.label}装备掉落 // ${itemLabel(event)}`);
      }
      return;
    }
    if (eventName === "lootpickedup") {
      pushEvent(`拾取 ${itemLabel(event)}`);
      return;
    }
    if (eventName === "itemequipped") {
      pushEvent(`已装备 ${itemLabel(event)}`);
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
      NO_STAT_POINTS: "没有可用属性点",
      NO_SKILL_POINTS: "没有可用技能点",
      RESPAWN_NOT_READY: "信号尚未恢复",
      RESPAWN_PENDING: "信号尚未恢复",
      REBIRTH_LEVEL_TOO_LOW: "等级不足，无法转生",
      PLAYER_DEAD: "阵亡状态下无法执行该操作",
      INVALID_ITEM: "背包中没有该装备",
      INVENTORY_FULL: "背包已满",
    };
    const message = String(first(translated[error.code], error.message, error.error, "中继请求失败"));
    pushEvent(message, true);
    if (!state.joined) {
      ui.joinError.textContent = message;
      ui.joinError.hidden = false;
      ui.joinButton.disabled = false;
    }
    if (error.requestType === "join") {
      state.joined = false;
      state.pendingJoin = false;
      ui.joinPanel.hidden = false;
      ui.hud.hidden = true;
      ui.joinButton.disabled = false;
    }
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
  }

  const TILE_W = 76;
  const TILE_H = 38;
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

  function drawDiamond(x, y, width, height, fill, stroke) {
    ctx.beginPath();
    ctx.moveTo(x, y - height * 0.5);
    ctx.lineTo(x + width * 0.5, y);
    ctx.lineTo(x, y + height * 0.5);
    ctx.lineTo(x - width * 0.5, y);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.stroke();
    }
  }

  function drawWorld(time) {
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    ctx.fillStyle = "#0b0f13";
    ctx.fillRect(0, 0, state.viewWidth, state.viewHeight);

    drawAtmosphere(time);
    drawTiles(time);
    drawObjects(time);
    drawCursor(time);
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

  function drawTiles(time) {
    const radiusX = Math.ceil(state.viewWidth / TILE_W) + 5;
    const radiusY = Math.ceil(state.viewHeight / TILE_H) + 7;
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
        if (point.x < -TILE_W || point.x > state.viewWidth + TILE_W || point.y < -TILE_H || point.y > state.viewHeight + TILE_H) continue;
        const noise = tileHash(x, y);
        const zone = state.map.safeZone;
        const worldX = (x + 0.5) * WORLD_CELL;
        const worldY = (y + 0.5) * WORLD_CELL;
        const inSafeZone = zone
          && (worldX - zone.x) ** 2 + (worldY - zone.y) ** 2 <= zone.radius * zone.radius;
        let fill;
        if (inSafeZone) {
          fill = noise > 0.6 ? "#33282b" : "#2e2427";
        } else {
          fill = noise > 0.77 ? "#2b2426" : noise > 0.37 ? "#272124" : "#231e21";
          if ((x + y) % 11 === 0) fill = "#2d2527";
        }
        drawDiamond(
          point.x,
          point.y,
          TILE_W - 1,
          TILE_H - 1,
          fill,
          inSafeZone ? "rgba(226, 168, 122, 0.2)" : "rgba(167, 143, 148, 0.12)",
        );

        if ((x === 2 || x === tileMapWidth - 3) && y % 5 < 2) drawRelayLine(point, time, x + y);
        if (!inSafeZone && noise > 0.965) drawCrystal(point.x, point.y - 4, noise, time);
        else if (!inSafeZone && noise > 0.93) drawDebris(point.x, point.y, noise);
      }
    }
    drawSafeZoneRing(time);
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

  function drawRelayLine(point, time, seed) {
    ctx.save();
    ctx.globalAlpha = 0.45 + Math.sin(time * 0.003 + seed) * 0.18;
    ctx.strokeStyle = "#bf394a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(point.x - 22, point.y);
    ctx.lineTo(point.x, point.y + 10);
    ctx.lineTo(point.x + 22, point.y);
    ctx.stroke();
    ctx.restore();
  }

  function drawCrystal(x, y, seed, time) {
    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha = 0.64 + Math.sin(time * 0.002 + seed * 8) * 0.12;
    ctx.shadowColor = "#4dd1c0";
    ctx.shadowBlur = 12;
    ctx.fillStyle = "#4da79f";
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
    if (drop.rarity === "epic" || drop.rarity === "rare") {
      // Rare finds throw a short light pillar so they read from far away.
      const beam = ctx.createLinearGradient(point.x, point.y - 46, point.x, point.y);
      beam.addColorStop(0, "rgba(0,0,0,0)");
      beam.addColorStop(1, info.color + "66");
      ctx.fillStyle = beam;
      ctx.fillRect(point.x - 3, point.y - 46, 6, 44);
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

    // Walk cycle driven by how far the interpolated sprite actually moved.
    const moved = Math.hypot(player.x - (player.lastDrawX ?? player.x), player.y - (player.lastDrawY ?? player.y));
    player.lastDrawX = player.x;
    player.lastDrawY = player.y;
    player.walkPhase = (player.walkPhase || 0) + Math.min(moved, 7) * 0.24;
    const legSwing = moved > 0.08 ? Math.sin(player.walkPhase) * 3 : 0;
    const facing = player.facing && Number.isFinite(player.facing.x) ? player.facing : { x: 1, y: 0 };
    const flip = (facing.x - facing.y) < -0.001;

    ctx.save();
    ctx.translate(point.x, point.y);
    ctx.fillStyle = "rgba(0, 0, 0, 0.43)";
    ctx.beginPath();
    ctx.ellipse(0, 3, 17, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    if (isSelf) {
      ctx.strokeStyle = "rgba(84, 211, 194, 0.75)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, 2, 22, 10, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.translate(0, bob - 12);
    if (flip) ctx.scale(-1, 1);
    drawHumanoid(key, player, legSwing, time);
    ctx.restore();

    drawEntityLabel(point.x, point.y - 64 + bob, String(first(player.name, "操作员")), player, isSelf ? archetype.accent : "#d7dddb");
  }

  function drawHumanoid(key, player, legSwing, time) {
    const look = CLASS_LOOKS[key] || CLASS_LOOKS.vanguard;
    const gear = player.equipment && typeof player.equipment === "object" ? player.equipment : {};
    const weaponShape = gear.weapon
      ? WEAPON_SHAPES[gear.weapon.name] || look.defaultWeapon
      : look.defaultWeapon;
    const weaponColor = gear.weapon ? rarityInfo(gear.weapon.rarity).color : look.weaponColor;
    const armorColor = gear.armor ? rarityInfo(gear.armor.rarity).color : null;

    // Back arm.
    ctx.fillStyle = look.skin;
    ctx.fillRect(-9, -7, 3, 9);

    // Legs and boots, swinging while walking.
    ctx.fillStyle = look.legs;
    ctx.fillRect(-6, 3, 4, 11 + legSwing);
    ctx.fillRect(2, 3, 4, 11 - legSwing);
    ctx.fillStyle = "#191418";
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
    } else {
      ctx.fillRect(-5, -22, 11, 5);
      ctx.fillRect(-5, -19, 3, 5);
    }
    ctx.fillStyle = "#1c1518";
    ctx.fillRect(2, -15, 2, 2);

    drawHeldWeapon(weaponShape, weaponColor, look.accent);

    // Equipped charm floats behind the shoulder as a glowing mote.
    if (gear.charm) {
      const charmColor = rarityInfo(gear.charm.rarity).color;
      ctx.save();
      ctx.fillStyle = charmColor;
      ctx.shadowColor = charmColor;
      ctx.shadowBlur = 9;
      ctx.beginPath();
      ctx.arc(-12, -21 + Math.sin(time * 0.005) * 2, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
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
    const species = String(first(enemy.type, "riftling")).toLowerCase();
    ctx.save();
    ctx.translate(point.x, point.y);
    ctx.fillStyle = "rgba(0, 0, 0, 0.48)";
    ctx.beginPath();
    ctx.ellipse(0, 2, species.includes("ashwing") ? 11 : 15, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    if (species.includes("duskfang")) {
      ctx.translate(0, -9);
      ctx.scale(pulse, pulse);
      drawDuskfang(time, enemy);
    } else if (species.includes("ashwing")) {
      ctx.translate(0, -26 + Math.sin(time * 0.005 + finite(enemy.x)) * 3);
      ctx.scale(pulse, pulse);
      drawAshwing(time);
    } else {
      ctx.translate(0, -11);
      ctx.scale(pulse, pulse);
      drawRiftling(time, enemy);
    }
    ctx.restore();
    const rawName = String(first(enemy.name, enemy.type, "裂隙体"));
    const localizedName = /riftling/i.test(rawName)
      ? "裂隙体"
      : /duskfang/i.test(rawName)
        ? "暮牙兽"
        : /ashwing/i.test(rawName)
          ? "烬翼"
          : rawName;
    const label = enemy.level > 1 ? `${localizedName} Lv${Math.floor(finite(enemy.level, 1))}` : localizedName;
    drawEntityLabel(point.x, point.y - 54, label, enemy, "#f18a95");
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

  function drawEntityLabel(x, y, name, entity, color) {
    const hp = finite(first(entity.hp, entity.health), 1);
    const maxHp = Math.max(1, finite(first(entity.maxHp, entity.maxHealth), 1));
    ctx.save();
    ctx.font = "600 10px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(0, 0, 0, 0.58)";
    ctx.fillRect(x - 33, y - 12, 66, 18);
    ctx.fillStyle = color;
    ctx.fillText(name.slice(0, 18), x, y - 2);
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.fillRect(x - 29, y + 2, 58, 2);
    ctx.fillStyle = entity.kind === "enemy" ? "#df4658" : "#54cbbd";
    ctx.fillRect(x - 29, y + 2, 58 * ratio(hp, maxHp), 2);
    ctx.restore();
  }

  function drawProjectile(projectile, time) {
    const point = worldToScreen(projectile.x, projectile.y, finite(projectile.z, 18));
    const color = String(first(projectile.color, projectile.team === "enemy" ? "#ef5365" : "#65e1d0"));
    ctx.save();
    ctx.translate(point.x, point.y);
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 16;
    ctx.rotate(time * 0.008 + finite(projectile.x));
    ctx.fillRect(-4, -4, 8, 8);
    ctx.restore();
  }

  function drawEffects(time) {
    state.effects = state.effects.filter((effect) => time - effect.born < effect.duration);
    for (const effect of state.effects) {
      const progress = clamp((time - effect.born) / effect.duration, 0, 1);
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

  function interpolateEntities(delta) {
    const factor = 1 - Math.exp(-delta * 0.014);
    for (const store of [state.players, state.enemies, state.projectiles, state.drops]) {
      for (const entity of store.values()) {
        entity.x += (entity.targetX - entity.x) * factor;
        entity.y += (entity.targetY - entity.y) * factor;
      }
    }
    const local = localPlayer();
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
      // moveTo/target are only present when a new order was clicked;
      // JSON.stringify drops undefined fields and the server keeps prior orders.
      moveTo: state.orders.moveTo,
      target: state.orders.target,
      primary: state.pulses.primary,
      q: state.pulses.q,
      e: state.pulses.e,
    });
    state.orders.moveTo = undefined;
    state.orders.target = undefined;
    state.pulses.primary = false;
    state.pulses.q = false;
    state.pulses.e = false;
  }

  function frame(time) {
    const delta = Math.min(50, time - state.lastFrame);
    state.lastFrame = time;
    interpolateEntities(delta);
    sendInput(time);
    drawWorld(time);
    requestAnimationFrame(frame);
  }

  function triggerAbility(ability) {
    if (!state.joined) return;
    const button = ui.abilities.find((item) => item.dataset.ability === ability);
    if (button?.classList.contains("is-cooling")) return;
    if (ability === "primary") state.pulses.primary = true;
    else state.pulses[ability] = true;
    if (button) {
      button.classList.remove("is-active");
      void button.offsetWidth;
      button.classList.add("is-active");
      window.setTimeout(() => button.classList.remove("is-active"), 140);
    }
  }

  ui.archetypes.forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedArchetype = button.dataset.archetype;
      ui.archetypes.forEach((item) => {
        const selected = item === button;
        item.classList.toggle("is-selected", selected);
        item.setAttribute("aria-checked", String(selected));
      });
    });
  });

  ui.joinForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const name = ui.nameInput.value.trim().replace(/\s+/g, " ");
    if (name.length < 2) {
      ui.joinError.textContent = "呼号至少需要 2 个字符";
      ui.joinError.hidden = false;
      return;
    }
    state.profile = { name: name.slice(0, 16), archetype: state.selectedArchetype };
    state.pendingJoin = true;
    ui.joinButton.disabled = true;
    if (state.connected) sendJoin();
    else {
      ui.joinError.textContent = "正在等待中继连接";
      ui.joinError.hidden = false;
      if (!state.socket || state.socket.readyState >= WebSocket.CLOSING) connect();
    }
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
  ui.rebirthButton?.addEventListener("click", () => send({ type: "rebirth" }));
  ui.inventoryList?.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-item]");
    if (!button) return;
    send({ type: button.dataset.action, item: button.dataset.item });
  });

  window.addEventListener("keydown", (event) => {
    if (event.target instanceof HTMLInputElement) return;
    if (["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.code)) {
      event.preventDefault();
      state.keys.add(event.code);
    }
    if (!event.repeat && event.code === "KeyQ") triggerAbility("q");
    if (!event.repeat && event.code === "KeyE") triggerAbility("e");
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

  resizeCanvas();
  applyProfileToHud();
  updateQuest();
  connect();
  requestAnimationFrame(frame);
})();
