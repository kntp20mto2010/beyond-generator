# sakura-bookshelf-sitting-2to1-l1b-v1-20260619

**png**: `assets/objects/sakura-bookshelf-dimetric.png`
**created_at**: 2026-06-19T08:57:18.862Z
**purpose**: 残家具 L1b dimetric front: sakura-bookshelf 一括第1弾

## Codex prompt

A single 本棚, drawn as a clean 2D furniture prop on a fully transparent background.

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


== DESIGN — sakura-bookshelf (本棚 / tall open bookshelf) ==
- Tall vertical open-front bookshelf in light warm beech wood, matching the L1b wardrobe / study desk wood tone exactly (warm pale beige, NOT yellow, NOT orange).
- Overall silhouette is a slim portrait rectangle: real-world proportions roughly 80 cm wide x 30 cm deep x 160 cm tall — clearly taller than wide, about 2x taller than wide in the front face.
- Carcass: two vertical side panels, one flat top board, one flat kick base at the floor (no visible legs — the carcass rests directly on a low solid plinth ~3 cm tall in slightly darker beech). No taper / no swell / uniform panel thickness throughout the carcass.
- 4 shelves total dividing the interior into 4 equal open compartments (no doors, no glass, fully open front). Shelf boards are the same beech, drawn as thin horizontal slabs whose front edge catches a tiny highlight.
- The right-hand depth side panel is drawn one shade darker beech than the front face (soft cel shadow), and the inside back panel visible behind the books is a slightly cooler / shaded beech to read as recessed interior.
- Books fill each compartment, standing upright and leaning slightly: muted pastel spines in a restrained L1b palette — dusty rose pink, soft cream, sage green, warm grey-blue, terracotta, mustard ochre. Spines are simple flat color rectangles of varying heights and widths, with at most one tiny darker band or thin cream label per spine; absolutely no text, no titles, no glyphs.
- Top compartment slightly less full (one or two books leaning, leaving a small gap) so the open interior reads clearly; the lower compartments are more densely packed.
- Sparse tiny dot / short-dash beech grain motifs only on the wooden side panels, top, and shelf fronts — never on book spines.
- Soft cel shading: one flat base color per surface plus one slightly darker soft-edged shadow shape (under each shelf, on the right depth side, and a subtle gradient inside each compartment). No outlines anywhere, shapes separated purely by adjacent color blocks.


Proportions: keep typical real-world proportions for this furniture type. Place the bottom of the furniture at the lower portion of the canvas so the contact line with the floor is clear.

== COMPOSITION ==
Exactly ONE piece of furniture, centered. The furniture content fits inside a centered content area inside a 1536 x 1024 px RGBA PNG canvas. Generous transparent padding on all four sides; do NOT crop or let any part bleed off the canvas edges. Transparent RGBA background.

NO floor, NO ground, NO ground shadow, NO cast shadow, NO contact shadow, NO background color, NO other furniture, NO human figure, NO text, NO logo, NO watermark, NO reference cuboid lines, NO axis arrows, NO construction lines, NO grid, NO tile pattern, NO platform, NO base plate.

Do NOT include the reference cuboid wireframe lines in the output. Use the cuboid only as a geometric guide for the dimetric axes; generate a fresh, clean illustration. Output one PNG at 1536 x 1024 px with fully transparent background.

REMEMBER: copy the dimetric 2:1 PROJECTION + sitting eye-level from the sofa reference; copy the SOFT NO-OUTLINE L1b STYLE from the wardrobe / bed / chair references. Do NOT mix them: no outlines, no ink strokes, no catalog-icon look anywhere in the final image.
