# ClassVibe — AVATAR_ART_BIBLE.md

**The single-page-per-topic reference a modeler, texture artist, or rigger opens daily.** Every number here is a hard requirement, not a suggestion — deviating from any of them means the resulting rig won't match its sibling (Boy vs Girl), won't hit the performance budget, or won't integrate with the shared-skeleton wardrobe system already built into ClassVibe's data model. For the *reasoning* behind these choices, see [AVATAR_STYLE_GUIDE.md](AVATAR_STYLE_GUIDE.md) — this document states the "what," that one explains the "why."

This is the art-direction half of the production package. Rig-specific numbers (height, bone names, blendshapes) live in [BOY_RIG_SPEC.md](BOY_RIG_SPEC.md) / [GIRL_RIG_SPEC.md](GIRL_RIG_SPEC.md); animation clips live in [ANIMATION_SPEC.md](ANIMATION_SPEC.md); the artist's step-by-step sign-off gate is [AVATAR_ASSET_CHECKLIST.md](AVATAR_ASSET_CHECKLIST.md).

---

## Table of Contents

1. Visual Identity Statement
2. Head/Body Proportions
3. Face Style
4. Hair Style
5. Clothing Style
6. Materials
7. Color Palette
8. Educational Personality
9. Animation Personality
10. Reference Anti-Patterns (what breaks the identity)

---

# 1. Visual Identity Statement

**ClassVibe Soft-Stylized.** Rounded, warm, simplified proportions that read as approachable and modern. Defined by four choices in combination, none of which alone is unique, but together produce a look no other product uses:

1. A **moderate** head-to-body ratio (Section 2) — not exaggerated toward cute (chibi) or toward realism.
2. **Fully smooth, rounded geometry** everywhere — never faceted or angular.
3. **Minimal, consistent facial detail** — simple shapes, no sculpted realism.
4. **Flat matte color blocking** — no fabric or skin texture detail.

This is an original direction — not a copy of any existing commercial avatar platform, and not intended to be pushed toward one during production.

---

# 2. Head/Body Proportions

- **Head-to-total-height ratio: 1:4.5** (measured standing, head top to floor, divided by head height). This is the single most load-bearing number in this document — check it first on every silhouette pass.
- Head shape: soft rounded-rectangle / gentle egg silhouette. No angular jaw, no pointed chin.
- Torso: simplified capsule-block. Soft rounded shoulders. No muscle definition, no anatomical landmarks (collarbone, ribs, etc.) sculpted into the base mesh.
- Hands: simplified rounded "mitten" shapes. No individually modeled or rigged fingers.
- Feet: simplified rounded blocks, shoes modeled as a single smooth volume (no separate sole/upper/lace geometry).
- Both Boy and Girl rigs share this exact ratio and silhouette language — only height and minor proportion tuning differ (see the individual rig specs). They must read as clearly the same character family standing side by side.

---

# 3. Face Style

- Eyes: one simple rounded shape per eye (flattened oval or soft rounded-rect), solid dark fill, one small fixed highlight dot. No iris, pupil, or sclera layers.
- Eye size and spacing are **identical across every hairstyle and both rigs** — this is the emotional anchor and must read consistently as small as ~24px on screen (chip-tier scale).
- No sculpted eyebrows. Expression range comes from face blendshapes (see rig specs), not a separate brow mesh.
- Mouth: a simple flat shape or thin line, driven entirely by blendshapes (neutral, smile, open, concern) — never a modeled 3D mouth cavity/teeth/tongue.
- No sculpted nose beyond, at most, a very subtle surface hint — this is a stylistic minimalism choice, not an oversight.

---

# 4. Hair Style

- Every hairstyle is one solid, smooth "cap" mesh — no individually modeled strands, no card-based hair with alpha-cutout textures.
- Flat-shaded or two-tone only (base tone + one soft highlight tone).
- Rounded silhouette only. No spiky, jagged, or sharply pointed shapes — this keeps the identity soft and avoids clipping against hats/accessories added later.
- A hairstyle is authored once and must silhouette-read cleanly against **both** rigs' head shapes — it is not gender-locked in the data model (see [AVATAR_FOUNDATION.md](AVATAR_FOUNDATION.md) §3/§8), so it needs to work on either.

---

# 5. Clothing Style

- Shirts, pants, and shoes are simplified block shapes. Folds are suggested only via a subtle two-tone shading band (one lighter "highlight" area) — never sculpted wrinkles or fabric normal maps.
- No logos, text, or realistic prints baked into any V1 clothing mesh. Differentiation is color and simple geometric trim only (a stripe, a collar color) — this is what lets the `variant` field do the work of a whole color range from one texture atlas region.
- Clothing must be low-profile enough to avoid clipping against the rounded hair caps (Section 4) and each other in every combination shipped in the V1 vertical slice (Section 8 in [AVATAR_FOUNDATION.md](AVATAR_FOUNDATION.md)) — check this at the modeling stage, not after rigging.

---

# 6. Materials

- Flat matte shading: one base tone plus a single lighter "light-facing" tone (a soft two-band toon look).
- No specular highlights, no PBR roughness/metalness variation, no texture maps, no normal maps anywhere on a V1 avatar.
- This is a performance decision as much as an aesthetic one — no per-pixel PBR lookups, no normal-map sampling, ever. See texture/poly budgets in the rig specs.

---

# 7. Color Palette

- **Clothing (default/starter items)**: draw from ClassVibe's existing brand families — indigo, slate, teal, coral, amber — already used for team colors and UI accents (`TEAM_MODE_DESIGN.md`, `UI_UX_ARCHITECTURE.md`). A default avatar must never visually clash with the team-color UI it stands next to.
- **Clothing (unlockable/reward items)**: reserved for bolder, more saturated colors — color intensity itself is a quiet signal of progression, so don't spend saturated colors on starter items.
- **Skin tones**: a curated set of 4–6 warm, slightly desaturated tones, selectable — not one fixed default, not photoreal shading. Backed by `avatar.skinTone` on the `User` model (`warm01`–`warm06`, default `warm03`) — the schema slot exists; the actual hex value per slug is still the artist's to define during production, following the same runtime vertex-color-tint mechanism as clothing (see [BOY_RIG_SPEC.md](BOY_RIG_SPEC.md) §9).
- **Backgrounds/scenes**: solid flat colors or brand-tinted flat fills only. No gradients.

---

# 8. Educational Personality

The avatar exists inside a classroom product, visible to a student's peers and teacher in real time. This constrains tone in ways a game character wouldn't be constrained:

- **Encouraging, never punishing.** A wrong answer must never visually shame a student in front of the class — no slumped posture, no sad face held for more than an instant, no "loser" framing.
- **Inclusive by default.** No single default look (skin tone, hairstyle, body type) should read as "the normal one" that everything else is a variant of — the curated tone/hairstyle sets (Sections 4/7) exist for this reason.
- **Calm baseline.** The resting/idle state (see [ANIMATION_SPEC.md](ANIMATION_SPEC.md)) is gentle, not hyperactive — this sits in a classroom, not an arcade.
- **Achievement-forward.** Positive moments (correct answers, wins, podium) get the most expressive treatment the system allows; neutral and negative moments stay understated. Visual energy budget is spent on encouragement, not on drama.

---

# 9. Animation Personality

Full clip list and per-animation detail is in [ANIMATION_SPEC.md](ANIMATION_SPEC.md). The rules every clip must follow:

- **Warm, brief, self-contained.** No animation targets or references another specific avatar (no pointing at, laughing at, or gesturing toward a peer's position).
- **No taunting or competitive-mockery animations of any kind** — celebration is always self-directed (fist pump, jump, wave to an implied audience/camera, not to a "loser").
- **Subtle over hyperactive.** Idle and listening states in particular should feel calm — this plays for minutes at a time on screen during a live class.
- **Consistent across rigs.** The same named clip (e.g. `Celebrate`) must feel like the same emotional beat on both the Boy and Girl rig — timing and intent match even though the underlying mesh differs.
- **Respects reduced motion.** Every looping animation needs a valid static-pose fallback frame (see [AVATAR_STYLE_GUIDE.md](AVATAR_STYLE_GUIDE.md) §13) for `prefers-reduced-motion` users.

---

# 10. Reference Anti-Patterns (what breaks the identity)

Quick gut-check list — if a WIP render matches any of these, it's drifted off-spec:

- Head looks oversized/childlike → drifted toward chibi. Recheck the 1:4.5 ratio.
- Visible flat polygon facets on curved surfaces → drifted toward low-poly geometric. Add subdivision/smoothing.
- Individually sculpted fingers, detailed shoe soles, visible fabric wrinkles → over-detailed for this budget and this identity. Simplify.
- Any specular sheen, gradient shading, or texture detail (skin pores, fabric weave) → violates the flat-matte material rule (Section 6).
- A character that could be mistaken at a glance for a screenshot from another named platform or game → stop and reassess against Section 1.
