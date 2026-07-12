extends Node2D
# Minimal native client for CRIMSON RELAY (protocol v2).
#
# Scope: connect -> welcome -> join (session token + protocol handshake) ->
# render snapshots -> send input -> leave. The server stays authoritative;
# this client only draws server state and forwards intents, mirroring
# public/client.js semantics. The protocol contract lives in
# src/server/protocol.js.

const SERVER_URL := "ws://127.0.0.1:3000/ws"
const CLIENT_PROTOCOL := 2
const INPUT_INTERVAL := 0.05          # 20 Hz, same as the browser client
const LERP_RATE := 14.0               # snapshot smoothing, ~browser feel
const RECONNECT_DELAY := 3.0
const TOKEN_FILE := "user://session.cfg"

var socket := WebSocketPeer.new()
var socket_active := false
var reconnect_timer := 0.0
var joined := false
var self_id := ""
var world_size := Vector2(4800, 2700)
var safe_zone := {}                   # {x, y, radius} or empty
var portals: Array = []
var map_name := ""
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

var camera := Camera2D.new()
var ui := {}
var smoke_timer := -1.0               # CRIMSON_SMOKE=<seconds>: headless verification run

func _ready() -> void:
	add_child(camera)
	camera.position = world_size / 2
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
			print("smoke: joined=%s players=%d enemies=%d drops=%d online=%d pos=%s" % [
				str(joined), players.size(), enemies.size(), drops.size(), online_count,
				str(me.pos.round()) if me else "n/a",
			])
			get_tree().quit()
			return
	_poll_socket(delta)
	if joined:
		_interpolate(delta)
		_send_input(delta)
		var me = players.get(self_id)
		if me:
			camera.position = me.pos
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
		camera.position = me.pos
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
	var move := Vector2.ZERO
	if Input.is_physical_key_pressed(KEY_W) or Input.is_physical_key_pressed(KEY_UP): move.y -= 1
	if Input.is_physical_key_pressed(KEY_S) or Input.is_physical_key_pressed(KEY_DOWN): move.y += 1
	if Input.is_physical_key_pressed(KEY_A) or Input.is_physical_key_pressed(KEY_LEFT): move.x -= 1
	if Input.is_physical_key_pressed(KEY_D) or Input.is_physical_key_pressed(KEY_RIGHT): move.x += 1
	move = move.normalized()
	var aim := get_global_mouse_position().clamp(Vector2.ZERO, world_size)
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
		var world_point := get_global_mouse_position().clamp(Vector2.ZERO, world_size)
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

# ---- Rendering ---------------------------------------------------------

func _draw() -> void:
	var font := ThemeDB.fallback_font
	# World bounds and town safe zone.
	draw_rect(Rect2(Vector2.ZERO, world_size), Color(0.09, 0.1, 0.12), true)
	draw_rect(Rect2(Vector2.ZERO, world_size), Color(0.4, 0.35, 0.3), false, 4.0)
	if safe_zone.has("radius"):
		var centre := Vector2(float(safe_zone.x), float(safe_zone.y))
		draw_circle(centre, float(safe_zone.radius), Color(0.9, 0.75, 0.4, 0.08))
		draw_arc(centre, float(safe_zone.radius), 0, TAU, 64, Color(0.9, 0.75, 0.4, 0.6), 2.0)
	for portal in portals:
		if portal is Dictionary:
			var portal_pos := Vector2(float(portal.get("x", 0)), float(portal.get("y", 0)))
			draw_circle(portal_pos, 26, Color(0.3, 0.8, 0.85, 0.35))
			draw_arc(portal_pos, 26, 0, TAU, 24, Color(0.3, 0.8, 0.85), 2.0)
	for drop in drops.values():
		var rarity := str(drop.data.get("rarity", "common"))
		var drop_color := Color(0.9, 0.8, 0.4) if rarity in ["epic", "relic"] else Color(0.7, 0.7, 0.6)
		draw_rect(Rect2(drop.pos - Vector2(5, 5), Vector2(10, 10)), drop_color, true)
	for enemy in enemies.values():
		var radius := float(enemy.data.get("radius", 16))
		var body := Color(0.55, 0.15, 0.2) if bool(enemy.data.get("boss", false)) else Color(0.75, 0.28, 0.32)
		if bool(enemy.data.get("elite", false)):
			body = Color(0.85, 0.5, 0.2)
		draw_circle(enemy.pos, radius, body)
		_draw_health_bar(enemy.pos - Vector2(0, radius + 10), enemy.data)
	for player in players.values():
		var radius := float(player.data.get("radius", 18))
		var body := Color.from_string(str(player.data.get("color", "#54d3c2")), Color(0.3, 0.8, 0.75))
		draw_circle(player.pos, radius, body)
		if str(player.data.get("id", "")) == self_id:
			draw_arc(player.pos, radius + 3, 0, TAU, 32, Color.WHITE, 2.0)
		var label := "%s L%d" % [str(player.data.get("name", "?")), int(player.data.get("level", 1))]
		draw_string(font, player.pos + Vector2(-60, -radius - 16), label,
			HORIZONTAL_ALIGNMENT_CENTER, 120, 13, Color.WHITE)
		_draw_health_bar(player.pos - Vector2(0, radius + 8), player.data)
	for projectile in projectiles.values():
		var proj_color := Color.from_string(str(projectile.data.get("color", "#ffffff")), Color.WHITE)
		draw_circle(projectile.pos, float(projectile.data.get("radius", 6)) * 0.7, proj_color)

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
