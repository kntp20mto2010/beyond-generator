# sakura-wardrobe-sitting-2to1-l1b-v1-20260619

**png**: `assets/objects/sakura-wardrobe-dimetric.png`
**created_at**: 2026-06-19T08:59:37.017Z
**purpose**: 残家具 L1b dimetric front: sakura-wardrobe 一括第1弾

## Codex prompt

A single ワードローブ, drawn as a clean 2D furniture prop on a fully transparent background.

This furniture belongs to a coordinated 2-view set: the FRONT view (this image) must be in dimetric 2:1 projection like the reference sofa, AND in the L1b flat no-outline style like the reference chair / wardrobe / bed.

== STYLE — L1b FLAT, NO OUTLINES (CRITICAL) ==
Match the existing L1b furniture style:
- assets/generated/school-chair-sitting-2to1-l1b-v2-20260619.png  (the L1b chair — same projection, same style)
- assets/objects/sakura-wardrobe-leftwall.png                     (L1b wardrobe in wall-aligned side view)
- assets/objects/sakura-bed-pink-single-leftwall.png              (L1b bed in wall-aligned side view)

Style rules (strict):
- ABSOLUTELY NO outlines. NO black silhouette stroke. NO dark border lines around any shape. Zero-width strokes everywhere. Shapes must be separated PURELY by adjacent color blocks.
- Soft cel shading: each surface gets ONE flat base color plus AT MOST ONE darker shadow shape with a slightly soft anti-aliased edge. NO crisp 2-tone vector ramps. NO heavy contrast cel ramps.
- Tiny dot / short-dash texture motifs sparsely scattered on wood surfaces (the small flecks you see on the L1b chair / wardrobe), to suggest beech wood grain.
- Restrained, muted, warm palette consistent with the existing L1b series (light warm beech wood, light cool grey metal, pastel pinks / cream for accent).
- NO bold linework. NO vector-icon look. NO editorial-catalog ink outlines. NO Animal Crossing tile. NO isometric pixel art. NO game-shop icon. NO platform / hex / floor square under the furniture.
- Soft, illustrated, picture-book feel — like the existing wardrobe and bed sides — not a sharp catalog SVG.

== CAMERA / EYE-LEVEL ==
The camera is at SITTING EYE-LEVEL — the viewer's eye is at the same height as a person sitting low on the floor. The TOP of the wardrobe is only slightly visible. The front face is the dominant visible surface.

== ANGLE — DIMETRIC PROJECTION, MATCH THE REFERENCE SOFA ==
Use the SAME dimetric axonometric projection as the reference sofa assets/generated/sofa-sitting-2to1-20260617.png and the wireframe cuboid in assets/references/angle-guide-cuboid-12-20.png.

Critical proportions of the implicit bounding cuboid wrapping the furniture:
- The cuboid's top face is a parallelogram with **width-to-depth visual ratio of 2:1** — the lateral edge is TWICE as long as the depth edge in the image.
- Width edges tilt at about 12 degrees upper-right.
- Depth edges tilt at about 20 degrees upper-left.
- All vertical structural members remain perfectly vertical with zero tilt.
- Parallel projection — no perspective convergence anywhere. No vanishing points. Lines parallel in 3D stay parallel in the image. No foreshortening of long edges.

IMPORTANT: copy the PROJECTION from the sofa reference, but DO NOT copy its bold outline / ink-stroke style. Style comes from the L1b wardrobe side view and L1b chair references.

== ORIENTATION ==
User side (the side with the doors) faces the camera. The right-hand depth surfaces are visible and drawn one shade darker than their front faces (same soft cel approach as the existing wardrobe side view).


== DESIGN — SAKURA WARDROBE (tall double-door wardrobe with cream mirror panels) ==
- Tall vertical wardrobe (armoire), single bay, two front doors that meet at the centerline. Real-world proportion: roughly 80 cm wide x 55 cm deep x 180 cm tall — clearly taller than wide, with depth about 2/3 of width.
- Carcass and door frames in light warm honey-beech wood, same beech tone as the L1b chair and the existing wardrobe side view (warm light-amber, NOT orange, NOT dark walnut). Sparse short-dash beech grain motifs on the wood top surface and on the door stiles.
- Each door is a flat rectangular slab with a recessed inner panel filled by a soft cream-white vertical mirror panel (warm off-white, very subtle pale-pink tint), framed by a thin wood inset border on all four sides — exactly like the existing side view. Two panels total, one per door, mirror-symmetric across the centerline.
- Small round wooden knobs centered on each door near the meeting stile, at roughly mid-height. Knobs are simple round nubs in a slightly darker beech, no metal hardware visible.
- Plinth / kick base: a short solid wood base block flush with the carcass, sitting directly on the floor. NO legs, NO feet, NO gap underneath — the wardrobe meets the floor as a continuous base.
- Flat top surface (no crown, no cornice) — a plain rectangular top slab in the same beech wood, slightly darker on the front edge to imply thickness.
- Right-side depth face one shade darker than the front (cooler, slightly desaturated beech), implying upper-left light. Door panels' cream face also receives a faint darker shadow band along the right edge of each panel.
- No interior reveal, no open door, no hanging clothes visible — wardrobe is fully closed.


Proportions: keep typical real-world proportions for this furniture type. Place the bottom of the furniture at the lower portion of the canvas so the contact line with the floor is clear.

== COMPOSITION ==
Exactly ONE piece of furniture, centered. The furniture content fits inside a centered content area inside a 1536 x 1024 px RGBA PNG canvas. Generous transparent padding on all four sides; do NOT crop or let any part bleed off the canvas edges. Transparent RGBA background.

NO floor, NO ground, NO ground shadow, NO cast shadow, NO contact shadow, NO background color, NO other furniture, NO human figure, NO text, NO logo, NO watermark, NO reference cuboid lines, NO axis arrows, NO construction lines, NO grid, NO tile pattern, NO platform, NO base plate.

Do NOT include the reference cuboid wireframe lines in the output. Use the cuboid only as a geometric guide for the dimetric axes; generate a fresh, clean illustration. Output one PNG at 1536 x 1024 px with fully transparent background.

REMEMBER: copy the dimetric 2:1 PROJECTION + sitting eye-level from the sofa reference; copy the SOFT NO-OUTLINE L1b STYLE from the wardrobe / bed / chair references. Do NOT mix them: no outlines, no ink strokes, no catalog-icon look anywhere in the final image.
