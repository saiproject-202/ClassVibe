# ClassVibe — AVATAR_ASSET_CHECKLIST.md

**Production sign-off checklist.** Work through every box in order — each phase gate assumes the previous one is already clean. References [AVATAR_ART_BIBLE.md](AVATAR_ART_BIBLE.md), [BOY_RIG_SPEC.md](BOY_RIG_SPEC.md), [GIRL_RIG_SPEC.md](GIRL_RIG_SPEC.md), and [ANIMATION_SPEC.md](ANIMATION_SPEC.md) rather than restating their numbers — if a box references a number, that source document is the authority, not this checklist.

---

## Phase 0 — Before opening Blender

- [ ] Read [AVATAR_ART_BIBLE.md](AVATAR_ART_BIBLE.md) in full, especially Section 10 ("Reference Anti-Patterns") — know what "off-spec" looks like before starting.
- [ ] Read [AVATAR_PRODUCTION_PIPELINE.md](AVATAR_PRODUCTION_PIPELINE.md) §3 for the production-constraint numbers restated in one place.
- [ ] Confirm which rig you're building (Boy or Girl) and have the matching spec file open, not the sibling's.

---

## Phase 1 — Concept

- [ ] Front/side/3-4-view 2D turnaround sketched for this rig.
- [ ] Head-to-height ratio checked against the sketch at **1:4.5** ([BOY_RIG_SPEC.md](BOY_RIG_SPEC.md)/[GIRL_RIG_SPEC.md](GIRL_RIG_SPEC.md) §1) before any 3D work starts.
- [ ] Silhouette reads as rounded/soft at a glance — no sharp angles, no faceted look (Art Bible §10 anti-pattern check).
- [ ] Concept approved (by whoever owns creative sign-off) before proceeding to modeling — revising here is cheap; revising after modeling is not.

---

## Phase 2 — Modeling

- [ ] Total standing height matches the rig spec exactly, and matches the sibling rig's height (both must be identical — [AVATAR_STYLE_GUIDE.md](AVATAR_STYLE_GUIDE.md) §12).
- [ ] Each part's triangle count checked individually against the rig spec's poly budget table (base body, hair, shirt, pants, shoes, accessory, face decal) — not just the ~2,600 total, since one oversized part can eat another part's headroom.
- [ ] No individually modeled fingers, no detailed shoe soles, no sculpted fabric wrinkles, no realistic anatomical landmarks (Art Bible §2/§5).
- [ ] Eyes, mouth modeled/positioned per Art Bible §3 — consistent size/spacing, no iris/pupil/sclera detail, no separate eyebrow mesh.
- [ ] Ground contact (foot sole) sits exactly at world-space y = 0 in rest pose.
- [ ] Clothing/hair combinations from the V1 vertical slice test-fit together with no clipping (Art Bible §5).

---

## Phase 3 — Rigging

- [ ] Skeleton bone names match [BOY_RIG_SPEC.md](BOY_RIG_SPEC.md)/[GIRL_RIG_SPEC.md](GIRL_RIG_SPEC.md) §3 **exactly** — no auto-generated suffixes, no renamed/duplicated bones.
- [ ] `Hips` is the root bone.
- [ ] All four `Attach_*` locator bones present (`Attach_Head`, `Attach_Chest`, `Attach_Hand_L`, `Attach_Hand_R`) even though some aren't used by V1 content yet.
- [ ] No scale keys baked onto any bone in the rest pose.
- [ ] Base body mesh weight-painted against the skeleton; deformation-tested through a full range of joint rotation (arms up, legs bent, head turned) with no visible mesh tearing or pinching.
- [ ] Every clothing/hair slot mesh (Section 6 of the rig spec) is skinned against the same skeleton, not rigidly parented — test-deform each one the same way as the base body.
- [ ] Accessory test items parented to their `Attach_*` bone, confirmed to follow correctly through a full joint rotation test.

---

## Phase 4 — Blendshapes

- [ ] All seven blendshapes present and named exactly per the rig spec §4 (`Mouth_Smile`, `Mouth_Open`, `Mouth_Concern`, `Eyes_Happy`, `Eyes_Surprised`, `Eyes_Blink`, `Eyes_Thinking`).
- [ ] Each blendshape tested individually at full weight (1.0) — confirms the deformation looks correct in isolation before composited expressions are tested.
- [ ] Each composited expression from the rig spec §5 (Neutral, Happy, Thinking, Listening, Celebrate/Surprised) tested as the actual blend combination, not just the individual shapes.
- [ ] No negative-affect blendshape beyond the mild `Mouth_Concern`/`Eyes_Thinking` exists — if one was added, remove it (Art Bible §8/§10).

---

## Phase 5 — Texture & Material

- [ ] Two-tone light/shadow shading baked into vertex colors (`COLOR_0`), not painted into a texture.
- [ ] Runtime color-tint approach tested: apply at least two different `variant` tint colors to the same mesh and confirm the baked vertex shading still reads correctly under both.
- [ ] Face-decal atlas is 512×512 or smaller, contains only the eyes/mouth shapes — no other part uses a texture atlas.
- [ ] Every material: `metallicFactor = 0`, `roughnessFactor` between 0.8–1.0, no normal/occlusion/metallic-roughness texture.
- [ ] `baseColorFactor` is neutral white on every body/clothing/hair material (color comes from vertex tint, not baked into the material) — the one exception is the face-decal material, which legitimately uses `baseColorTexture`.

---

## Phase 6 — Animation

- [ ] All 11 clips from [ANIMATION_SPEC.md](ANIMATION_SPEC.md) §2 present in the shared animations file, named exactly as listed.
- [ ] Each clip plays correctly on **both** rigs without a per-rig retarget pass — this is the actual test of whether Phase 3's bone-name matching worked.
- [ ] No foot-sliding or ground-penetration in `Walk`/`Idle`.
- [ ] Every clip reviewed against the personality rule (Art Bible §9): no clip targets or references another avatar's position, no taunting/mockery framing on `Celebrate`/`Victory`/`Clap`, `TeamRespect` reads as genuine sportsmanship not defeat.
- [ ] `TeamRespect` and any "losing" context clip does **not** use a sad/slumped pose or negative facial expression (Art Bible §8's "never punishing" rule) — spot-check this one specifically, it's the easiest rule to accidentally violate.
- [ ] A static-pose frame exported for each loop clip (`Idle`, `Walk`, `Happy`, `Thinking`, `Listening`) for the reduced-motion fallback ([ANIMATION_SPEC.md](ANIMATION_SPEC.md) §4).

---

## Phase 7 — Export

- [ ] All transforms applied (location/rotation/scale) before export — verify no residual scale on any bone.
- [ ] Y-up axis confirmed.
- [ ] Body/clothing GLBs contain **no baked animation** — animation lives only in the shared per-rig animations file.
- [ ] Skinning data, morph targets (with names intact), and vertex colors all present in the exported file — check each explicitly, don't assume the exporter defaults included them.
- [ ] No Draco compression applied.
- [ ] File names follow [AVATAR_FOUNDATION.md](AVATAR_FOUNDATION.md) §2's convention exactly (`{gender}_{slot}_{itemId}_{variant}.glb`).

---

## Phase 8 — Integration Validation

- [ ] File passes the [glTF Validator](https://github.com/KhronosGroup/glTF-Validator) with no errors.
- [ ] File loads via `@react-three/drei`'s `useGLTF` with **zero console warnings** — this is the real pass/fail gate, not a visual check in a standalone viewer.
- [ ] `mesh.morphTargetDictionary` inspected after load — every name matches Phase 4's list exactly.
- [ ] Bone name uniqueness confirmed across the whole file (no silent duplicate).
- [ ] Each of the 11 animation clips confirmed playable via `THREE.AnimationMixer` against the loaded skeleton.

---

## Phase 9 — Final Sign-off

- [ ] Boy rig: base body + starter hair/shirt/pants/shoes/accessory + shared animations file, all present and named correctly.
- [ ] Girl rig: same file set, same check.
- [ ] Both rigs visually compared side by side at the same world scale — confirm neither reads as taller/larger than the other.
- [ ] Both rigs compared against [AVATAR_ART_BIBLE.md](AVATAR_ART_BIBLE.md) §10's anti-pattern list one final time, fresh eyes, before calling this done.
- [ ] Skin-tone hex values chosen for all six `warm01`–`warm06` slugs (the `User.avatar.skinTone` schema field already exists — [AVATAR_STYLE_GUIDE.md](AVATAR_STYLE_GUIDE.md) §15) and applied via the same vertex-color-tint mechanism as clothing.
