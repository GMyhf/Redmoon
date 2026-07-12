extends Control
# Bottom-right minimap: map bounds, safe zone, portals, and entity dots,
# mirroring the browser client's overview.

var main: Node2D

func _process(_delta: float) -> void:
	queue_redraw()

func _draw() -> void:
	if main == null or not main.joined:
		return
	var box := size
	draw_rect(Rect2(Vector2.ZERO, box), Color(0.03, 0.04, 0.05, 0.62), true)
	draw_rect(Rect2(Vector2.ZERO, box), Color(0.6, 0.55, 0.45, 0.8), false, 1.0)
	var to_map: Vector2 = box / main.world_size
	if main.safe_zone.has("radius"):
		var centre: Vector2 = Vector2(float(main.safe_zone.x), float(main.safe_zone.y)) * to_map
		draw_arc(centre, float(main.safe_zone.radius) * to_map.x, 0, TAU, 20, Color(0.9, 0.75, 0.4, 0.7), 1.0)
	for portal in main.portals:
		if portal is Dictionary:
			var p: Vector2 = Vector2(float(portal.get("x", 0)), float(portal.get("y", 0))) * to_map
			draw_rect(Rect2(p - Vector2(1.5, 1.5), Vector2(3, 3)), Color(0.3, 0.8, 0.85), true)
	for drop in main.drops.values():
		draw_rect(Rect2(drop.pos * to_map - Vector2(1, 1), Vector2(2, 2)), Color(0.9, 0.8, 0.4), true)
	for enemy in main.enemies.values():
		var color := Color(0.85, 0.3, 0.32)
		var dot := 2.0
		if bool(enemy.data.get("boss", false)):
			color = Color(1.0, 0.15, 0.2)
			dot = 4.0
		elif bool(enemy.data.get("elite", false)):
			color = Color(0.95, 0.75, 0.3)
		draw_rect(Rect2(enemy.pos * to_map - Vector2(dot, dot) / 2, Vector2(dot, dot)), color, true)
	for player in main.players.values():
		var is_self: bool = str(player.data.get("id", "")) == main.self_id
		draw_rect(
			Rect2(player.pos * to_map - Vector2(1.5, 1.5), Vector2(3, 3)),
			Color.WHITE if is_self else Color(0.35, 0.85, 0.75),
			true,
		)
