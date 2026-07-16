# ClassVibe — ANIMATION_SPEC.md

**Every animation clip required for Version 1**, built once against the shared skeleton defined in [BOY_RIG_SPEC.md](BOY_RIG_SPEC.md)/[GIRL_RIG_SPEC.md](GIRL_RIG_SPEC.md) §3 and playing correctly on both rigs without retargeting. All clips must follow the animation-personality rules in [AVATAR_ART_BIBLE.md](AVATAR_ART_BIBLE.md) §9 — warm, brief, self-directed, never mocking or targeting another avatar.

---

## Table of Contents

1. Delivery Format
2. Clip List
3. Per-Clip Detail
4. Reduced-Motion Fallback Rule

---

# 1. Delivery Format

- All 11 clips ship in **one shared file per rig** — `boy_animations.glb` / `girl_animations.glb` — containing animation data only, referencing the same bone names as the corresponding base rig file. This avoids embedding a duplicate skeleton per clip and keeps [BOY_RIG_SPEC.md](BOY_RIG_SPEC.md)/[GIRL_RIG_SPEC.md](GIRL_RIG_SPEC.md)'s body/clothing GLBs animation-free and small.
- Each clip is a separate named `AnimationClip` inside that file (glTF `animations` array entry), named exactly as listed in Section 2 — the app selects a clip by name at runtime via `THREE.AnimationMixer`.
- Source clips are retargeted from Mixamo's generic humanoid library onto the custom skeleton (per [AVATAR_PRODUCTION_PIPELINE.md](AVATAR_PRODUCTION_PIPELINE.md) §4) wherever the motion is generic humanoid locomotion/gesture — Mixamo is a legitimate accelerant here since these motions carry no visual-style risk, unlike modeling.
- Facial blendshape animation (Section 3 per-clip "Face" column) is authored separately from body motion and can be driven by the app directly via the Facial Expression states in the rig specs §5, rather than baked into the body animation clip — keeps facial expression reusable independent of which body clip is playing.

---

# 2. Clip List

| # | Clip name | Type | Approx. duration |
|---|---|---|---|
| 1 | `Idle` | Loop | 3–4s cycle |
| 2 | `Walk` | Loop | 1–1.2s cycle |
| 3 | `Wave` | One-shot | 1.5s |
| 4 | `Clap` | One-shot | 1.5s |
| 5 | `Celebrate` | One-shot | 2s |
| 6 | `TeamRespect` | One-shot | 2s |
| 7 | `ThankYou` | One-shot | 1.5s |
| 8 | `Victory` | One-shot | 2.5s |
| 9 | `Happy` | Loop | 2–3s cycle |
| 10 | `Thinking` | Loop | 3–4s cycle |
| 11 | `Listening` | Loop | 3–4s cycle |

---

# 3. Per-Clip Detail

### 1. `Idle`
- **Where used**: default state for any avatar at rest — lobby roster, profile screen, any waiting state with no more specific clip active.
- **Motion**: slow, gentle breathing/sway. No bounce, no hyperactivity — this plays for minutes at a time during a live class.
- **Face**: Neutral expression, with the procedural `Eyes_Blink` pulse running independently on its own timer.

### 2. `Walk`
- **Where used**: not wired to a specific screen in the V1 product — reserved for future spatial/lobby-entrance features (e.g. an avatar walking into frame when a student joins). Included now because it's a generic humanoid cycle, free to retarget from Mixamo, and expensive to add later if a future feature needs it and it's missing.
- **Motion**: a standard, calm walk cycle — not a run, not a strut.
- **Face**: Neutral.

### 3. `Wave`
- **Where used**: a student's avatar joining the Lobby roster (`QuizLobby.jsx`).
- **Motion**: one arm raises and waves briefly toward the implied camera/viewer — a simple greeting, not directed at any specific other avatar's position.
- **Face**: Happy.

### 4. `Clap`
- **Where used**: Leaderboard reveal, MVP/awards reveal — genuine applause for a highlighted player or team, always self-directed enthusiasm, never framed as directed at a "losing" peer.
- **Motion**: both hands come together in a simple clapping loop-and-stop (plays 2–3 claps then settles).
- **Face**: Happy.

### 5. `Celebrate`
- **Where used**: personal correct-answer reveal, streak milestones — the full-body counterpart to the existing client-side `streakBump` scale-pop beat already used in `QuizPlayer.jsx`.
- **Motion**: a single fist-pump or small jump — self-directed, brief, no direction toward any other avatar.
- **Face**: Mouth_Open + Eyes_Surprised (the "Celebrate/Surprised" composited expression).

### 6. `TeamRespect`
- **Where used**: End of Quiz, for the non-winning team acknowledging the winning team — a good-sportsmanship beat, not a loss/defeat pose.
- **Motion**: a simple nod or a hand-over-chest gesture toward the implied camera/audience — deliberately **not** modeled as a gesture toward another specific avatar's position, since no inverse-kinematics targeting between characters exists in this pipeline. Every avatar plays the identical clip regardless of where teammates/opponents are positioned on screen.
- **Face**: Happy (calm, genuine respect — not a sad or defeated expression; per the Art Bible §8, losing must never visually punish a student).

### 7. `ThankYou`
- **Where used**: end-of-quiz closing moment, or a teacher-ended session — a general appreciation gesture.
- **Motion**: a small bow of the head or a hand-to-chest gesture, brief and warm.
- **Face**: Happy.

### 8. `Victory`
- **Where used**: Podium (Individual mode) / Team Celebration (Team mode) ending — reserved for the actual quiz winner or MVP, the single most prominent clip in the set, never played by non-winners.
- **Motion**: the most expressive clip allowed — a jump with both arms raised, or an equivalent clear "win" gesture. Still self-contained: celebrating the win itself, not directed at or over other avatars.
- **Face**: Mouth_Open + Eyes_Surprised, held slightly longer than `Celebrate`'s.

### 9. `Happy`
- **Where used**: a lighter positive loop for correct-answer states that aren't a full `Celebrate` moment — e.g. sustained display during Question Summary when a student answered correctly.
- **Motion**: mostly a facial/expression-led state — a light, gentle upper-body sway, calmer than `Idle`'s neutral sway.
- **Face**: `Mouth_Smile` + `Eyes_Happy` (the "Happy" composited expression from the rig specs §5).

### 10. `Thinking`
- **Where used**: the question-answering window, and the Countdown transition view in `QuizPlayer.jsx`.
- **Motion**: a subtle head tilt, optionally a hand-near-chin gesture (using `Attach_Hand_R`'s reach as a soft guide, not a hard IK target) — restrained, not fidgety.
- **Face**: `Eyes_Thinking` (the "Thinking" composited expression).

### 11. `Listening`
- **Where used**: lobby wait states, moments when a teacher is presenting/reading a question aloud, or the teacher-facing `QuizControlPanel` roster view.
- **Motion**: an attentive, still-but-not-frozen pose — slight weight shift only, calmer than `Idle`.
- **Face**: `Eyes_Happy` at low intensity (0.3) — the "Listening" composited expression from the rig specs §5.

---

# 4. Reduced-Motion Fallback Rule

Every **loop** clip (`Idle`, `Walk`, `Happy`, `Thinking`, `Listening`) needs a single frame from partway through its cycle exported as a valid static pose — used when the app respects `prefers-reduced-motion` (per [AVATAR_STYLE_GUIDE.md](AVATAR_STYLE_GUIDE.md) §13). **One-shot** clips (`Wave`, `Clap`, `Celebrate`, `TeamRespect`, `ThankYou`, `Victory`) don't need a separate fallback — under reduced motion they simply don't play, and the avatar holds its current static pose instead.
