# ClassVibe — AVATAR_FOUNDATION.md

**Milestone 1: Avatar Foundation — design only, no UI, no animation, no rewards logic.**

This document defines the structural bedrock the full-body 3D avatar system will be built on: where asset files live, how they're named, what shape an avatar's data takes in the database and over the wire, how the client will load/cache that data, and how the whole thing needs to be assembled (skeleton/rig strategy) and to scale (performance, future content) once real content and UI arrive in later milestones.

**What this milestone deliberately does NOT do:**
- No avatar rendering, no avatar builder UI, no profile/lobby/leaderboard integration.
- No animation, no rig playback, no emote system behavior.
- No rewards/unlock logic (badges/currency/progression).
- No real 3D asset files — folders exist and are empty (`.gitkeep` only), per design.

Every screen already shipped in [TEAM_MODE_DESIGN.md](TEAM_MODE_DESIGN.md) reserves avatar space using the existing colored-circle-with-initial chip (see `QuizLobby.jsx`, `QuizControlPanel.jsx`, `QuizPlayer.jsx` podium/celebration views) — that placeholder stays exactly as-is until a later milestone swaps it for a real rendered avatar.

---

## Table of Contents

1. Folder Structure
2. Asset Naming Convention
3. Avatar JSON Structure
4. Database Schema
5. Asset Loading Strategy
6. Skeleton / Rig Strategy
7. Performance Strategy
8. Future Scalability
9. Milestone 2 Checklist

---

# 1. Folder Structure

Two asset trees exist because the two runtimes need different things: the frontend needs the actual renderable 3D/2D asset files (served to the browser, bundled or fetched), the backend tree exists for anything generated or processed server-side (e.g. a future server-rendered avatar thumbnail for share cards, or admin-uploaded custom content pending moderation) — kept separate from the frontend's build-time asset pipeline on purpose.

```
frontend/src/assets/avatars/
├── boy/
│   ├── hair/
│   ├── eyes/
│   ├── shirts/
│   ├── pants/
│   ├── shoes/
│   └── accessories/
└── girl/
    ├── hair/
    ├── eyes/
    ├── shirts/
    ├── pants/
    ├── shoes/
    └── accessories/

frontend/src/assets/
├── backgrounds/     (avatar card / profile background scenes)
├── badges/          (reward/achievement icons — NOT avatar-worn items)
└── emotes/          (reaction animations/stickers triggerable in lobby/chat, later phase)

backend/assets/
├── avatars/
│   ├── boy/         (shared boy base mesh + rig, if server-side processing is ever needed)
│   └── girl/        (shared girl base mesh + rig, same)
├── emotes/
├── badges/
└── backgrounds/
```

**Rules:**
- One subfolder per **gender base** (`boy`, `girl`) at the top level of `avatars/` — never per-item-type-then-gender. This keeps every gender's full wardrobe self-contained, which matters once a 3rd base (e.g. a gender-neutral rig) is added later — it's a folder addition, not a restructure (see Section 8).
- Item-type subfolders (`hair`, `eyes`, `shirts`, `pants`, `shoes`, `accessories`) are fixed "slots" — they map 1:1 to the slot keys in the Avatar JSON Structure (Section 3) and the `avatar` sub-schema (Section 4). Adding a new slot (e.g. `hats`) is a folder + schema + manifest addition, never a rename of an existing slot.
- `badges` and `backgrounds` are **not** part of the avatar's wearable slots — badges are reward/profile decorations, backgrounds are display-context scenery. Keeping them out of `avatars/` avoids the slot list growing with things that aren't clothing.
- Folders are created empty in this milestone (`.gitkeep` placeholder only) — no real asset files exist yet. Populating them is Phase 3 ("Boy & Girl Base Avatar") per the user's own 11-phase roadmap.

---

# 2. Asset Naming Convention

Every asset file follows one fixed pattern so the loading strategy (Section 5) and manifest (Section 5) can generate paths programmatically instead of hardcoding a lookup table per item:

```
{gender}_{slot}_{itemId}_{variant}.{ext}
```

| Segment | Meaning | Example values |
|---|---|---|
| `gender` | `boy` \| `girl` | `boy` |
| `slot` | matches the folder/slot name | `hair`, `shirt`, `pants`, `shoes`, `accessory`, `eyes` |
| `itemId` | stable, never-reused short slug for this specific item design | `spiky01`, `crewneck03` |
| `variant` | color/pattern variant of the same item design | `red`, `navy`, `default` |
| `ext` | `.glb` for 3D meshes, `.png`/`.webp` for 2D icon thumbnails (used in the future Avatar Builder picker UI) | `.glb`, `.png` |

**Examples:**
```
boy_hair_spiky01_black.glb
boy_hair_spiky01_black_thumb.webp      (builder-picker thumbnail, same itemId+variant)
girl_shirt_crewneck03_navy.glb
girl_accessory_glasses02_default.glb
```

**Rules:**
- `itemId` is permanent once assigned — it is the value stored in the database (Section 4), never the filename itself. Renaming a file's `variant` or fixing a typo in the folder is safe; renaming `itemId` is a breaking change to every saved avatar config that references it (see Section 4's "why store IDs, not paths").
- Thumbnails share the exact `{gender}_{slot}_{itemId}_{variant}` prefix with a `_thumb` suffix, so the manifest can derive one from the other without a second lookup table.
- No spaces, no camelCase, no uppercase — lowercase snake_case only, consistent with this repo's existing asset conventions.

---

# 3. Avatar JSON Structure

This is the shape an avatar configuration takes both in the database (Section 4, stored as-is under `User.avatar`) and over the wire (socket payloads, REST responses) — one shape, no transformation between storage and transport, matching this codebase's existing "one scoring engine" philosophy of not maintaining two representations of the same thing.

```json
{
  "gender": "boy",
  "skinTone": "warm03",
  "hair": { "itemId": "spiky01", "variant": "black" },
  "eyes": { "itemId": "round01", "variant": "brown" },
  "shirt": { "itemId": "crewneck03", "variant": "navy" },
  "pants": { "itemId": "jeans01", "variant": "blue" },
  "shoes": { "itemId": "sneaker02", "variant": "white" },
  "accessory": { "itemId": "glasses02", "variant": "default" },
  "badges": ["fastest_thinker", "team_mvp_bronze"],
  "background": { "itemId": "classroom01", "variant": "default" },
  "favoriteEmote": "thumbs_up"
}
```

**Rules:**
- `skinTone` is a plain slug (`warm01`–`warm06`), not an `{ itemId, variant }` pair — skin has no separate "item design" the way hair/clothing do, only a curated tone choice, applied at render time as a runtime color tint against the base body mesh's baked vertex shading (same mechanism as clothing `variant` tinting — see `BOY_RIG_SPEC.md` §9).
- Every wearable slot (`hair`, `eyes`, `shirt`, `pants`, `shoes`, `accessory`) is an object of `{ itemId, variant }`, never a bare string — this is what lets a single item design (e.g. `crewneck03`) exist in multiple colors without needing a separate `itemId` per color, and lets the manifest resolve a real file path from the pair.
- `accessory` is singular (one slot) for this milestone. Multiple simultaneous accessories (e.g. glasses + hat) is a future-scalability concern addressed in Section 8, not solved now — the user's own vertical-slice plan lists exactly one accessory type in the first real content pass.
- `badges` is an array of badge slugs (reward system's vocabulary, defined in the — not yet built — Rewards phase), stored on the avatar only for the purpose of the future profile/leaderboard badge display; the avatar model does not own badge-award logic.
- `background` and `favoriteEmote` are display/profile preferences, not "worn" items — they don't have a corresponding slot folder under `avatars/{gender}/`, they read from `assets/backgrounds/` and `assets/emotes/` respectively.
- No absolute or relative file paths ever appear in this structure — only `itemId`/`variant`/slug identifiers. Resolving an identifier to an actual asset file is entirely the Asset Loading Strategy's job (Section 5). This indirection is what allows re-organizing the physical folder structure or swapping a `.glb` for a re-exported version later without touching a single saved user record.

---

# 4. Database Schema

Implemented now (additive, non-breaking) as a sub-schema on the existing `User` model (`backend/models/User.js`), since a user's avatar configuration is fundamentally a property of the user, exactly like `profilePhoto` already is.

```js
const avatarItemSchema = new mongoose.Schema({
  itemId: { type: String, required: true },
  variant: { type: String, required: true, default: 'default' }
}, { _id: false });

const avatarSchema = new mongoose.Schema({
  gender: { type: String, enum: ['boy', 'girl'], default: 'boy' },
  skinTone: { type: String, enum: ['warm01', 'warm02', 'warm03', 'warm04', 'warm05', 'warm06'], default: 'warm03' },
  hair: { type: avatarItemSchema, default: () => ({ itemId: 'spiky01', variant: 'black' }) },
  eyes: { type: avatarItemSchema, default: () => ({ itemId: 'round01', variant: 'brown' }) },
  shirt: { type: avatarItemSchema, default: () => ({ itemId: 'crewneck01', variant: 'default' }) },
  pants: { type: avatarItemSchema, default: () => ({ itemId: 'jeans01', variant: 'default' }) },
  shoes: { type: avatarItemSchema, default: () => ({ itemId: 'sneaker01', variant: 'default' }) },
  accessory: { type: avatarItemSchema, default: null },
  badges: { type: [String], default: [] },
  background: { type: avatarItemSchema, default: null },
  favoriteEmote: { type: String, default: null }
}, { _id: false });

// on userSchema:
avatar: { type: avatarSchema, default: () => ({}) }
```

**Rules:**
- `{ _id: false }` on both sub-schemas — these are embedded value objects, not separately-referenced documents; matches this codebase's existing pattern for embedded config objects (e.g. `Quiz.settings.teamMode`).
- Defaults are real, sane starting items (not `null` placeholders) so every existing/new user has a complete, renderable avatar the moment this field exists — no "avatar not configured yet" empty state to design around later. The specific default `itemId`s above are illustrative placeholders and will be confirmed against whatever the actual first vertical-slice content ends up being named (Phase 3).
- `accessory` and `background` default to `null` (genuinely optional, unlike the always-worn base slots) — a student who never touches the (future) Avatar Builder simply has no accessory, not a fake default one.
- This is a **field addition only** — no migration script needed. Mongoose applies the schema default to every document read, whether or not the field exists in the stored document yet; existing users get a valid avatar object the first time they're read, without a backfill pass.
- No new top-level collection. An avatar is not independently queryable/listable data (there's no product need to query "all users with red hair") — embedding keeps it a single read alongside the user document, consistent with `profilePhoto`.

---

# 5. Asset Loading Strategy

**The manifest is the contract.** A single generated file, `frontend/src/assets/avatars/manifest.json`, maps every `{gender, slot, itemId, variant}` combination to its real bundled asset path (and thumbnail path). This is the only place in the codebase that ever needs to know actual file paths — every other consumer (Avatar Builder UI, avatar renderer, leaderboard chip) resolves through the manifest, never by string-concatenating a path from an avatar config directly. This is the same indirection principle already used for the asset naming convention (Section 2) and JSON structure (Section 3): identifiers are stable, physical layout can change freely underneath them.

```json
{
  "boy": {
    "hair": {
      "spiky01": { "black": { "model": "boy/hair/boy_hair_spiky01_black.glb", "thumb": "boy/hair/boy_hair_spiky01_black_thumb.webp" } }
    }
  },
  "girl": { "...": "..." }
}
```

- Manifest is generated (or hand-maintained, for the small initial vertical slice) at build time — it is checked in, not computed at runtime by scanning folders, so a missing asset fails fast at build/review time rather than as a runtime 404 in front of a class of students.
- Loading is **lazy and per-slot**: only the `.glb` files for a student's own currently-equipped items load when their avatar needs to render, never the entire wardrobe. This matters most in the Leaderboard/Team roster views where many different students' avatars may render simultaneously (Section 7).
- Once loaded, a given `(itemId, variant)` mesh is cached client-side by the loader (keyed on that pair) for the session, since the same shirt design in the same color will very likely be worn by more than one student in a class.
- Missing-manifest-entry is a hard error surfaced in development (console) rather than a silent fallback — an avatar silently rendering with a wrong/missing part in front of a live class is worse than a build-time failure.

---

# 6. Skeleton / Rig Strategy

**Confirmed tech stack:** `three.js` + `@react-three/fiber` (+ `@react-three/drei` for common helpers) as the rendering stack, with `.glb`/GLTF as the sole asset interchange format. Not yet installed in `frontend/package.json` — that happens when Milestone 3 (Boy & Girl Rig) starts building, not in this design-only milestone.

**Why this combination:** it's the de facto standard for real-time 3D in React web apps (large ecosystem, GLTF is the format every major DCC tool — Blender, Mixamo, etc. — exports natively), and GLB (binary GLTF) bundles mesh + skeleton + textures in one file, which keeps the asset-naming/manifest model in Section 2/5 simple (one file per asset, no sidecar files to track). The stack stays renderer-independent where practical — GLB/GLTF is a neutral interchange format, not tied to three.js, so a future engine swap would not require re-authoring assets.

**Shared-rig principle, rig-count kept open-ended:** Version 1 ships **two base rigs** — `boy` and `girl` — and every hair/shirt/pants/shoes/accessory mesh for a given rig is modeled and rigged (or rigidly attached, for non-deforming items like glasses) against that rig's one shared skeleton. This is the single most important rule in this section, because it's what makes the wardrobe system combinatorial instead of per-outfit:
- One animation clip (idle, wave, celebrate, etc.) authored once per rig plays correctly regardless of which clothing combination is currently equipped — animations are never re-authored per outfit.
- Adding a new shirt design later requires only modeling+skinning that one new mesh against the existing rig's skeleton — it does not require touching hair, pants, shoes, or any existing animation.
- Non-deforming accessories (glasses, simple hats) can be attached to a fixed bone (e.g. a head bone) rather than fully skinned, which is cheaper to produce for the first vertical slice.
- This directly enables the user's own vertical-slice plan (1 boy rig, 1 girl rig, 2 hairstyles, 2 shirts, 1 pants, 1 shoes, 1 accessory, 2 emotes) — every one of those items targets exactly one of the two Version-1 rigs.

**Deliberately not hardcoded to "exactly two rigs forever":** the `gender` field (Section 3/4) and the `avatars/{rigId}/` folder convention (Section 1) are keyed by an open rig identifier, not a boolean. Adding a future rig — a teacher avatar, a school mascot, a seasonal/limited character, a robot — is a new `rigId` folder + a new shared skeleton + an enum extension, following exactly the same shared-rig principle above; it never requires redesigning the database shape or the animation pipeline, because both were already built around "N rigs," not "2 rigs."

**Assembly at render time:** the renderer loads the rig's base body mesh (already bound to its shared skeleton) plus each equipped slot's mesh, and either merges them onto the single skeleton instance (for skinned items) or parents them to a named bone (for rigid accessories) — assembled per-student at render time from the avatar config, never pre-baked into a single combined file per outfit combination (which would blow up combinatorially: slots × variants × rigs).

---

# 7. Performance Strategy

Avatars will appear in places where **many render simultaneously** — team rosters, leaderboards, lobby grids — which is a fundamentally different budget than a single full-screen avatar in a builder/profile screen. Two tiers are planned:

- **"Full" tier** (profile screen, avatar builder, podium top-3 at quiz end): full-detail GLB meshes, real-time lit, one or a small handful on screen at once.
- **"Chip" tier** (lobby roster, team leaderboard rows, in-question participant lists): the *existing* placeholder pattern (colored circle + initial) is not just a temporary stand-in for "we haven't built avatars yet" — it remains the permanent low-cost representation at this tier even after avatars exist, or is replaced by a small number of pre-baked 2D icon renders (the same thumbnail images already planned for the Avatar Builder picker, Section 2) rather than a live 3D render, so a 30-student roster never has to instantiate 30 live WebGL meshes at once.
- Texture atlasing: all of one gender's clothing textures for the initial content pass share a single atlas texture rather than one texture per item, keeping GPU texture-swap overhead flat regardless of how many distinct students/outfits are visible together.
- Poly-count budget per assembled avatar (base + 5 slots) is a hard target set before Phase 3 content is modeled, not discovered afterward — exact number to be fixed once the first vertical-slice meshes exist and can be profiled on the lowest-spec target device (school-issued Chromebooks are the realistic worst case for this product).
- LOD (level of detail) swapping — a lower-poly mesh variant for the "chip tier" if it ever does render live 3D instead of a baked icon — is a Phase-3-or-later optimization, not solved now; this section only reserves the concept so it isn't a surprise later.

---

# 8. Future Scalability

Every choice above was made to keep specific future additions cheap:

- **New gender base** (e.g. a third neutral option): add a folder (`avatars/neutral/`), one new skeleton, and extend the `gender` enum — no restructuring of the existing `boy`/`girl` trees or the manifest shape.
- **New wearable slot** (e.g. `hats`, worn simultaneously with `accessory`): add a folder, add the slot key to the JSON structure/schema/manifest, update the naming convention table — every existing avatar config is still valid (new slot defaults to unset), no migration.
- **Multiple simultaneous accessories**: `accessory` becoming `accessories: []` is a schema/JSON change, not an asset or naming-convention change — items themselves don't need to change shape.
- **New content packs / seasonal items**: new `itemId`s under existing slots are pure asset+manifest additions — zero schema change, since the schema already only stores identifiers.
- **Multi-school / SaaS tenancy** (per [SAAS_EVOLUTION.md](SAAS_EVOLUTION.md)): avatar items are global content, not per-tenant data, so nothing here needs a `schoolId`/tenant scope; a future "school-exclusive cosmetic" would be an additive flag on a manifest entry (e.g. `"schoolExclusive": "school_123"`), not a structural change.
- **Server-side avatar rendering** (e.g. static share-card thumbnails, moderation previews): the `backend/assets/avatars/` tree already exists for exactly this, kept separate from the frontend bundle so adding a headless-render pipeline later doesn't touch client asset loading at all.

---

# 9. Milestone 4 Checklist

Milestone 2 (art direction) and Milestone 3's production package are now complete:

- [AVATAR_STYLE_GUIDE.md](AVATAR_STYLE_GUIDE.md) — confirmed original ClassVibe avatar style.
- [AVATAR_PRODUCTION_PIPELINE.md](AVATAR_PRODUCTION_PIPELINE.md) — tool selection and pipeline (Blender modeling/rigging, Mixamo retargeting, glTF export, R3F integration).
- [AVATAR_ART_BIBLE.md](AVATAR_ART_BIBLE.md), [BOY_RIG_SPEC.md](BOY_RIG_SPEC.md), [GIRL_RIG_SPEC.md](GIRL_RIG_SPEC.md), [ANIMATION_SPEC.md](ANIMATION_SPEC.md), [AVATAR_ASSET_CHECKLIST.md](AVATAR_ASSET_CHECKLIST.md) — the complete artist-facing production package: exact proportions, shared bone hierarchy/names, blendshapes, attachment points, poly/texture budgets, material rules, GLB export settings, the full V1 animation clip list, and a phase-by-phase sign-off checklist.

What remains of Milestone 3 is the actual modeling/rigging/texturing/animation work itself — hands-on 3D art production against the specs above, executed by a 3D artist (in-house, contracted, or via a licensed base-mesh pack per [AVATAR_PRODUCTION_PIPELINE.md](AVATAR_PRODUCTION_PIPELINE.md) §6), not something producible by writing code. Checklist before Milestone 4 (Avatar Builder UI) can start:

- [ ] Actual Boy and Girl rig files (base body + starter wardrobe + shared animations) produced by a 3D artist and passed through [AVATAR_ASSET_CHECKLIST.md](AVATAR_ASSET_CHECKLIST.md) end to end.
- [ ] Lock the exact vertical-slice content list (already drafted by the user: 1 boy rig, 1 girl rig, 2 hairstyles, 2 shirts, 1 pants, 1 shoes, 1 accessory, 2 emotes) into concrete `itemId`s, following Section 2's naming convention.
- [x] ~~Resolve the skin-tone schema gap~~ — done: `avatar.skinTone` (`warm01`–`warm06`, default `warm03`) added to `User.js`. Actual hex-per-slug mapping is still an artist decision during production ([AVATAR_STYLE_GUIDE.md](AVATAR_STYLE_GUIDE.md) §15).
- [ ] Confirm badge slugs (referenced but not defined in Section 3/4) against whatever the Rewards phase (Phase 11) ends up calling its unlockable achievements.
- [ ] Fix the poly-count/texture budgets referenced in Section 7 and the rig specs against a real target device test (school-issued Chromebook class), not just the design-time targets.
