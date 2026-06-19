# sakura-bed-wall-aligned-v10-r2-20260618

**png**: `assets/objects/sakura-bed-pink-single-leftwall.png`
**created_at**: 2026-06-19T00:17:06.497Z
**purpose**: サクラ部屋ベッド、左壁這う orientation v10 (r2 リトライ)。Eye 160, Rotation -65, Lateral 10, Depth 30。前回 worker が SQLite readonly で claim 失敗。

## Codex prompt

Generate a single-size pastel-pink bed in EXACT wall-aligned orientation. Standalone PNG on TRANSPARENT background.

CAMERA / PROJECTION (EXACT VALUES — same as wardrobe v10):
- Eye-level: 160 cm
- Camera tilt: 10° downward
- Rotation: -65° yaw (negative). HEADBOARD short end face is DOMINANT (~70% silhouette width on camera-LEFT). FRONT long side narrower zone (~30% camera-RIGHT). BACK long side hidden (against wall).
- Lateral axis: 10° below horizontal, sloping DOWN-LEFT
- Depth axis: 30° from horizontal, sloping UP-RIGHT
- Projection: perspective (weak)
- Bed: ~200cm long × ~100cm wide × ~45cm tall

ORIENTATION:
- Bed's LONG axis (head-to-foot) runs ALONG the LEFT wall
- HEAD end (headboard) on camera-LEFT (closer to camera)
- FOOT end on camera-RIGHT (further, toward back wall corner)
- LONG BACK side flush against LEFT wall (hidden)
- LONG FRONT side (body pillow + drawers) visible at steep angle on camera-RIGHT (~30%)
- TOP (bedspread, pillows, plushies, heart cushion) prominently visible (low bed + 160cm eye-level)

VISIBLE FACES:
- HEADBOARD short end: dominant (~70% width, camera-LEFT). Upholstered headboard panel + mattress edge sliver
- FRONT LONG SIDE (camera-RIGHT, ~30%): partial body pillow + foreshortened drawer + mattress edge
- TOP plane: prominent parallelogram — bedspread, cream pillow, pink pillow, body pillow lengthwise, heart cushion, plush bunny
- BACK long side hidden
- FOOT short end hidden
- BOTTOM hidden

BED STRUCTURE:
- Single mattress, honey oak frame
- Padded/upholstered headboard at HEAD end (camera-LEFT)
- Storage drawers on visible FRONT long side (2-3 drawers, small round wood knobs)
- Mattress thick

BEDDING (pastel girly):
- Bedspread: pastel pink + cream fold-back along headboard
- Cream rectangular pillow + smaller pink pillow at HEAD end
- Body pillow lengthwise (pastel pink + darker pink stripe)
- Heart cushion (dusty rose)
- Plush bunny (cream/pale pink, abstract dot eyes only)

PALETTE:
- Wood: honey oak
- Headboard upholstery + bedspread: pastel pink
- Cream pillow / fold-back: cream
- Body pillow stripe: darker pink
- Heart cushion: dusty rose
- Plushie: cream + dusty rose ears/cheeks

INTERNAL HARD-EDGED SHADOWS (volume only — NO floor shadow):
- Bedspread folds at mattress edge
- Pillow indentations
- Drawer recess
- TOP plane vs side drape tone difference
- Headboard volume shadow
- Mattress edge band at headboard base

STYLE — STRICT L1b:
- NO outlines, color blocks only
- KEEP flat texture motifs (fabric weave dashes, wood-grain strokes)
- KEEP hard-edged shadow shapes
- NO gradients, airbrush, photorealism, cel-shading rim light

BACKGROUND:
- Fully TRANSPARENT (alpha) — NO room, NO wall, NO floor, NO baseboard
- Snug bbox
- NO drop shadow on floor

ANTI-REQUIREMENTS:
- Eye-level MUST be 160 cm (NOT sitting 100-120)
- Rotation MUST be -65° (NOT +30°, NOT other negative values)
- Lateral 10°, Depth 30° exactly
- HEAD dominant on camera-LEFT (~70%), FRONT long side narrower on camera-RIGHT (~30%)
- BACK long side MUST be hidden
- TOP MUST be prominently visible
- NO ranges
- NO axonometric / isometric / dimetric / trimetric / parallel projection / orthographic
- NO outlines / line-art / photorealism / 3D-render
- NO room background
- NO drop shadow on ground
- NO red wireframe lines
- NO labels / text
- NO human / faces / realistic plushie face
- NO gradients, airbrush, cel-shading rim lights
- NO standard +30° front-LEFT 3/4 view

DELIVERABLE: One single-size bed at eye 160cm, Rotation -65°, Lateral 10° below, Depth 30°. HEADBOARD dominant camera-LEFT, FRONT long side narrower camera-RIGHT, TOP prominent. Honey oak + pastel pink, L1b flat, transparent BG, no drop shadow.
