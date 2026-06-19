# sofa-navy-sitting-2to1-l1b-v1-20260619

**png**: `assets/objects/sofa-navy-dimetric.png`
**created_at**: 2026-06-19T09:00:30.076Z
**purpose**: 残家具 L1b dimetric front: sofa-navy 一括第1弾(現 bold-outline 版を L1b 化)

## Codex prompt

A single ソファ, drawn as a clean 2D furniture prop on a fully transparent background.

This furniture belongs to a coordinated 2-view set: the FRONT view (this image) must be in dimetric 2:1 projection like the reference sofa-sitting-2to1, AND in the L1b flat no-outline style like the reference chair / wardrobe / bed.

== STYLE — L1b FLAT, NO OUTLINES (CRITICAL — DIFFERENT FROM THE SOFA-SITTING-2TO1 REFERENCE'S OUTLINE STYLE) ==
Match the existing L1b furniture style:
- assets/generated/school-chair-sitting-2to1-l1b-v2-20260619.png  (the L1b chair — same projection, same style)
- assets/objects/sakura-wardrobe-leftwall.png                     (L1b wardrobe in wall-aligned side view)
- assets/objects/sakura-bed-pink-single-leftwall.png              (L1b bed in wall-aligned side view)

Style rules (strict):
- ABSOLUTELY NO outlines. NO black silhouette stroke. NO dark border lines around any shape. Zero-width strokes everywhere. Shapes must be separated PURELY by adjacent color blocks.
- Soft cel shading: each surface gets ONE flat base color plus AT MOST ONE darker shadow shape with a slightly soft anti-aliased edge.
- Restrained, muted, warm palette.
- NO bold linework. NO vector-icon look. NO Animal Crossing tile. NO isometric pixel art.
- Soft, illustrated, picture-book feel — like the existing wardrobe / bed sides — not a sharp catalog SVG.

== CAMERA / EYE-LEVEL ==
The camera is at SITTING EYE-LEVEL — at the height of a person sitting on the sofa cushion. The TOP of the sofa is only slightly visible. The front face is the dominant visible surface.

== ANGLE — DIMETRIC PROJECTION, MATCH THE REFERENCE SOFA ==
Use the SAME dimetric axonometric projection as assets/generated/sofa-sitting-2to1-20260617.png and the wireframe cuboid in assets/references/angle-guide-cuboid-12-20.png.

Critical proportions of the implicit bounding cuboid wrapping the furniture:
- The cuboid's top face is a parallelogram with **width-to-depth visual ratio of 2:1**.
- Width edges tilt at about 12 degrees upper-right.
- Depth edges tilt at about 20 degrees upper-left.
- All vertical structural members remain perfectly vertical with zero tilt.
- Parallel projection — no perspective convergence anywhere.

IMPORTANT: copy the PROJECTION from sofa-sitting-2to1, but DO NOT copy its bold dark outlines. Style comes from the L1b chair and L1b wardrobe references, NOT from the bold-outlined sofa.

== ORIENTATION ==
User side (cushion fronts and backrest cushions visible) faces the camera. Right-hand depth surfaces are one shade darker. Implied light from upper-left.


== DESIGN — 2-SEAT NAVY SOFA WITH RATTAN-WEAVE ARMS & BASE ==
- Two-seater lounge sofa, real-world proportions: about 160 cm wide x 80 cm deep x 75 cm tall, seat height about 38 cm from floor, low backrest reaching only slightly above the camera's sitting eye-level.
- Upholstered cushions in muted deep navy fabric (dusty indigo, not pure black-blue) with a barely perceptible soft cel shadow under the seat-cushion fronts and along the inside of the backrest where it meets the seat.
- TWO separate seat cushions sitting on the base, divided by a faint vertical seam at the centerline; TWO matching back cushions of the same width leaning slightly back. Cushion corners gently rounded, no piping, no buttons, no stitching outlines.
- Arms and the front apron of the base are clad in light warm beige rattan weave (woven cane look): suggest the weave with a sparse pattern of tiny short dashes / dot rows in a slightly darker beige on a lighter beige base — flat L1b texture motifs, NEVER drawn as crisp grid lines or outlines.
- Arm blocks are simple soft-edged rectangular volumes flanking the cushions, same height as the top of the seat cushions, with the rattan weave wrapping the front face and a one-shade-darker beige on the right-hand depth face.
- Four short cylindrical legs in matte charcoal black, one at each corner of the base, about 10 cm tall, perfectly vertical, uniform tube thickness, no taper / no swell. Front-right and back-right legs visible; back-left leg partly hidden behind the front-left leg per the dimetric 2:1 projection.
- Implied light from upper-left: navy cushions and rattan arms get a single slightly darker shadow shape on their right-hand depth faces.
- Palette: deep dusty navy (cushions) + warm light beige + slightly darker beige (rattan weave) + matte charcoal (legs), all muted and consistent with the L1b series — no saturated primaries, no glossy highlights.


Proportions: keep typical real-world proportions. Place the bottom of the furniture at the lower portion of the canvas so the contact line with the floor is clear.

== COMPOSITION ==
Exactly ONE piece of furniture, centered. Generous transparent padding on all four sides; do NOT crop or let any part bleed off the canvas edges. Transparent RGBA background.

NO floor, NO ground shadow, NO background, NO other furniture, NO human figure, NO text, NO logo, NO reference cuboid lines, NO grid, NO tile pattern.

Output one PNG at 1536 x 1024 px with fully transparent background.

REMEMBER: copy the dimetric 2:1 PROJECTION + sitting eye-level from sofa-sitting-2to1; copy the SOFT NO-OUTLINE L1b STYLE from the wardrobe / bed / chair references. Do NOT mix them: no outlines anywhere in the final image.
