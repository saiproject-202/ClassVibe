# ClassVibe — AVATAR_PRODUCTION_PIPELINE.md

**Milestone 3, Part 1: Production pipeline and tool selection — architecture, not asset creation yet.**

This document defines *how* the Boy and Girl base rigs described in [AVATAR_STYLE_GUIDE.md](AVATAR_STYLE_GUIDE.md) get made — the tool comparison, the recommended pipeline from concept through React Three Fiber integration, and, in Section 6, an honest statement of what part of this pipeline can be executed by writing code versus what genuinely requires a human 3D artist.

---

## Table of Contents

1. Tool Comparison
2. Recommended Pipeline
3. Style Target, Restated as Production Constraints
4. Pipeline Stage Detail
5. React Three Fiber Integration (the stage this can actually build)
6. What This Milestone Can and Cannot Deliver

---

# 1. Tool Comparison

| Tool | Strength | Why not the primary choice here |
|---|---|---|
| **Blender** | Free, industry-standard, best-in-class native glTF/GLB export, full manual control over topology/rigging/animation, scriptable via Python for pipeline automation, zero house-style bias | Steepest learning curve; needs a real 3D artist, not a shortcut |
| **Ready Player Me** | Fast avatar-as-a-service, photo-to-avatar, native GLB, easy SDK | Every RPM avatar visibly reads as "a Ready Player Me avatar" — a recognizable house style. Directly conflicts with the Style Guide's explicit "not Ready Player Me" originality requirement. Also a third-party runtime dependency, a real consideration for a classroom product handling student avatars |
| **VRM / VRoid Studio** | Free, slider-based character building (no sculpting skill needed), strong anime-style tooling | The VRM aesthetic is its own distinct (anime-influenced) house style — same originality conflict as RPM, just a different look. Needs an extra loader dependency (`@pixiv/three-vrm`) beyond stock glTF |
| **Mixamo** | Free, huge pre-made humanoid animation library, automatic rigging for an uploaded mesh | Not a modeling tool at all — only rigs/animates a mesh you already have. Real value is at the *animation* stage only (Section 4), not modeling |
| **Character Creator / iClone (Reallusion)** | Commercial-grade rigging + animation + morph-based customization; slot-based clothing/hair system that maps naturally onto the wardrobe model from [AVATAR_FOUNDATION.md](AVATAR_FOUNDATION.md); faster iteration than raw Blender for a non-specialist | Paid per-seat license; defaults toward semi-realistic humans (needs deliberate push toward the Style Guide's soft-stylized look); another vendor dependency |
| **Blockbench** | Free, lightweight, great for low-poly/blocky modeling | Its natural output *is* the low-poly geometric look the Style Guide explicitly rejected |
| **AI text-to-3D (Meshy, Tripo3D, etc.)** | Very fast for one-off props | Not currently reliable for a *rigged, production-quality, style-consistent* humanoid base mesh with clean topology and proper slot separation for hair/clothing — not mature enough yet to be a permanent brand-owned foundation |
| **Licensed stylized base-mesh packs** (e.g. commercial asset-store humanoid packs) | A real accelerant — a pre-made, cleanly-rigged stylized humanoid base, then re-proportioned/re-textured to the Style Guide's palette and 1:4.5 head ratio | Starting point only, not a finished original character — still needs an artist's pass to actually match the Style Guide rather than the pack's stock look |

---

# 2. Recommended Pipeline

**Primary recommendation: Blender for modeling and rigging, Mixamo for animation retargeting only, native glTF export.**

Reasoning: the Style Guide's core requirement is originality — a look that isn't "Ready Player Me," "VRM," or any other recognizable platform. The only tool in the comparison table with zero built-in house style is Blender. Mixamo is brought in narrowly, for generic humanoid motion (idle, walk, wave) that has no bearing on visual style — retargeted onto the custom rig, not used as the rig's source.

**Legitimate alternative**: Character Creator, if the team prefers faster iteration and is willing to pay for a per-seat license and lean into a stylization pass on top of its semi-realistic defaults. Either path assumes a person doing hands-on modeling and rigging work — see Section 6.

---

# 3. Style Target, Restated as Production Constraints

Pulled from [AVATAR_STYLE_GUIDE.md](AVATAR_STYLE_GUIDE.md) so a modeler has hard numbers, not just adjectives:

- Head-to-height ratio **1:4.5** — not chibi, not realistic.
- Fully rounded, smooth topology — **no faceted/low-poly shading** anywhere on the surface.
- Flat matte two-tone shading, no PBR texture detail, no normal maps.
- Full-tier triangle budget **≤3,000 triangles** per fully-dressed avatar (base + 5–6 slots).
- One shared **512×512 or 1024×1024** texture atlas per rig — no per-item unique textures; color differentiation happens through the `variant` palette-swap approach, not separate texture painting per color.
- Simplified "mitten" hands, no individually modeled fingers.
- Simple rounded dot/oval eyes, no iris/pupil/sclera detail, no separate eyebrow mesh.

---

# 4. Pipeline Stage Detail

1. **Concept** — 2D front/side/3-4-view turnaround sketches for the Boy and Girl base body, checked against the Section 3 constraints *before* any 3D work starts. Cheap to revise here; expensive to revise once modeled.
2. **Modeling** — Box-model (or sculpt-then-retopologize) in Blender at the target poly budget, built at the fixed avatar-scale unit height from the Style Guide §12, UV-unwrapped for the shared atlas.
3. **Rigging** — Author a humanoid skeleton per rig (or run Mixamo's auto-rigger on the finished mesh, then clean up and rename bones to the project's convention), weight-paint the base body and every wearable slot mesh against that one shared skeleton, per [AVATAR_FOUNDATION.md](AVATAR_FOUNDATION.md) §6.
4. **Animation** — Retarget a small starter clip set (idle sway, correct-answer pop, wrong-answer shrug, celebration) from Mixamo's library onto the custom rig, following the Style Guide §7-8 animation-personality rules (warm, brief, never mocking or taunting).
5. **GLB export** — Blender's native glTF exporter, one `.glb` per mesh, named per the Milestone 1 convention (`{gender}_{slot}_{itemId}_{variant}.glb`), skeleton and skin weights embedded, textures baked into the shared per-rig atlas.
6. **React Three Fiber integration** — load, resolve through the manifest, and assemble on the shared skeleton at render time. Detailed next.

---

# 5. React Three Fiber Integration

This is the stage that's genuinely a coding task, and the only stage this milestone can build without a finished mesh existing yet:

- `@react-three/fiber` + `@react-three/drei`'s `useGLTF` to load a rig's base body GLB and each equipped slot's GLB.
- Resolve every `{gender, slot, itemId, variant}` avatar-config entry (Milestone 1 §3) to a real GLB path via the manifest (Milestone 1 §5) before calling `useGLTF`.
- Mount equipped slot meshes onto the base rig's shared skeleton (`SkeletonUtils.clone` + bone-matching by name for skinned items; parent to a named bone directly for rigid accessories), matching [AVATAR_FOUNDATION.md](AVATAR_FOUNDATION.md) §6's assembly rule.
- This integration code can be written and unit-tested against a single **temporary, clearly-labeled placeholder GLB** (a primitive stand-in, deleted once real art lands) purely to prove the loading/assembly/animation-mounting pipeline works — that stand-in is a throwaway pipeline test fixture, never shipped, never called "the rig." Whether to build that throwaway fixture now is a call for you: it validates the code path today, or this step waits until the first real Boy rig file exists.

---

# 6. What This Milestone Can and Cannot Deliver

Being direct about a real capability boundary, because it changes what "done" means for Milestone 3:

**I can do everything in Sections 1–3 above** (tool comparison, pipeline recommendation, production constraints) and **all of Section 5** (the loading/assembly code) once a real mesh exists to load. Both are genuine engineering/research work.

**I cannot personally model, sculpt, UV-unwrap, rig, or texture the actual Boy and Girl characters.** That is 3D character art — a manual craft skill (topology, silhouette, weight painting, hand-tuned proportions) — not something producible by writing a script. There's no tool available to me in this environment that changes that: no Blender install on this machine, and no 3D-generation API (Meshy/Tripo3D/RPM/etc.) connected to this session. Procedurally generating geometry from code, even smoothed/subdivided, would land back at "primitive shapes wearing a stylized paint job" — exactly what was ruled out, and it would not meet a "production-ready, permanent base rig" bar regardless of how it's dressed up.

**What actually gets you a real Boy/Girl rig**, in order of how directly it satisfies "fully original, production quality":

1. **Hire or assign a 3D artist** (in-house or contracted) to execute the Section 4 pipeline in Blender against the Section 3 constraints — the highest-fidelity, fully-original path, and the one this document is written to hand directly to that person.
2. **License a stylized humanoid base-mesh pack** as a modeling starting point, then have an artist re-proportion it to the 1:4.5 ratio and re-texture it to the ClassVibe palette — faster than modeling from zero, at the cost of starting from someone else's topology.
3. **Character Creator**, if there's budget for the license and someone willing to learn it — meaningfully faster iteration than Blender for a non-specialist, still needs a stylization pass.

None of these are something I can execute directly. What I can do right now, if useful: draft a clear creative brief/spec sheet (turnaround requirements, the Section 3 numbers, deliverable file format) to hand to whoever ends up modeling this — that's a real, immediately useful artifact for option 1 or 2.
