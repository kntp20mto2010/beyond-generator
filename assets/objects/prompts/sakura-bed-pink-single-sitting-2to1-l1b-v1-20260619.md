# sakura-bed-pink-single-sitting-2to1-l1b-v1-20260619

**png**: `assets/objects/sakura-bed-pink-single-dimetric.png`
**created_at**: 2026-06-19T08:56:47.674Z
**purpose**: 残家具 L1b dimetric front: sakura-bed-pink-single 一括第1弾

## Codex prompt

A single ベッド(ピンクシングル), drawn as a clean 2D furniture prop on a fully transparent background.

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

== DESIGN — SAKURA PINK SINGLE BED ==
- A Japanese-style single bed (シングル, roughly 100cm wide x 200cm long x 35cm mattress-top height), low to the floor with a short slatted headboard at the LEFT short end (head of the bed). No footboard on the right end — the foot end is open with only the mattress edge visible.
- Frame and headboard in light warm beech wood (same beech tone as the L1b wardrobe / chair), with sparse tiny dot / short-dash grain flecks on the headboard and frame rails. Headboard is a simple low rectangle with 4–5 vertical slats, about 40cm tall above the mattress.
- Base is a low boxed platform (NOT raised on legs) with TWO storage drawers facing the camera on the long user-side rail. Each drawer has a small horizontal cutout pull (no metal hardware, no knobs), centered on the drawer front. Drawer fronts are the same beech wood, one shade darker than the side rails to read as separate panels via color block only.
- Mattress is a soft thick slab (about 18cm tall) in warm cream / off-white, with one subtle darker cream shadow band along the lower mattress edge where it tucks into the frame.
- Comforter (掛布団) in muted pastel pink (#f4c5cf range, same family as the existing sakura-bed side view), draped loosely over the mattress and hanging slightly down the user-side long edge; a soft darker-pink shadow shape on the underside of the drape and where the pillow presses into it. No quilting stitches, no patterned print — just flat pink with one cel shadow.
- White pillow at the headboard end, plump rectangular shape, with one very soft warm-grey shadow under the pillow's right edge.
- A small stuffed rabbit plush sitting on top of the pillow, facing the camera: cream-white body, long floppy ears, tiny pastel-pink inner-ear patches, two black dot eyes, no mouth detail, sized about as wide as the pillow's short edge. Soft cel shadow on the underside of the body and ears.
- Top of the bed (mattress + comforter + pillow + rabbit) is only slightly visible due to sitting eye-level — the camera sits near mattress-top height so you mostly see the comforter's front drape, the drawer fronts, and the headboard rising up at the left.
- Right-hand depth surfaces (the short foot-end rail and the right side of the headboard) are drawn one shade darker than the user-facing front to confirm the dimetric volume.


Proportions: keep typical real-world proportions for this furniture type. Place the bottom of the furniture at the lower portion of the canvas so the contact line with the floor is clear.

== COMPOSITION ==
Exactly ONE piece of furniture, centered. The furniture content fits inside a centered content area inside a 1536 x 1024 px RGBA PNG canvas. Generous transparent padding on all four sides; do NOT crop or let any part bleed off the canvas edges. Transparent RGBA background.

NO floor, NO ground, NO ground shadow, NO cast shadow, NO contact shadow, NO background color, NO other furniture, NO human figure, NO text, NO logo, NO watermark, NO reference cuboid lines, NO axis arrows, NO construction lines, NO grid, NO tile pattern, NO platform, NO base plate.

Do NOT include the reference cuboid wireframe lines in the output. Use the cuboid only as a geometric guide for the dimetric axes; generate a fresh, clean illustration. Output one PNG at 1536 x 1024 px with fully transparent background.

REMEMBER: copy the dimetric 2:1 PROJECTION + sitting eye-level from the sofa reference; copy the SOFT NO-OUTLINE L1b STYLE from the wardrobe / bed / chair references. Do NOT mix them: no outlines, no ink strokes, no catalog-icon look anywhere in the final image.
