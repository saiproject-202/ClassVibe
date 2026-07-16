# ClassVibe — AVATAR_STYLE_GUIDE.md

**Milestone 2: Avatar Art Direction — design only, no modeling, no texturing, no rigging, no animation yet.**

This is the design bible every future avatar artist, contractor, or AI tool references so that whether ClassVibe ships 10 clothing items or 10,000, they all look like they belong to the same product. It defines **how ClassVibe avatars look and behave**, building on [AVATAR_FOUNDATION.md](AVATAR_FOUNDATION.md)'s structural decisions (folders, naming, JSON shape, database schema, GLB/three.js/React Three Fiber stack, shared-rig strategy). Real modeling begins in Milestone 3 ("Boy Rig, Girl Rig").

---

## Identity statement

**ClassVibe Soft-Stylized** — rounded, warm, simplified proportions that read as approachable and modern, without tipping into any of the following:

| Not this | Why |
|---|---|
| Chibi (oversized head, tiny body) | Reads as babyish to older students; clashes with "fun but professional." |
| Standard game-stylized (Fortnite/Fall Guys-adjacent) | Invites direct comparison to existing games; expensive to produce well; not distinctive. |
| Low-poly geometric (faceted, angular) | Reads as "indie game," not "modern classroom," at leaderboard/roster scale. |
| Any existing commercial avatar platform (Bitmoji/Memoji-style, Roblox, Ready Player Me, Kahoot, or similar) | Not being copied — referenced only as the category of "simple and friendly" this guide independently defines its own version of. |

The combination that makes this original: a **moderate** head ratio (not exaggerated either direction) + **fully smooth, rounded geometry** (never faceted) + **minimal, consistent facial detail** (dot/shape eyes, no sculpted realism) + **flat matte color blocking** (no fabric or skin texture). No single existing product combines exactly these four choices this way.

---

## Table of Contents

1. Face Proportions & Head/Body Ratio
2. Eye Style
3. Hair Style
4. Clothing Style
5. Color Palette
6. Material Style
7. Animation Personality
8. Pose Guidelines
9. Lighting
10. Shadow Style
11. Camera Angle
12. Avatar Scale
13. Accessibility Rules
14. Performance Budget
15. Open Item Surfaced by This Guide

---

# 1. Face Proportions & Head/Body Ratio

- **Head-to-total-height ratio: 1:4.5.** A deliberate middle point — noticeably rounder and friendlier than realistic adult proportions (~1:7–1:8), far less exaggerated than chibi (~1:2). This one number is the clearest single differentiator from the three earlier reference directions.
- Head shape: soft rounded-rectangle / gentle egg silhouette — no angular jawlines.
- Torso: simplified capsule-block, soft rounded shoulders, no muscle definition or realistic anatomy.
- Hands: simplified rounded "mitten" shapes, no individually modeled fingers — cheaper to rig/animate and avoids uncanny-realism at hand scale.

---

# 2. Eye Style

- Each eye is one simple rounded shape (flattened oval or soft rounded-rect), solid dark fill, no separate iris/pupil/sclera layers, with one small fixed highlight dot for warmth.
- Eye size and spacing are identical across every hairstyle and both rigs — eyes are the emotional anchor and must read consistently even at "chip tier" size (as small as ~24px, per [AVATAR_FOUNDATION.md](AVATAR_FOUNDATION.md) §7).
- No separate eyebrow mesh in V1. Expression is carried later (future emote milestone) by swapping the eye-shape variant itself, not by animating a brow.

---

# 3. Hair Style

- Each hairstyle is one solid, smooth "cap" mesh — no individually modeled strands. Flat-shaded or two-tone (base tone + one soft highlight tone). Rounded silhouette only — no spiky or jagged points, which keeps the identity "soft" and avoids clipping against hats/accessories in a later milestone.
- Hairstyles are tagged per rig (boy/girl) in content, but the underlying data model doesn't hard-lock a style to a gender (per [AVATAR_FOUNDATION.md](AVATAR_FOUNDATION.md) §3/§8) — the only style-guide requirement is that every hairstyle's silhouette reads cleanly against both rigs' head shape.

---

# 4. Clothing Style

- Shirts/pants/shoes are simplified block shapes. Folds are suggested only with a subtle two-tone shading band (a lighter "highlight" area) — never fabric-texture normal maps or sculpted wrinkles.
- No logos, text, or realistic prints baked into V1 meshes. Differentiation comes from color and simple geometric trim (a stripe, a collar color) — this keeps the `variant` field (see [AVATAR_FOUNDATION.md](AVATAR_FOUNDATION.md) §3) doing most of the visual work cheaply, without needing a unique texture per color.
- Layering stays clip-free by construction: low-profile shirt collars + rounded hair caps (Section 3) are sized so the default vertical-slice combinations never need per-combination clipping fixes.

---

# 5. Color Palette

- **Clothing palette**: draws from ClassVibe's existing brand families (indigo/slate/teal/coral/amber, already used for team colors and UI accents per `TEAM_MODE_DESIGN.md` and `UI_UX_ARCHITECTURE.md`) for default/starter items, so a default avatar never visually clashes with the team-color UI it stands next to. Bolder, more saturated colors are reserved for unlockable reward items later — color intensity itself becomes a quiet signal of progression.
- **Skin tones**: a curated set of 4–6 warm, slightly desaturated tones offered as options (not one default realistic tone, not photoreal shading). Now backed by `avatar.skinTone` on the `User` model (`warm01`–`warm06`, default `warm03`) — see Section 15.
- **Backgrounds/scenes**: solid flat colors or brand-tinted flat fills only — no gradients, matching this product's existing flat-design UI language.

---

# 6. Material Style

- Flat, matte shading: one base tone plus a single lighter "light-facing" tone (a soft two-band toon look) — no specular highlights, no PBR roughness/metalness variation, no texture or normal maps anywhere on a V1 avatar.
- This is not only aesthetic — it directly minimizes shader and texture-sampling cost, which is the same reasoning behind the flat-design rule already enforced elsewhere in this product's UI.

---

# 7. Animation Personality

- Warm, encouraging, subtle. Idle state is a slow, gentle breathing/sway loop — never bouncy or hyperactive.
- Reactions stay simple: correct answers get one clear scale-pop (the same beat already established client-side as `streakBump` in `QuizPlayer.jsx`), not an elaborate full-body sequence. Wrong answers get a brief, small, non-mocking gesture (a soft shrug) — never a sad, slumped, or visibly "punished" pose, since this plays out in front of the whole class.
- No competitive or taunting animations directed at other avatars (no pointing, no laughing at someone else). Celebration is always self-directed — a fist pump, a jump, a wave.
- Future emotes inherit this same rule: warm, brief, self-contained.

---

# 8. Pose Guidelines

- Default/rest pose is a relaxed, symmetric stance facing the camera, arms slightly away from the body — this is the actual idle-loop pose, never a stiff bind T-pose shown to a user.
- Podium/leaderboard poses (future milestone): exactly one fixed celebratory pose per rank tier (1st/2nd/3rd), reused across every student who reaches that tier — comparable and cheap, rather than unique per-student poses.

---

# 9. Lighting

- One fixed, flat "soft studio" three-point-equivalent lighting setup baked into the render pipeline — key light from front-upper-left, soft fill, no dramatic rim light or hard shadow. Every avatar looks equally well-lit regardless of where it appears (roster grid vs. podium).
- No per-team relighting. Team identity is carried by clothing/background color (Section 5), not by changing the avatar's lighting model — this keeps lighting cost and appearance identical everywhere.

---

# 10. Shadow Style

- A small, soft blob/contact shadow directly under the avatar's feet (a simple low-opacity dark ellipse) — no directional cast shadow onto surrounding UI.
- No shadow at all at "chip tier" (per [AVATAR_FOUNDATION.md](AVATAR_FOUNDATION.md) §7) — shadows are strictly a full-tier detail, reinforcing the two-tier cost split.

---

# 11. Camera Angle

- Full tier (profile, builder, podium): one fixed, slight 3/4 front angle — friendly and dynamic without needing a live-orbiting camera.
- Chip tier: no live camera at all — reuses the flat 2D icon thumbnail already planned in [AVATAR_FOUNDATION.md](AVATAR_FOUNDATION.md) §2/§5, rendered from this same fixed angle so the chip and the full avatar are recognizably the same character.

---

# 12. Avatar Scale

- A single fixed world-space "avatar unit height" applies across every rig (boy, girl, and any future rig added per [AVATAR_FOUNDATION.md](AVATAR_FOUNDATION.md) §6) — no rig is authored taller or shorter than another, so mixed-gender rosters and team leaderboards never show one avatar towering over another.
- On-screen pixel height is fixed per tier: chip tier matches the existing colored-circle placeholder's current diameter exactly, so swapping in a real avatar later is a drop-in visual replacement, not a layout change anywhere in `QuizLobby.jsx` / `QuizControlPanel.jsx` / `QuizPlayer.jsx`.

---

# 13. Accessibility Rules

- Color is never the only signal. Team identity already pairs a color with an icon/emoji (existing pattern from `TEAM_MODE_DESIGN.md`); any future avatar-based status indicator follows the same rule.
- Animation respects `prefers-reduced-motion` — idle sway and reaction animations fall back to a static pose for users/devices that request reduced motion, a genuine need for a classroom product likely to include motion-sensitive students.
- Flat matte materials (Section 6) keep silhouettes legible against this app's existing light and dark surface colors without relying on busy texture detail for readability.

---

# 14. Performance Budget

Builds directly on the two-tier model in [AVATAR_FOUNDATION.md](AVATAR_FOUNDATION.md) §7. Design-time targets, to be validated against a real target device (school-issued Chromebook class, per that section) at the start of Milestone 3:

- Full-tier assembled avatar (base rig + 5–6 equipped slots): target **≤3,000 triangles** total, one shared **512×512 or 1024×1024** texture atlas per rig.
- Chip tier: **0 live triangles** — pre-baked 2D icon only, never a live render.
- No per-item unique textures: every clothing/hair item's color comes from the `variant` field via a palette-swap/tint on the shared rig atlas (Section 5's cheap-color-differentiation approach), so texture memory stays flat no matter how many color variants ship.
- The flat/matte material choice (Section 6) is itself part of this budget, not just a look — no per-pixel PBR lookups, no normal-map sampling, ever.

---

# 15. Open Item Surfaced by This Guide — Resolved

Writing this guide originally surfaced a real gap in the Milestone 1 data model: skin tone had no home. **Resolved**: `backend/models/User.js`'s `avatarSchema` now has `skinTone: { type: String, enum: ['warm01', 'warm02', 'warm03', 'warm04', 'warm05', 'warm06'], default: 'warm03' }` — a plain selectable slug (not an `{itemId, variant}` pair like the wearable slots), since skin has no separate "item design," only a curated tone choice. The actual hex value each `warmNN` slug maps to is still an open art decision for whoever produces the rigs (see [AVATAR_ART_BIBLE.md](AVATAR_ART_BIBLE.md) §7) — the schema only reserves the slot and its cardinality.
