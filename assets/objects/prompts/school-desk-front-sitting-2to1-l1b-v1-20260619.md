# school-desk-front-sitting-2to1-l1b-v1-20260619

**png**: `assets/objects/school-desk-front-dimetric.png`
**created_at**: 2026-06-19T09:00:05.007Z
**purpose**: 残家具 L1b dimetric front: school-desk-front 一括第1弾

## Codex prompt

A single 学校机(対面), drawn as a clean 2D furniture prop on a fully transparent background.

This furniture belongs to a coordinated 2-view set: the FRONT view (this image) must be in dimetric 2:1 projection like the reference sofa, AND in the L1b flat no-outline style like the reference chair / wardrobe / bed.

== STYLE — L1b FLAT, NO OUTLINES (CRITICAL) ==
Match the existing L1b furniture style:
- assets/generated/school-chair-sitting-2to1-l1b-v2-20260619.png  (the L1b chair — same projection, same style)
- assets/objects/sakura-wardrobe-leftwall.png                     (L1b wardrobe in wall-aligned side view)
- assets/objects/sakura-bed-pink-single-leftwall.png              (L1b bed in wall-aligned side view)

Style rules (strict):
- ABSOLUTELY NO outlines. NO black silhouette stroke. NO dark border lines around any shape. Zero-width strokes everywhere. Shapes must be separated PURELY by adjacent color blocks.
- Soft cel shading: each surface gets ONE flat base color plus AT MOST ONE darker shadow shape with a slightly soft anti-aliased edge. NO crisp 2-tone vector ramps. NO heavy contrast cel ramps.
- Tiny dot / short-dash texture motifs sparsely scattered on wood surfaces. Skip texture motifs on metal, fabric, or painted surfaces.
- Restrained, muted, warm palette consistent with the existing L1b series.
- NO bold linework. NO vector-icon look. NO editorial-catalog ink outlines. NO game-shop icon. NO platform / hex / floor square under the furniture.
- Soft, illustrated, picture-book feel — like the existing wardrobe and bed sides.

== CAMERA / EYE-LEVEL ==
The camera is at SITTING EYE-LEVEL — at the height of a seated student. The TOP of the desk is only slightly visible. The front face is the dominant visible surface. The underside is NEVER visible.

== ANGLE — DIMETRIC PROJECTION, MATCH THE REFERENCE SOFA ==
Use the SAME dimetric axonometric projection as the reference sofa assets/generated/sofa-sitting-2to1-20260617.png and the wireframe cuboid in assets/references/angle-guide-cuboid-12-20.png.

Critical proportions of the implicit bounding cuboid wrapping the furniture:
- The cuboid's top face is a parallelogram with width-to-depth visual ratio of 2:1.
- Width edges tilt at about 12 degrees upper-right.
- Depth edges tilt at about 20 degrees upper-left.
- All vertical structural members remain perfectly vertical with zero tilt.
- Parallel projection — no perspective convergence. No vanishing points.

IMPORTANT: copy the PROJECTION from the sofa reference, but DO NOT copy its bold outline / ink-stroke style.

== ORIENTATION ==
User side faces the camera. Right-hand depth surfaces are one shade darker than front faces. Implied light from upper-left.


== DESIGN — 学校机(対面) (Japanese single-student school desk, front view) ==
- One single-student Japanese school desk (生徒用机), upright on the floor, facing the camera so its FRONT face (the side a sitting student looks at across the desktop, with the book bar and book basket) is the dominant visible surface.
- Desktop: rectangular flat board in warm light beech / orange-tinted wood, soft satin finish; ONE base wood tone plus ONE slightly darker shadow shape along the right-hand depth edge. Sparse tiny dot / short-dash grain motifs scattered on the top, very subtle.
- Front rail / pencil bar: a slim horizontal wood bar spanning the full front width directly under the desktop, same beech tone, acting as the front apron — kept thin and flat, no carving.
- Book basket (下段カゴ): a single open wire-mesh basket suspended under the desktop, sitting between the front and rear leg pairs; light cool grey metal mesh drawn as a faint uniform crosshatch fill (NOT outlined wires), with a slightly darker grey shadow shape on its right-hand depth side. The basket is empty.
- Legs: four straight tubular steel legs in light cool grey, same metal spec as the matching L1b school chair. Perfectly vertical, uniform tube thickness top-to-bottom — no taper, no swell, no bulge. Small dark grey floor caps at each foot.
- Leg frame: a horizontal cross-stretcher in the same grey tube connects the front leg pair and rear leg pair near the bottom (typical school-desk H-frame).
- Palette: beech-orange wood ~#E2B074 base with ~#C8884A soft shadow; light cool grey metal ~#C8CDD2 base with ~#9AA1A8 shadow; dark grey ferrule ~#5A5F66.
- Proportions: desktop slightly wider than deep (school standard ~65 cm wide × 45 cm deep), legs occupy the lower ~55% of the silhouette; book basket occupies the middle band.


Proportions: keep typical real-world proportions. Place the bottom of the furniture at the lower portion of the canvas so the contact line with the floor is clear.

== COMPOSITION ==
Exactly ONE piece of furniture, centered. Generous transparent padding on all four sides; do NOT crop or let any part bleed off the canvas edges. Transparent RGBA background.

NO floor, NO ground, NO ground shadow, NO background color, NO other furniture, NO human figure, NO text, NO logo, NO reference cuboid lines, NO grid, NO tile pattern.

Output one PNG at 1536 x 1024 px with fully transparent background.

REMEMBER: copy the dimetric 2:1 PROJECTION + sitting eye-level from the sofa reference; copy the SOFT NO-OUTLINE L1b STYLE from the wardrobe / bed / chair references.
