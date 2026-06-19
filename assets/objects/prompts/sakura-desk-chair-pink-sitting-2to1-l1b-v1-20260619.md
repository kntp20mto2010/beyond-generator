# sakura-desk-chair-pink-sitting-2to1-l1b-v1-20260619

**png**: `assets/objects/sakura-desk-chair-pink-dimetric.png`
**created_at**: 2026-06-19T08:57:47.741Z
**purpose**: 残家具 L1b dimetric front: sakura-desk-chair-pink 一括第1弾

## Codex prompt

A single デスクチェア(ピンク), drawn as a clean 2D furniture prop on a fully transparent background.

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


== DESIGN — Sakura Desk Chair (Pink), pink swivel office chair on 5-star caster base ==
- Backrest: tall rounded-rectangular cushioned back panel in soft dusty pink (#E8A8B8 base, slightly desaturated muted shadow on the right-side depth edge). Gentle vertical seam down the center suggested by ONE thin shadow stripe only — no outline.
- Seat cushion: matching soft dusty pink top pad, slightly thicker than the backrest, with a subtle rounded front lip; a single soft underside shadow shape at the front overhang, cream-pink darker tone, no outline.
- Armrests: short straight bars running forward from the back uprights; arm pads in the same dusty pink, supported by slim silver tubular brackets — uniform tube thickness, no taper / no swell.
- Central column: single vertical chrome-silver gas-lift cylinder (light cool grey #C7CDD2 with one slightly darker right-side shadow band), perfectly vertical, uniform tube thickness, no taper / no swell.
- 5-star base: five flat radial spokes in light cool grey splayed symmetrically from the column foot; spokes are simple flat tapered-from-hub bars (treat as flat shapes, NOT 3D rods) — uniform plank thickness along each spoke.
- Casters: five small dark-grey wheel pucks (#6F7479) at the tip of each spoke, simple flattened-disc silhouettes, one soft shadow notch on each.
- Skip wood-grain dot motifs entirely (this chair has no wood surfaces); fabric and metal are smooth flat fills with at most one cel shadow shape each.
- Palette anchors: dusty pink upholstery, cool light grey chrome, charcoal caster pucks — restrained and consistent with the L1b series.


Proportions: keep typical real-world proportions for this furniture type. Place the bottom of the furniture at the lower portion of the canvas so the contact line with the floor is clear.

== COMPOSITION ==
Exactly ONE piece of furniture, centered. The furniture content fits inside a centered content area inside a 1536 x 1024 px RGBA PNG canvas. Generous transparent padding on all four sides; do NOT crop or let any part bleed off the canvas edges. Transparent RGBA background.

NO floor, NO ground, NO ground shadow, NO cast shadow, NO contact shadow, NO background color, NO other furniture, NO human figure, NO text, NO logo, NO watermark, NO reference cuboid lines, NO axis arrows, NO construction lines, NO grid, NO tile pattern, NO platform, NO base plate.

Do NOT include the reference cuboid wireframe lines in the output. Use the cuboid only as a geometric guide for the dimetric axes; generate a fresh, clean illustration. Output one PNG at 1536 x 1024 px with fully transparent background.

REMEMBER: copy the dimetric 2:1 PROJECTION + sitting eye-level from the sofa reference; copy the SOFT NO-OUTLINE L1b STYLE from the wardrobe / bed / chair references. Do NOT mix them: no outlines, no ink strokes, no catalog-icon look anywhere in the final image.
