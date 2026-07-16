# ClassVibe — BOY_RIG_SPEC.md

**Production spec for the Boy base rig.** Read [AVATAR_ART_BIBLE.md](AVATAR_ART_BIBLE.md) first for the visual identity this rig must match. This document is the technical contract: exact numbers, bone names, and export settings, so the finished file plugs into ClassVibe's React Three Fiber pipeline without back-and-forth revisions.

The Girl rig ([GIRL_RIG_SPEC.md](GIRL_RIG_SPEC.md)) shares the **identical** bone hierarchy, bone names, blendshape set, attachment points, budgets, and export settings in this document — per [AVATAR_FOUNDATION.md](AVATAR_FOUNDATION.md) §6's shared-rig principle, the two rigs must be interchangeable at the skeleton level so animation clips built once play correctly on both. Only silhouette proportions and height-independent shaping differ; see Section 2.

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

**Total standing height: 1.0 world unit** (treat as 1.0 meter in Blender's default unit scale). This is identical to the Girl rig — per [AVATAR_STYLE_GUIDE.md](AVATAR_STYLE_GUIDE.md) §12, no rig is authored taller or shorter than its sibling, so mixed-gender rosters and team leaderboards never show one avatar towering over another.

- Head height: 1.0 / 4.5 ≈ **0.222 world units** (the 1:4.5 ratio from [AVATAR_ART_BIBLE.md](AVATAR_ART_BIBLE.md) §2).
- Eye line: centered at approximately 0.90 of head height from the crown.
- Ground contact (foot sole) sits exactly at world-space y = 0 in the rest pose, so the rig drops into any scene with no manual vertical offset.

---

# 2. Body Proportions

Shared silhouette language from [AVATAR_ART_BIBLE.md](AVATAR_ART_BIBLE.md) §2 applies (rounded egg head, capsule torso, no muscle definition, mitten hands, rounded feet). Boy-specific silhouette shaping, kept subtle — the goal is at-a-glance roster variety, not anatomical realism or stereotyping:

- Shoulder width: ~1.05× the torso's base capsule width (a touch broader than the Girl rig's baseline).
- Hip width: equal to shoulder width — a straight, rectangular torso silhouette.
- Default starter hairstyle for the demoable rig: a short, rounded crop (fully within the "smooth cap, no spiky points" rule from the Art Bible §4).
- Default starter outfit for the demoable rig: a simple crewneck shirt, straight-leg pants, rounded sneakers — one clean recognizable silhouette, not a "busy" default.

---

# 3. Joint Hierarchy & Bone Names

31 bones total. No finger bones (mitten hands, per the Art Bible §2) — this keeps weight painting simple and the skeleton lightweight. `Attach_*` bones are non-deforming locators, not part of the deforming skin chain.

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

- `Hips` is the root bone — matches the Mixamo/Unity Mecanim convention, so retargeting animation clips (per [ANIMATION_SPEC.md](ANIMATION_SPEC.md)) is a direct bone-name match, not a manual remap.
- Bone names must be **exactly** as listed, with no auto-generated suffixes (`Bone.001`, `Head_2`, etc.) — rename explicitly in Blender before export. Duplicate/renamed bones break the shared-skeleton assumption every clothing item and animation clip relies on.
- No scale keys on any bone in the rest pose — apply all transforms before rigging (see Section 11).

---

# 4. Blendshape Requirements

Seven morph targets on the head/face mesh, all deltas from the neutral rest face:

| Blendshape name | Effect |
|---|---|
| `Mouth_Smile` | Corners of mouth shape lift into a simple smile curve |
| `Mouth_Open` | Mouth shape opens (talking, surprise, celebration) |
| `Mouth_Concern` | Mouth shape flattens/softly downturns — never a full frown, per the "never punishing" rule in the Art Bible §8 |
| `Eyes_Happy` | Eye shapes curve into a soft "happy squint" |
| `Eyes_Surprised` | Eye shapes widen |
| `Eyes_Blink` | Eye shapes close — procedural, used for idle blink pulses, not tied to any emotional state |
| `Eyes_Thinking` | Eye shapes narrow/shift, paired with a slight head tilt in the `Thinking` animation clip |

- Names must be preserved exactly through export — some glTF exporters silently rename or strip morph targets; verify in a validator before handoff (see [AVATAR_ASSET_CHECKLIST.md](AVATAR_ASSET_CHECKLIST.md)).
- No blendshape for anger, sadness, fear, or any negative-affect expression beyond the mild `Mouth_Concern`/`Eyes_Thinking` — this is a deliberate limit from the Art Bible's educational-personality rule, not a missed requirement.

---

# 5. Facial Expressions

Composited from Section 4's blendshapes — these are the named "expression states" the app will request, each a fixed blend of the primitives above:

| Expression | Blend |
|---|---|
| Neutral | all blendshapes at 0 |
| Happy | `Mouth_Smile` 1.0 + `Eyes_Happy` 1.0 |
| Thinking | `Eyes_Thinking` 1.0, mouth neutral |
| Listening | `Eyes_Happy` 0.3 (subtle attentiveness), mouth neutral |
| Celebrate/Surprised | `Mouth_Open` 1.0 + `Eyes_Surprised` 1.0 |
| Blink (procedural, not a named state) | `Eyes_Blink` pulses to 1.0 and back on an idle timer, independent of whichever named expression is active |

---

# 6. Clothing Attachment Points

Hair, shirt, pants, and shoes are **skinned meshes**, not rigid attachments — each is weight-painted directly against the shared skeleton's body bones (the same bones the base body mesh uses), so they deform correctly with any future pose/animation rather than floating rigidly. No dedicated "clothing attachment bone" exists for these slots — the skeleton itself *is* the attachment mechanism, per [AVATAR_FOUNDATION.md](AVATAR_FOUNDATION.md) §6's assembly rule.

---

# 7. Accessory Attachment Points

Non-deforming items parent directly to a locator bone rather than being skinned:

- **`Attach_Head`** — glasses, simple hats, any headwear that shouldn't deform with facial blendshapes.
- **`Attach_Chest`** — badges/pins (future Rewards-phase display, per [AVATAR_FOUNDATION.md](AVATAR_FOUNDATION.md) §3's `badges` field).
- **`Attach_Hand_L` / `Attach_Hand_R`** — reserved for future held props or emote items (e.g. a trophy in the `Victory` clip, per [ANIMATION_SPEC.md](ANIMATION_SPEC.md)) — not required for the V1 vertical slice, but the locator must exist now so nothing about the skeleton needs to change when that content ships.

---

# 8. Poly Budget

Ceiling from [AVATAR_STYLE_GUIDE.md](AVATAR_STYLE_GUIDE.md) §14: **≤3,000 triangles** for a fully-dressed avatar. Target breakdown:

| Part | Target triangles |
|---|---|
| Base body (head, torso, limbs, hands, feet) | 1,100 |
| Hair | 300 |
| Shirt | 400 |
| Pants | 350 |
| Shoes (pair) | 250 |
| Accessory | 150 |
| Face decal (eyes + mouth shapes) | 50 |
| **Total assembled** | **~2,600** (400 under ceiling — headroom, not a target to fill) |

---

# 9. Texture Budget & Coloring Strategy

- **Primary coloring mechanism: baked vertex colors, not a texture atlas.** Bake the flat two-tone light/shadow shading detail (Art Bible §6) directly onto each mesh's vertex color channel (`COLOR_0`) as a neutral grayscale-ish gradient.
- At runtime, each equipped item's actual `variant` color (Milestone 1's `{itemId, variant}` pair) is applied as a simple material color tint that multiplies against the baked vertex shading — one mesh serves every color variant with zero extra texture memory and no per-variant asset duplication.
- **Small shared face-decal atlas, one per rig, 512×512 max**: reserved specifically for the eyes/mouth shapes (Section 4), since crisp fixed facial shapes need real texture resolution that vertex color on a coarse low-poly mesh can't cleanly express. This is the *only* place a texture atlas is used — clothing/hair do not need one.
- No per-item unique textures anywhere. If a design ever seems to need one, that's a signal to reconsider it against the flat-material rule (Art Bible §6), not a reason to add a texture.

---

# 10. Material Rules

- One glTF PBR "metallic-roughness" material per mesh part.
- `metallicFactor = 0` (nothing on a ClassVibe avatar is metallic).
- `roughnessFactor` between 0.8–1.0 (fully matte — no shine, no specular highlight).
- `baseColorFactor` set to neutral white (vertex colors + runtime tint handle actual color, per Section 9) — do not bake a color into `baseColorFactor` for clothing/hair/body parts.
- `baseColorTexture` used only for the face-decal material described in Section 9.
- No `normalTexture`, `occlusionTexture`, or `metallicRoughnessTexture` on any part. `emissiveFactor` may be used sparingly only for the single fixed eye-highlight dot, if the artist judges it adds life without breaking the flat-matte read.

---

# 11. GLB Export Settings

- **Apply all transforms** (location, rotation, scale) before export — no residual non-uniform scale on any bone or mesh. Non-uniform scale on skinned bones is a common source of skewed deformation in three.js `SkinnedMesh`.
- Y-up axis (glTF standard).
- Export in the rest/bind pose — **no baked animation** in this file. Animation clips ship as a separate shared file per rig (see [ANIMATION_SPEC.md](ANIMATION_SPEC.md)) referencing this same skeleton, so clothing/body GLBs stay animation-free and small.
- Include skinning data (skeleton + skin weights) for every deforming mesh part.
- Include morph targets (Section 4), with names preserved exactly.
- Include vertex colors (`COLOR_0`).
- **No Draco mesh compression.** File sizes are already small given the poly budget in Section 8; Draco's interaction with morph targets has inconsistent support across three.js versions and isn't worth the risk for the size saved here.
- File naming per [AVATAR_FOUNDATION.md](AVATAR_FOUNDATION.md) §2's convention: `boy_body_base_default.glb`, `boy_hair_{itemId}_{variant}.glb`, `boy_shirt_{itemId}_{variant}.glb`, etc.

---

# 12. React Three Fiber Compatibility

- Verify the file loads cleanly via `@react-three/drei`'s `useGLTF` with **zero console warnings** before considering it done — this is the actual pass/fail gate, not a visual glance in a separate viewer.
- Bone names must be unique across the whole file (Section 3) — three.js resolves bones by name when matching an animation clip's skeleton to the character's skeleton; a renamed-duplicate bone silently fails to animate.
- Confirm morph target names survive export by inspecting `mesh.morphTargetDictionary` after load — if a name doesn't match Section 4 exactly, expression-driving code will silently target nothing.
- Run the file through the [glTF Validator](https://github.com/KhronosGroup/glTF-Validator) before handoff — catches transform, accessor, and skinning issues earlier and more precisely than a runtime console warning would.
