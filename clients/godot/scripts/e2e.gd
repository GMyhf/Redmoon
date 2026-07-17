extends SceneTree

var failures := 0

func _init() -> void:
	var args := OS.get_cmdline_user_args()
	var url := "ws://127.0.0.1:3000/ws"
	for index in range(args.size() - 1):
		if args[index] == "--url":
			url = args[index + 1]
	var left := WebSocketPeer.new()
	var right := WebSocketPeer.new()
	left.connect_to_url(url)
	right.connect_to_url(url)
	if not await await_open(left, "left") or not await await_open(right, "right"):
		quit(1)
		return
	left.send_text(JSON.stringify({"type": "join", "protocol": 5, "name": "Godot-A", "archetype": "vanguard", "nextToken": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"}))
	right.send_text(JSON.stringify({"type": "join", "protocol": 5, "name": "Godot-B", "archetype": "strider", "nextToken": "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB"}))
	var welcome_a: Dictionary = await await_message(left, "welcome")
	var welcome_b: Dictionary = await await_message(right, "welcome")
	if welcome_a.is_empty() or welcome_b.is_empty():
		quit(1)
		return
	# `welcome` is sent on socket open, before the join command is processed.
	# Wait for one post-join snapshot so both server-side seats exist before
	# either client addresses the other.
	if (await await_message(left, "snapshot")).is_empty() or (await await_message(right, "snapshot")).is_empty():
		quit(1)
		return
	var id_a := str(welcome_a.get("playerId", ""))
	var id_b := str(welcome_b.get("playerId", ""))
	left.send_text(JSON.stringify({"type": "duelInvite", "target": id_b}))
	var invite: Dictionary = await await_event(right, "duelInvited")
	if invite.is_empty():
		fail("right client did not receive duel invite")
	else:
		right.send_text(JSON.stringify({"type": "duelAccept", "from": id_a}))
		if ((await await_event(left, "duelStarted")).is_empty()
			or (await await_event(right, "duelStarted")).is_empty()):
			fail("both clients did not receive duelStarted")
	# The Node harness raises both accounts before this phase.
	left.send_text(JSON.stringify({"type": "armyCreate", "name": "Godot Relay", "camp": "freehold"}))
	if (await await_event(left, "armyCreated")).is_empty():
		fail("commander did not create an army")
	left.send_text(JSON.stringify({"type": "armyInvite", "target": id_b}))
	var army_invite: Dictionary = await await_event(right, "armyInvited")
	if army_invite.is_empty():
		fail("right client did not receive army invite")
	else:
		right.send_text(JSON.stringify({"type": "armyAccept", "from": id_a}))
		if (await await_event(right, "armyJoined")).is_empty():
			fail("right client did not receive armyJoined")
	print("godot e2e: duel and army passed")
	quit(1 if failures > 0 else 0)

func await_open(peer: WebSocketPeer, label: String) -> bool:
	var deadline := Time.get_ticks_msec() + 3000
	while Time.get_ticks_msec() < deadline:
		peer.poll()
		if peer.get_ready_state() == WebSocketPeer.STATE_OPEN:
			return true
		await process_frame
	fail("%s client did not open" % label)
	return false

func await_message(peer: WebSocketPeer, wanted: String) -> Dictionary:
	var deadline := Time.get_ticks_msec() + 4000
	while Time.get_ticks_msec() < deadline:
		peer.poll()
		while peer.get_available_packet_count() > 0:
			var parsed: Variant = JSON.parse_string(peer.get_packet().get_string_from_utf8())
			if parsed is Dictionary and str(parsed.get("type", "")) == wanted:
				return parsed
		await process_frame
	fail("missing %s" % wanted)
	return {}

func await_event(peer: WebSocketPeer, wanted: String) -> Dictionary:
	var deadline := Time.get_ticks_msec() + 4000
	while Time.get_ticks_msec() < deadline:
		peer.poll()
		while peer.get_available_packet_count() > 0:
			var parsed: Variant = JSON.parse_string(peer.get_packet().get_string_from_utf8())
			if parsed is Dictionary and str(parsed.get("type", "")) == "event":
				if str(parsed.get("event", "")) == wanted:
					return parsed
		await process_frame
	fail("missing event %s" % wanted)
	return {}

func fail(message: String) -> void:
	failures += 1
	printerr("FAIL: " + message)
