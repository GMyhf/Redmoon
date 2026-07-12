extends Node2D
# Native client for CRIMSON RELAY (protocol v2), isometric edition.
#
# Server state is authoritative; this client renders snapshots and forwards
# intents. The isometric projection matches the browser client
# (sx = wx - wy, sy = (wx + wy) / 2), and art is reused straight from the
# game server over HTTP (/assets/... WebP files) — one source of truth, no
# copied files. Until a texture arrives, entities fall back to primitive
# shapes, mirroring the browser's progressive loading.
# The protocol contract lives in src/server/protocol.js.

const SERVER_URL := "ws://127.0.0.1:3000/ws"
const CLIENT_PROTOCOL := 2
const INPUT_INTERVAL := 0.05          # 20 Hz, same as the browser client
const LERP_RATE := 14.0               # snapshot smoothing, ~browser feel
const RECONNECT_DELAY := 3.0
const TOKEN_FILE := "user://session.cfg"
const HERO_SIZE := Vector2(58, 84)    # browser world-sprite footprint
const GROUND_REPEAT := 512.0          # texture repeat in world units

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
				var parsed = JSON.parse_string(socket.get_packet().get_string_from_utf8())
				if parsed is Dictionary:
					_handle_message(parsed)
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
			_fill_archetypes(message.get("archetypes", {}))
			_render_roster(message.get("roster", []))
			_set_status("已连接，选择角色进入")
			print("welcome: protocol v%d, %d archetypes" % [server_protocol, message.get("archetypes", {}).size()])
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

func _draw_enemy(enemy: Dictionary) -> void:
	var p := iso(enemy.pos)
	var radius := float(enemy.data.get("radius", 16))
	var body := Color(0.55, 0.15, 0.2) if bool(enemy.data.get("boss", false)) else Color(0.75, 0.28, 0.32)
	if bool(enemy.data.get("elite", false)):
		body = Color(0.85, 0.5, 0.2)
	_draw_shadow(p, radius)
	draw_circle(p - Vector2(0, radius * 0.7), radius, body)
	_draw_health_bar(p - Vector2(0, radius * 1.7 + 10), enemy.data)

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

	var panel := PanelContainer.new()
	panel.set_anchors_preset(Control.PRESET_CENTER)
	panel.custom_minimum_size = Vector2(360, 0)
	layer.add_child(panel)
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
	layer.add_child(hud)

	var leave_button := Button.new()
	leave_button.text = "返回主画面 (Esc)"
	leave_button.position = Vector2(16, 60)
	leave_button.visible = false
	leave_button.pressed.connect(_leave)
	layer.add_child(leave_button)

	ui = {
		"join_panel": panel,
		"name_input": name_input,
		"archetype_select": archetype_select,
		"status": status,
		"roster": roster,
		"hud": hud,
		"leave_button": leave_button,
	}

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
	ui.hud.text = "%s  L%d  HP %d/%d  金币 %d  %s  在线 %d" % [
		str(data.get("name", "")), int(data.get("level", 1)),
		int(data.get("hp", 0)), int(data.get("maxHp", 1)),
		int(data.get("gold", 0)), map_name, online_count,
	]
	ui.hud.visible = true
	ui.leave_button.visible = true

func _show_lobby(message: String) -> void:
	joined = false
	self_id = ""
	for store in [players, enemies, drops, projectiles]:
		store.clear()
	ui.join_panel.visible = true
	ui.hud.visible = false
	ui.leave_button.visible = false
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
