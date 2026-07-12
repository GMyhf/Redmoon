extends Node2D
# Native client for CRIMSON RELAY (protocol v2), isometric edition.
#
# Server state is authoritative; this client renders snapshots and forwards
# intents. The isometric projection matches the browser client
# (sx = wx - wy, sy = (wx + wy) / 2), art streams over HTTP from the game
# server (WebP), and snapshots arrive as binary1 frames (negotiated via the
# join codec field; see src/server/codec.js for the layout). The protocol
# contract lives in src/server/protocol.js.

const SERVER_URL := "ws://127.0.0.1:3000/ws"
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

# One body colour per species; the silhouettes live in _draw_enemy.
const SPECIES_COLORS := {
	"riftling": Color(0.74, 0.3, 0.35), "duskfang": Color(0.56, 0.36, 0.3),
	"ashwing": Color(0.62, 0.46, 0.4), "thorncrawler": Color(0.46, 0.52, 0.34),
	"stonehorn": Color(0.56, 0.5, 0.44), "frostseer": Color(0.52, 0.66, 0.8),
	"scraphulk": Color(0.52, 0.42, 0.3), "stormeye": Color(0.56, 0.52, 0.76),
	"voidmaw": Color(0.42, 0.3, 0.52),
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
var camera := Camera2D.new()
var ui := {}
var bag_signature := ""
var smoke_timer := -1.0               # CRIMSON_SMOKE=<seconds>: headless verification run

# ---- Isometric projection (matches public/client.js) --------------------

func iso(world_point: Vector2) -> Vector2:
	return Vector2(world_point.x - world_point.y, (world_point.x + world_point.y) * 0.5)

func from_iso(iso_point: Vector2) -> Vector2:
	return Vector2(iso_point.y + iso_point.x * 0.5, iso_point.y - iso_point.x * 0.5)

func _ready() -> void:
	texture_repeat = CanvasItem.TEXTURE_REPEAT_ENABLED
	add_child(camera)
	camera.position = iso(world_size / 2)
	camera.make_current()
	_build_ui()
	_connect_socket()
	var smoke := OS.get_environment("CRIMSON_SMOKE")
	if smoke != "":
		smoke_timer = maxf(1.0, float(smoke))

func _connect_socket() -> void:
	socket = WebSocketPeer.new()
	var err := socket.connect_to_url(SERVER_URL)
	socket_active = err == OK
	_set_status("连接中 %s" % SERVER_URL if socket_active else "连接失败：%s" % error_string(err))

# ---- Main loop ---------------------------------------------------------

func _process(delta: float) -> void:
	if smoke_timer > 0.0:
		smoke_timer -= delta
		if smoke_timer <= 0.0:
			_print_smoke_summary()
			get_tree().quit()
			return
	_poll_socket(delta)
	if joined:
		_interpolate(delta)
		_send_input(delta)
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
	map_theme = str(world.get("theme", map_theme))
	portals = world.get("portals", portals)
	var zone = world.get("safeZone")
	safe_zone = zone if zone is Dictionary else {}

func _apply_snapshot(snapshot: Dictionary) -> void:
	self_id = str(snapshot.get("selfId", self_id))
	online_count = int(snapshot.get("online", online_count))
	_apply_world(snapshot.get("world", {}))
	if snapshot.get("safeZone") is Dictionary:
		safe_zone = snapshot["safeZone"]
	_sync_store(players, snapshot.get("players", []))
	_sync_store(enemies, snapshot.get("enemies", []))
	_sync_store(drops, snapshot.get("drops", []))
	_sync_store(projectiles, snapshot.get("projectiles", []))
	if not joined and players.has(self_id):
		joined = true
		ui.join_panel.visible = false
		ui.hud.visible = true
		ui.skill_bar.visible = true
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

func _sync_store(store: Dictionary, entries: Array) -> void:
	var seen := {}
	for raw in entries:
		if not (raw is Dictionary):
			continue
		var id := str(raw.get("id", ""))
		seen[id] = true
		var target := Vector2(float(raw.get("x", 0)), float(raw.get("y", 0)))
		if store.has(id):
			store[id].target = target
			store[id].data = raw
		else:
			store[id] = {"pos": target, "target": target, "data": raw}
	for id in store.keys():
		if not seen.has(id):
			store.erase(id)

func _handle_event(event: Dictionary) -> void:
	var name := str(event.get("event", ""))
	match name:
		"bossSpawned":
			_set_status("Boss 出现：%s" % str(event.get("name", "")))
		"bossSlain":
			_set_status("Boss 被击破：%s" % str(event.get("name", "")))
		"lootPickedUp":
			if str(event.get("playerId", "")) == self_id and bool(event.get("autoEquipped", false)):
				_set_status("拾取并装备 %s" % str(event.get("name", "")))

# ---- Input -------------------------------------------------------------

func _interpolate(delta: float) -> void:
	var factor: float = 1.0 - exp(-delta * LERP_RATE)
	for store in [players, enemies, projectiles, drops]:
		for entity in store.values():
			entity.pos = entity.pos.lerp(entity.target, factor)

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
			KEY_ESCAPE: _leave()

# ---- Art fetched from the game server -----------------------------------

func _http_base() -> String:
	return SERVER_URL.replace("ws://", "http://").replace("wss://", "https://").trim_suffix("/ws")

# Returns the texture for a server asset path, or null while it downloads.
func _server_texture(path: String) -> Texture2D:
	if textures.has(path):
		return textures[path]
	textures[path] = null
	var request := HTTPRequest.new()
	add_child(request)
	request.request_completed.connect(func(_result: int, code: int, _headers: PackedStringArray, body: PackedByteArray) -> void:
		if code == 200:
			var image := Image.new()
			if image.load_webp_from_buffer(body) == OK:
				textures[path] = ImageTexture.create_from_image(image)
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

func _draw_ground() -> void:
	var corners := PackedVector2Array([
		iso(Vector2.ZERO),
		iso(Vector2(world_size.x, 0)),
		iso(world_size),
		iso(Vector2(0, world_size.y)),
	])
	var base: Color = THEME_COLORS.get(map_theme, Color(0.16, 0.15, 0.17))
	draw_colored_polygon(corners, base)
	var ground := _ground_texture()
	if ground:
		var repeats := world_size / GROUND_REPEAT
		var uvs := PackedVector2Array([
			Vector2.ZERO, Vector2(repeats.x, 0), repeats, Vector2(0, repeats.y),
		])
		# The affine world→iso map carries the texture onto the ground plane.
		draw_colored_polygon(corners, Color(0.62, 0.62, 0.66, 0.85), uvs, ground)
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

func _draw_zone_markers() -> void:
	if safe_zone.has("radius"):
		var centre := Vector2(float(safe_zone.x), float(safe_zone.y))
		var ring := _iso_ring(centre, float(safe_zone.radius))
		draw_colored_polygon(ring, Color(0.9, 0.75, 0.4, 0.05))
		draw_polyline(ring, Color(0.9, 0.75, 0.4, 0.55), 2.0)
	for portal in portals:
		if not (portal is Dictionary):
			continue
		var portal_pos := Vector2(float(portal.get("x", 0)), float(portal.get("y", 0)))
		draw_polyline(_iso_ring(portal_pos, 26, 24), Color(0.3, 0.8, 0.85), 2.0)
		var beam_base := iso(portal_pos)
		draw_line(beam_base, beam_base - Vector2(0, 60), Color(0.3, 0.8, 0.85, 0.35), 6.0)

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
	var bc := p - Vector2(0, radius * 0.7)
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
	_draw_shadow(p, radius)
	var texture := _hero_texture(str(player.data.get("archetype", "vanguard")))
	if texture:
		var facing: Dictionary = player.data.get("facing", {})
		var facing_left := float(facing.get("x", 1)) < 0.0
		if facing_left:
			draw_set_transform(Vector2(2.0 * p.x, 0), 0.0, Vector2(-1, 1))
		draw_texture_rect(texture, Rect2(p - Vector2(HERO_SIZE.x * 0.5, HERO_SIZE.y), HERO_SIZE), false)
		if facing_left:
			draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
	else:
		var body := Color.from_string(str(player.data.get("color", "#54d3c2")), Color(0.3, 0.8, 0.75))
		draw_circle(p - Vector2(0, radius), radius, body)
	if str(player.data.get("id", "")) == self_id:
		draw_polyline(_iso_ring(player.pos, radius + 6, 28), Color(1, 1, 1, 0.7), 1.5)
	var font := ThemeDB.fallback_font
	var label := "%s L%d" % [str(player.data.get("name", "?")), int(player.data.get("level", 1))]
	draw_string(font, p + Vector2(-60, -HERO_SIZE.y - 14), label,
		HORIZONTAL_ALIGNMENT_CENTER, 120, 13, Color.WHITE)
	_draw_health_bar(p - Vector2(0, HERO_SIZE.y + 8), player.data)

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
	draw_circle(p, float(projectile.data.get("radius", 6)) * 0.7, color)
	draw_circle(p, float(projectile.data.get("radius", 6)) * 0.3, Color(1, 1, 1, 0.9))

func _draw_health_bar(at: Vector2, data: Dictionary) -> void:
	var max_hp := maxf(1.0, float(data.get("maxHp", 1)))
	var ratio := clampf(float(data.get("hp", 0)) / max_hp, 0.0, 1.0)
	draw_rect(Rect2(at - Vector2(20, 2), Vector2(40, 4)), Color(0, 0, 0, 0.6), true)
	draw_rect(Rect2(at - Vector2(20, 2), Vector2(40 * ratio, 4)), Color(0.35, 0.8, 0.5), true)

# ---- UI (built in code so the scene file stays trivial) ----------------

func _build_ui() -> void:
	var layer := CanvasLayer.new()
	add_child(layer)
	var root := Control.new()
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	layer.add_child(root)

	var panel := PanelContainer.new()
	panel.set_anchors_preset(Control.PRESET_CENTER)
	panel.custom_minimum_size = Vector2(360, 0)
	root.add_child(panel)
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 10)
	panel.add_child(box)

	var title := Label.new()
	title.text = "CRIMSON RELAY — Godot 客户端"
	box.add_child(title)

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

	ui = {
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
	ui.join_panel.visible = true
	ui.hud.visible = false
	ui.leave_button.visible = false
	ui.bag_button.visible = false
	ui.skill_bar.visible = false
	ui.bag_panel.visible = false
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
