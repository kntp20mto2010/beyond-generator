# sofa-navy-front-eye120-v2-rattan-20260619

**png**: `assets/objects/sofa-navy-front.png`
**created_at**: 2026-06-19T12:26:34.965Z
**purpose**: ソファ正面 v2: ラタン編みアーム/ベース・黒丸脚をプロンプトに明記して dimetric/side と素材統一

## Codex prompt

A 2-seater navy sofa with RATTAN-WEAVE BEIGE ARMS AND BASE, rendered in a FRONT-FACING WEAK-HIGH-ANGLE view, eye-level 120 cm above the floor. Camera is centered, no left/right rotation; mild downward tilt (~10-15°) so the tops of cushion/backrest/armrests appear as thin horizontal bands. This is NOT axonometric, NOT dimetric, NOT 3/4 view, NOT a perspective render.

This asset must SHARE THE SAME MATERIAL DESIGN as `assets/objects/sofa-navy-dimetric.png` and `assets/objects/sofa-navy-leftwall.png` — the only differences are the camera angle and projection. Materials, palette, and "what parts are rattan vs what parts are navy" are identical to those references.

================================
CAMERA / ANGLE
================================
- Eye-level 120 cm. Slight downward pitch (~10-15°). Lateral rotation 0°. Depth angle 0°.
- Lateral symmetry: mirroring the image horizontally produces a ≥95% identical shape.
- Every vertical edge parallel to image vertical axis (0° deviation), no taper.
- Sofa left/right edges perfectly vertical, identical distance top vs bottom.

================================
VISIBLE / HIDDEN SURFACES
================================
VISIBLE:
- Front face of the sofa body (dominant).
- TOP of seat cushion, TOP of each back cushion, TOP of each armrest — each as a thin horizontal band (~5-8% of sofa height, never wider than 15%).
- The 2 front legs.

HIDDEN:
- Right-side depth face, left-side depth face, back face, underside.
- The 2 back legs are mostly hidden behind the front legs (a 1-3 px hint behind each front leg is allowed but not required).

================================
DESIGN — RATTAN + NAVY (CRITICAL — DO NOT MAKE THE ARMS NAVY) ==
================================
This sofa has TWO distinct materials, mixed exactly like the dimetric and leftwall reference images:

(A) NAVY UPHOLSTERED CUSHIONS — for the soft seat cushions and back cushions ONLY:
- Two seat cushions sitting side by side, divided by a soft vertical seam down the exact horizontal center.
- Two back cushions of matching width above the seat cushions, separated by a vertical seam aligned with the seat seam.
- Color: deep dusty navy (matching sofa-navy-dimetric exactly), with one slightly darker navy shadow under each cushion front lip and along the inside corner where seat meets backrest.
- The thin top bands on the cushions are painted in the slightly darker navy shade.

(B) RATTAN / WICKER WEAVE — for the ARMS and the BASE APRON (frame around and beneath the cushions):
- Light warm beige base color (same beige tone as in the dimetric and leftwall reference images).
- Sparse short-dash / tiny-dot motifs scattered across the rattan surfaces to suggest a woven cane texture. NEVER drawn as crisp grid lines or outlines — purely flat L1b dot/dash texture motifs in a slightly darker beige.
- Armrests: chunky vertical RATTAN blocks on left and right, full height from floor to the top of the backrest minus a small step. Both armrest tops at the same y-coordinate. The armrest tops appear as thin horizontal beige bands (one shade darker beige, with rattan texture continued).
- Base apron: a horizontal RATTAN band running across the entire front of the sofa beneath the seat cushions, connecting the two armrests at floor level (about 8-12 cm tall in real-world scale). Same beige + sparse weave dots.
- Do NOT make the arms or base navy. They are beige rattan.

(C) LEGS — 4 short black cylindrical legs:
- Matte charcoal-black color, about 8-10 cm tall in real-world scale, simple flat rectangles in the image (no taper, no shading).
- 2 front legs visible directly under the rattan base apron at the corners.
- The 2 back legs are mostly hidden behind the front legs.

================================
STYLE — L1b
================================
- Soft-cel flat shading. NO outlines. NO halftones. NO gradients with banding.
- Per-surface tone count: each visible surface uses at most 2 tones — a base color + a slightly darker shade for cel shadow / weave motifs / top bands.
- NO outline / stroke around the silhouette.
- NO directional rim light suggesting a 3D light source.

================================
NEGATIVES
================================
- NO right-side or left-side depth face — not even 1 px.
- NO back face, NO underside of seat.
- NO trapezoidal silhouette.
- NO 3/4 view, NO axonometric, NO dimetric, NO perspective convergence, NO vanishing points.
- NO plain-navy armrests or plain-navy base — those must be beige rattan with weave texture.
- NO floor shadow that wraps under or behind to imply a ground plane. Only allowed shadow: a thin rectangular drop shadow directly beneath the 2 visible legs, centered. No ellipse.

================================
COMPOSITION
================================
- Canvas 1024×1024, transparent background.
- Single sofa, centered, occupying ~70% canvas width and ~55% canvas height.
- Sofa silhouette: width ≈ 2.0× height (normal 2-seater proportion, including top bands).
- Generous transparent padding.

================================
DELIVERABLE
================================
A single PNG, transparent background, of a 2-seater sofa with navy upholstered cushions and beige rattan-weave armrests + base apron, rendered as a front-facing weak-high-angle view from eye-level 120 cm. Materials and palette must match sofa-navy-dimetric.png and sofa-navy-leftwall.png so the three assets read as the SAME PHYSICAL SOFA from three different angles.
