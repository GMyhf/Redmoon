# Headless GDScript checks for the native client's pure logic.
#
# Run with: godot --headless --path clients/godot --script scripts/tests.gd
# (wired into `npm run test:godot` and CI).
#
# The browser client's rules live in the fast Node suite, but main.gd's own
# reading of the protocol had no cover at all — and the first thing that went
# wrong there was a JSON null: `duelEnded.winner` is null on a draw, and
# GDScript's str(null) is "<null>", not "", so a string-first check reported
# every draw as a loss. Anything in this client that interprets a server value
# belongs here.
extends SceneTree

const Main = preload("res://scripts/main.gd")

var failures := 0

func check(actual: Variant, expected: Variant, label: String) -> void:
	if actual == expected:
		print("  ok  %s" % label)
	else:
		failures += 1
		printerr("  FAIL %s: expected '%s', got '%s'" % [label, str(expected), str(actual)])

func _init() -> void:
	print("duel_end_status:")
	# A draw arrives as JSON null, exactly as the server sends it.
	var draw: Dictionary = JSON.parse_string('{"duelId":"a","winner":null,"loser":null,"reason":"timeout"}')
	check(Main.duel_end_status(draw, "me"), "决斗平局 — 时限已到", "a timeout draw is a draw, not a loss")

	var won: Dictionary = JSON.parse_string('{"duelId":"a","winner":"me","loser":"you","reason":"defeat"}')
	check(Main.duel_end_status(won, "me"), "决斗胜利", "winning reads as a win")

	var lost: Dictionary = JSON.parse_string('{"duelId":"a","winner":"you","loser":"me","reason":"defeat"}')
	check(Main.duel_end_status(lost, "me"), "决斗失败", "losing reads as a loss")

	if failures > 0:
		printerr("godot tests: %d failed" % failures)
		quit(1)
	else:
		print("godot tests: all passed")
		quit(0)
