extends Node2D
# Native client for CRIMSON RELAY (protocol v2), isometric edition.
#
# Server state is authoritative; this client renders snapshots and forwards
# intents. The isometric projection matches the browser client
# (sx = wx - wy, sy = (wx + wy) / 2), art streams over HTTP from the game
# server (WebP), and snapshots arrive as binary1 frames (negotiated via the
# join codec field; see src/server/codec.js for the layout). The protocol
# contract lives in src/server/protocol.js.

# Override with CRIMSON_SERVER=ws://host:port/ws (no code edit needed).
var server_url := "ws://127.0.0.1:3000/ws"
const CLIENT_PROTOCOL := 2
const SNAPSHOT_CODEC := "binary1"
const INPUT_INTERVAL := 0.05          # 20 Hz, same as the browser client
const LERP_RATE := 14.0               # snapshot smoothing, ~browser feel
const RECONNECT_DELAY := 3.0
const TOKEN_FILE := "user://session.cfg"
const HERO_SIZE := Vector2(58, 84)    # browser world-sprite footprint
const GROUND_REPEAT := 512.0          # texture repeat in world units
const BINARY_MAGIC := 0xB1

# theme -> terrain texture asset (mirrors ZONE_TEXTURE in public/data.js;
# themes without a texture render the flat base colour only).
const ZONE_TEXTURE := {
	"residential": "residential", "downtown": "downtown", "mountain": "mountain",
	"scrapyard": "scrapyard", "desert": "desert", "snow": "snow",
	"castle": "castle", "spaceport": "spaceport", "skycity": "skycity",
}

# Base ground colours per theme (the darker end of BIOME_RAMPS in data.js).
const THEME_COLORS := {
	"town": Color("3d312c"), "grass": Color("24401f"), "mountain": Color("2e3540"),
	"scrapyard": Color("3a2b1f"), "spaceport": Color("232a3c"), "wastes": Color("33222b"),
	"residential": Color("3d312c"), "downtown": Color("2b2233"), "desert": Color("4a3b26"),
	"snow": Color("2e3844"), "castle": Color("2c2733"), "skycity": Color("1f2a3c"),
}

const RARITY_COLORS := {
	"common": Color(0.72, 0.72, 0.66), "fine": Color(0.45, 0.78, 0.5),
	"rare": Color(0.42, 0.62, 0.9), "epic": Color(0.85, 0.4, 0.45),
	"relic": Color(0.92, 0.78, 0.35),
}

# Terrain colour ramps, both ends (mirrors BIOME_RAMPS in public/data.js);
# ground tiles blend between them on value noise like the browser client.
const BIOME_RAMPS := {
	"town": ["3d312c", "4c3d35"], "grass": ["24401f", "3f6132"],
	"mountain": ["2e3540", "4d5868"], "scrapyard": ["3a2b1f", "5c4433"],
	"spaceport": ["232a3c", "3c4763"], "wastes": ["33222b", "502f3e"],
	"lake": ["1c3a50", "2e5f7d"], "residential": ["3a332e", "544a3e"],
	"downtown": ["26242e", "403c50"], "desert": ["5c4a2e", "8a7048"],
	"snow": ["5a6878", "93a7b8"], "castle": ["3a363c", "5a5460"],
	"skycity": ["33415e", "57698f"],
}

const ZONE_LABELS := {
	"town": "城镇", "grass": "草原", "grassland": "草原", "mountain": "后山",
	"backhill": "后山", "scrapyard": "废车场", "spaceport": "宇宙船",
	"starship": "宇宙船", "wastes": "水晶荒原", "residential": "住宅区",
	"downtown": "闹区", "desert": "沙漠", "snowmountain": "雪山", "snow": "雪山",
	"castle": "城堡", "skycity": "天空之城", "lake": "湖泊",
}

const WORLD_CELL := 48.0              # ground tile edge in world units
const MOTE_COUNT := 30

# One body colour per species; the silhouettes live in _draw_enemy.
const SPECIES_COLORS := {
	"riftling": Color(0.74, 0.3, 0.35), "duskfang": Color(0.56, 0.36, 0.3),
	"ashwing": Color(0.62, 0.46, 0.4), "thorncrawler": Color(0.46, 0.52, 0.34),
	"stonehorn": Color(0.56, 0.5, 0.44), "frostseer": Color(0.52, 0.66, 0.8),
	"scraphulk": Color(0.52, 0.42, 0.3), "stormeye": Color(0.56, 0.52, 0.76),
	"voidmaw": Color(0.42, 0.3, 0.52),
}

# Attack-style tell colours under each mob (mirrors the browser's rings).
const ATTACK_COLORS := {
	"claw": Color(0.9, 0.35, 0.4), "bite": Color(0.95, 0.55, 0.3),
	"ember": Color(1.0, 0.5, 0.2), "spike": Color(0.6, 0.8, 0.4),
	"charge": Color(0.75, 0.6, 0.4), "frost": Color(0.5, 0.8, 1.0),
	"slam": Color(0.7, 0.7, 0.72), "lightning": Color(0.75, 0.6, 1.0),
	"void": Color(0.7, 0.4, 0.95),
}

const SKILL_SLOTS := [["primary", "M1"], ["q", "Q"], ["e", "E"], ["r", "R"], ["c", "C"], ["f", "F"]]

var socket := WebSocketPeer.new()
var socket_active := false
var reconnect_timer := 0.0
var joined := false
var self_id := ""
var world_size := Vector2(4800, 2700)
var safe_zone := {}                   # {x, y, radius} or empty
var portals: Array = []
var map_name := ""
var map_theme := "town"
var online_count := 0
var archetype_meta := {}              # welcome archetypes (primary skill names)

# Entity stores: id -> { pos: Vector2 (smoothed), target: Vector2, data: Dictionary }
var players := {}
var enemies := {}
var drops := {}
var projectiles := {}

var input_seq := 0
var input_timer := 0.0
var pending_move_to = null            # Vector2 set by a ground click
var pulses := {"primary": false, "q": false, "e": false, "r": false, "c": false, "f": false}

var textures := {}                    # url path -> Texture2D (absent = not requested, null = loading)
var texture_retry_at := {}            # url path -> next retry time after a failed request
var camera := Camera2D.new()
var ui := {}
var shops: Array = []
var shade_cache := {}
var motes: Array = []
var effects: Array = []               # floating combat text {pos, text, color, age, life}
var sparks: Array = []                # impact particles {pos, vel, age, life, color}
var glow_layer: Node2D
var sounds := {}                      # name -> AudioStreamPlayer (procedurally synthesized)
var light_texture: GradientTexture2D
var bag_signature := ""
var smoke_timer := -1.0               # CRIMSON_SMOKE=<seconds>: headless verification run

# ---- Isometric projection (matches public/client.js) --------------------

func iso(world_point: Vector2) -> Vector2:
	return Vector2(world_point.x - world_point.y, (world_point.x + world_point.y) * 0.5)

func from_iso(iso_point: Vector2) -> Vector2:
	return Vector2(iso_point.y + iso_point.x * 0.5, iso_point.y - iso_point.x * 0.5)

func _ready() -> void:
	var override := OS.get_environment("CRIMSON_SERVER")
	if override != "":
		server_url = override
	texture_repeat = CanvasItem.TEXTURE_REPEAT_ENABLED
	light_texture = GradientTexture2D.new()
	light_texture.width = 256
	light_texture.height = 256
	light_texture.fill = GradientTexture2D.FILL_RADIAL
	light_texture.fill_from = Vector2(0.5, 0.5)
	light_texture.fill_to = Vector2(0.5, 1.0)
	var gradient := Gradient.new()
	gradient.colors = PackedColorArray([Color(1, 1, 1, 1), Color(1, 1, 1, 0)])
	gradient.offsets = PackedFloat32Array([0.0, 1.0])
	light_texture.gradient = gradient
	glow_layer = Node2D.new()
	glow_layer.set_script(load("res://scripts/glow.gd"))
	glow_layer.main = self
	add_child(glow_layer)
	add_child(camera)
	camera.position = iso(world_size / 2)
	camera.make_current()
	_build_ui()
	_build_sounds()
	_connect_socket()
	var smoke := OS.get_environment("CRIMSON_SMOKE")
	if smoke != "":
		smoke_timer = maxf(1.0, float(smoke))

func _connect_socket() -> void:
	socket = WebSocketPeer.new()
	var err := socket.connect_to_url(server_url)
	socket_active = err == OK
	_set_status("连接中 %s" % server_url if socket_active else "连接失败：%s" % error_string(err))

# ---- Main loop ---------------------------------------------------------

func _process(delta: float) -> void:
	if smoke_timer > 0.0:
		smoke_timer -= delta
		if smoke_timer <= 0.0:
			_print_smoke_summary()
			get_tree().quit()
			return
	_poll_socket(delta)
	if not joined and ui.has("lobby_bg") and ui.lobby_bg.texture == null:
		var art = textures.get("/assets/scenes/crimson-relay-eclipse.webp")
		if art != null:
			ui.lobby_bg.texture = art
	if joined:
		_interpolate(delta)
		_send_input(delta)
		_update_motes(delta)
		var me = players.get(self_id)
		if me:
			camera.position = iso(me.pos)
			_update_hud(me.data)
	queue_redraw()

func _print_smoke_summary() -> void:
	var me = players.get(self_id)
	var loaded := PackedStringArray()
	for path in textures:
		var texture = textures[path]
		if texture != null:
			loaded.append("%s %dx%d" % [path.get_file(), texture.get_width(), texture.get_height()])
	print("smoke: joined=%s players=%d enemies=%d drops=%d online=%d pos=%s" % [
		str(joined), players.size(), enemies.size(), drops.size(), online_count,
		str(me.pos.round()) if me else "n/a",
	])
	print("smoke textures: [%s]" % ", ".join(loaded))
	var probe := iso(Vector2(123, 456))
	print("smoke iso roundtrip ok=%s ring=%d" % [
		str(from_iso(probe).distance_to(Vector2(123, 456)) < 0.001),
		_iso_ring(Vector2(100, 100), 50).size(),
	])

func _poll_socket(delta: float) -> void:
	if not socket_active:
		reconnect_timer -= delta
		if reconnect_timer <= 0.0:
			reconnect_timer = RECONNECT_DELAY
			_connect_socket()
		return
	socket.poll()
	match socket.get_ready_state():
		WebSocketPeer.STATE_OPEN:
			while socket.get_available_packet_count() > 0:
				var packet := socket.get_packet()
				if socket.was_string_packet():
					var parsed = JSON.parse_string(packet.get_string_from_utf8())
					if parsed is Dictionary:
						_handle_message(parsed)
				else:
					var snapshot := _decode_binary_snapshot(packet)
					if not snapshot.is_empty():
						_apply_snapshot(snapshot)
		WebSocketPeer.STATE_CLOSED:
			socket_active = false
			reconnect_timer = RECONNECT_DELAY
			if joined:
				_show_lobby("连接中断，重连中…")
			else:
				_set_status("连接中断，重连中…")

func _send(message: Dictionary) -> void:
	if socket_active and socket.get_ready_state() == WebSocketPeer.STATE_OPEN:
		socket.send_text(JSON.stringify(message))

# ---- Binary snapshot decoding (mirror of src/server/codec.js) -----------

func _read_str(buffer: StreamPeerBuffer) -> String:
	var length := buffer.get_u16()
	if length == 0:
		return ""
	return buffer.get_data(length)[1].get_string_from_utf8()

func _decode_binary_snapshot(bytes: PackedByteArray) -> Dictionary:
	var buffer := StreamPeerBuffer.new()
	buffer.data_array = bytes
	buffer.big_endian = false
	if buffer.get_u8() != BINARY_MAGIC:
		return {}
	var meta_length := buffer.get_u32()
	var meta = JSON.parse_string(buffer.get_data(meta_length)[1].get_string_from_utf8())
	if not (meta is Dictionary):
		return {}

	var player_list := []
	if meta.get("self") is Dictionary:
		player_list.append(meta["self"])
	for _index in buffer.get_u16():
		var player := {
			"id": _read_str(buffer), "name": _read_str(buffer),
			"archetype": _read_str(buffer), "color": _read_str(buffer),
			"attunement": _read_str(buffer),
		}
		var target_id := _read_str(buffer)
		player["targetId"] = target_id if target_id != "" else null
		player["running"] = buffer.get_u8() == 1
		player["alive"] = buffer.get_u8() == 1
		player["x"] = buffer.get_float()
		player["y"] = buffer.get_float()
		player["facing"] = {"x": buffer.get_float(), "y": buffer.get_float()}
		player["hp"] = buffer.get_float()
		player["maxHp"] = buffer.get_float()
		player["mp"] = buffer.get_float()
		player["maxMp"] = buffer.get_float()
		player["respawnIn"] = buffer.get_float()
		player["moveSpeed"] = buffer.get_float()
		player["reputation"] = buffer.get_32()
		player["will"] = buffer.get_u32()
		player["radius"] = buffer.get_u16()
		player["rebirths"] = buffer.get_u16()
		player["level"] = buffer.get_u16()
		var equipment := {}
		for _piece in buffer.get_u8():
			var key := _read_str(buffer)
			var item := {"name": _read_str(buffer), "rarity": _read_str(buffer)}
			var drop_class := _read_str(buffer)
			if drop_class != "":
				item["dropClass"] = drop_class
			item["level"] = buffer.get_u16()
			equipment[key] = item
		player["equipment"] = equipment
		player_list.append(player)

	var enemy_list := []
	for _index in buffer.get_u16():
		var enemy := {
			"id": _read_str(buffer), "type": _read_str(buffer), "name": _read_str(buffer),
			"attackStyle": _read_str(buffer), "combatState": _read_str(buffer),
		}
		var attack_target := _read_str(buffer)
		enemy["attackTargetId"] = attack_target if attack_target != "" else null
		var flags := buffer.get_u8()
		enemy["elite"] = (flags & 1) != 0
		enemy["boss"] = (flags & 2) != 0
		enemy["alive"] = (flags & 4) != 0
		enemy["x"] = buffer.get_float()
		enemy["y"] = buffer.get_float()
		enemy["hp"] = buffer.get_float()
		enemy["maxHp"] = buffer.get_float()
		enemy["damage"] = buffer.get_float()
		enemy["speed"] = buffer.get_float()
		enemy["attackRemaining"] = buffer.get_float()
		enemy["attackWindup"] = buffer.get_float()
		enemy["radius"] = buffer.get_u16()
		enemy["level"] = buffer.get_u16()
		enemy["defense"] = buffer.get_u16()
		enemy_list.append(enemy)

	var projectile_list := []
	for _index in buffer.get_u16():
		var projectile := {
			"id": _read_str(buffer), "ownerId": _read_str(buffer),
			"team": _read_str(buffer), "color": _read_str(buffer),
		}
		projectile["x"] = buffer.get_float()
		projectile["y"] = buffer.get_float()
		projectile["fromX"] = buffer.get_float()
		projectile["fromY"] = buffer.get_float()
		projectile["radius"] = buffer.get_u16()
		projectile_list.append(projectile)

	var drop_list := []
	for _index in buffer.get_u16():
		var drop := {
			"id": _read_str(buffer), "slot": _read_str(buffer), "rarity": _read_str(buffer),
		}
		var drop_class := _read_str(buffer)
		drop["dropClass"] = drop_class if drop_class != "" else null
		drop["name"] = _read_str(buffer)
		drop["x"] = buffer.get_float()
		drop["y"] = buffer.get_float()
		drop_list.append(drop)

	return {
		"type": "snapshot",
		"tick": meta.get("tick", 0),
		"serverTime": meta.get("serverTime", 0),
		"selfId": meta.get("selfId", ""),
		"mapId": meta.get("mapId", ""),
		"online": meta.get("online", 0),
		"world": meta.get("world", {}),
		"safeZone": meta.get("safeZone"),
		"players": player_list,
		"enemies": enemy_list,
		"projectiles": projectile_list,
		"drops": drop_list,
	}

# ---- Protocol ----------------------------------------------------------

func _handle_message(message: Dictionary) -> void:
	match str(message.get("type", "")):
		"welcome":
			var server_protocol := int(message.get("protocol", CLIENT_PROTOCOL))
			if server_protocol != CLIENT_PROTOCOL:
				_set_status("协议版本不匹配：服务器 v%d / 客户端 v%d" % [server_protocol, CLIENT_PROTOCOL])
				return
			var world: Dictionary = message.get("world", {})
			world_size = Vector2(float(world.get("width", 4800)), float(world.get("height", 2700)))
			_apply_world(world)
			archetype_meta = message.get("archetypes", {})
			_fill_archetypes(archetype_meta)
			_render_roster(message.get("roster", []))
			_set_status("已连接，选择角色进入")
			print("welcome: protocol v%d, %d archetypes" % [server_protocol, archetype_meta.size()])
			# Debug affordance for headless runs and CI: auto-join on connect.
			var autojoin := OS.get_environment("CRIMSON_AUTOJOIN")
			if autojoin != "" and not joined:
				ui.name_input.text = autojoin
				_join()
		"roster":
			_render_roster(message.get("players", []))
		"session":
			_store_token(str(message.get("name", "")), str(message.get("token", "")))
		"snapshot":
			_apply_snapshot(message)
		"event":
			_handle_event(message)
		"error":
			var code := str(message.get("code", ""))
			_set_status("错误 %s：%s" % [code, str(message.get("message", ""))])
			print("error %s: %s" % [code, str(message.get("message", ""))])
			if code in ["INVALID_TOKEN", "NAME_IN_USE", "NAME_TAKEN", "PROTOCOL_MISMATCH", "INVALID_ARCHETYPE"]:
				_show_lobby("")

func _join() -> void:
	var player_name: String = ui.name_input.text.strip_edges()
	if player_name.length() < 2:
		_set_status("呼号至少需要 2 个字符")
		return
	var archetype: String = ui.archetype_select.get_item_text(ui.archetype_select.selected)
	var message := {
		"type": "join",
		"protocol": CLIENT_PROTOCOL,
		"codec": SNAPSHOT_CODEC,
		"name": player_name,
		"archetype": archetype,
	}
	var token := _load_token(player_name)
	if token != "":
		message["token"] = token
	_send(message)
	_set_status("接入中…")

func _leave() -> void:
	_send({"type": "leave"})
	_show_lobby("已返回主画面")

func _apply_world(world: Dictionary) -> void:
	map_name = str(world.get("name", map_name))
	var theme := str(world.get("theme", map_theme))
	if theme != map_theme:
		map_theme = theme
		shade_cache.clear()
	portals = world.get("portals", portals)
	var shop_list = world.get("shops")
	if shop_list is Array and not shop_list.is_empty():
		shops = shop_list
	var zone = world.get("safeZone")
	safe_zone = zone if zone is Dictionary else {}

func _apply_snapshot(snapshot: Dictionary) -> void:
	self_id = str(snapshot.get("selfId", self_id))
	online_count = int(snapshot.get("online", online_count))
	_apply_world(snapshot.get("world", {}))
	if snapshot.get("safeZone") is Dictionary:
		safe_zone = snapshot["safeZone"]
	_sync_store(players, snapshot.get("players", []), "player")
	_sync_store(enemies, snapshot.get("enemies", []), "enemy")
	_sync_store(drops, snapshot.get("drops", []))
	_sync_store(projectiles, snapshot.get("projectiles", []))
	if not joined and players.has(self_id):
		joined = true
		ui.lobby_bg.visible = false
		ui.join_panel.visible = false
		ui.hud.visible = true
		ui.skill_bar.visible = true
		ui.chat_feed.visible = true
		ui.chat_row.visible = true
		var me = players[self_id]
		me.pos = me.target
		camera.position = iso(me.pos)
		# Warm the art for this hero and ground; headless smoke runs verify
		# the download+decode path this way (they never reach _draw).
		_hero_texture(str(me.data.get("archetype", "vanguard")))
		_ground_texture()
		print("joined as %s (%d players, %d enemies on map)" % [
			str(me.data.get("name", "?")), players.size(), enemies.size(),
		])

func _sync_store(store: Dictionary, entries: Array, kind := "") -> void:
	var seen := {}
	for raw in entries:
		if not (raw is Dictionary):
			continue
		var id := str(raw.get("id", ""))
		seen[id] = true
		var target := Vector2(float(raw.get("x", 0)), float(raw.get("y", 0)))
		if store.has(id):
			var entity: Dictionary = store[id]
			# Floating combat text from hp deltas between snapshots, plus a
			# short hit flash — the browser client's feedback, ported.
			if kind != "" and joined:
				var delta := float(raw.get("hp", 0)) - float(entity.data.get("hp", 0))
				var is_self := kind == "player" and id == self_id
				if delta <= -1.0:
					entity.flash = 0.13
					var color := Color(1.0, 0.83, 0.47) if kind == "enemy" else (Color(1.0, 0.42, 0.45) if is_self else Color(0.91, 0.6, 0.64))
					_push_effect(target, str(int(-delta)), color)
					for _spark in 4:
						sparks.append({
							"pos": target, "age": 0.0, "life": randf_range(0.3, 0.5),
							"vel": Vector2(randf_range(-90, 90), randf_range(-140, -40)),
							"color": color,
						})
					if is_self:
						_sfx("hurt")
				elif delta >= 5.0 and is_self:
					_push_effect(target, "+%d" % int(delta), Color(0.4, 0.84, 0.6))
			entity.target = target
			entity.data = raw
		else:
			store[id] = {"pos": target, "target": target, "data": raw, "flash": 0.0}
	for id in store.keys():
		if not seen.has(id):
			store.erase(id)

func _push_effect(world_pos: Vector2, text: String, color: Color) -> void:
	if effects.size() > 120:
		effects.pop_front()
	effects.append({"pos": world_pos, "text": text, "color": color, "age": 0.0, "life": 0.8})

const CHAT_CHANNELS := [["global", "全服"], ["map", "本图"], ["party", "组队"]]
var chat_lines: Array = []
var pending_invite := ""              # inviter id; Y accepts

func _handle_event(event: Dictionary) -> void:
	var name := str(event.get("event", ""))
	match name:
		"chatMessage":
			var channel := str(event.get("channel", "global"))
			var label := "全服"
			for pair in CHAT_CHANNELS:
				if pair[0] == channel:
					label = pair[1]
			chat_lines.append("[%s] %s: %s" % [label, str(event.get("name", "?")), str(event.get("text", ""))])
			while chat_lines.size() > 6:
				chat_lines.pop_front()
			if ui.has("chat_feed"):
				ui.chat_feed.text = "\n".join(PackedStringArray(chat_lines))
		"bossSpawned":
			_set_status("Boss 出现：%s" % str(event.get("name", "")))
		"bossSlain":
			_set_status("Boss 被击破：%s" % str(event.get("name", "")))
		"partyInvited":
			if str(event.get("playerId", "")) == self_id:
				pending_invite = str(event.get("from", ""))
				_set_status("%s 邀请你组队 — 按 Y 接受" % str(event.get("fromName", "?")))
		"partyJoined":
			if str(event.get("playerId", "")) == self_id:
				pending_invite = ""
				_set_status("已加入队伍")
		"lootPickedUp":
			if str(event.get("playerId", "")) == self_id:
				_sfx("pickup")
				if bool(event.get("autoEquipped", false)):
					_set_status("拾取并装备 %s" % str(event.get("name", "")))
		"enemyDefeated":
			if str(event.get("playerId", "")) == self_id:
				_sfx("kill")
		"levelUp":
			if str(event.get("playerId", "")) == self_id:
				_sfx("levelup")
		"playerDefeated":
			if str(event.get("playerId", "")) == self_id:
				_sfx("death")
		"teleported":
			if str(event.get("playerId", "")) == self_id:
				_sfx("teleport")

# ---- Input -------------------------------------------------------------

func _interpolate(delta: float) -> void:
	var factor: float = 1.0 - exp(-delta * LERP_RATE)
	for store in [players, enemies, projectiles, drops]:
		for entity in store.values():
			entity.pos = entity.pos.lerp(entity.target, factor)
			if entity.get("flash", 0.0) > 0.0:
				entity.flash = maxf(0.0, entity.flash - delta)
	for effect in effects:
		effect.age += delta
	effects = effects.filter(func(effect) -> bool: return effect.age < effect.life)
	for spark in sparks:
		spark.age += delta
		spark.pos += spark.vel * delta
		spark.vel.y += 260.0 * delta
	sparks = sparks.filter(func(spark) -> bool: return spark.age < spark.life)

func _send_input(delta: float) -> void:
	input_timer -= delta
	if input_timer > 0.0:
		return
	input_timer = INPUT_INTERVAL
	# Screen-relative keys, converted into the world axes (screen up-right is
	# world +x, up-left is world -y), matching the browser's currentMove().
	var screen_move := Vector2.ZERO
	if Input.is_physical_key_pressed(KEY_W) or Input.is_physical_key_pressed(KEY_UP): screen_move.y -= 1
	if Input.is_physical_key_pressed(KEY_S) or Input.is_physical_key_pressed(KEY_DOWN): screen_move.y += 1
	if Input.is_physical_key_pressed(KEY_A) or Input.is_physical_key_pressed(KEY_LEFT): screen_move.x -= 1
	if Input.is_physical_key_pressed(KEY_D) or Input.is_physical_key_pressed(KEY_RIGHT): screen_move.x += 1
	screen_move = screen_move.normalized()
	var move := Vector2((screen_move.y + screen_move.x) / sqrt(2.0), (screen_move.y - screen_move.x) / sqrt(2.0))
	var aim := from_iso(get_global_mouse_position()).clamp(Vector2.ZERO, world_size)
	input_seq += 1
	var message := {
		"type": "input",
		"seq": input_seq,
		"move": {"x": move.x, "y": move.y},
		"aim": {"x": aim.x, "y": aim.y},
		"sprint": Input.is_physical_key_pressed(KEY_SHIFT),
		"primary": pulses.primary,
		"q": pulses.q,
		"e": pulses.e,
		"r": pulses.r,
		"c": pulses.c,
		"f": pulses.f,
	}
	if pending_move_to != null:
		message["moveTo"] = {"x": pending_move_to.x, "y": pending_move_to.y}
		pending_move_to = null
	_send(message)
	for key in pulses:
		pulses[key] = false

func _unhandled_input(event: InputEvent) -> void:
	if not joined:
		return
	if event is InputEventMouseButton and event.pressed:
		var world_point := from_iso(get_global_mouse_position()).clamp(Vector2.ZERO, world_size)
		if event.button_index == MOUSE_BUTTON_LEFT:
			pending_move_to = world_point
		elif event.button_index == MOUSE_BUTTON_RIGHT:
			pulses.primary = true
	if event is InputEventKey and event.pressed and not event.echo:
		match event.physical_keycode:
			KEY_Q: pulses.q = true
			KEY_E: pulses.e = true
			KEY_R: pulses.r = true
			KEY_C: pulses.c = true
			KEY_F: pulses.f = true
			KEY_B: _toggle_bag()
			KEY_Y:
				if pending_invite != "":
					_send({"type": "partyAccept", "from": pending_invite})
					pending_invite = ""
			KEY_ENTER: ui.chat_input.grab_focus()
			KEY_ESCAPE: _leave()

# ---- Synthesized audio (no assets, like the browser's WebAudio sfx) -----

func _make_tone(freqs: Array, duration: float, shape := "sine", volume := 0.35) -> AudioStreamWAV:
	var rate := 22050
	var count := int(rate * duration)
	var data := PackedByteArray()
	data.resize(count * 2)
	var segment := duration / freqs.size()
	for i in count:
		var t := float(i) / rate
		var freq: float = freqs[mini(freqs.size() - 1, int(t / segment))]
		var envelope := 1.0 - t / duration
		var phase := fmod(t * freq, 1.0)
		var sample := 0.0
		match shape:
			"square": sample = 1.0 if phase < 0.5 else -1.0
			"saw": sample = phase * 2.0 - 1.0
			_: sample = sin(TAU * t * freq)
		data.encode_s16(i * 2, int(clampf(sample * envelope * volume, -1.0, 1.0) * 32767.0))
	var stream := AudioStreamWAV.new()
	stream.format = AudioStreamWAV.FORMAT_16_BITS
	stream.mix_rate = rate
	stream.data = data
	return stream

func _build_sounds() -> void:
	var recipes := {
		"hurt": _make_tone([130.0], 0.09, "saw", 0.3),
		"kill": _make_tone([420.0, 640.0], 0.12, "square", 0.22),
		"pickup": _make_tone([880.0], 0.07, "sine", 0.3),
		"levelup": _make_tone([520.0, 660.0, 780.0], 0.3, "sine", 0.3),
		"death": _make_tone([160.0, 110.0], 0.45, "saw", 0.3),
		"teleport": _make_tone([300.0, 900.0], 0.2, "sine", 0.25),
	}
	for name in recipes:
		var player := AudioStreamPlayer.new()
		player.stream = recipes[name]
		add_child(player)
		sounds[name] = player

func _sfx(name: String) -> void:
	if sounds.has(name):
		sounds[name].play()

# ---- Art fetched from the game server -----------------------------------

func _http_base() -> String:
	return server_url.replace("ws://", "http://").replace("wss://", "https://").trim_suffix("/ws")

# Returns the texture for a server asset path, or null while it downloads.
func _server_texture(path: String) -> Texture2D:
	if textures.has(path):
		var cached = textures[path]
		if cached != null:
			return cached
		if Time.get_ticks_msec() < int(texture_retry_at.get(path, 0)):
			return null
	textures[path] = null
	texture_retry_at[path] = Time.get_ticks_msec() + 5000
	var request := HTTPRequest.new()
	add_child(request)
	request.request_completed.connect(func(_result: int, code: int, _headers: PackedStringArray, body: PackedByteArray) -> void:
		if code == 200:
			var image := Image.new()
			if image.load_webp_from_buffer(body) == OK:
				textures[path] = ImageTexture.create_from_image(image)
				texture_retry_at.erase(path)
		request.queue_free()
	)
	if request.request(_http_base() + path) != OK:
		request.queue_free()
	return null

func _hero_texture(archetype: String) -> Texture2D:
	return _server_texture("/assets/heroes/%s-3d.webp" % archetype)

func _ground_texture() -> Texture2D:
	if not ZONE_TEXTURE.has(map_theme):
		return null
	return _server_texture("/assets/textures/%s.webp" % ZONE_TEXTURE[map_theme])

# ---- Rendering ---------------------------------------------------------

func _draw() -> void:
	_draw_ground()
	_draw_decorations()
	_draw_zone_markers()
	# Painter's order: entities lower on the iso plane draw last.
	var drawables := []
	for drop in drops.values():
		drawables.append({"kind": "drop", "entity": drop})
	for enemy in enemies.values():
		drawables.append({"kind": "enemy", "entity": enemy})
	for player in players.values():
		drawables.append({"kind": "player", "entity": player})
	drawables.sort_custom(func(a, b) -> bool:
		return a.entity.pos.x + a.entity.pos.y < b.entity.pos.x + b.entity.pos.y)
	for item in drawables:
		match item.kind:
			"drop": _draw_drop(item.entity)
			"enemy": _draw_enemy(item.entity)
			"player": _draw_player(item.entity)
	for projectile in projectiles.values():
		_draw_projectile(projectile)
	_draw_effects()

# Deterministic per-tile hash and coarse value noise, ported from the
# browser's tileHash/smoothNoise so the two clients share terrain character.
func _tile_hash(x: int, y: int) -> float:
	var value := (x * 374761393 + y * 668265263) ^ (x * y * 69069)
	value = ((value ^ (value >> 13)) * 1274126177) & 0xFFFFFFFF
	return float((value ^ (value >> 16)) & 0x7FFFFFFF) / 2147483647.0

func _smooth_noise(x: float, y: float) -> float:
	var cx := x / 5.0
	var cy := y / 5.0
	var x0 := floori(cx)
	var y0 := floori(cy)
	var sx := cx - x0
	var sy := cy - y0
	var top := lerpf(_tile_hash(x0, y0), _tile_hash(x0 + 1, y0), sx)
	var bottom := lerpf(_tile_hash(x0, y0 + 1), _tile_hash(x0 + 1, y0 + 1), sx)
	return lerpf(top, bottom, sy)

func _tile_shade(tx: int, ty: int) -> Color:
	var key := ty * 100000 + tx
	if shade_cache.has(key):
		return shade_cache[key]
	var color: Color
	if map_theme == "town" and safe_zone.has("radius"):
		# Concentric paving bands around the relay plaza, like the browser.
		var world_point := Vector2((tx + 0.5) * WORLD_CELL, (ty + 0.5) * WORLD_CELL)
		var centre := Vector2(float(safe_zone.x), float(safe_zone.y))
		var distance := world_point.distance_to(centre) / float(safe_zone.radius)
		if distance < 0.14:
			color = Color("5a463c")
		else:
			color = Color("48392f") if int(distance * 6.0) % 2 == 0 else Color("3f322a")
	else:
		var ramp: Array = BIOME_RAMPS.get(map_theme, BIOME_RAMPS["wastes"])
		var value := clampf(_smooth_noise(tx, ty) * 0.78 + _tile_hash(tx, ty) * 0.22, 0.0, 1.0)
		color = Color(ramp[0]).lerp(Color(ramp[1]), value)
	shade_cache[key] = color
	return color

func _draw_ground() -> void:
	var corners := PackedVector2Array([
		iso(Vector2.ZERO),
		iso(Vector2(world_size.x, 0)),
		iso(world_size),
		iso(Vector2(0, world_size.y)),
	])
	var base: Color = THEME_COLORS.get(map_theme, Color(0.16, 0.15, 0.17))
	draw_colored_polygon(corners, base)

	# Noise-shaded diamond tiles over the visible area only.
	var tiles := _visible_tile_range()
	var half_w := WORLD_CELL + 1.0
	var half_h := WORLD_CELL * 0.5 + 0.5
	for ty in range(tiles.position.y, tiles.position.y + tiles.size.y + 1):
		for tx in range(tiles.position.x, tiles.position.x + tiles.size.x + 1):
			var p := iso(Vector2((tx + 0.5) * WORLD_CELL, (ty + 0.5) * WORLD_CELL))
			draw_colored_polygon(PackedVector2Array([
				p + Vector2(0, -half_h), p + Vector2(half_w, 0),
				p + Vector2(0, half_h), p + Vector2(-half_w, 0),
			]), _tile_shade(tx, ty))

	var ground := _ground_texture()
	if ground:
		var repeats := world_size / GROUND_REPEAT
		var uvs := PackedVector2Array([
			Vector2.ZERO, Vector2(repeats.x, 0), repeats, Vector2(0, repeats.y),
		])
		# The affine world→iso map carries the texture onto the ground plane;
		# lower alpha lets the noise shading breathe through, like the
		# browser's per-tile texture pass.
		draw_colored_polygon(corners, Color(0.72, 0.72, 0.76, 0.42), uvs, ground)
	# World edge.
	var outline := corners.duplicate()
	outline.append(corners[0])
	draw_polyline(outline, Color(0.45, 0.4, 0.34), 3.0)

# A circle in world space becomes its iso ellipse by projecting each point.
func _iso_ring(centre: Vector2, radius: float, segments := 48) -> PackedVector2Array:
	var points := PackedVector2Array()
	for index in segments + 1:
		var angle := TAU * index / segments
		points.append(iso(centre + Vector2(cos(angle), sin(angle)) * radius))
	return points

func _label(at: Vector2, text: String, size := 12, color := Color.WHITE) -> void:
	var font := ThemeDB.fallback_font
	draw_string_outline(font, at + Vector2(-90, 0), text, HORIZONTAL_ALIGNMENT_CENTER, 180, size, 4, Color(0, 0, 0, 0.8))
	draw_string(font, at + Vector2(-90, 0), text, HORIZONTAL_ALIGNMENT_CENTER, 180, size, color)

func _draw_zone_markers() -> void:
	var pulse := 0.5 + 0.5 * sin(Time.get_ticks_msec() / 320.0)
	if safe_zone.has("radius"):
		var centre := Vector2(float(safe_zone.x), float(safe_zone.y))
		var ring := _iso_ring(centre, float(safe_zone.radius))
		draw_colored_polygon(ring, Color(0.9, 0.75, 0.4, 0.05))
		draw_polyline(ring, Color(0.9, 0.75, 0.4, 0.4 + pulse * 0.25), 2.0)
		if map_theme == "town":
			_draw_beacon(iso(centre), pulse)
	for portal in portals:
		if not (portal is Dictionary):
			continue
		var portal_pos := Vector2(float(portal.get("x", 0)), float(portal.get("y", 0)))
		draw_polyline(_iso_ring(portal_pos, 26, 24), Color(0.3, 0.8, 0.85), 2.0)
		var beam_base := iso(portal_pos)
		draw_line(beam_base, beam_base - Vector2(0, 60), Color(0.3, 0.8, 0.85, 0.2 + pulse * 0.25), 6.0)
		var zone := str(portal.get("zone", ""))
		_label(beam_base - Vector2(0, 74), "→ %s" % ZONE_LABELS.get(zone, zone), 12, Color(0.75, 0.95, 0.98))
	for shop in shops:
		if not (shop is Dictionary):
			continue
		var base := iso(Vector2(float(shop.get("x", 0)), float(shop.get("y", 0))))
		draw_rect(Rect2(base - Vector2(11, 26), Vector2(22, 24)), Color("6a5138"), true)
		draw_colored_polygon(PackedVector2Array([
			base + Vector2(-15, -26), base + Vector2(15, -26), base + Vector2(0, -40),
		]), Color("8a6a44"))
		draw_rect(Rect2(base - Vector2(3, 12), Vector2(6, 10)), Color(1, 0.85, 0.55, 0.85), true)
		_label(base - Vector2(0, 48), str(shop.get("name", "")), 12, Color(0.98, 0.85, 0.6))

# The relay beacon anchoring the town plaza: truss silhouette, platform,
# and a pulsing crimson signal — a miniature of the browser landmark.
func _draw_beacon(base: Vector2, pulse: float) -> void:
	var height := 110.0
	draw_colored_polygon(PackedVector2Array([
		base + Vector2(-16, 0), base + Vector2(16, 0),
		base + Vector2(6, -height), base + Vector2(-6, -height),
	]), Color(0.16, 0.14, 0.15))
	draw_line(base + Vector2(-16, 0), base + Vector2(6, -height), Color(0.35, 0.3, 0.28), 2.0)
	draw_line(base + Vector2(16, 0), base + Vector2(-6, -height), Color(0.35, 0.3, 0.28), 2.0)
	draw_rect(Rect2(base + Vector2(-10, -height - 6), Vector2(20, 6)), Color(0.3, 0.26, 0.25), true)
	draw_circle(base + Vector2(0, -height - 10), 5.0, Color(0.6, 0.16, 0.2))

func _update_motes(delta: float) -> void:
	var anchor := from_iso(camera.position)
	while motes.size() < MOTE_COUNT:
		motes.append({
			"pos": anchor + Vector2(randf_range(-1500, 1500), randf_range(-1000, 1000)),
			"vel": Vector2(randf_range(-8, 8), randf_range(-8, 8)),
			"z": randf_range(4, 40),
			"life": randf_range(4.0, 8.0),
			"age": 0.0,
		})
	for mote in motes:
		mote.age += delta
		mote.pos += mote.vel * delta
		mote.z += 6.0 * delta
	motes = motes.filter(func(mote) -> bool: return mote.age < mote.life)

# Threshold-scattered ground props per theme, mirroring the browser's
# drawBiomeDecoration: the same per-tile hash decides what grows where.
func _visible_tile_range() -> Rect2i:
	var view_size := get_viewport_rect().size
	var view_origin: Vector2 = camera.position - view_size / 2.0
	var min_world := Vector2.INF
	var max_world := -Vector2.INF
	for corner in [view_origin, view_origin + Vector2(view_size.x, 0),
			view_origin + view_size, view_origin + Vector2(0, view_size.y)]:
		var world_point := from_iso(corner)
		min_world = min_world.min(world_point)
		max_world = max_world.max(world_point)
	var tx0 := maxi(0, floori(min_world.x / WORLD_CELL) - 1)
	var ty0 := maxi(0, floori(min_world.y / WORLD_CELL) - 1)
	var tx1 := mini(int(world_size.x / WORLD_CELL) - 1, ceili(max_world.x / WORLD_CELL) + 1)
	var ty1 := mini(int(world_size.y / WORLD_CELL) - 1, ceili(max_world.y / WORLD_CELL) + 1)
	return Rect2i(tx0, ty0, tx1 - tx0, ty1 - ty0)

func _draw_decorations() -> void:
	var tiles := _visible_tile_range()
	for ty in range(tiles.position.y, tiles.position.y + tiles.size.y + 1):
		for tx in range(tiles.position.x, tiles.position.x + tiles.size.x + 1):
			var noise := _tile_hash(tx, ty)
			if noise < 0.62:
				continue
			var p := iso(Vector2((tx + 0.5) * WORLD_CELL, (ty + 0.5) * WORLD_CELL))
			if noise >= 0.86:
				_draw_prop(p, noise)
			elif noise < 0.8:
				_draw_accent(p, noise)
	if map_theme == "town" and safe_zone.has("radius"):
		_draw_town_fixtures()

# Mid-frequency ground details on ~1/5 of tiles: the layer between flat
# shading and rare props that makes ground read as lived-in.
func _draw_accent(p: Vector2, noise: float) -> void:
	var ticks := Time.get_ticks_msec() / 1000.0
	match map_theme:
		"residential", "grass":
			var sway := sin(ticks * 1.8 + noise * 30.0) * 1.5
			for offset in [-5.0, 0.0, 5.0]:
				draw_line(p + Vector2(offset, 3), p + Vector2(offset + sway, -5), Color(0.43, 0.63, 0.35, 0.55), 1.2)
		"mountain":
			if noise > 0.76:
				draw_circle(p, 1.6, Color(0.62, 0.84, 0.89, 0.35 + 0.3 * sin(ticks * 3.0 + noise * 40.0)))
			else:
				draw_rect(Rect2(p - Vector2(3, 1), Vector2(6, 3)), Color(0.35, 0.39, 0.45, 0.6), true)
		"snow":
			draw_circle(p, 1.4, Color(0.95, 0.98, 1.0, 0.4 + 0.3 * sin(ticks * 2.4 + noise * 50.0)))
		"scrapyard":
			if noise > 0.74:
				_draw_ellipse(p + Vector2(0, 2), 11, 4, Color(0.08, 0.05, 0.03, 0.35))
			else:
				draw_rect(Rect2(p - Vector2(4, 1), Vector2(7, 2)), Color(0.55, 0.37, 0.22, 0.5), true)
		"desert":
			draw_arc(p, 7, PI * 0.2, PI * 0.8, 8, Color(0.72, 0.6, 0.4, 0.4), 1.0)
		"castle":
			draw_rect(Rect2(p - Vector2(3, 1), Vector2(5, 3)), Color(0.42, 0.4, 0.44, 0.5), true)
		"spaceport":
			draw_line(p + Vector2(-9, 0), p + Vector2(9, 0), Color(0.28, 0.33, 0.42, 0.6), 1.0)
		"skycity":
			draw_circle(p, 1.3, Color(0.55, 0.75, 1.0, 0.35 + 0.3 * sin(ticks * 2.0 + noise * 60.0)))
		_:
			draw_circle(p, 1.4, Color(0.75, 0.34, 0.4, 0.4))

func _draw_prop(p: Vector2, noise: float) -> void:
	var rare := noise > 0.975
	match map_theme:
		"residential", "grass":
			if rare:
				# Tree: trunk plus two stacked crowns.
				draw_rect(Rect2(p - Vector2(2, 26), Vector2(4, 26)), Color("4a3524"), true)
				draw_circle(p - Vector2(0, 32), 13, Color("2f5228"))
				draw_circle(p - Vector2(0, 42), 9, Color("3d6a33"))
			else:
				for offset in [-5.0, 0.0, 5.0]:
					draw_line(p + Vector2(offset, 3), p + Vector2(offset + 2.0, -6), Color(0.42, 0.6, 0.35, 0.7), 1.3)
		"mountain":
			if rare:
				draw_colored_polygon(PackedVector2Array([
					p + Vector2(-16, 6), p + Vector2(16, 6), p + Vector2(3, -30),
				]), Color("55606e"))
				draw_colored_polygon(PackedVector2Array([
					p + Vector2(-3, -16), p + Vector2(9, -16), p + Vector2(3, -30),
				]), Color(0.92, 0.95, 1.0, 0.9))
			else:
				draw_rect(Rect2(p - Vector2(5, 3), Vector2(10, 6)), Color(0.42, 0.46, 0.52), true)
		"snow":
			if rare:
				draw_colored_polygon(PackedVector2Array([
					p + Vector2(0, -22), p + Vector2(7, -6), p + Vector2(0, 4), p + Vector2(-7, -6),
				]), Color(0.75, 0.88, 1.0, 0.85))
			else:
				draw_circle(p, 2.0, Color(0.9, 0.96, 1.0, 0.8))
		"scrapyard":
			if rare:
				# Wrecked car: rusty shell and two dark wheels.
				draw_rect(Rect2(p - Vector2(16, 14), Vector2(32, 12)), Color("6a4128"), true)
				draw_rect(Rect2(p - Vector2(10, 20), Vector2(18, 8)), Color("54331f"), true)
				draw_circle(p + Vector2(-9, 0), 4, Color(0.1, 0.09, 0.08))
				draw_circle(p + Vector2(9, 0), 4, Color(0.1, 0.09, 0.08))
			else:
				draw_rect(Rect2(p - Vector2(4, 2), Vector2(8, 3)), Color(0.5, 0.34, 0.2, 0.8), true)
		"desert":
			if rare:
				for offset in [-6.0, 0.0, 6.0]:
					draw_rect(Rect2(p + Vector2(offset - 1.5, -18 if offset == 0.0 else -11), Vector2(3, 18 if offset == 0.0 else 11)), Color("4f7040"), true)
			else:
				draw_arc(p, 9, PI * 0.15, PI * 0.85, 10, Color(0.75, 0.62, 0.4, 0.5), 1.2)
		"castle":
			if rare:
				draw_rect(Rect2(p - Vector2(5, 30), Vector2(10, 30)), Color("6a6470"), true)
				draw_colored_polygon(PackedVector2Array([
					p + Vector2(-5, -30), p + Vector2(5, -30), p + Vector2(2, -36), p + Vector2(-4, -34),
				]), Color("7a7482"))
			else:
				draw_rect(Rect2(p - Vector2(4, 2), Vector2(8, 4)), Color(0.4, 0.38, 0.42), true)
		"spaceport":
			if rare:
				draw_rect(Rect2(p - Vector2(14, 8), Vector2(28, 14)), Color("3c4658"), true)
				for light in 3:
					var lit := 0.4 + 0.6 * float((Time.get_ticks_msec() / 400 + light) % 3 == 0)
					draw_circle(p + Vector2(-8 + light * 8, -1), 1.6, Color(0.4, 0.85, 1.0, lit))
			else:
				draw_line(p + Vector2(-8, 0), p + Vector2(8, 0), Color(0.3, 0.36, 0.46), 1.5)
		"skycity":
			if rare:
				draw_rect(Rect2(p - Vector2(2, 34), Vector2(4, 34)), Color("5a6c94"), true)
				var glow := 0.5 + 0.5 * sin(Time.get_ticks_msec() / 300.0 + p.x)
				draw_circle(p - Vector2(0, 36), 4.0, Color(0.6, 0.85, 1.0, 0.4 + glow * 0.5))
			else:
				draw_line(p + Vector2(-7, 0), p + Vector2(7, -3), Color(0.5, 0.7, 1.0, 0.45), 1.2)
		_:
			if rare:
				draw_colored_polygon(PackedVector2Array([
					p + Vector2(0, -16), p + Vector2(6, -4), p + Vector2(0, 2), p + Vector2(-6, -4),
				]), Color(0.85, 0.3, 0.4, 0.8))
			else:
				draw_circle(p, 2.0, Color(0.8, 0.35, 0.4, 0.6))

# Six warm lamps and three cottages ring the town plaza, echoing the
# browser's townscape.
func _draw_town_fixtures() -> void:
	var centre := Vector2(float(safe_zone.x), float(safe_zone.y))
	var radius := float(safe_zone.radius)
	var pulse := 0.5 + 0.5 * sin(Time.get_ticks_msec() / 500.0)
	for index in 6:
		var angle := -PI / 2 + 0.42 + index * TAU / 6.0
		var base := iso(centre + Vector2(cos(angle), sin(angle)) * radius * 0.82)
		draw_rect(Rect2(base - Vector2(1.5, 34), Vector2(3, 34)), Color(0.2, 0.18, 0.17), true)
		draw_circle(base - Vector2(0, 36), 4.0, Color(1.0, 0.82, 0.5, 0.8 + pulse * 0.2))
	for index in 3:
		var angle := 0.9 + index * 1.75
		var base := iso(centre + Vector2(cos(angle), sin(angle)) * radius * 0.6)
		draw_rect(Rect2(base - Vector2(16, 26), Vector2(32, 26)), Color("4c3b2e"), true)
		draw_colored_polygon(PackedVector2Array([
			base + Vector2(-20, -26), base + Vector2(20, -26), base + Vector2(0, -42),
		]), Color("64503c"))
		draw_rect(Rect2(base + Vector2(-4, -16), Vector2(8, 16)), Color(0.16, 0.13, 0.11), true)
		draw_rect(Rect2(base + Vector2(7, -20), Vector2(6, 7)), Color(1.0, 0.85, 0.55, 0.9), true)

func _draw_effects() -> void:
	for effect in effects:
		var progress: float = effect.age / effect.life
		var p: Vector2 = iso(effect.pos) - Vector2(0, 30 + progress * 34)
		var color: Color = effect.color
		_label(p, effect.text, 14, Color(color, 1.0 - progress))

func _draw_shadow(at: Vector2, size: float) -> void:
	draw_colored_polygon(_iso_ring(from_iso(at), size, 20), Color(0, 0, 0, 0.28))

func _draw_ellipse(centre: Vector2, rx: float, ry: float, color: Color) -> void:
	draw_set_transform(centre, 0.0, Vector2(1.0, ry / rx))
	draw_circle(Vector2.ZERO, rx, color)
	draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)

func _draw_drop(drop: Dictionary) -> void:
	var p := iso(drop.pos)
	var rarity := str(drop.data.get("rarity", "common"))
	var color: Color = RARITY_COLORS.get(rarity, RARITY_COLORS["common"])
	var special = drop.data.get("dropClass")
	if special != null:
		color = Color(1.0, 0.62, 0.25) if str(special) == "uniq" else Color(1.0, 0.4, 0.65)
		draw_line(p, p - Vector2(0, 70), Color(color, 0.4), 4.0)
	var diamond := PackedVector2Array([
		p + Vector2(0, -7), p + Vector2(7, 0), p + Vector2(0, 7), p + Vector2(-7, 0),
	])
	draw_colored_polygon(diamond, color)

# Nine species, nine silhouettes built from primitives — a readable
# miniature of the browser's bestiary, not a copy of it.
func _draw_enemy(enemy: Dictionary) -> void:
	var p := iso(enemy.pos)
	var data: Dictionary = enemy.data
	var species := str(data.get("type", "riftling"))
	var radius := float(data.get("radius", 16))
	var body: Color = SPECIES_COLORS.get(species, Color(0.7, 0.3, 0.34))
	if bool(data.get("elite", false)):
		body = body.lightened(0.18)
	_draw_shadow(p, radius)
	# Attack-style tell ring, and a little life: fliers hover, walkers breathe.
	var style := str(data.get("attackStyle", ""))
	if ATTACK_COLORS.has(style):
		draw_polyline(_iso_ring(enemy.pos, radius + 3, 20), Color(ATTACK_COLORS[style], 0.45), 1.5)
	var ticks := Time.get_ticks_msec() / 1000.0
	var wobble := sin(ticks * 3.2 + p.x * 0.02)
	var bc := p - Vector2(0, radius * 0.7)
	if species in ["ashwing", "stormeye", "voidmaw"]:
		bc.y += wobble * 3.5
	else:
		radius *= 1.0 + wobble * 0.035
	match species:
		"duskfang":
			_draw_ellipse(bc + Vector2(0, radius * 0.2), radius * 1.25, radius * 0.7, body)
			for side in [-1, 1]:
				draw_colored_polygon(PackedVector2Array([
					bc + Vector2(side * radius * 0.5, -radius * 0.4),
					bc + Vector2(side * radius * 0.9, -radius * 1.1),
					bc + Vector2(side * radius * 0.2, -radius * 0.6),
				]), body.darkened(0.2))
		"ashwing":
			bc -= Vector2(0, radius * 0.8)
			for side in [-1, 1]:
				draw_colored_polygon(PackedVector2Array([
					bc, bc + Vector2(side * radius * 1.6, -radius * 0.7), bc + Vector2(side * radius * 0.7, radius * 0.3),
				]), body.darkened(0.15))
			draw_circle(bc, radius * 0.6, body)
		"thorncrawler":
			_draw_ellipse(bc + Vector2(0, radius * 0.25), radius * 1.35, radius * 0.65, body)
			for spike in range(-2, 3):
				draw_line(bc + Vector2(spike * radius * 0.4, 0),
					bc + Vector2(spike * radius * 0.5, -radius * 0.9), body.darkened(0.25), 2.0)
		"stonehorn":
			draw_circle(bc, radius, body)
			for side in [-1, 1]:
				draw_line(bc + Vector2(side * radius * 0.5, -radius * 0.5),
					bc + Vector2(side * radius * 1.1, -radius * 1.3), Color(0.85, 0.82, 0.75), 3.0)
		"frostseer":
			draw_colored_polygon(PackedVector2Array([
				bc + Vector2(0, -radius * 1.1), bc + Vector2(radius * 0.8, 0),
				bc + Vector2(0, radius * 0.9), bc + Vector2(-radius * 0.8, 0),
			]), body)
			draw_arc(bc, radius * 1.2, 0, TAU, 24, Color(0.7, 0.9, 1.0, 0.5), 1.5)
		"scraphulk":
			draw_rect(Rect2(bc - Vector2(radius, radius * 0.9), Vector2(radius * 2, radius * 1.6)), body, true)
			draw_rect(Rect2(bc - Vector2(radius * 0.45, radius * 1.5), Vector2(radius * 0.9, radius * 0.7)), body.darkened(0.2), true)
		"stormeye":
			bc -= Vector2(0, radius * 0.9)
			draw_circle(bc, radius * 0.9, body)
			draw_circle(bc, radius * 0.45, Color(0.95, 0.95, 1.0))
			draw_circle(bc, radius * 0.2, Color(0.2, 0.2, 0.4))
		"voidmaw":
			draw_arc(bc, radius, 0, TAU, 28, body.lightened(0.3), 3.0)
			draw_circle(bc, radius * 0.75, Color(0.1, 0.06, 0.14))
		_:
			# riftling and unknown species: spiked orb
			draw_circle(bc, radius * 0.9, body)
			for spike in 5:
				var angle := -PI * 0.15 - spike * PI * 0.18
				draw_line(bc, bc + Vector2(cos(angle), sin(angle)) * radius * 1.3, body.darkened(0.2), 2.0)
	if enemy.get("flash", 0.0) > 0.0:
		draw_circle(bc, radius, Color(1, 1, 1, 0.45))
	if bool(data.get("boss", false)):
		draw_polyline(_iso_ring(enemy.pos, radius + 14, 32), Color(0.9, 0.2, 0.25, 0.6), 2.0)
	elif bool(data.get("elite", false)):
		draw_polyline(_iso_ring(enemy.pos, radius + 8, 24), Color(0.95, 0.8, 0.3, 0.6), 1.5)
	# Windup telegraph: the arc closes as the strike lands.
	if str(data.get("combatState", "")) == "windup":
		var windup := maxf(0.05, float(data.get("attackWindup", 0.5)))
		var progress := 1.0 - clampf(float(data.get("attackRemaining", 0)) / windup, 0.0, 1.0)
		draw_arc(bc, radius + 6, -PI / 2, -PI / 2 + TAU * progress, 24, Color(1, 0.35, 0.3, 0.85), 2.5)
	_draw_health_bar(p - Vector2(0, radius * 1.7 + 10), data)

func _draw_player(player: Dictionary) -> void:
	var p := iso(player.pos)
	var radius := float(player.data.get("radius", 18))
	var is_self := str(player.data.get("id", "")) == self_id
	_draw_shadow(p, radius)
	var level := int(player.data.get("level", 1))
	var stage := 1.18 if level >= 20 else (1.08 if level >= 10 else 1.0)
	var sprite_size := HERO_SIZE * stage
	var texture := _hero_texture(str(player.data.get("archetype", "vanguard")))
	# Walk bob while moving, gentle float while idle.
	var ticks := Time.get_ticks_msec() / 1000.0
	var moving: bool = player.pos.distance_to(player.target) > 2.0
	var bob := sin(ticks * 11.0) * 2.6 if moving else sin(ticks * 1.8) * 1.2
	if texture:
		var facing: Dictionary = player.data.get("facing", {})
		var facing_left := float(facing.get("x", 1)) < 0.0
		if facing_left:
			draw_set_transform(Vector2(2.0 * p.x, 0), 0.0, Vector2(-1, 1))
		draw_texture_rect(texture, Rect2(p - Vector2(sprite_size.x * 0.5, sprite_size.y + bob), sprite_size), false)
		if facing_left:
			draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
	else:
		var body := Color.from_string(str(player.data.get("color", "#54d3c2")), Color(0.3, 0.8, 0.75))
		draw_circle(p - Vector2(0, radius), radius, body)
	if player.get("flash", 0.0) > 0.0:
		draw_circle(p - Vector2(0, sprite_size.y * 0.45), radius * 1.2, Color(1, 0.5, 0.5, 0.3))
	if is_self:
		draw_polyline(_iso_ring(player.pos, radius + 6, 28), Color(1, 1, 1, 0.7), 1.5)
	_label(p - Vector2(0, sprite_size.y + 24), "%s L%d" % [str(player.data.get("name", "?")), level], 13)
	_draw_health_bar(p - Vector2(0, sprite_size.y + 8), player.data)

func _draw_projectile(projectile: Dictionary) -> void:
	var lift := Vector2(0, 14)
	var p := iso(projectile.pos) - lift
	var from_point := iso(Vector2(
		float(projectile.data.get("fromX", projectile.pos.x)),
		float(projectile.data.get("fromY", projectile.pos.y)),
	)) - lift
	var color := Color.from_string(str(projectile.data.get("color", "#ffffff")), Color.WHITE)
	if from_point.distance_to(p) > 1.0:
		draw_line(from_point, p, Color(color, 0.4), 3.0)
	var radius := float(projectile.data.get("radius", 6))
	draw_circle(p, radius * 0.7, color)
	draw_circle(p, radius * 0.3, Color(1, 1, 1, 0.9))

func _draw_health_bar(at: Vector2, data: Dictionary) -> void:
	var max_hp := maxf(1.0, float(data.get("maxHp", 1)))
	var ratio := clampf(float(data.get("hp", 0)) / max_hp, 0.0, 1.0)
	draw_rect(Rect2(at - Vector2(20, 2), Vector2(40, 4)), Color(0, 0, 0, 0.6), true)
	draw_rect(Rect2(at - Vector2(20, 2), Vector2(40 * ratio, 4)), Color(0.35, 0.8, 0.5), true)

# ---- Additive glow pass (called by glow.gd, draws with BLEND_MODE_ADD) --

func _draw_glow(canvas: CanvasItem) -> void:
	if not joined:
		return
	var pulse := 0.5 + 0.5 * sin(Time.get_ticks_msec() / 320.0)
	# Warm light pool under the hero.
	var me = players.get(self_id)
	if me and light_texture:
		var centre := iso(me.pos)
		canvas.draw_texture_rect(light_texture, Rect2(centre - Vector2(210, 132), Vector2(420, 264)),
			false, Color(0.55, 0.4, 0.26, 0.55))
	# Portal beams and rings.
	for portal in portals:
		if not (portal is Dictionary):
			continue
		var base := iso(Vector2(float(portal.get("x", 0)), float(portal.get("y", 0))))
		canvas.draw_line(base, base - Vector2(0, 66), Color(0.15, 0.5, 0.55, 0.35 + pulse * 0.3), 7.0)
		canvas.draw_circle(base, 15, Color(0.1, 0.35, 0.4, 0.5))
	# Beacon signal and town lamp glows.
	if map_theme == "town" and safe_zone.has("radius"):
		var centre := Vector2(float(safe_zone.x), float(safe_zone.y))
		var beacon := iso(centre)
		canvas.draw_line(beacon - Vector2(0, 118), beacon - Vector2(0, 200), Color(0.5, 0.1, 0.12, 0.2 + pulse * 0.2), 12.0)
		canvas.draw_circle(beacon - Vector2(0, 120), 9.0 + pulse * 4.0, Color(0.6, 0.12, 0.15, 0.55))
		var radius := float(safe_zone.radius)
		for index in 6:
			var angle := -PI / 2 + 0.42 + index * TAU / 6.0
			var lamp := iso(centre + Vector2(cos(angle), sin(angle)) * radius * 0.82)
			canvas.draw_circle(lamp - Vector2(0, 36), 10.0 + pulse * 2.0, Color(0.5, 0.36, 0.18, 0.4))
			if light_texture:
				canvas.draw_texture_rect(light_texture, Rect2(lamp - Vector2(52, 30), Vector2(104, 60)),
					false, Color(0.4, 0.28, 0.13, 0.5))
	# Projectile halos.
	for projectile in projectiles.values():
		var p := iso(projectile.pos) - Vector2(0, 14)
		var color := Color.from_string(str(projectile.data.get("color", "#ffffff")), Color.WHITE)
		canvas.draw_circle(p, float(projectile.data.get("radius", 6)) * 2.2, Color(color, 0.28))
	# Special drop beams.
	for drop in drops.values():
		if drop.data.get("dropClass") != null:
			var p := iso(drop.pos)
			var beam := Color(1.0, 0.45, 0.2, 0.3) if str(drop.data.get("dropClass")) == "uniq" else Color(1.0, 0.3, 0.55, 0.3)
			canvas.draw_line(p, p - Vector2(0, 80), beam, 5.0)
	# Ambient motes and impact sparks.
	var ramp: Array = BIOME_RAMPS.get(map_theme, BIOME_RAMPS["wastes"])
	var mote_color := Color(ramp[1]).lightened(0.5)
	for mote in motes:
		var fade: float = clampf(mote.age / 1.2, 0.0, 1.0) * clampf((mote.life - mote.age) / 1.6, 0.0, 1.0)
		canvas.draw_circle(iso(mote.pos) - Vector2(0, mote.z), 2.2, Color(mote_color, 0.5 * fade))
	for spark in sparks:
		var fade: float = 1.0 - spark.age / spark.life
		canvas.draw_circle(iso(spark.pos) - Vector2(0, 20), 2.5 * fade + 0.8, Color(spark.color, 0.85 * fade))

# ---- UI (built in code so the scene file stays trivial) ----------------

func _build_theme() -> Theme:
	var theme := Theme.new()
	var panel_style := StyleBoxFlat.new()
	panel_style.bg_color = Color(0.04, 0.05, 0.07, 0.93)
	panel_style.border_color = Color(0.86, 0.79, 0.66, 0.24)
	panel_style.set_border_width_all(1)
	panel_style.set_corner_radius_all(4)
	panel_style.set_content_margin_all(16)
	theme.set_stylebox("panel", "PanelContainer", panel_style)

	var button_normal := StyleBoxFlat.new()
	button_normal.bg_color = Color(0.09, 0.1, 0.13, 0.92)
	button_normal.border_color = Color(0.86, 0.79, 0.66, 0.2)
	button_normal.set_border_width_all(1)
	button_normal.set_corner_radius_all(3)
	button_normal.content_margin_left = 10
	button_normal.content_margin_right = 10
	button_normal.content_margin_top = 6
	button_normal.content_margin_bottom = 6
	var button_hover := button_normal.duplicate()
	button_hover.bg_color = Color(0.24, 0.09, 0.11, 0.95)
	button_hover.border_color = Color(0.89, 0.29, 0.36, 0.7)
	var button_pressed := button_normal.duplicate()
	button_pressed.bg_color = Color(0.35, 0.11, 0.14, 0.95)
	var button_disabled := button_normal.duplicate()
	button_disabled.bg_color = Color(0.07, 0.08, 0.1, 0.7)
	theme.set_stylebox("normal", "Button", button_normal)
	theme.set_stylebox("hover", "Button", button_hover)
	theme.set_stylebox("pressed", "Button", button_pressed)
	theme.set_stylebox("disabled", "Button", button_disabled)
	theme.set_color("font_color", "Button", Color(0.93, 0.95, 0.94))
	theme.set_color("font_disabled_color", "Button", Color(0.93, 0.95, 0.94, 0.35))
	theme.set_color("font_color", "Label", Color(0.9, 0.92, 0.9))

	var input_style := button_normal.duplicate()
	input_style.bg_color = Color(0.06, 0.07, 0.09, 0.95)
	theme.set_stylebox("normal", "LineEdit", input_style)
	theme.set_color("font_color", "LineEdit", Color(0.93, 0.95, 0.94))
	return theme

func _build_ui() -> void:
	var layer := CanvasLayer.new()
	add_child(layer)
	var root := Control.new()
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.theme = _build_theme()
	layer.add_child(root)

	# Title art streamed from the server as the lobby backdrop.
	var lobby_bg := TextureRect.new()
	lobby_bg.set_anchors_preset(Control.PRESET_FULL_RECT)
	lobby_bg.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
	lobby_bg.mouse_filter = Control.MOUSE_FILTER_IGNORE
	lobby_bg.modulate = Color(0.62, 0.6, 0.62)
	root.add_child(lobby_bg)
	_server_texture("/assets/scenes/crimson-relay-eclipse.webp")

	var panel := PanelContainer.new()
	panel.set_anchors_preset(Control.PRESET_CENTER)
	panel.custom_minimum_size = Vector2(360, 0)
	root.add_child(panel)
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 10)
	panel.add_child(box)

	var title := Label.new()
	title.text = "CRIMSON RELAY"
	title.add_theme_font_size_override("font_size", 26)
	title.add_theme_color_override("font_color", Color(0.89, 0.35, 0.4))
	box.add_child(title)
	var subtitle := Label.new()
	subtitle.text = "中继接入 // Godot 客户端"
	subtitle.add_theme_font_size_override("font_size", 11)
	subtitle.add_theme_color_override("font_color", Color(0.6, 0.63, 0.62))
	box.add_child(subtitle)

	var name_input := LineEdit.new()
	name_input.placeholder_text = "操作员呼号（至少 2 字符）"
	name_input.text = "Godot-01"
	box.add_child(name_input)

	var archetype_select := OptionButton.new()
	archetype_select.add_item("vanguard")
	box.add_child(archetype_select)

	var join_button := Button.new()
	join_button.text = "接入中继"
	join_button.pressed.connect(_join)
	box.add_child(join_button)

	var status := Label.new()
	status.text = "未连接"
	status.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	status.custom_minimum_size = Vector2(340, 0)
	box.add_child(status)

	var roster := Label.new()
	roster.text = ""
	box.add_child(roster)

	var hud := Label.new()
	hud.position = Vector2(16, 12)
	hud.visible = false
	root.add_child(hud)

	var leave_button := Button.new()
	leave_button.text = "返回主画面 (Esc)"
	leave_button.position = Vector2(16, 60)
	leave_button.visible = false
	leave_button.pressed.connect(_leave)
	root.add_child(leave_button)

	var bag_button := Button.new()
	bag_button.text = "背包 (B)"
	bag_button.position = Vector2(170, 60)
	bag_button.visible = false
	bag_button.pressed.connect(_toggle_bag)
	root.add_child(bag_button)

	# Chat: bottom-left feed, channel selector, and input line.
	var chat_feed := Label.new()
	chat_feed.set_anchors_preset(Control.PRESET_BOTTOM_LEFT)
	chat_feed.offset_left = 16.0
	chat_feed.offset_top = -206.0
	chat_feed.offset_right = 360.0
	chat_feed.offset_bottom = -52.0
	chat_feed.vertical_alignment = VERTICAL_ALIGNMENT_BOTTOM
	chat_feed.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	chat_feed.add_theme_font_size_override("font_size", 12)
	chat_feed.visible = false
	root.add_child(chat_feed)
	var chat_row := HBoxContainer.new()
	chat_row.set_anchors_preset(Control.PRESET_BOTTOM_LEFT)
	chat_row.offset_left = 16.0
	chat_row.offset_top = -46.0
	chat_row.offset_right = 360.0
	chat_row.offset_bottom = -14.0
	chat_row.visible = false
	root.add_child(chat_row)
	var chat_channel := OptionButton.new()
	for pair in CHAT_CHANNELS:
		chat_channel.add_item(pair[1])
	chat_row.add_child(chat_channel)
	var chat_input := LineEdit.new()
	chat_input.placeholder_text = "Enter 聊天…"
	chat_input.max_length = 200
	chat_input.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	chat_input.text_submitted.connect(func(text: String) -> void:
		var cleaned := text.strip_edges()
		if cleaned != "":
			_send({"type": "chat", "channel": CHAT_CHANNELS[chat_channel.selected][0], "text": cleaned})
		chat_input.clear()
		chat_input.release_focus())
	chat_row.add_child(chat_input)

	# Skill bar, bottom centre: one button per slot with level/cooldown.
	var skill_bar := HBoxContainer.new()
	skill_bar.set_anchors_preset(Control.PRESET_CENTER_BOTTOM)
	skill_bar.offset_top = -86.0
	skill_bar.offset_bottom = -16.0
	skill_bar.grow_horizontal = Control.GROW_DIRECTION_BOTH
	skill_bar.add_theme_constant_override("separation", 6)
	skill_bar.visible = false
	root.add_child(skill_bar)
	var skill_buttons := {}
	for pair in SKILL_SLOTS:
		var slot: String = pair[0]
		var button := Button.new()
		button.custom_minimum_size = Vector2(88, 64)
		button.text = pair[1]
		button.pressed.connect(func() -> void: pulses[slot] = true)
		skill_bar.add_child(button)
		skill_buttons[slot] = button

	# Bag panel, right side: item rows rebuilt when the bag changes.
	var bag_panel := PanelContainer.new()
	bag_panel.set_anchors_preset(Control.PRESET_CENTER_RIGHT)
	bag_panel.offset_left = -330.0
	bag_panel.offset_right = -14.0
	bag_panel.offset_top = -240.0
	bag_panel.offset_bottom = 240.0
	bag_panel.visible = false
	root.add_child(bag_panel)
	var bag_box := VBoxContainer.new()
	bag_panel.add_child(bag_box)
	var bag_title := Label.new()
	bag_title.text = "背包"
	bag_box.add_child(bag_title)
	var bag_scroll := ScrollContainer.new()
	bag_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	bag_box.add_child(bag_scroll)
	var bag_list := VBoxContainer.new()
	bag_list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	bag_scroll.add_child(bag_list)

	# Soft vignette for depth, and the bottom-right minimap.
	var vignette := TextureRect.new()
	var vignette_texture := GradientTexture2D.new()
	vignette_texture.width = 512
	vignette_texture.height = 320
	vignette_texture.fill = GradientTexture2D.FILL_RADIAL
	vignette_texture.fill_from = Vector2(0.5, 0.5)
	vignette_texture.fill_to = Vector2(0.5, 1.0)
	var vignette_gradient := Gradient.new()
	vignette_gradient.colors = PackedColorArray([Color(0, 0, 0, 0), Color(0, 0, 0, 0), Color(0, 0, 0, 0.42)])
	vignette_gradient.offsets = PackedFloat32Array([0.0, 0.58, 1.0])
	vignette_texture.gradient = vignette_gradient
	vignette.texture = vignette_texture
	vignette.stretch_mode = TextureRect.STRETCH_SCALE
	vignette.set_anchors_preset(Control.PRESET_FULL_RECT)
	vignette.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(vignette)
	root.move_child(vignette, 0)

	var minimap := Control.new()
	minimap.set_script(load("res://scripts/minimap.gd"))
	minimap.set_anchors_preset(Control.PRESET_BOTTOM_RIGHT)
	minimap.offset_left = -206.0
	minimap.offset_top = -124.0
	minimap.offset_right = -14.0
	minimap.offset_bottom = -16.0
	minimap.mouse_filter = Control.MOUSE_FILTER_IGNORE
	minimap.main = self
	root.add_child(minimap)

	ui = {
		"lobby_bg": lobby_bg,
		"join_panel": panel,
		"name_input": name_input,
		"archetype_select": archetype_select,
		"status": status,
		"roster": roster,
		"hud": hud,
		"leave_button": leave_button,
		"bag_button": bag_button,
		"skill_bar": skill_bar,
		"skill_buttons": skill_buttons,
		"bag_panel": bag_panel,
		"bag_title": bag_title,
		"bag_list": bag_list,
		"chat_feed": chat_feed,
		"chat_row": chat_row,
		"chat_input": chat_input,
	}

func _toggle_bag() -> void:
	ui.bag_panel.visible = not ui.bag_panel.visible
	bag_signature = ""

func _fill_archetypes(archetypes: Dictionary) -> void:
	if archetypes.is_empty():
		return
	ui.archetype_select.clear()
	var keys := archetypes.keys()
	keys.sort()
	for key in keys:
		ui.archetype_select.add_item(str(key))
	ui.archetype_select.select(keys.find("vanguard") if keys.has("vanguard") else 0)

func _render_roster(entries: Array) -> void:
	var lines := PackedStringArray()
	for entry in entries:
		if entry is Dictionary:
			lines.append("%s · %s · L%d" % [
				str(entry.get("name", "?")), str(entry.get("archetype", "?")), int(entry.get("level", 1)),
			])
	ui.roster.text = "在线：无人" if lines.is_empty() else "在线：\n" + "\n".join(lines)

func _update_hud(data: Dictionary) -> void:
	var inventory: Array = data.get("inventory", [])
	ui.hud.text = "%s  L%d  HP %d/%d  MP %d/%d  金币 %d  背包 %d  %s  在线 %d" % [
		str(data.get("name", "")), int(data.get("level", 1)),
		int(data.get("hp", 0)), int(data.get("maxHp", 1)),
		int(data.get("mp", 0)), int(data.get("maxMp", 1)),
		int(data.get("gold", 0)), inventory.size(), map_name, online_count,
	]
	ui.hud.visible = true
	ui.leave_button.visible = true
	ui.bag_button.visible = true
	_update_skill_bar(data)
	if ui.bag_panel.visible:
		_update_bag(data)

func _update_skill_bar(data: Dictionary) -> void:
	var skills: Dictionary = data.get("skills", {})
	var hero: Dictionary = archetype_meta.get(str(data.get("archetype", "")), {})
	for pair in SKILL_SLOTS:
		var slot: String = pair[0]
		var button: Button = ui.skill_buttons[slot]
		if slot == "primary":
			var primary: Dictionary = hero.get("primary", {})
			button.text = "M1\n%s" % str(primary.get("name", "普攻"))
			continue
		var skill = skills.get(slot)
		if not (skill is Dictionary):
			button.text = pair[1]
			continue
		var unlocked := bool(skill.get("unlocked", true))
		var remaining := float(skill.get("remaining", 0))
		var line := "%s Lv%d" % [str(skill.get("name", "")), int(skill.get("level", 0))]
		if not unlocked:
			line = "%s (L%d解锁)" % [str(skill.get("name", "")), int(skill.get("unlockLevel", 1))]
		elif remaining > 0.05:
			line += "  %.1fs" % remaining
		button.text = "%s\n%s" % [pair[1], line]
		button.disabled = not unlocked
		button.modulate = Color(1, 1, 1, 0.55) if remaining > 0.05 else Color.WHITE

func _update_bag(data: Dictionary) -> void:
	var inventory: Array = data.get("inventory", [])
	var signature := ""
	for item in inventory:
		signature += str(item.get("id", "")) + ","
	if signature == bag_signature:
		return
	bag_signature = signature
	ui.bag_title.text = "背包 %d" % inventory.size()
	for child in ui.bag_list.get_children():
		child.queue_free()
	for item in inventory:
		if not (item is Dictionary):
			continue
		var row := HBoxContainer.new()
		var label := Label.new()
		var rarity := str(item.get("rarity", "common"))
		label.text = "%s L%d" % [str(item.get("name", "?")), int(item.get("level", 1))]
		label.modulate = RARITY_COLORS.get(rarity, Color.WHITE)
		label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row.add_child(label)
		var item_id := str(item.get("id", ""))
		var is_potion := item.get("heal") != null
		var action := Button.new()
		action.text = "用" if is_potion else "装"
		action.pressed.connect(func() -> void:
			_send({"type": "use" if is_potion else "equip", "item": item_id}))
		row.add_child(action)
		var sell := Button.new()
		sell.text = "卖"
		sell.pressed.connect(func() -> void: _send({"type": "sell", "item": item_id}))
		row.add_child(sell)
		ui.bag_list.add_child(row)

func _show_lobby(message: String) -> void:
	joined = false
	self_id = ""
	bag_signature = ""
	for store in [players, enemies, drops, projectiles]:
		store.clear()
	ui.lobby_bg.visible = true
	ui.join_panel.visible = true
	ui.hud.visible = false
	ui.leave_button.visible = false
	ui.bag_button.visible = false
	ui.skill_bar.visible = false
	ui.bag_panel.visible = false
	ui.chat_feed.visible = false
	ui.chat_row.visible = false
	chat_lines.clear()
	if message != "":
		_set_status(message)

func _set_status(text: String) -> void:
	ui.status.text = text

# ---- Session token persistence -----------------------------------------

func _token_key(player_name: String) -> String:
	return player_name.strip_edges().to_lower()

func _load_token(player_name: String) -> String:
	var config := ConfigFile.new()
	if config.load(TOKEN_FILE) != OK:
		return ""
	return str(config.get_value("tokens", _token_key(player_name), ""))

func _store_token(player_name: String, token: String) -> void:
	if player_name == "" or token == "":
		return
	var config := ConfigFile.new()
	config.load(TOKEN_FILE)
	config.set_value("tokens", _token_key(player_name), token)
	config.save(TOKEN_FILE)
