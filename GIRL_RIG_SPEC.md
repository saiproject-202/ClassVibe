# ClassVibe — GIRL_RIG_SPEC.md

**Production spec for the Girl base rig.** Read [AVATAR_ART_BIBLE.md](AVATAR_ART_BIBLE.md) first for the visual identity this rig must match. This document mirrors [BOY_RIG_SPEC.md](BOY_RIG_SPEC.md) exactly wherever the two rigs are required to be identical (skeleton, blendshapes, attachment points, budgets, export settings) — per [AVATAR_FOUNDATION.md](AVATAR_FOUNDATION.md) §6's shared-rig principle, both rigs must be interchangeable at the skeleton level so every animation clip built once plays correctly on both without retargeting. Every value below is restated in full so this file is self-contained — an artist should never need to flip back to the Boy spec to find a number.

---

## Table of Contents

1. Height
2. Body Proportions
3. Joint Hierarchy & Bone Names
4. Blendshape Requirements
5. Facial Expressions
6. Clothing Attachment Points
7. Accessory Attachment Points
8. Poly Budget
9. Texture Budget & Coloring Strategy
10. Material Rules
11. GLB Export Settings
12. React Three Fiber Compatibility

---

# 1. Height

**Total standing height: 1.0 world unit** — identical to the Boy rig. Per [AVATAR_STYLE_GUIDE.md](AVATAR_STYLE_GUIDE.md) §12, no rig is authored taller or shorter than its sibling, so mixed-gender rosters and team leaderboards never show one avatar towering over another.

- Head height: 1.0 / 4.5 ≈ **0.222 world units** (the same 1:4.5 ratio from [AVATAR_ART_BIBLE.md](AVATAR_ART_BIBLE.md) §2).
- Eye line: centered at approximately 0.90 of head height from the crown.
- Ground contact (foot sole) sits exactly at world-space y = 0 in the rest pose.

---

# 2. Body Proportions

Shared silhouette language from [AVATAR_ART_BIBLE.md](AVATAR_ART_BIBLE.md) §2 applies (rounded egg head, capsule torso, no muscle definition, mitten hands, rounded feet) — identical to the Boy rig. Girl-specific silhouette shaping, kept subtle — the goal is at-a-glance roster variety, not anatomical realism or stereotyping:

- Shoulder width: baseline torso capsule width (slightly narrower than the Boy rig's 1.05× shoulder width).
- Hip width: ~1.05× shoulder width — a softly tapered torso silhouette, still simplified and not exaggerated.
- Default starter hairstyle for the demoable rig: a rounded bob (fully within the "smooth cap, no spiky points" rule from the Art Bible §4).
- Default starter outfit for the demoable rig: a simple crewneck shirt, straight-leg pants, rounded sneakers — same garment types as the Boy default, so the two starter looks read as siblings, differentiated by silhouette and default color only, not by different clothing categories.

---

# 3. Joint Hierarchy & Bone Names

Identical to [BOY_RIG_SPEC.md](BOY_RIG_SPEC.md) §3 — 31 bones, no finger bones, `Hips` as root:

```
Hips                          (root)
├── Spine
│   └── Spine1
│       └── Chest
│           ├── Attach_Chest          (locator — badges/pins)
│           ├── Neck
│           │   └── Head
│           │       ├── HeadTop_End    (end effector — scale/camera reference, no geometry)
│           │       └── Attach_Head    (locator — glasses/hats)
│           ├── Shoulder_L
│           │   └── UpperArm_L
│           │       └── LowerArm_L
│           │           └── Hand_L
│           │               └── Attach_Hand_L  (locator — held props/emote items)
│           └── Shoulder_R
│               └── UpperArm_R
│                   └── LowerArm_R
│                       └── Hand_R
│                           └── Attach_Hand_R   (locator — held props/emote items)
├── UpperLeg_L
│   └── LowerLeg_L
│       └── Foot_L
│           └── Toe_L
└── UpperLeg_R
    └── LowerLeg_R
        └── Foot_R
            └── Toe_R
```

- Bone names must match this list **exactly**, with no auto-generated suffixes — this is what lets a single animation file drive both rigs (see [ANIMATION_SPEC.md](ANIMATION_SPEC.md)) without a per-rig retarget pass.
- No scale keys on any bone in the rest pose — apply all transforms before rigging (see Section 11).

---

# 4. Blendshape Requirements

Identical set to the Boy rig — seven morph targets on the head/face mesh, all deltas from the neutral rest face:

| Blendshape name | Effect |
|---|---|
| `Mouth_Smile` | Corners of mouth shape lift into a simple smile curve |
| `Mouth_Open` | Mouth shape opens (talking, surprise, celebration) |
| `Mouth_Concern` | Mouth shape flattens/softly downturns — never a full frown |
| `Eyes_Happy` | Eye shapes curve into a soft "happy squint" |
| `Eyes_Surprised` | Eye shapes widen |
| `Eyes_Blink` | Eye shapes close — procedural idle blink, not tied to emotional state |
| `Eyes_Thinking` | Eye shapes narrow/shift, paired with a slight head tilt in the `Thinking` clip |

Names must be preserved exactly through export (see [AVATAR_ASSET_CHECKLIST.md](AVATAR_ASSET_CHECKLIST.md)). No negative-affect blendshapes beyond the mild `Mouth_Concern`/`Eyes_Thinking`, same rationale as the Boy rig.

---

# 5. Facial Expressions

Identical composited expression states to the Boy rig:

| Expression | Blend |
|---|---|
| Neutral | all blendshapes at 0 |
| Happy | `Mouth_Smile` 1.0 + `Eyes_Happy` 1.0 |
| Thinking | `Eyes_Thinking` 1.0, mouth neutral |
| Listening | `Eyes_Happy` 0.3 (subtle attentiveness), mouth neutral |
| Celebrate/Surprised | `Mouth_Open` 1.0 + `Eyes_Surprised` 1.0 |
| Blink (procedural) | `Eyes_Blink` pulses to 1.0 and back on an idle timer |

---

# 6. Clothing Attachment Points

Hair, shirt, pants, and shoes are **skinned meshes**, weight-painted directly against the shared skeleton's body bones — identical mechanism to the Boy rig, per [AVATAR_FOUNDATION.md](AVATAR_FOUNDATION.md) §6. No dedicated clothing-attachment bone; the skeleton itself is the attachment mechanism.

---

# 7. Accessory Attachment Points

Identical locator bones to the Boy rig:

- **`Attach_Head`** — glasses, simple hats, headwear that shouldn't deform with facial blendshapes.
- **`Attach_Chest`** — badges/pins (future Rewards-phase display).
- **`Attach_Hand_L` / `Attach_Hand_R`** — reserved for future held props/emote items (e.g. `Victory` clip), not required for the V1 vertical slice but must exist now.

---

# 8. Poly Budget

Identical ceiling and target breakdown to the Boy rig — [AVATAR_STYLE_GUIDE.md](AVATAR_STYLE_GUIDE.md) §14's **≤3,000 triangle** budget applies equally:

| Part | Target triangles |
|---|---|
| Base body (head, torso, limbs, hands, feet) | 1,100 |
| Hair | 300 |
| Shirt | 400 |
| Pants | 350 |
| Shoes (pair) | 250 |
| Accessory | 150 |
| Face decal (eyes + mouth shapes) | 50 |
| **Total assembled** | **~2,600** |

---

# 9. Texture Budget & Coloring Strategy

Identical strategy to the Boy rig:

- **Primary coloring mechanism: baked vertex colors** (`COLOR_0`), not a texture atlas — bake flat two-tone light/shadow shading as a neutral grayscale-ish gradient.
- Runtime `variant` color applied as a material color tint multiplying the baked vertex shading — one mesh serves every color variant, zero extra texture memory.
- **Small shared face-decal atlas, 512×512 max, one per rig** — reserved only for the eyes/mouth shapes, which need crisp resolution vertex color can't provide on a coarse mesh. No other part uses a texture atlas.

---

# 10. Material Rules

Identical to the Boy rig:

- One glTF PBR metallic-roughness material per mesh part.
- `metallicFactor = 0`.
- `roughnessFactor` 0.8–1.0 (fully matte).
- `baseColorFactor` neutral white for body/clothing/hair parts (vertex color + runtime tint carry actual color, per Section 9) — never bake a color into `baseColorFactor` for these parts.
- `baseColorTexture` used only for the face-decal material.
- No `normalTexture`, `occlusionTexture`, or `metallicRoughnessTexture` anywhere. `emissiveFactor` may be used sparingly only for the fixed eye-highlight dot.

---

# 11. GLB Export Settings

Identical to the Boy rig:

- Apply all transforms before export — no residual non-uniform scale on any bone or mesh.
- Y-up axis.
- Export in rest/bind pose — **no baked animation** in this file (animation ships as a separate shared file, see [ANIMATION_SPEC.md](ANIMATION_SPEC.md)).
- Include skinning data for every deforming mesh part.
- Include morph targets (Section 4) with names preserved exactly.
- Include vertex colors (`COLOR_0`).
- No Draco mesh compression.
- File naming per [AVATAR_FOUNDATION.md](AVATAR_FOUNDATION.md) §2's convention: `girl_body_base_default.glb`, `girl_hair_{itemId}_{variant}.glb`, `girl_shirt_{itemId}_{variant}.glb`, etc.

---

# 12. React Three Fiber Compatibility

Identical gate to the Boy rig:

- Load cleanly via `@react-three/drei`'s `useGLTF` with **zero console warnings** before considering it done.
- Bone names must be unique across the file — a renamed-duplicate bone silently fails to receive animation.
- Confirm morph target names survive export via `mesh.morphTargetDictionary` after load.
- Run through the [glTF Validator](https://github.com/KhronosGroup/glTF-Validator) before handoff.
