# sakura-study-desk-sitting-2to1-l1b-v1-20260619

**png**: `assets/objects/sakura-study-desk-dimetric.png`
**created_at**: 2026-06-19T08:58:19.641Z
**purpose**: 残家具 L1b dimetric front: sakura-study-desk 一括第1弾

## Codex prompt

A single 学習デスク, drawn as a clean 2D furniture prop on a fully transparent background.

This furniture belongs to a coordinated 2-view set: the FRONT view (this image) must be in dimetric 2:1 projection like the reference sofa, AND in the L1b flat no-outline style like the reference chair / wardrobe / bed.

== STYLE — L1b FLAT, NO OUTLINES (CRITICAL) ==
Match the existing L1b furniture style:
- assets/generated/school-chair-sitting-2to1-l1b-v2-20260619.png  (the L1b chair — same projection, same style)
- assets/objects/sakura-wardrobe-leftwall.png                     (L1b wardrobe in wall-aligned side view)
- assets/objects/sakura-bed-pink-single-leftwall.png              (L1b bed in wall-aligned side view)

Style rules (strict):
- ABSOLUTELY NO outlines. NO black silhouette stroke. NO dark border lines around any shape. Zero-width strokes everywhere. Shapes must be separated PURELY by adjacent color blocks.
- Soft cel shading: each surface gets ONE flat base color plus AT MOST ONE darker shadow shape with a slightly soft anti-aliased edge. NO crisp 2-tone vector ramps. NO heavy contrast cel ramps.
- Tiny dot / short-dash texture motifs sparsely scattered on wood surfaces (the small flecks you see on the L1b chair / wardrobe), to suggest beech wood grain. Skip texture motifs on metal, fabric, or painted surfaces.
- Restrained, muted, warm palette consistent with the existing L1b series (light warm beech wood, light cool grey metal, pastel pinks / cream for accent).
- NO bold linework. NO vector-icon look. NO editorial-catalog ink outlines. NO Animal Crossing tile. NO isometric pixel art. NO game-shop icon. NO platform / hex / floor square under the furniture.
- Soft, illustrated, picture-book feel — like the existing wardrobe and bed sides — not a sharp catalog SVG.

== CAMERA / EYE-LEVEL ==
The camera is at SITTING EYE-LEVEL — the viewer's eye is at the same height as a person sitting low on the floor, roughly at the seat / mattress / low-shelf height of the furniture. The TOP of the furniture is only slightly visible. The front face is the dominant visible surface. The underside is NEVER visible (camera is above floor, not below).

== ANGLE — DIMETRIC PROJECTION, MATCH THE REFERENCE SOFA ==
Use the SAME dimetric axonometric projection as the reference sofa assets/generated/sofa-sitting-2to1-20260617.png and the wireframe cuboid in assets/references/angle-guide-cuboid-12-20.png.

Critical proportions of the implicit bounding cuboid wrapping the furniture:
- The cuboid's top face is a parallelogram with **width-to-depth visual ratio of 2:1** — the lateral edge is TWICE as long as the depth edge in the image.
- Width edges tilt at about 12 degrees upper-right.
- Depth edges tilt at about 20 degrees upper-left.
- All vertical structural members remain perfectly vertical with zero tilt.
- Parallel projection — no perspective convergence anywhere. No vanishing points. Lines parallel in 3D stay parallel in the image. No foreshortening of long edges.

IMPORTANT: copy the PROJECTION from the sofa reference, but DO NOT copy its bold outline / ink-stroke style. Style comes from the L1b chair and L1b wardrobe references, NOT from the sofa.

== ORIENTATION ==
User side faces the camera. The right-hand depth surfaces are visible and drawn one shade darker than their front faces (same soft cel approach as the wardrobe sides). Implied light from upper-left.

== DESIGN — SAKURA STUDY DESK (学習デスク) ==
- Classic Japanese children's "gakushuu desk" (学習机) for an elementary-school girl's room, matching the existing Sakura-room pastel palette (warm light beech wood + soft pastel pink accents + cream/off-white panels).
- Overall layout: a rectangular desk with a flat writing top, a tall right-hand side cabinet (the user's right, camera-right) that runs full height from floor to under-top, and an open knee well on the left where a chair tucks in. A LOW back-of-desk hutch / 小物棚 sits on top of the writing surface along the back edge — a single shallow shelf with a thin pastel-pink back panel, about 1/3 of the desk's height tall, with one short divider creating two small compartments. No tall bookshelf tower; keep the hutch low and friendly.
- Side cabinet (right): three stacked drawers, each drawer face is a flat cream / off-white pastel rectangle with a small horizontal pastel-pink pill-shaped pull centered near the top of each drawer. Thin warm-beech frame around the drawer stack. Bottom drawer is slightly taller than the upper two.
- Writing top: warm light beech laminate with very sparse short-dash wood grain flecks; a soft single darker shadow shape along the back edge under the hutch and a thin shadow stripe on the right-hand depth face of the top.
- Legs / structure: TWO slim vertical front legs on the open (left) side — uniform tube thickness, no taper, no swell, perfectly vertical, in a slightly cooler off-white painted finish — plus the full side cabinet doing structural duty on the right. A thin floor-skimming stretcher / kick plate is OK but optional; keep underside clean and open.
- Hutch detailing: pastel-pink back board, cream shelf surface, a tiny round wooden knob is NOT needed — keep the hutch open-front (no doors). Optional: one tiny pastel-pink heart or star motif sparsely on the back board, but no text and no logo.
- Depth faces (camera-right side of top, of hutch, of cabinet) are rendered one shade darker than their front faces using the soft cel approach — same treatment as the wardrobe sides.
- Real-world proportions: desk top width roughly 2× its depth; total height (floor to top of hutch) roughly equal to desk top width × 0.75; side cabinet width roughly 1/4 of total desk width.

Proportions: keep typical real-world proportions for this furniture type. Place the bottom of the furniture at the lower portion of the canvas so the contact line with the floor is clear.

== COMPOSITION ==
Exactly ONE piece of furniture, centered. The furniture content fits inside a centered content area inside a 1536 x 1024 px RGBA PNG canvas. Generous transparent padding on all four sides; do NOT crop or let any part bleed off the canvas edges. Transparent RGBA background.

NO floor, NO ground, NO ground shadow, NO cast shadow, NO contact shadow, NO background color, NO other furniture, NO human figure, NO text, NO logo, NO watermark, NO reference cuboid lines, NO axis arrows, NO construction lines, NO grid, NO tile pattern, NO platform, NO base plate.

Do NOT include the reference cuboid wireframe lines in the output. Use the cuboid only as a geometric guide for the dimetric axes; generate a fresh, clean illustration. Output one PNG at 1536 x 1024 px with fully transparent background.

REMEMBER: copy the dimetric 2:1 PROJECTION + sitting eye-level from the sofa reference; copy the SOFT NO-OUTLINE L1b STYLE from the wardrobe / bed / chair references. Do NOT mix them: no outlines, no ink strokes, no catalog-icon look anywhere in the final image.
