# school-chair-sitting-2to1-l1b-v2-20260619

**png**: `assets/objects/school-chair-front-dimetric.png`
**created_at**: 2026-06-19T08:33:47.517Z
**purpose**: 学校椅子の正面 dimetric 2:1 ビュー(v2)。前作 v1 はアウトラインありで v10 サイド系(L1b 無線・軟調セル)と未統一だった。geometry は sofa-sitting-2to1 系に揃え、style は chair-flat-l1b-r2 と v10 ワードローブ/ベッドに合わせる。

## Codex prompt

A single Japanese-style school classroom chair, drawn as a clean 2D furniture prop on a fully transparent background.

This is a STYLE REVISION of an earlier chair. The geometry (dimetric 2:1 projection, sitting eye-level) must match the reference sofa, but the visual style must match the existing flat L1b furniture series.

== STYLE — L1b FLAT, NO OUTLINES (CRITICAL — DIFFERENT FROM A CATALOG ICON) ==
Match the existing L1b furniture style used in the project:
- `assets/generated/chair-flat-l1b-r2-20260617.png` — the L1b chair (same chair, different angle).
- `assets/objects/sakura-wardrobe-leftwall.png` — L1b wardrobe in wall-aligned view.
- `assets/objects/sakura-bed-pink-single-leftwall.png` — L1b bed in wall-aligned view.

Style rules (strict):
- ABSOLUTELY NO outlines. NO black silhouette stroke. NO dark border lines around any shape. Zero-width strokes everywhere. Shapes must be separated PURELY by adjacent color blocks.
- Soft cel shading: each surface gets ONE flat base color plus AT MOST ONE darker shadow shape with a slightly soft / gently anti-aliased edge. NO crisp 2-tone vector ramps. NO heavy contrast cel ramps.
- Tiny dot / short-dash texture motifs sparsely scattered on the wood surfaces (the small flecks you see on `chair-flat-l1b-r2`), to suggest beech wood grain.
- Restrained warm wood palette: light warm beech-orange for the seat pan and backrest (matching `sakura-wardrobe-leftwall.png` wood tone), light cool grey for the steel tubes (matching `chair-flat-l1b-r2` steel tone).
- NO bold linework. NO vector-icon look. NO editorial-catalog ink outlines. NO Animal Crossing tile. NO isometric pixel art. NO game-shop icon. NO platform / hex / floor square under the chair.
- Soft, illustrated, picture-book feel — like the existing wardrobe and bed sides — not a sharp catalog SVG.

== CAMERA / EYE-LEVEL ==
The camera is at SITTING EYE-LEVEL — the viewer's eye is at the same height as a person sitting low on the floor, roughly at the chair's seat-pan top. The TOP of the chair (seat-pan surface, top of the backrest slab) is only slightly visible. The front face of the seat and the front face of the backrest are the dominant visible surfaces. The underside of the seat is NEVER visible.

== ANGLE — DIMETRIC PROJECTION, MATCH THE REFERENCE SOFA ==
The chair must use the SAME dimetric axonometric projection as the reference sofa `assets/generated/sofa-sitting-2to1-20260617.png` and the wireframe cuboid in `assets/references/angle-guide-cuboid-12-20.png`.

Critical proportions of the implicit bounding cuboid wrapping the chair:
- The cuboid's top face is a parallelogram with **width-to-depth visual ratio of 2:1** — the lateral edge is TWICE as long as the depth edge in the image. The seat-pan top must follow this same 2:1 parallelogram proportion.
- Width edges tilt at about 12 degrees upper-right.
- Depth edges tilt at about 20 degrees upper-left.
- Vertical edges (all four legs, the two backrest posts) remain perfectly vertical with zero tilt.
- Parallel projection — no perspective convergence anywhere. No vanishing points. Lines parallel in 3D stay parallel in the image. No foreshortening of long edges.

The seat-pan top surface is a 2:1 parallelogram opening upper-left along the 20-degree depth axis. The backrest is a separate thin vertical slab standing behind the seat with a clearly visible empty gap between the seat plane and the backrest plane. The four legs are pure vertical lines; the two back legs are partially visible behind the two front legs, never hidden, never merged into the front legs.

IMPORTANT: copy the PROJECTION from the sofa reference, but DO NOT copy its bold outline / ink-stroke style. Style comes from the L1b chair and L1b wardrobe references, NOT from the sofa.

== ORIENTATION ==
User side (sitting side, front face of the seat pan and front face of the backrest visible) faces the camera. The right-hand depth surfaces of the seat slab and the backrest slab are visible and drawn one shade darker than their front faces (using the same soft cel shading as the wardrobe sides, not crisp 2-tone). Implied light from upper-left.

== DESIGN — JAPANESE SCHOOL CHAIR ==
- Seat pan and backrest: warm light beech-orange wood. Seat pan is a thin flat slab. Backrest is a narrow horizontal slab held by two vertical posts rising from the back of the seat. Sparse dot/dash texture motifs to read as wood grain.
- Frame: light cool-grey tubular steel — two front legs, two back legs, a low horizontal cross-rail near the floor between front and back on each side, and a U-shape under the seat supporting it. Steel tubes have uniform thickness everywhere; do NOT let any tube taper or swell. NO black outline around tubes — define them only by the color contrast between the grey tube and the transparent background, with a single slightly-darker grey strip along the lower-right side of each tube as soft cel shading.
- Foot caps: small flat dark-grey cylindrical caps on the bottom of each leg.
- No text, no numbers, no name tag, no logo on the chair.

Proportions: footprint roughly square in plan view, total height about 1.4x the seat-pan side length, seat surface at roughly 45% of total height from the floor.

== COMPOSITION ==
Exactly ONE chair, centered. The chair content fits inside a centered 1100 x 900 px content box inside a 1536 x 1024 px RGBA PNG canvas. Generous transparent padding on all four sides; do NOT crop or let any part of the chair bleed off the canvas edges. Transparent RGBA background.

NO floor, NO ground, NO ground shadow, NO cast shadow, NO contact shadow, NO background color, NO desk, NO table, NO other furniture, NO human figure, NO text, NO logo, NO watermark, NO reference cuboid lines, NO axis arrows, NO construction lines, NO grid, NO tile pattern, NO platform, NO base plate.

Do NOT include the reference cuboid wireframe lines in the output. Use the cuboid only as a geometric guide for the dimetric axes; generate a fresh, clean chair illustration. Output one PNG at 1536 x 1024 px with fully transparent background.

REMEMBER: copy the dimetric 2:1 PROJECTION + sitting eye-level from the sofa reference; copy the SOFT NO-OUTLINE L1b STYLE from the wardrobe/bed/L1b-chair references. Do NOT mix them: no outlines, no ink strokes, no catalog-icon look anywhere in the final image.
