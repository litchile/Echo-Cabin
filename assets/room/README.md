# Echo Cabin Room Assets

- The only current formal asset directory is `res://assets/room/layers_1920x1080/`.
- This directory contains 11 image files total:
  - 9 runtime layers used by `room_prototype.tscn`;
  - 1 final visual reference: `00_final_room_reference.jpg`;
  - 1 window-view source backup: `00_window_view_source.png` (not used at runtime).
- The formal canvas size is 1920 × 1080; all layers come from the same PSD and share one coordinate system.
- In Godot, every room `Sprite2D` uses Position `(0, 0)`, Scale `(1, 1)`, and Centered `false`.
- Legacy room assets are deprecated and archived outside `res://`; do not restore assets from the archive.
- `00_final_room_reference.jpg` is the current visual reference.
- `res://scenes/room/room_prototype.tscn` is the current formal room prototype scene.
