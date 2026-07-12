extends Node2D
# Additive glow layer: everything luminous (light pools, beams, halos,
# motes, sparks) draws here with BLEND_MODE_ADD, which is what makes glows
# read as light instead of flat washes — the browser's "lighter" composite.

var main: Node2D

func _ready() -> void:
	var glow_material := CanvasItemMaterial.new()
	glow_material.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD
	material = glow_material

func _process(_delta: float) -> void:
	queue_redraw()

func _draw() -> void:
	if main:
		main._draw_glow(self)
