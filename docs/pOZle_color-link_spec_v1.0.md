# Color Link — Game Design & Implementation Spec

| Field           | Value                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------------- |
| Version         | v1.0                                                                                              |
| Date            | 2026-08-27                                                                                        |
| Status          | Draft                                                                                             |
| Genre           | Grid path-connection logic puzzle (Flow-style)                                                    |
| Platform        | Web (mobile-first, responsive to desktop); installable PWA is a stretch goal                      |
| Stack           | TypeScript (strict), Vite, HTML5 Canvas for the board, plain DOM for all chrome, Vitest for tests |
| Estimated build | 1 Claude Code session for MVP (phases 0–5 in section 17)                                          |

Reference: "Color Link" mode in the mobile app _Numpuz_. This spec re-implements the core mechanic, keeps the tier/level structure, removes all monetisation and decoration, restyles the UI in the spirit of the New York Times Games apps (white, typographic, minimal), and extends the difficulty ladder with two new tiers, **Expert** and **Master**, placed after **Extreme**.

---

## 1. Elevator pitch

An N×N grid holds pairs of coloured dots. You drag a line from one dot to its twin, cell by cell, and no two lines may cross or share a cell. The puzzle is solved when every pair is joined **and** every cell on the board is covered. The "aha" is realising that the empty cells are the real constraint: you are not routing lines, you are tiling the board with them. Six tiers from a 5×5 warm-up to a 14×14 Master board, 100 levels each, generated deterministically so every player gets the same level 42.

## 2. Assumptions

Tob confirms or overrides each of these. Anything marked _(config)_ can be changed by editing a single constant in `src/generator/difficulty.ts` or `src/app/config.ts` without touching logic.

1. **Tier ladder** is Easy 5×5, Normal 6×6, Hard 8×8, Extreme 10×10, Expert 12×12, Master 14×14 — in that order of increasing difficulty. Numpuz's "Hell" tier is dropped. The ladder is a config array; adding "Hell" back as a 7th tier is one entry. _(config)_
2. Numpuz does not reveal Extreme's board size (it is locked in the screenshots); 10×10 is chosen so that each tier grows by ≥2 cells per side. _(config)_
3. **100 levels per tier**, matching the original. _(config)_
4. **Win condition requires 100% cell coverage**, not merely all pairs connected. The original displays a "coverage rate" and the reference genre (Flow Free) requires a full board. This also gives a clean solvability guarantee (section 7.1).
5. **Drawing over another colour's line cuts that line back** to the cell before the collision (Flow Free behaviour) rather than blocking the pointer. This is better on touch and still enforces "lines never intersect" in any resting state.
6. **Levels are procedurally generated at runtime from a deterministic seed** derived from `(generatorVersion, tierId, levelIndex)`. No level JSON is shipped. Same level for every player, every device, forever (until `GENERATOR_VERSION` is bumped).
7. **Tier unlocks** mirror the original: Easy, Normal and Hard are always open; Extreme unlocks after 20 Hard levels solved; Expert after 20 Extreme; Master after 20 Expert. _(config)_
8. **Within a tier all 100 levels are playable in any order** (no sequential lock). The level grid highlights the first unsolved level as the suggested next one. This departs from the original's sequential unlock in favour of NYT-style freedom.
9. **No coins, ads, hint economy, stars, or share-to-earn**. Hints are unlimited; a level solved with a hint is recorded as such and displayed with a hollow marker instead of a solid one.
10. **No lose condition.** The timer counts up and is informational only.
11. **Board rendering uses Canvas**; every other screen is plain DOM + CSS. No game engine, no UI framework.
12. **Sound defaults to on**, synthesised with the Web Audio API (no audio files). Haptics default to on where `navigator.vibrate` exists.
13. **No backend, no analytics, no network requests after initial load.**
14. Working title is "Color Link" (US spelling, matching the reference). The display name lives in one constant (`APP_NAME`) for later renaming. _(config)_
15. Languages: English UI only for MVP; all user-facing strings live in one `strings.ts` file to make French a later drop-in.

## 3. Player experience

- **Session length**: 20 s (Easy) to 5–10 min (Master) per level. A play session is typically 3–10 levels. Nothing interrupts play; there are no popups except the solved card.
- **Difficulty curve**: two axes. _Across tiers_, board size grows (5→14). _Within a tier_, level 1 uses the most pairs (short, obvious paths) and level 100 the fewest (long, winding paths); the generator also requires progressively more bends per path. Concretely, "hard" means fewer, longer lines that must snake around each other to cover the board.
- **Emotional target**: calm and clever. Quiet feedback, no shaking, no confetti; a short, satisfying solve animation and a clean results card.
- **Reference games and what is borrowed**:
  - _Numpuz – Color Link_: the mechanic, the tier/level structure, the "lines x/y" and coverage HUD, tier unlock thresholds.
  - _Flow Free_: exact drag semantics (start from an endpoint, cut other lines, backtrack), cell tint under paths, full-coverage rule.
  - _NYT Games (Wordle, Connections, Strands)_: visual language — white background, black text, serif headline, thin rules, pill buttons, single accent, results card with time, dark mode.

## 4. Core loop

1. Launch → Home shows the six tiers with progress (e.g. "Hard · 8×8 · 23/100"). Locked tiers show what unlocks them.
2. Tap a tier → level grid (100 tiles). The first unsolved level is highlighted.
3. Tap a level → board appears; timer starts on first pointer-down.
4. Drag from a dot to its twin; repeat for every colour, using undo/restart/hint as needed.
5. When all pairs are connected and every cell is filled, the board locks, the solve animation plays, and the results card shows time, best time, and a "Perfect" badge if no hint was used and each colour was drawn exactly once.
6. Tap "Next level" → next level in the same tier (or the level grid if 100 was just solved).
7. Progress and the current in-progress board are saved to localStorage on every state change, so closing the app mid-level and reopening resumes exactly where the player left off.

## 5. Rules (formal)

### 5.1 Board / world

| Element       | Definition                                                                                                                                                                                                                      |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Board         | Square grid of `size × size` cells, `size ∈ {5, 6, 8, 10, 12, 14}`. Cell coordinates `[row, col]`, 0-based, row 0 at top.                                                                                                       |
| Cell          | Exactly one of: empty; occupied by colour `c`. Occupancy is derived from paths.                                                                                                                                                 |
| Endpoint      | A cell permanently marked with colour `c`. Each colour has exactly two endpoints, `a` and `b`. Endpoints are always occupied by their own colour (an endpoint with no path still counts as occupied by `c` for coverage).       |
| Colour        | Integer `0 ≤ c < K`, `K` = number of pairs in the level, `K ≤ 16` (palette size).                                                                                                                                               |
| Path          | Ordered list of cells for colour `c`. Either empty, or begins at one of `c`'s endpoints and consists of orthogonally adjacent, pairwise-distinct cells. A path is **complete** when its last cell is the other endpoint of `c`. |
| Adjacency     | Orthogonal only (up/down/left/right). No diagonals, no wrapping.                                                                                                                                                                |
| Initial state | All paths empty. Occupancy = endpoint cells only. Timer = 0, moves = 0, hintUsed = false.                                                                                                                                       |

### 5.2 Legal moves

All interaction is a **stroke**: pointer-down (`begin`), zero or more pointer-moves (`extend`), pointer-up (`end`). The engine exposes exactly these operations plus `undo`, `restart`, `hint`. `head(c)` = last cell of `paths[c]`.

| Operation                                                             | Precondition                           | Effect                                                                                                                                                                                                                                                                                                                                |
| --------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `begin(cell)` — cell is an endpoint of colour `c`                     | —                                      | `paths[c] = [cell]` (any previous path of `c`, complete or not, is discarded). Stroke becomes active for `c`.                                                                                                                                                                                                                         |
| `begin(cell)` — cell is occupied by colour `c` but is not an endpoint | —                                      | `paths[c]` truncated to end at `cell` (inclusive). Stroke active for `c`.                                                                                                                                                                                                                                                             |
| `begin(cell)` — cell empty                                            | —                                      | No effect; no active stroke.                                                                                                                                                                                                                                                                                                          |
| `extend(cell)` — no active stroke                                     | —                                      | No effect.                                                                                                                                                                                                                                                                                                                            |
| `extend(cell)` — `cell == head(c)`                                    | active stroke                          | No effect.                                                                                                                                                                                                                                                                                                                            |
| `extend(cell)` — `paths[c]` is complete                               | active stroke                          | No effect (a complete path cannot be extended; the player must `begin` again to redraw).                                                                                                                                                                                                                                              |
| `extend(cell)` — cell not orthogonally adjacent to `head(c)`          | active stroke                          | If `cell` shares a row or column with `head(c)`, apply `extend` to each intermediate cell in order, stopping at the first one that has no effect. Otherwise no effect. (Handles fast pointer movement that skips cells.)                                                                                                              |
| `extend(cell)` — cell already in `paths[c]`                           | active stroke                          | Backtrack: `paths[c]` truncated to end at `cell` (inclusive).                                                                                                                                                                                                                                                                         |
| `extend(cell)` — cell is an endpoint of colour `d ≠ c`                | active stroke                          | No effect (blocked).                                                                                                                                                                                                                                                                                                                  |
| `extend(cell)` — cell is the other endpoint of `c`                    | active stroke                          | Append `cell`. Path is now complete. Emit `pathCompleted(c)`.                                                                                                                                                                                                                                                                         |
| `extend(cell)` — cell occupied by colour `d ≠ c` (non-endpoint)       | active stroke                          | Cut: `paths[d]` truncated to end at the cell _before_ `cell` (so `cell` and everything after it are removed from `d`). Then append `cell` to `paths[c]`.                                                                                                                                                                              |
| `extend(cell)` — cell empty                                           | active stroke                          | Append `cell`.                                                                                                                                                                                                                                                                                                                        |
| `end()`                                                               | —                                      | Stroke inactive. If the board differs from the snapshot taken at `begin`, push that snapshot onto the undo stack and `moves += 1`.                                                                                                                                                                                                    |
| `undo()`                                                              | undo stack non-empty, no active stroke | Restore the top snapshot (all paths). Timer unaffected.                                                                                                                                                                                                                                                                               |
| `restart()`                                                           | no active stroke                       | All paths empty, undo stack cleared, `moves = 0`. Timer keeps running (it is per-attempt, not per-board). `hintUsed` unchanged.                                                                                                                                                                                                       |
| `hint()`                                                              | no active stroke, level not won        | Let `c` = lowest colour index whose current path, as a set of cells, differs from `solution[c]`. Set `paths[c] = solution[c]`, cutting any other path that occupies a cell of `solution[c]` (same cut rule as `extend`). Push undo snapshot, `moves += 1`, `hintUsed = true`. If no such `c` exists the level is already won (no-op). |

Invariants that must hold after every operation (asserted in tests):

- Every non-empty `paths[c]` starts at an endpoint of `c` and is a chain of distinct orthogonally adjacent cells.
- No cell belongs to two paths.
- No path contains an endpoint of another colour.

### 5.3 Win condition

`won == (every colour c has a complete path) AND (occupiedCells == size × size)`.

Evaluated after every state mutation (including mid-stroke, since the final cell can be filled while dragging). When it becomes true: the active stroke is force-ended, the timer stops, and the state machine transitions `Playing → Won`. The elapsed time recorded is the time at which the condition became true, not at pointer-up.

### 5.4 Lose / fail condition

N/A — there is no lose state. No move limits, no countdown. The timer is informational.

### 5.5 Edge cases

- **Coverage display**: `coverage = occupiedCells / (size × size)`, where endpoints always count as occupied. Displayed as an integer percentage, rounded down.
- **Lines counter**: number of complete paths. A complete path that is later cut is no longer complete.
- **Pointer leaves the board**: treated as moving to no cell; the stroke stays active and resumes when the pointer re-enters, subject to the adjacency/interpolation rules.
- **Pointer cancel** (browser gesture, incoming call): treated as `end()`.
- **Multi-touch**: only the first active `pointerId` is tracked; other pointers are ignored until it ends.
- **Undo during stroke**: not allowed; the toolbar is inert while a stroke is active.
- **Undo depth**: unlimited within a level; the stack is cleared on restart and on leaving the level.
- **Resize / rotation**: board re-lays out; state unchanged.
- **Tab hidden / app backgrounded**: `Playing → Paused` automatically; timer stops.
- **Hint on a level with all pairs connected but coverage < 100%**: by definition at least one path differs from its solution, so `hint()` always makes progress.
- **Last level of a tier solved**: "Next level" returns to the level grid.
- **Tier unlock**: evaluated on every level completion; newly unlocked tiers appear unlocked the next time Home is shown (no interstitial).
- **Reset progress**: clears all three storage keys after a confirm dialog; the app returns to Home.

## 6. Game state machine

Two orthogonal layers: a **screen** (exactly one) and an optional **modal** overlaid on it.

```
Screens:
  Boot ──(storage loaded)──▶ Home
  Home ──(tap tier, unlocked)──▶ LevelSelect(tier)
  LevelSelect ──(tap level)──▶ Playing(level)
  LevelSelect ──(back)──▶ Home
  Playing ──(won == true)──▶ Won(level, result)
  Playing ──(back)──▶ LevelSelect          (in-progress board is saved)
  Won ──(next)──▶ Playing(level+1)  |  ──(next on level 100)──▶ LevelSelect
  Won ──(replay)──▶ Playing(same level, fresh)
  Won ──(levels)──▶ LevelSelect
  Boot ──(inProgress level found)──▶ Playing(restored)   (resume; overrides Home)

Modals (any screen unless noted):
  Settings, HowToPlay, ConfirmReset
  Paused — only over Playing; triggers: pause button, Escape, visibilitychange→hidden
  Paused ──(resume / visible again + tap)──▶ Playing
```

| Trigger            | From              | To               | Side effects                                                                                    |
| ------------------ | ----------------- | ---------------- | ----------------------------------------------------------------------------------------------- |
| Level loaded       | LevelSelect / Won | Playing          | generate or restore level; timer at 0 or restored; timer does **not** start until first `begin` |
| First `begin`      | Playing           | Playing          | timer starts                                                                                    |
| `won` becomes true | Playing           | Won              | stop timer; persist result; play solve animation, then show card                                |
| Pause              | Playing           | Playing + Paused | stop timer; board is hidden behind the modal (prevents timer cheating, matches NYT)             |
| Resume             | Paused            | Playing          | timer resumes                                                                                   |

## 7. Levels & content

### 7.1 Source

**Procedural, deterministic, generated on demand at level load.** No level data is shipped.

**Seed**: `seed = fnv1a32("v" + GENERATOR_VERSION + "|" + tierId + "|" + levelIndex)`. `GENERATOR_VERSION` is an integer constant; bumping it changes every level and must be accompanied by a changelog entry. PRNG is `mulberry32(seed)`; every random decision in the generator draws from this PRNG and nowhere else (`Math.random` is forbidden in `src/generator/**`, enforced by a unit test that greps the source).

**Solvability guarantee**: the generator first builds a full partition of the board into paths (a complete solution), then derives the puzzle by keeping only each path's two end cells as endpoints. A solution therefore exists by construction and covers 100% of the board. The solution is retained in the level object for the hint feature. Uniqueness of solution is **not** guaranteed in MVP; the win check accepts any valid full-coverage solution, so non-uniqueness is never a correctness bug.

**Difficulty parameters** (`src/generator/difficulty.ts`) — `t = (levelIndex − 1) / 99` is the position within the tier:

| Tier    | id        | Board | Pairs at L1 → L100 (linear in t, rounded) | Min avg bends/path at L1 → L100 | Unlock            |
| ------- | --------- | ----- | ----------------------------------------- | ------------------------------- | ----------------- |
| Easy    | `easy`    | 5×5   | 6 → 4                                     | 0.5 → 1.5                       | always            |
| Normal  | `normal`  | 6×6   | 7 → 5                                     | 0.8 → 2.0                       | always            |
| Hard    | `hard`    | 8×8   | 9 → 6                                     | 1.0 → 2.5                       | always            |
| Extreme | `extreme` | 10×10 | 12 → 8                                    | 1.2 → 3.0                       | 20 Hard solved    |
| Expert  | `expert`  | 12×12 | 14 → 10                                   | 1.5 → 3.5                       | 20 Extreme solved |
| Master  | `master`  | 14×14 | 16 → 12                                   | 1.8 → 4.0                       | 20 Expert solved  |

Global generator constants: `MIN_PATH_LENGTH = 3` (a length-2 path means adjacent endpoints, which is trivial), `MAX_PATH_LENGTH = floor(0.5 × size²)`, `PAIR_TOLERANCE = 1`, `MAX_ATTEMPTS_PER_RELAX = 400`, `STOP_PROBABILITY = 0.12`, `WARNSDORFF_PROBABILITY = 0.6`. "Bends" of a path = number of direction changes along it.

**Generator outline** (pseudocode; the implementation lives in `src/generator/generate.ts`):

```
generate(tier, levelIndex):
  rng   = mulberry32(seed(tier.id, levelIndex))
  t     = (levelIndex - 1) / (tier.levelCount - 1)
  targetPairs = round(lerp(tier.pairs.atFirst, tier.pairs.atLast, t))
  minBends    = lerp(tier.minAvgBends.atFirst, tier.minAvgBends.atLast, t)

  for relax in [0, 1, 2]:                       # relax constraints only if needed
    tolerance  = PAIR_TOLERANCE + relax
    bendsFloor = minBends * [1, 0.5, 0][relax]
    repeat MAX_ATTEMPTS_PER_RELAX times:
      paths = fillWithRandomWalks(rng, tier.size)
      paths = mergeShortPaths(paths)            # returns null on failure
      if paths == null: continue
      if any(len(p) > MAX_PATH_LENGTH for p in paths): continue
      if abs(len(paths) - targetPairs) > tolerance: continue
      if avgBends(paths) < bendsFloor: continue
      return buildLevel(tier, levelIndex, paths, rng)
  throw GeneratorError   # must be unreachable; a test generates all 600 levels

fillWithRandomWalks(rng, size):
  grid = all empty; paths = []
  while grid has empty cells:
    head = uniformly random empty cell
    path = [head]; mark head
    loop:
      cands = empty orthogonal neighbours of head
      if cands is empty: break
      if len(path) >= MIN_PATH_LENGTH and rng() < STOP_PROBABILITY: break
      if rng() < WARNSDORFF_PROBABILITY:
        next = candidate with the fewest empty neighbours (ties by rng)   # avoids dead pockets
      else:
        next = uniformly random candidate
      push next; mark; head = next
    paths.push(path)
  return paths

mergeShortPaths(paths):
  while exists S in paths with len(S) < MIN_PATH_LENGTH:
    find Q ≠ S such that an end cell of Q is orthogonally adjacent to an end cell of S
    if none: return null
    replace S and Q by their concatenation (reversing either as needed so the adjacent ends meet)
  return paths

buildLevel(tier, levelIndex, paths, rng):
  shuffle(paths, rng)                           # colour assignment is random
  for each path i: if rng() < 0.5 reverse it   # which end is "a" is random
  pairs    = paths.map((p, i) => { color: i, a: p[0], b: p[last] })
  solution = paths
  return { id: `${tier.id}-${pad3(levelIndex)}`, tier: tier.id, index: levelIndex,
           size: tier.size, pairs, solution, seed, generatorVersion: GENERATOR_VERSION }
```

Design note: the Warnsdorff bias (prefer the neighbour with the fewest exits) is what keeps random walks from stranding single cells, which is the main failure mode of naive fill generators. If a tier's acceptance rate is poor (measured by the test in 13), tune `STOP_PROBABILITY` and `WARNSDORFF_PROBABILITY` per tier before changing the algorithm.

### 7.2 Data format

```ts
// src/engine/types.ts
export type Cell = readonly [row: number, col: number];
export type TierId =
  'easy' | 'normal' | 'hard' | 'extreme' | 'expert' | 'master';

export interface LevelPair {
  color: number;
  a: Cell;
  b: Cell;
}

export interface Level {
  id: string; // "hard-042"
  tier: TierId;
  index: number; // 1-based, 1..100
  size: number; // 5 | 6 | 8 | 10 | 12 | 14
  pairs: LevelPair[]; // length K, color === array index
  solution: Cell[][]; // solution[c] is the full path for color c, endpoints included
  seed: number; // uint32
  generatorVersion: number;
}

// src/generator/difficulty.ts
export interface TierConfig {
  id: TierId;
  name: string; // display name
  size: number;
  levelCount: number; // 100
  pairs: { atFirst: number; atLast: number };
  minAvgBends: { atFirst: number; atLast: number };
  unlock: { tier: TierId; solved: number } | null;
}
export const TIERS: readonly TierConfig[] = [/* table in 7.1 */];
```

Example level (Easy, hand-checked, shown for shape only — real levels come from the generator):

```json
{
  "id": "easy-001",
  "tier": "easy",
  "index": 1,
  "size": 5,
  "pairs": [
    { "color": 0, "a": [0, 0], "b": [0, 4] },
    { "color": 1, "a": [1, 0], "b": [1, 3] },
    { "color": 2, "a": [2, 0], "b": [1, 4] },
    { "color": 3, "a": [3, 0], "b": [3, 4] },
    { "color": 4, "a": [4, 0], "b": [4, 4] }
  ],
  "solution": [
    [
      [0, 0],
      [0, 1],
      [0, 2],
      [0, 3],
      [0, 4]
    ],
    [
      [1, 0],
      [1, 1],
      [1, 2],
      [1, 3]
    ],
    [
      [2, 0],
      [2, 1],
      [2, 2],
      [2, 3],
      [2, 4],
      [1, 4]
    ],
    [
      [3, 0],
      [3, 1],
      [3, 2],
      [3, 3],
      [3, 4]
    ],
    [
      [4, 0],
      [4, 1],
      [4, 2],
      [4, 3],
      [4, 4]
    ]
  ],
  "seed": 0,
  "generatorVersion": 1
}
```

(This mirrors the Numpuz Easy level 1 in the reference screenshot, which has exactly this layout.)

### 7.3 Initial content

6 tiers × 100 levels = 600 levels, all available at first launch (subject to tier unlock). Ordered by `index` within a tier; difficulty ramps with `t` as defined in 7.1.

## 8. Input & controls

| Input                                | Action                                                                                                                                        |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Touch / mouse / pen: press on a cell | `begin(cell)`                                                                                                                                 |
| Drag                                 | `extend(cell)` for each new cell under the pointer (cell resolved from pointer position with a dead zone of 0 — the full cell area is active) |
| Release / cancel                     | `end()`                                                                                                                                       |
| Keyboard: arrow keys                 | Move a visible cursor cell (wraps at edges: no; clamps)                                                                                       |
| Enter / Space                        | If no stroke active: `begin(cursor)`. If active: `end()`.                                                                                     |
| Arrow keys while stroke active       | Move cursor **and** `extend(cursor)`                                                                                                          |
| Escape                               | If stroke active: `end()`. Else toggle Paused.                                                                                                |
| U or Ctrl/Cmd+Z                      | `undo()`                                                                                                                                      |
| R                                    | `restart()` (with confirm if any path exists)                                                                                                 |
| H                                    | `hint()`                                                                                                                                      |
| Tab / Shift+Tab                      | Standard focus traversal through toolbar and dialogs                                                                                          |

Pointer events use the Pointer Events API with `touch-action: none` on the canvas. Keyboard cursor is only rendered after the first keyboard interaction (avoids clutter for touch users). All buttons have ≥ 44×44 px hit areas and `aria-label`s. The board canvas has `role="application"` and an `aria-label` describing the level; the HUD counters are `aria-live="polite"`.

## 9. UI / UX

Visual language: **Tob's artwork behind every screen**, near-black or white text depending on what it sits on, one serif headline face, one sans UI face, hairline rules, black pill buttons, generous whitespace. The page is no longer white and the tier capsules are moulded rather than flat — see "The artwork behind every screen" and "Home wears the Hub app's moulded capsules" below. Dark mode inverts the neutrals of the panels; the artwork is the same in both.

### Screen inventory

**Home**

- Header: `APP_NAME` in the serif face (32 px), small tagline "Connect the dots. Fill the board." below.
- Vertical list of six tier rows, each a capsule in its own tier colour (see the note below). Each row: tier name (sans, 19 px, bold), board size ("8×8"), progress "23/100" right-aligned, and a progress bar along the bottom of the capsule. Locked rows are greyed with a lock glyph and one line: "Solve 20 Hard levels to unlock" (from config, never hard-coded).
- Footer row: "How to play" and a gear icon (Settings), both text buttons.

**LevelSelect(tier)**

- Header: back chevron, "Hard · 8×8" centred, "23/100" right.
- Grid of 100 square tiles, 5 columns, scrollable. Tile states (revised for the artwork — see the note below):
  - unsolved: a pane of glass over the artwork, white number;
  - solved: filled with the tier's own capsule colour, that capsule's ink;
  - solved with hint: glass with a 2 px ring in the tier colour, small dot in the corner;
  - suggested next (first unsolved): glass with a 2 px white ring;
  - locked: a darker well, faint white number.
- Tapping a tile opens Playing.

**Playing**

- Top bar: back chevron (left), "Hard · Level 42" (centre, sans 16 px), pause icon (right).
- Board: centred canvas. `cellPx = floor(min(viewportWidth − 32, viewportHeight − 220) / size)`, clamped to `[20, 72]`. The board is never scrollable; it always fits.
- Stats row directly under the board, secondary text 14 px, three items separated by "·": `Lines 3/8 · Filled 62% · 1:24`.
- Toolbar under the stats: three icon+label buttons — Undo, Hint, Restart. Disabled state at 35% opacity (Undo when stack empty; all three during an active stroke).

**Paused** (modal over Playing; board hidden)

- "Paused" (serif 28 px), elapsed time, buttons: Resume (primary pill), Restart, Level list, Settings, How to play.

**Won** (modal card over the solved board, which stays visible behind at 100% opacity)

- Heading: "Solved" (serif 28 px). If Perfect: "Perfect" replaces it, with a one-line explanation below ("No hints, every line drawn once").
- Rows: "Time 1:24", "Best 1:02" (or "New best" badge when improved), "Hint used" if applicable.
- Buttons: Next level (primary pill, full width), Replay, Level list (text buttons).

**Settings** (modal, from Home or Paused)

- Theme: System / Light / Dark (segmented control)
- Sound: on/off
- Haptics: on/off (hidden if `navigator.vibrate` is unavailable)
- Colour-blind labels: on/off
- Reduced motion: System / On / Off
- Reset progress (destructive text button → ConfirmReset modal)
- Version string and `GENERATOR_VERSION` in small secondary text at the bottom.

**HowToPlay** (modal)

- Three short paragraphs with a tiny static illustration drawn by the same board renderer: (1) drag between matching dots, (2) lines can't cross — drawing over a line cuts it, (3) fill every cell to solve.

### HUD elements during play

Lines counter, coverage percentage, timer, undo/hint/restart availability. Nothing else.

### Feedback

| Event                           | Visual                                                                                  | Sound (synth)                                  | Haptic                  |
| ------------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------- | ----------------------- |
| Stroke begins on endpoint       | Endpoint scales to 1.15× for 120 ms                                                     | none                                           | none                    |
| Cell appended                   | Path segment grows with 60 ms ease-out; cell tint fades in                              | none                                           | none                    |
| Path completed                  | Both endpoints pulse once (1.0→1.2→1.0, 200 ms)                                         | two-note rising blip (C5→E5, 80 ms each, sine) | `vibrate(10)`           |
| Path cut by another colour      | Removed segment fades out over 120 ms                                                   | soft low tick (120 Hz, 40 ms, triangle)        | none                    |
| Blocked move (foreign endpoint) | Nothing (silent rejection)                                                              | none                                           | none                    |
| Win                             | Paths brighten to 100% alpha in colour order, 40 ms stagger; then card slides up 200 ms | 4-note arpeggio (C5 E5 G5 C6, 90 ms each)      | `vibrate([10, 40, 20])` |
| Undo / restart                  | Paths removed instantly (no animation)                                                  | UI tick (1 kHz, 20 ms)                         | none                    |
| Hint                            | Solution path draws in cell by cell, 30 ms per cell                                     | same as path completed                         | same                    |

With reduced motion on: all durations become 0 and the win stagger is removed; the card appears instantly.

### Undo / hint / restart / pause behaviour

As defined in 5.2 and 6. Restart shows a confirm only if at least one path cell exists beyond endpoints. Pause hides the board.

### Settings

Listed above; persisted immediately on change (11.2).

## 10. Art & audio direction

**Neutrals (light)**: background `#FFFFFF`, text `#121212`, secondary text `#6E6E6E`, hairline `#DCDCDC`, grid line `#E8E8E8`, cell background `#F7F7F7`, disabled `#B8B8B8`, accent (ring/focus) `#121212`.
**Neutrals (dark)**: background `#121212`, text `#F5F5F5`, secondary `#A0A0A0`, hairline `#2E2E2E`, grid line `#262626`, cell background `#1A1A1A`, disabled `#555555`, accent `#F5F5F5`.

**Path palette** (16 colours; index = colour id; ordered so that any prefix is as mutually distinct as possible; identical in light and dark themes):

| #   | Hex              | #   | Hex              | #   | Hex              | #   | Hex              |
| --- | ---------------- | --- | ---------------- | --- | ---------------- | --- | ---------------- |
| 0   | `#D62828` red    | 4   | `#8338EC` purple | 8   | `#2A9D8F` teal   | 12  | `#A0522D` sienna |
| 1   | `#118AB2` blue   | 5   | `#FF7A00` orange | 9   | `#FF3D8A` pink   | 13  | `#48CAE4` sky    |
| 2   | `#F2B705` yellow | 6   | `#06D6A0` mint   | 10  | `#6A4C93` violet | 14  | `#8C8C8C` gray   |
| 3   | `#3FA34D` green  | 7   | `#073B4C` navy   | 11  | `#B5E048` lime   | 15  | `#F4A3B5` blush  |

Colour-blind labels mode: each endpoint shows its colour index + 1 as a numeral (white or black, whichever has ≥ 4.5:1 contrast against the colour) in a 12 px bold sans; the numeral is drawn only on endpoints, not along paths. Palette is limited to 16 because Master's maximum pair count is 16.

**Board rendering** (Canvas, devicePixelRatio-aware):

- Cell: filled with cell background, 1 px grid line between cells, board has a 2 px outer border in hairline colour and 8 px corner radius.
- Endpoint: filled circle, diameter `0.62 × cellPx`, centred.
- Path: polyline through cell centres, stroke width `0.36 × cellPx`, round caps and joins, alpha 0.92 (1.0 for the active stroke).
- Occupied cell tint: the path colour at 14% alpha filling the cell (this is the coverage cue).
- Keyboard cursor: 2 px accent-colour inset rectangle.

**Typography**: headings `"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif`; UI `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`. No web fonts in MVP (zero network dependency, instant load). Minimum body size 14 px; tier names 18 px; HUD 14 px.

**Placeholder strategy**: there are no external assets. Icons (back chevron, pause, undo, hint bulb, restart, gear, lock) are inline SVG paths defined in `src/app/icons.ts` — 24×24, 1.75 px stroke, `currentColor`. If time is short, use the Unicode glyphs `‹ ⏸ ↶ 💡 ↻ ⚙ 🔒` as placeholders and note it in the phase report. Favicon: a generated 64×64 SVG of two dots joined by a rounded line.

**Sound list** (all synthesised in `src/audio/sfx.ts` with Web Audio, master gain 0.25, AudioContext created lazily on first user gesture):
`sfx.connect`, `sfx.cut`, `sfx.win`, `sfx.tick`. Parameters as in the 9 feedback table.

## 11. Technical design

### 11.1 Architecture

| Module           | Responsibility                                                                                                                                                                                                                                                                                                    | Dependencies            |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| `src/engine/`    | Pure game rules: types, `Engine` state and operations (5.2), win/coverage queries, undo stack. Zero DOM, zero randomness, fully unit-tested.                                                                                                                                                                      | none                    |
| `src/generator/` | `prng.ts` (fnv1a32, mulberry32), `difficulty.ts` (TIERS), `generate.ts` (7.1), `validate.ts` (asserts a level's solution replays to Won through the engine). Pure.                                                                                                                                                | engine (validate only)  |
| `src/render/`    | `BoardRenderer` (Canvas draw of a read-only engine state + animation state), `layout.ts` (cell size, pixel↔cell mapping), `theme.ts` (palette, CSS variable sync).                                                                                                                                                | engine (types only)     |
| `src/input/`     | `pointer.ts` maps Pointer Events on the canvas to `begin/extend/end`; `keyboard.ts` maps keys to engine ops and the cursor.                                                                                                                                                                                       | engine, render (layout) |
| `src/app/`       | `state.ts` (screen + modal state machine of section 6), `App.ts` (bootstrap, routing, wiring), `screens/` (Home, LevelSelect, Play), `modals/` (Paused, Won, Settings, HowToPlay, ConfirmReset), `progress.ts` (unlock rules, best times), `strings.ts`, `config.ts` (`APP_NAME`, version), `icons.ts`. DOM only. | all of the above        |
| `src/storage/`   | `persistence.ts`: typed load/save for the three keys, schema version, safe parsing with fallback to defaults.                                                                                                                                                                                                     | none                    |
| `src/audio/`     | `sfx.ts`, `haptics.ts`.                                                                                                                                                                                                                                                                                           | none                    |
| `src/styles/`    | `base.css` (reset, tokens as CSS variables, light/dark), `screens.css`.                                                                                                                                                                                                                                           | —                       |

Rules: `engine` and `generator` must have no imports from `render`, `input`, `app`, or the DOM. The renderer is stateless with respect to game rules — it reads the engine state each frame. Rendering is on demand (redraw on state change) plus a `requestAnimationFrame` loop that runs only while an animation is active.

### 11.2 Data & persistence

localStorage, JSON, all under the `colorlink:v1:` prefix. `v1` is the schema version; a mismatch on load resets that key to defaults (never crashes).

| Key                       | Shape                                                                                                                               | Written when                                                                                          |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `colorlink:v1:progress`   | `{ tiers: Record<TierId, { solved: Record<number, { bestMs: number; hint: boolean; perfect: boolean; at: string }> }> }`            | on every level completion                                                                             |
| `colorlink:v1:settings`   | `{ theme: 'system'\|'light'\|'dark'; sound: boolean; haptics: boolean; colorBlind: boolean; reducedMotion: 'system'\|'on'\|'off' }` | on every settings change                                                                              |
| `colorlink:v1:inProgress` | `{ levelId: string; paths: Cell[][]; elapsedMs: number; moves: number; hintUsed: boolean } \| null`                                 | on every `end()`, `undo`, `restart`, `hint`, pause; cleared on win or when leaving the level via back |

Unlock rule (`progress.ts`): `isUnlocked(tier) = tier.unlock == null || count(solved in tier.unlock.tier) ≥ tier.unlock.solved`.

### 11.3 Performance constraints

- Level generation: ≤ 150 ms for Master on a mid-range phone; test asserts all 600 levels generate in < 20 s total on the CI/desktop Node runtime.
- Rendering: 60 fps during drag on a 14×14 board on a mid-range phone. Full-board redraw ≤ 4 ms at DPR 3. Only redraw on state change or during animation.
- Initial load: no network after the HTML/JS/CSS; total JS bundle < 80 kB gzipped.
- Memory: undo snapshots are `paths` arrays only (≤ 200 cells × 16 colours); no images.

### 11.4 Dependencies

| Package          | Version       | Purpose                  | Justification                         |
| ---------------- | ------------- | ------------------------ | ------------------------------------- |
| `vite`           | latest stable | dev server, bundler      | default stack                         |
| `typescript`     | ^5            | language, `strict: true` | default stack                         |
| `vitest`         | latest stable | unit tests               | default test runner for Vite projects |
| `prettier` (dev) | latest stable | formatting               | zero-config; one `.prettierrc`        |

Nothing else. No UI framework, no state library, no canvas library, no audio library, no icon package. `vite-plugin-pwa` is listed under 14.2 and must not be added without asking.

## 12. Acceptance criteria

Each item is verified either by `npm test` (T) or by running the app (R).

1. (T) `npm run build` completes with zero TypeScript errors under `strict: true`; `npm test` passes with zero skipped tests.
2. (T) `generate(tier, i)` called twice with the same inputs returns deep-equal levels; called with different `i` returns different levels.
3. (T) For every one of the 600 levels: the solution covers exactly `size²` cells with no duplicates; every path has length ≥ 3 and ≤ `MAX_PATH_LENGTH`; pair count is within `PAIR_TOLERANCE + 2` of the level's target; `K ≤ 16`.
4. (T) For every one of the 600 levels, replaying `solution` through the engine (`begin(a)`, `extend` each cell) results in `won == true`.
5. (T) All 600 levels generate in under 20 s total; no level reaches `relax = 2` more than 5% of the time per tier (logged, not failing, in MVP).
6. (T) Engine invariants (5.2) hold after a randomised sequence of 10,000 operations on each board size (property test with a seeded PRNG).
7. (T) Cut, backtrack, blocked-endpoint, straight-line interpolation, and completion rules each have a dedicated unit test that matches the tables in 5.2.
8. (R) Home lists six tiers in ladder order with correct board sizes; Extreme, Expert and Master show the lock and the exact unlock sentence; solving 20 Hard levels unlocks Extreme without a reload.
9. (R) Every tier's level grid shows 100 tiles; tile states (unsolved / solved / solved-with-hint / suggested next) render as in section 9.
10. (R) On a 360×640 viewport, every board size including 14×14 fits without scrolling and all toolbar buttons remain reachable.
11. (R) Win triggers only when all pairs are connected **and** coverage is 100%; connecting all pairs with an empty cell remaining does not trigger it.
12. (R) Undo reverts exactly one stroke; Restart clears the board; Hint draws one correct path and marks the result as hint-used on the Won card and level tile.
13. (R) Timer starts on first pointer-down, stops on win, pauses in Paused and when the tab is hidden, and resumes correctly.
14. (R) Closing the tab mid-level and reopening the app restores the same level, paths, and elapsed time.
15. (R) A level can be selected, played and solved using the keyboard only.
16. (R) Colour-blind labels, dark theme, and reduced motion each take effect immediately when toggled and persist across reloads.
17. (R) The DevTools Network panel shows zero requests after initial load during a full level.
18. (R) No console errors or warnings during the manual test script in section 13.
19. (R) Lighthouse (mobile) accessibility score ≥ 90.

## 13. Test plan

### Unit tests (Vitest)

`tests/engine/`

- `begin.test.ts`: begin on endpoint clears existing path; begin on mid-path truncates; begin on empty is a no-op.
- `extend.test.ts`: append empty; backtrack to earlier cell truncates; blocked by foreign endpoint; completes on twin endpoint and refuses further extension; cut removes tail of other colour and appends; non-adjacent same-row/column interpolates and stops at first rejection; non-adjacent diagonal is a no-op.
- `win.test.ts`: all connected + full → won; all connected + one empty → not won; coverage counts endpoints.
- `undo.test.ts`: end() with no change pushes nothing; undo restores; stack cleared on restart.
- `hint.test.ts`: chooses lowest differing colour; cuts conflicting paths; no-op when won.
- `invariants.test.ts`: property test — 10,000 seeded random ops per board size, invariants asserted after each.

`tests/generator/`

- `prng.test.ts`: mulberry32 known-answer vector (first 5 outputs for seed 1); fnv1a32 known-answer for `"v1|easy|1"`.
- `determinism.test.ts`: same inputs → deep-equal; `GENERATOR_VERSION` change → different level.
- `all-levels.test.ts`: generates all 600; asserts criteria 3, 4, 5; records per-tier relax-level histogram to console.
- `no-math-random.test.ts`: reads `src/generator/**/*.ts` and fails if `Math.random` appears.
- `difficulty.test.ts`: TIERS is in ladder order, sizes strictly increasing, pairs ≤ 16, unlock references point to the previous tier only.

`tests/storage/`

- `persistence.test.ts`: round-trip each key; corrupt JSON → defaults; wrong schema version → defaults.

`tests/app/`

- `progress.test.ts`: unlock logic; best-time only updates when lower; perfect flag requires `moves == K && !hintUsed`.

### Manual test script

1. Fresh profile (clear localStorage). Launch. Verify Home: six tiers, three locked with unlock text, 0/100 everywhere.
2. Open Easy. Verify 100 tiles, tile 1 has the suggested-next ring.
3. Open level 1. Timer shows 0:00 and does not run. Press on a red endpoint: timer starts. Drag to the twin: endpoints pulse, sound plays, Lines shows 1/K.
4. Draw a second colour across the first: verify the first is cut back and Lines decrements.
5. Drag a colour into a foreign endpoint: verify nothing happens.
6. Backtrack along the active path: verify it shortens.
7. Connect all pairs leaving one cell empty: verify not won and coverage < 100%. Fill it: verify Won card with time.
8. Tap Next level. Solve level 2 using Hint once; verify "Hint used" on the card and the hollow tile in the grid.
9. Start level 3, draw two paths, press back. Reopen the app: verify it resumes level 3 with both paths and the timer.
10. Press pause; verify the board is hidden and the timer stops. Switch tabs and return; verify it is paused.
11. Settings: toggle dark, colour-blind labels, reduced motion, sound off. Reload; verify all persisted.
12. Keyboard only: navigate to Normal level 1 with Tab/Enter; solve it with arrows/Enter; undo with U; restart with R.
13. Temporarily set Hard's unlock threshold to 1 via the config (or solve 20 Hard levels); verify Extreme unlocks on returning Home. Restore the config.
14. Open Master level 100 on a 360 px-wide viewport (DevTools device mode). Verify the board fits and cells are ≥ 20 px.
15. Reset progress; verify Home is back to fresh state.

### Known tricky scenarios to verify

- Fast diagonal flick across the board (no cells should be skipped illegally; diagonal moves are ignored, straight ones interpolate).
- Winning mid-drag: the last cell filled while the pointer is still down must trigger Won and ignore further movement.
- Cutting a path at its first cell after the endpoint (the endpoint stays, the path becomes length 1).
- Undo immediately after a hint.
- Rotating the device mid-stroke.
- DPR 3 rendering: no blurry lines, no half-pixel grid seams.

## 14. Scope

### 14.1 MVP (this build)

Everything in sections 5–13 and phases 0–5 of section 17: six tiers, 600 generated levels, full drag/keyboard input, undo/hint/restart/pause, Home/LevelSelect/Play/Won/Paused/Settings/HowToPlay, persistence and resume, dark mode, colour-blind labels, reduced motion, synthesised sound and haptics, full test suite.

### 14.2 Later / stretch

- Installable PWA with offline caching (`vite-plugin-pwa`, manifest, icons) — phase 6.
- Solution-uniqueness filter in the generator for Easy–Hard (solver is cheap at ≤ 8×8), with `GENERATOR_VERSION` bump.
- Build-time level pre-baking script (`scripts/bake-levels.ts`) producing `public/levels.json` as a fallback for low-end devices.
- Share card (emoji grid of the solution, NYT-style) and per-tier stats screen (average time, perfect count).
- Daily puzzle (seed from date) on the Home screen.
- French localisation via `strings.ts`.
- Optional "Hell" tier (16×16) if Tob wants it.

### 14.3 Explicitly out of scope

Accounts, cloud sync, leaderboards, ads, in-app purchases, coins, timers as a fail condition, sequential level locks within a tier, native app wrappers, hexagonal or non-square boards, bridges/walls/special cells.

## 15. Open questions

1. Confirm the ladder in assumption 1 (drop "Hell"; Extreme 10×10, Expert 12×12, Master 14×14).
2. Confirm full-coverage win rule (assumption 4) versus "all pairs connected" only.
3. Working title "Color Link" — keep, or rename before build? (One constant either way.)

## 16. Hand-off to Claude Code

### 16.1 Repository layout

```
color-link/
├── CLAUDE.md
├── docs/
│   └── pOZle_color-link_spec_v1.0.md      # this file — the source of truth
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts                          # includes the vitest `test` block
├── .prettierrc
├── public/
│   └── favicon.svg
├── src/
│   ├── main.ts
│   ├── app/
│   │   ├── App.ts
│   │   ├── state.ts
│   │   ├── config.ts
│   │   ├── strings.ts
│   │   ├── icons.ts
│   │   ├── progress.ts
│   │   ├── screens/  Home.ts  LevelSelect.ts  Play.ts
│   │   └── modals/   Paused.ts  Won.ts  Settings.ts  HowToPlay.ts  ConfirmReset.ts
│   ├── engine/
│   │   ├── types.ts
│   │   ├── engine.ts                       # Engine class: begin/extend/end/undo/restart/hint
│   │   └── queries.ts                      # isWon, coverage, completedCount
│   ├── generator/
│   │   ├── prng.ts
│   │   ├── difficulty.ts
│   │   ├── generate.ts
│   │   └── validate.ts
│   ├── render/
│   │   ├── BoardRenderer.ts
│   │   ├── layout.ts
│   │   └── theme.ts
│   ├── input/
│   │   ├── pointer.ts
│   │   └── keyboard.ts
│   ├── storage/
│   │   └── persistence.ts
│   ├── audio/
│   │   ├── sfx.ts
│   │   └── haptics.ts
│   └── styles/
│       ├── base.css
│       └── screens.css
└── tests/
    ├── engine/
    ├── generator/
    ├── storage/
    └── app/
```

### 16.2 Setup & run commands

```bash
# scaffold
npm create vite@latest color-link -- --template vanilla-ts
cd color-link
npm install
npm install -D vitest prettier

# add scripts to package.json:
#   "dev": "vite", "build": "tsc --noEmit && vite build", "preview": "vite preview",
#   "test": "vitest run", "test:watch": "vitest", "format": "prettier --write ."

npm run dev        # http://localhost:5173
npm test           # unit tests
npm run build      # type-check + production bundle in dist/
npm run preview    # serve dist/ locally
```

`tsconfig.json` must set `"strict": true`, `"noUncheckedIndexedAccess": true`, `"target": "ES2020"`, `"lib": ["ES2020", "DOM"]`. `vite.config.ts` includes `test: { environment: 'node', include: ['tests/**/*.test.ts'] }` (the engine and generator tests need no DOM; screen tests, if any, may opt into `jsdom` per file).

### 16.3 CLAUDE.md snippet

```markdown
# Color Link — conventions for Claude Code

- The spec is `docs/pOZle_color-link_spec_v1.0.md`. It is the source of truth. If code and spec disagree, the spec wins; if the spec is ambiguous or wrong, stop and ask rather than guess.
- Build in the phase order of spec section 17. Do not start a phase until the previous phase's definition of done is met. Report at each milestone.
- `src/engine/**` and `src/generator/**` are pure TypeScript: no DOM, no `window`, no `Math.random`, no imports from `app/`, `render/`, `input/`.
- TypeScript strict mode; no `any`; no `// @ts-ignore`.
- Tests live in `tests/` mirroring `src/`. Every rule in spec 5.2 has a named test. Run `npm test` before every commit; never commit red.
- Formatting: Prettier defaults (`.prettierrc`: `{ "singleQuote": true, "semi": true }`). Run `npm run format` before committing.
- Dependencies: only those in spec 11.4. Ask before adding anything.
- All user-facing text goes through `src/app/strings.ts`. All tunables go in `src/app/config.ts` or `src/generator/difficulty.ts`.
- Commit at the end of every phase with a message `phase N: <milestone name>`; smaller commits within a phase are welcome.
- Never bump `GENERATOR_VERSION` without adding a changelog line to the spec and telling Tob.
```

### 16.4 Kickoff prompt

Paste this into Claude Code in the empty `color-link/` folder (after copying the spec into `docs/`):

> Read `docs/pOZle_color-link_spec_v1.0.md` in full before doing anything else. Then create `CLAUDE.md` from section 16.3. Build the MVP defined in section 14.1 by executing the phases in section 17 strictly in order: complete phase 0 (scaffold, 16.1–16.2), then phase 1 (pure rules engine with the tests named in 13), then phase 2 (deterministic generator, difficulty config, all-levels test), then phase 3 (canvas renderer and pointer/keyboard input), then phase 4 (screens, state machine, persistence), then phase 5 (polish, accessibility, audio). At the end of each phase, run `npm test` and `npm run build`, confirm that phase's definition of done, commit, and post a short report listing what was built, any deviation from the spec, and anything you need from me — then continue to the next phase without waiting unless you have a blocking question. Before reporting the build done, walk through every item in section 12 and state pass/fail for each. Do not add any dependency not listed in 11.4 without asking. Do not implement anything from 14.2 or 14.3.

## 17. Build plan: phases & milestones

Each phase has a scope, a definition of done (DoD), and a milestone name for the commit and the report. Estimated effort is for a single Claude Code session; phases 0–5 are MVP.

### Phase 0 — Scaffold

**Scope**: run the commands in 16.2; create the folder tree in 16.1 with empty modules; `index.html` with `<div id="app">` and a `<canvas>` placeholder; `base.css` with the neutral tokens from section 10 as CSS variables for light and dark (`prefers-color-scheme` plus a `data-theme` attribute override); `strings.ts` and `config.ts` with `APP_NAME` and `APP_VERSION`; a trivial passing test; `CLAUDE.md`.
**DoD**: `npm run dev` shows the app name on a white page; `npm test` passes; `npm run build` succeeds.
**Milestone M0**: "scaffold".

### Phase 1 — Rules engine (pure)

**Scope**: `engine/types.ts`, `engine/engine.ts` implementing every row of the 5.2 table, `engine/queries.ts` (won, coverage, completed count), undo stack, hint. Write the tests in 13 `tests/engine/` first or alongside; include the invariant property test.
**DoD**: all `tests/engine/*` pass; engine has no DOM imports; a hand-written 5×5 level (the example in 7.2) replays to `won == true`.
**Milestone M1**: "rules engine green".

### Phase 2 — Generator

**Scope**: `prng.ts` with known-answer tests, `difficulty.ts` with the TIERS table, `generate.ts` per 7.1, `validate.ts` (replay through engine). Add `tests/generator/*` including the all-600-levels test with timing and the relax-level histogram.
**DoD**: all 600 levels generate, validate, and meet acceptance criteria 2–5. If any tier's relax-2 rate exceeds 5%, tune `STOP_PROBABILITY` / `WARNSDORFF_PROBABILITY` (per tier if needed) and report the final numbers.
**Milestone M2**: "600 levels validated".

### Phase 3 — Board renderer & input

**Scope**: `render/layout.ts` (cell size formula from section 9, pixel↔cell mapping, DPR handling), `render/BoardRenderer.ts` (grid, endpoints, paths, tints, cursor, animation state hooks), `input/pointer.ts`, `input/keyboard.ts`. A temporary dev harness in `main.ts` that loads `generate(TIERS[2], 1)` and renders it.
**DoD**: a Hard level is fully playable in the browser with mouse, touch (DevTools device mode), and keyboard; cut/backtrack/complete behave per 5.2; console logs `WON` when solved; the board fits on 360×640 for size 14.
**Milestone M3**: "playable level".

### Phase 4 — Screens, state machine, persistence

**Scope**: `app/state.ts` (section 6), `app/App.ts`, Home, LevelSelect, Play (top bar, stats row, toolbar, timer), Paused, Won, Settings, HowToPlay, ConfirmReset; `app/progress.ts` (unlocks, best times, perfect); `storage/persistence.ts` with the three keys and schema guards; in-progress resume on boot; `visibilitychange` auto-pause. Remove the phase-3 dev harness.
**DoD**: the full core loop of section 4 works end to end; progress and in-progress board survive a reload; tier unlock works; `tests/storage/*` and `tests/app/*` pass; acceptance criteria 8–14 pass.
**Milestone M4**: "full loop + persistence".

### Phase 5 — Polish, accessibility, audio

**Scope**: animations from the section 9 feedback table with reduced-motion switch; `audio/sfx.ts` and `audio/haptics.ts`; colour-blind labels; dark theme QA; inline SVG icons; focus styles and `aria` attributes; keyboard-only pass; favicon; Lighthouse run.
**DoD**: acceptance criteria 15–19 pass; the manual test script in 13 runs clean; a final report lists every item of section 12 with pass/fail.
**Milestone M5**: "MVP complete".

### Phase 6 — PWA & release _(stretch, only if Tob asks)_

**Scope**: `vite-plugin-pwa` (ask first), manifest, 192/512 icons, offline caching of the app shell, `README.md` with deploy instructions for a static host (GitHub Pages or Netlify).
**DoD**: installable on Android Chrome and iOS Safari; works offline after first load; Lighthouse PWA checks pass.
**Milestone M6**: "installable".

### Reporting format at each milestone

```
## Phase N — <milestone>
Built: <3–6 bullets>
Tests: <count> passing, <count> skipped
Deviations from spec: <none | list with reason>
Needs Tob: <none | questions>
Next: Phase N+1
```

## Changelog

- v1.0 — initial spec
- v1.0-as-built — MVP delivered (phases 0–5). `GENERATOR_VERSION` is unchanged at 1, so every level is exactly as this spec defines. The notes below record where the build diverged from the letter of the spec, so later work does not "fix" them back.

### As-built notes

**Generator stop probability is per level, not the flat 0.12 (section 7.1).** With `STOP_PROBABILITY = 0.12` the generator could not produce Master levels at all (1200 attempts, no candidate) and missed the pair target badly at both ends of the ladder: one probability cannot serve a 5×5 board wanting 4-cell paths and a 14×14 board wanting 16-cell ones. Section 7.1 sanctions tuning this constant when acceptance is poor, so it is now derived from the average path length each level needs, with a board-size correction for walks that stop early because they run out of neighbours. `WARNSDORFF_PROBABILITY` went 0.6 → 0.95 by measurement. Result: all 600 levels are accepted at `relax = 0`, in 225 ms total.

**A path holding only its own start endpoint is stored as no path.** Otherwise pressing an endpoint and releasing without dragging counted as a move, consumed an undo slot, and cost the player the "Perfect" badge, even though the board looked untouched. Only an in-flight stroke sits at length 1.

**`hint()` starts the timer.** Section 6 starts it on the first `begin`, which would record 0:00 for a level solved entirely with hints.

**`pathCut` events carry the removed cells,** so the renderer can fade exactly the segment that was cut (section 9 feedback table).

**Dependencies (section 11.4): `jsdom` added, dev-only.** Section 16.2 already anticipates it ("screen tests, if any, may opt into `jsdom` per file"). It earns its place: the one bug that escaped the unit suite was a DOM-attribute bug — the element builder wrote `aria-checked` as an empty string for `true` and dropped it entirely for `false`, so the Settings switches silently never toggled. No effect on the shipped bundle.

**Repository layout (section 16.1): `scripts/verify/` added.** `npm run verify` starts a dev server, drives a headless Chromium-based browser through the app, and checks the acceptance criteria in section 12 that can only be judged by running it. 89 checks in about 55 s, with no npm dependency beyond Node's built-in `fetch` and `WebSocket`.

**`index.html` drops `maximum-scale=1.0, user-scalable=no`.** Blocking zoom fails an accessibility audit, and `touch-action: none` on the canvas already stops the board being panned or double-tap-zoomed during a drag.

**Home tier rows carry no `aria-label`.** A label that does not contain the row's own visible text breaks voice control and fails the axe `label-content-name-mismatch` rule. The row's content already reads "Easy 5×5 0/100".

**Verified at delivery:** 175 unit tests, 89 browser checks, all 600 levels generated and replayed, and Lighthouse (mobile) on the production build at 100 accessibility, 100 performance, 100 best practices.

### Phase 6 — installable (as-built)

**Dependency added: `vite-plugin-pwa` (dev only), approved by Tob.** The only
addition beyond section 11.4 and the jsdom note above. It contributes nothing
to the JS bundle, which stays at 17.5 kB gzipped; it emits `sw.js`,
`workbox-*.js` and `manifest.webmanifest` alongside it.

**`base` is relative (`'./'`).** The build runs from a domain root, a GitHub
Pages project subpath, or a file server with no reconfiguration, so
`start_url` and `scope` in the manifest are `'.'` to match.

**Orientation is not locked.** Section 5.5 requires the board to re-lay out on
rotation, so pinning the manifest to `portrait` would contradict it.

**Icons are generated, not hand-drawn.** `npm run icons` rasterises
`icon-192`, `icon-512`, `icon-maskable-512` and a 180 px `apple-touch-icon`
from the favicon artwork, using the same headless browser the verification
harness drives — so section 11.4 gains no image dependency. The maskable
variant is full-bleed with the artwork inside the middle 64%, well within the
80% safe zone; the plain icons have their corner radius cut out of the alpha
channel; the Apple icon is opaque, which iOS requires.

**Repository layout: `README.md` and `scripts/icons/` added.** The README
carries the deploy instructions phase 6 calls for (Netlify, GitHub Pages, and
the two things any other host must get right: HTTPS, and not caching `sw.js`
or `index.html` hard).

**Criterion 17 re-verified against the production build.** A service worker
could have broken "zero requests after initial load"; it does not. Precaching
happens once during the initial load, and a level played afterwards issues no
request at all. `npm run verify:pwa` asserts this.

**Phase 6 verified:** 22 browser checks, including a genuine offline pass — the
preview server is killed, the network is emulated offline, and the app is
reloaded and a level played to a solve. Unit tests total 188.

### Rule changes after first phone test (Tob, 28 August 2026)

**Open question 2 settled: full coverage stays required.** Spec assumption 4
required 100% cell coverage and spec 15 listed the alternative as an open
question. It was briefly changed to "every pair connected is enough" and then
reverted the same day: the board must be filled, as the spec always said.
`WIN_REQUIRES_FULL_COVERAGE` in `src/engine/queries.ts` is the single line
that expresses it, and it is `true`.

Why the revert was right, from the evidence gathered while the loose rule was
in place: the verification suite joins every pair along breadth-first shortest
routes and won ordinary Normal boards at 83% coverage. A player could ignore
the board entirely and route each pair the short way, which removes the tiling
constraint spec 1 calls the "aha" — _you are not routing lines, you are tiling
the board with them_ — and flattens the difficulty ladder in spec 3 into a
count of pairs.

All 600 levels are confirmed completable under this rule.
`tests/generator/completability.test.ts` generates every level, drags each
solution path through the engine exactly as a player would, and asserts 100%
coverage and `won == true`. Every tier reports 100/100 solvable at a minimum
coverage of 100%. This holds by construction — the generator starts from a
partition of the whole board — but it is now asserted rather than assumed.
`GENERATOR_VERSION` never changed, so no level and no saved progress was
affected by either the change or the revert.

**Levels now open one at a time.** This overrides spec assumption 8 ("within a
tier all 100 levels are playable in any order") and spec 14.3, which put
sequential locks out of scope. `isLevelUnlocked` in `src/app/progress.ts`: a
level opens when the one before it is solved. Level 1 of every tier is always
open. An already-solved level stays open regardless of what sits before it, so
progress earned under the old rule cannot strand a level behind a gap. Locked
tiles render as disabled buttons — dimmed, unclickable, and skipped by Tab
rather than trapping a keyboard user on a control that does nothing.

Tier unlock thresholds (assumption 7) are unchanged and still count solves
within the gate tier.

**No change was needed for "prompt to go to the next level".** The Won card has
carried a full-width `Next level` pill as its primary action since phase 4, per
spec 9. It was unreachable in practice because connecting every pair did not
win — fixing the rule above surfaced it.

### Board layout revisited on a real phone (Tob, 28 August 2026)

Section 9's cell formula reserved 32px of width and 220px of height. Measured on
a Galaxy A14 at 360x780 that left the board covering 38% of the screen, pinned
to the top, with 284px of dead space beneath it — 36% of the screen height doing
nothing. Every board size on a 360px-wide phone is width-limited, so the only
way to enlarge the board is to reclaim horizontal padding; the vertical slack
can only be redistributed.

**Portrait.** `viewportPaddingX` 32 -> 16 and `viewportPaddingY` 220 -> 196. The
board and its controls are now centred in the space under the top bar rather
than stacked from the top. Hard goes from 41px to 43px cells (328px to 344px of
a 360px screen, 95% of the width) and from 38.3% to 42.1% of the screen; the
ceiling for a square board on that phone is 46%.

**Landscape, which was broken.** The portrait formula reserved 220px of height
on a 360px-high screen, and the 20px cell floor then forced a 14x14 board 280px
tall into 140px of space: the page scrolled, which section 9 forbids. Easy
meanwhile drew a 160px board on a 780px-wide screen, 9% of the display.

Landscape now lays the screen out as a grid — board on the left across the full
height, stats and toolbar in a column beside it — with its own constants,
`landscapePaddingX` 184 and `landscapePaddingY` 64. Nothing scrolls at any board
size, Easy's board goes 160px -> 296px, and Master fits at 21px cells where it
previously overflowed by 91px.

`isLandscape` in `src/render/layout.ts` is the switch: wider than tall, and under
500px high. A wide desktop window stays on the portrait maths.

The two padding constants must stay in step with the CSS. `.screen--play` sets
8px of horizontal padding in portrait and 8px vertical in landscape, and
`tests/render/layout.test.ts` pins the arithmetic in both orientations. The
verification suite rotates the viewport and asserts nothing scrolls and the
controls do not sit on top of the board — the check that caught a 4px overflow
while this was being written.

### Renamed to pOZ-Link, and endpoints are now O's (Tob, 28 August 2026)

**The working title in assumption 14 is settled: pUZlink** (briefly pOZ-Link, and
written PUZLink until 6 September, when it was corrected to match its siblings on
the Hub's home screen — pUZmate, pUZsaw, pUZfill, pUZdoku). It lives in
`APP_NAME` exactly as section 2 promised, so the Home masthead, the page title,
the web app manifest and the Won card all follow from one constant. The two
places outside TypeScript that carry a name of their own — `capacitor.config.json`
and the Android `strings.xml` — were updated to match.

Three identifiers deliberately did **not** change, because each would cost more
than it is worth and none is visible to a player:

- The Android application id stays `com.oubata.colorlink`. Changing it installs
  a second, separate app rather than upgrading the first, and abandons whatever
  progress is on the device.
- The storage prefix stays `colorlink:v1:` (section 11.2). Changing it discards
  every saved best time and unlock.
- The repository and its Pages URL stay `color-link`, so the published address
  keeps working.

**Endpoints are drawn as the letter O, not a filled dot.** This revises the
section 10 board rendering: an endpoint is a ring of `endpointRingWidth` = 0.15
of a cell, inside the unchanged 0.62 outer diameter, giving a hole 0.32 of a
cell across. Both numbers are fractions of the cell, so the O holds from a 20px
Master cell to a 72px Easy one.

The subtlety is that a path is drawn to the centre of its endpoint cell, so a
connected endpoint would fill its own hole and the O would collapse back into a
dot the moment it was joined. The renderer therefore repaints the cell beneath
the hole — background and colour tint both, so it matches its neighbours —
before stroking the ring. The line then reads as running into the O and stopping
at its inner edge.

**Colour-blind labels keep the filled dot.** A numeral needs a solid field, and
at a 20px cell the hole is 6px across, far too small to read a digit in. With
labels on, the centre is filled with the endpoint colour and the numeral sits on
it exactly as before. Legibility beats the letterform.

The app icon follows the same idea: two O's joined by a line that stops at each
ring's outer edge rather than running to its centre, so the letters stay hollow
without needing anything painted over them.

The verification suites locate endpoints by sampling the canvas, and were
sampling each cell's centre — which is now a hole. `SAMPLE_CELL` in
`scripts/verify/helpers.mjs` samples the ring as well and keeps the most
saturated hit.

### Haptics on real hardware (Tob, 29 August 2026)

Assumption 12 defaults haptics on and section 9 gives the patterns as 10ms on a
connected pair and [10, 40, 20] on a win. Neither survived contact with a phone.

**The permission was missing.** Capacitor's default Android manifest does not
declare `android.permission.VIBRATE`, so nothing the app asked for ever reached
the vibrator. What made this hard to spot from the code: the WebView still
exposes `navigator.vibrate`, and it still returns `true`. `Haptics.available`
passed, the Settings row appeared, the buzz branch ran, and the device sat
still. Only Android's own vibrator service, which logged nothing at all, gave
it away. The permission is now declared; it is a normal one, granted at install
with no runtime prompt.

**The patterns were below the hardware's floor.** With the permission in place a
Galaxy A14 played the spec's values exactly as asked - 10ms and 20ms steps -
and they could not be felt. A rotating-mass motor needs 20-30ms just to spin
up, and Android scales game haptics to LOW. Android's own touch feedback uses
45ms, which is the mark to hit. `navigator.vibrate` exposes no amplitude, so
duration is the only lever available.

The patterns are now tunables in `src/app/config.ts`: 40ms on a connected pair,
[45, 60, 90] on a win. Confirmed in play on the device, and confirmed felt.
A phone with a linear actuator would render the spec's 10ms crisply, so this is
a floor for the weakest hardware rather than a correction of taste.

**Haptics now default off**, against assumption 12. A buzz on every connected
pair is a strong opinion to impose on a first run before anyone asks for it,
and the toggle sits in Settings. Sound keeps its default of on.

This only affects fresh installs. A device that already has settings stored
keeps whatever it had, since the stored value wins over the default.

### Hints capped at two (Tob, 29 August 2026)

Assumption 9 makes hints unlimited. They are now capped at two per level, the
same for every tier. `MAX_HINTS_PER_LEVEL` lives in `src/engine/queries.ts`
rather than `src/app/config.ts`, because the engine enforces it and may not
import from `app/` — the same reason `WIN_REQUIRES_FULL_COVERAGE` sits beside
it.

**Two hints per attempt at a level, and a restart is a new attempt.** The first
version withheld hints across a restart, on the reasoning that refilling them
made the cap a formality. Testing on the device showed that reasoning did not
survive contact with the rest of the app: only one board is saved at a time
(section 11.2 has a single `inProgress` key), so leaving a level and coming
back already handed the allowance back. Restart behaving differently from
revisiting was an inconsistency, not a safeguard. Both are now a fresh attempt
at the level, worth two hints.

`hintUsed` still survives a restart, exactly as spec 5.2 says. That is what
stops a restart laundering away the Perfect badge, and it is a separate fact
from the allowance: the engine keeps `hintWasUsed` (sticky, has this level ever
been hinted) apart from `hintCounter` (this attempt's tally, and what the
allowance is measured against).

**The toolbar shows what is left.** The Hint button reads "Hint 2", counts down,
and goes flat at zero the way Undo does with an empty undo stack. A cap the
player only discovers by finding the button greyed out would be worse than no
cap at all. Its `aria-label` carries the same, as "Hint, 2 left".

**A consequence worth recording: this broke the verification harness.** Every
suite finished a board by pressing Hint until it was solved, which two hints
can no longer do. The app now exposes `window.__colorlink.solve()` behind
`import.meta.env.DEV`, which replays the level's own solution exactly as a
player would drag it. Vite strips the branch from a production build: the
assignment appears in no production chunk, so no handle ships. The method it
calls survives as an unreachable class method.

`npm run verify:pwa` runs against the production bundle, where that hook does
not exist, so its offline check no longer completes a level. It now asserts
that the game _runs_ offline — a level generates, the engine responds, the
board redraws, the HUD follows, and the hint allowance runs out — rather than
that a level can be _completed_ offline. Completing one is covered against the
dev server, and nothing on the win path touches the network.

### Home wears the Hub app's moulded capsules (Tob, 5 September 2026)

pUZlink is going into the Hub app, whose other games present their modes as
brightly coloured, embossed capsules. Home now matches them: each tier is a
capsule in its own colour, lit along the top edge, darkening into the bottom of
the mould, standing on a 3 px edge of its own colour, and pressing down onto
that edge when tapped. This overrides "no gradients, no drop shadows" in
section 9 for this one screen — deliberately, and only here. The board, the
level grid and the modals stay flat.

It also reverses the reasoning behind the tier colours added on 30 August, which
kept the colour to a rail and a wash precisely to avoid being the only bevelled
thing in a flat app. Consistency with the Hub app now outranks internal
consistency with the play screen.

**Nothing is picked by eye: the whole capsule is derived from the tier's one
palette colour.** `tierSurface()` in `src/render/theme.ts` returns the face, the
top highlight, the bottom, the edge and the label ink, and the row hands them to
the stylesheet as custom properties. The ink is white or near-black, whichever
reads on that colour, and the face is then pushed away from the ink in 4% steps
until the label clears 4.5:1 against _both_ ends of the gradient rather than
just the middle — a highlight bright enough to look moulded is also bright
enough to swallow white text. Four of the six hues need no help; blue lightens
one notch, purple and red deepen. A test pins the contrast at top, face and
bottom for all six.

**The progress bar moved into the capsule** rather than taking a row of its
own, so six capsules still fit a 320×568 screen with three unlock lines showing.
It stops short of the corners, where the radius would otherwise swallow the
first few percent — 3/100 has to be visible. Its track and fill are the label
ink at 25% and 85%, so it carries the same guaranteed contrast as the text.

**A locked tier keeps its shape and loses its colour** — fully desaturated at
60% opacity, sitting flat on its edge with no lift. Section 9's 40% opacity was
too faint to read the unlock line through once the row had a coloured ground.

### The artwork behind every screen (Tob, 5 September 2026)

Every screen now sits on Tob's artwork — the wall of blue cubes, `Specs/images/
Backg image1.png` — **exactly as supplied**. Not cropped, not lightened, not
darkened, with no scrim between it and the app. Section 9's white page and
section 10's neutral grounds are overridden for the page itself; the panels keep
their neutrals.

**Three pictures were fitted before this one was chosen.** A dotted world map
(too busy behind the wordmark, and its colour dulled the capsules) and a wall of
LED strips (technically the easiest — dead even at L 0.25, so one ink served the
whole screen — but visually inert, and its dot pitch fought every glyph). The
cube wall won on looks: big, low-frequency shapes that recede behind the
capsules, a saturated blue that lets the tier colours sing, and a gradient that
does compositional work. It is the _hardest_ of the three to write on, and that
trade was made deliberately.

**It ships whole.** `scripts/textures/prepare-background.py` re-encodes the
1.16 MB PNG as an 860 KB lossless WebP and refuses to write anything unless the
result decodes pixel for pixel identical to the source; `--check` re-verifies
the committed file. Container only — no crop, no resample, no colour change.
The framing is the app's: `background-size: cover` on a fixed layer, so a
portrait phone shows a tall slice of the middle and the 100-tile level grid
scrolls over a still picture.

**Two inks, because the picture is lit from below.** Measured down the slice a
phone shows: the top eighth is deep blue, where white clears 4.5:1 on 99% of
the pixels and near-black on 0.8%; the bottom eighth is near white, where the
numbers are almost exactly reversed (white 12%, dark 88%). No one ink survives
that, so an element takes the ink for the region it sits in — `--ink-on-art`
(white) up top for the masthead and both top bars, `--ink-on-lit-art` (deep
navy) down in the light for the Home footer and the play stats and toolbar.
Those positions are fixed by the layout, so the assignment is static.

Each ink carries a ring of zero-blur shadows in the other's colour — the
technique subtitling uses — which is what covers the cube seams and highlights
where neither ink clears on its own. A blurred glow does not work; only a hard
edge separates ink from a lit surface. `--ink-drop` and `--ink-lit-drop` are the
same rings for SVG icons, which `text-shadow` cannot reach.

**The stats line and the toolbar get a heavier ring** (`--ink-lit-shadow-heavy`,
a second set of cardinals at 2px). They are the smallest text in the app, 12 and
14px, and they land squarely on the near-black seams between the cube faces,
which a single 1px ring lets close over a stroke. Checked at 390x844, 360x640
and 320x568, where the toolbar sits at a different point of the gradient each
time.

**What sits on the artwork, and what does not.** Anything with a surface of its
own keeps the theme's neutrals: the board, the modal cards, the tier capsules.
Anything sitting directly on the picture takes one of the two inks and does
_not_ follow the theme, because the picture behind it does not either.

**Three things had to change to stay legible over it.**

- **A locked tier capsule is moulded from grey** (`lockedTierSurface()`) rather
  than dimmed to 60% opacity. An opacity would have let the artwork through the
  capsule and taken the unlock line with it.
- **The level grid is a hundred dark wells.** It is the one surface that covers
  the whole screen — and so the whole gradient — which rules out both an opaque
  neutral (the artwork would be gone) and a clear one (the numbers would read at
  the top and vanish at the foot). Each open tile carries its own dark wash, the
  same one wherever it lands, so one ink serves the grid.
- **A solved tile is filled with its tier's colour**, not `--accent`. With
  `--accent` a played-out tier was a wall of white; the tier colour also ties
  the grid to the capsule it was opened from.

**A trap worth recording: a button inherits neither.** `text-shadow` does not
reach a `<button>` from its parent, and `.text-button`/`.icon-button` set a
colour of their own, so the Home footer came out in the theme's ink and
unringed. Every on-artwork button is now named explicitly in those rules, and
`npm run verify` has a suite that fails if any of them loses its outline.

**Landscape is the one case the measurements do not cover.** Rotated, `cover`
crops the picture vertically instead and shows its middle band, where white
clears on 38% of the pixels rather than 99% — so the top bar leans on its ring
there rather than on its ink. Portrait is the orientation this was fitted to.

**Both themes are kept.** The artwork does not flip with them, so Light now
means light panels on the picture (a white board, white modal cards) and Dark
means dark ones. Nothing was removed from Settings.

`background_color`, `theme_color` and Capacitor's `backgroundColor` are all
`#0A2A63`, taken from the artwork's deep end, so no launch screen or
task-switcher card flashes white in front of it. The WebP is precached with the
shell — `npm run verify:pwa` fails if it is not — since an install that cached
everything but the picture would come up offline as a flat blue app.

### The app runs edge to edge, with the navigation bar hidden (Tob, 6 September 2026)

On Android the artwork now reaches all four edges of the phone, and the board
gets the whole screen. Two separate things in `MainActivity`:

- **Edge to edge.** `setDecorFitsSystemWindows(false)` with both system bars
  transparent, so the picture runs behind the status bar instead of stopping
  under the grey band that Capacitor's default theme paints there. The status
  bar itself stays — the clock and the battery float over the artwork during a
  game — with its icons set light, because the top of the artwork is deep blue.
- **The navigation bar is hidden** while the app is in front. Hidden, not
  disabled: `BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE` means a swipe from the
  bottom edge brings it back as an overlay that fades again on its own, and the
  content never relayouts around it.

The hide request is made again on every `onWindowFocusChanged(true)`, not once
at startup: Android drops it whenever the window loses focus, which a permission
dialog, the recents switcher or an incoming call all do.

**`env(safe-area-inset-top)` cannot carry the status bar on Android.** The
WebView fills it from the display cutout only, so it reads 0 on a phone whose
status bar sits in ordinary screen space — and the top bar would then sit under
the clock. `MainActivity` measures the real inset in an
`OnApplyWindowInsetsListener` and sets it on the page as `--inset-top`, in CSS
pixels, every time the system reports it; rotation and a cutout appearing on one
edge both come through the same path. The stylesheet declares
`--inset-top: env(safe-area-inset-top, 0px)` as the default, so the web build
and iOS are unaffected, and `#app` pads by it.

**The status bar's inset counts towards the masthead's top padding rather than
adding to it** — it is already holding the masthead clear of the edge — so
`.home__header` pads by `max(0px, calc(var(--space-6) - var(--inset-top)))`.

Measured while fitting it: Home needs about 536px of content height, and it
tolerates a 24px inset at a 568px viewport with nothing to spare. That is not a
constraint in practice — going edge to edge and hiding the navigation bar hands
back roughly 70px that the layout never had before, so the app now fits on
smaller phones than it did. It already overflowed below ~536px, before any of
this.

This is the fourth thing in the app that exists only on the device and cannot be
proved by any check that runs here. `npm run apk` proves it compiles and ships;
whether the bar is really gone, whether one swipe brings it back, and whether
the clock clears the top bar all have to be looked at on the phone.

**`android/gradlew` was committed without its executable bit** (mode 100644), so
`npm run apk` could never have run on macOS or Linux — only the `gradlew.bat`
path on Windows worked. Fixed to 100755 while building the APK for this change.
Also worth recording: Gradle 8.11.1 rejects the JDK 25 that current Android
Studio bundles ("Unsupported class file major version 69"), so `JAVA_HOME` has
to point at a JDK of 21 or older.

### The solve is recorded when the board is solved (Tob, 6 September 2026)

Winning a level used to do two things in one deferred call: clear the saved
board immediately, then, once the win animation had finished, record the solve
and show the results card. Leaving the screen in between — the back chevron, the
Android back button, the browser's back gesture — destroyed the view, and
`destroy()` cancels that timer. **The level was solved on screen, the saved
board was already gone, and nothing was ever written to progress.** On a Master
board the window is about a second wide.

`PlayView` now reports the win through two callbacks instead of one. `onSolved`
fires synchronously inside the engine's `won` event and carries the snapshot;
`App.recordWin` writes progress and clears the saved board there and then.
`onWinShown` fires from the animation timer and carries nothing — by then the
solve is already durable, and all that is left is `App.showWon`, which presents
the card if the player is still on that level. If they left, the card is
dropped and the level stays solved.

**A solved board is now inert.** Three holes were open while the engine had won
but the card had not yet appeared, all of them reachable:

- **Pause.** The state machine refuses Paused on the `won` screen, but in that
  window the screen is still `playing`. Paused offers Restart, which wiped the
  board out from under the pending solve. `App.pause()` and the
  visibilitychange handler now both refuse once `engine.won`.
- **Undo.** The board keeps keyboard focus under the results card, and
  `Engine.undo` recomputes the win flag — so `u` un-won a level that was already
  recorded, leaving the card over an unsolved board.
- **Restart.** `r` opened the restart-confirm dialog over the results card.

The last two are guarded in `PlayView`, not in the input layer: `begin` and
`extend` already refuse on a won board, so only the tool callbacks were exposed.
The Pause button hides itself on a solved board rather than sitting there live
and silent.

### The clock cannot bill a sleeping phone (Tob, 6 September 2026)

The play clock is built on `performance.now()`, which keeps advancing while a
device sleeps, and the pause that would stop it hangs off `visibilitychange`,
which a hard suspend does not always fire. A phone that slept in a pocket with a
board open could come back with hours on the level.

It now accumulates tick by tick instead of measuring one span from the moment it
started: each 250ms tick, and each read of `elapsedMs`, folds
`min(delta, TIMER.maxTickDeltaMs)` into the total. One second is the ceiling on
any single stretch of wall time, so a gap longer than a tick — which only
happens when the timer itself was frozen — contributes a tick and no more.
Ordinary play is unaffected, since ordinary ticks are 250ms apart. Both values
are tunables in `src/app/config.ts`.

### The hint animation and the hint agree on a colour (Tob, 6 September 2026)

`Engine.hint` picks the lowest colour whose path is not its solution, comparing
the cells. The board screen, which has to animate the reveal, worked the colour
out a second time by comparing path _lengths_ — a different question, since a
path can be exactly as long as its solution and still take a different route.
When the two disagreed the hint redrew one colour and the animation played over
another. The engine now answers it once, through `nextHintColor()`, and the view
asks rather than guesses.

### Back, and the rest of the way out (Tob, 6 September 2026)

**Back at Home minimizes instead of exiting.** The Android handler called
`exitApp()`, which finishes the activity: the task is destroyed, it leaves
Recents, and the resume state the app had just saved is only reachable through a
cold start. `minimizeApp()` is what Android's own guidance describes — the task
goes to the background with its board intact and comes back where it was.

**The spare history entry is now consumed when it should be.** The web build
pushes one entry on leaving Home so the browser's back gesture has something to
pop. Returning to Home through the UI left that entry on the stack, so the first
back press at Home did nothing at all and a second was needed to leave.
`syncHistory` now pops it on arrival at the root — and only if `history.state`
says the entry is the app's own, so it can never pop something it did not push.

**The board is saved on `pagehide` as well as on `visibilitychange`.** The
first covers backgrounding; the second covers a tab closing, a navigation away,
or a WebView being torn down. A consequence worth recording, because it broke
the verification harness: a page that goes away while a board is mounted now
writes that board on the way out, so a suite that clears the saved board and
reloads has to leave the board first or the reload restores it.

**The wiring of the native back button is no longer fire-and-forget.** If the
dynamic import of `@capacitor/app` fails, the platform default finishes the
activity from any screen — the exact bug the listener exists to prevent — so the
failure is now logged rather than swallowed as an unhandled rejection.

### The canvas follows the OS theme (Tob, 6 September 2026)

Theme and reduced motion both default to `system`, and the app read them once at
startup. Switching the phone to dark mode with a board open repainted the DOM —
the CSS media query does that by itself — but left the canvas on the palette it
was built with, because the board reads those custom properties in JS and had
nothing telling it to look again. Acceptance criterion 16 was satisfied by the
Settings toggle and by nothing else.

`watchSystemPreferences` in `src/render/theme.ts` subscribes to both media
queries and calls back on either. The App re-applies whatever is stored, which is
the same path the Settings modal takes and ends at `refreshColors()`; the stored
value can stay `system`, since the resolvers work that out for themselves. It
falls back to the deprecated `addListener` for a WebView without
`addEventListener` on a MediaQueryList, and does nothing at all where
`matchMedia` is missing.

### The launch screen is the app's, and the inset arrives in time (Tob, 6 September 2026)

**The APK was shipping Capacitor's splash screen** — all eleven density
variants were the framework's stock artwork, a white field with the Capacitor
logo, because `npm run icons` only ever wrote the launcher icons. They are now
generated alongside them from the app's own mark on `#0A2A63`, at the same
sizes the template defined.

Two paths have to be served, because Android 12 changed how this works. Older
versions paint `android:background` from the launch theme, which is the drawable
above. Twelve and up ignore that drawable entirely and paint
`windowSplashScreenBackground`, which was never set — so the cold-launch window
was the platform default, white, in front of a dark blue app. Both now point at
`@color/brand_background`, a new `values/colors.xml` holding the same `#0A2A63`
as the web manifest and Capacitor's `backgroundColor`.

**The launcher icon has a monochrome layer**, so Android 13's themed icons tint
it with the rest of the home screen instead of leaving it a white square. It is
the same artwork flattened to one colour on transparency, which is what the
tinting requires.

**`--inset-top` no longer races the page load.** The window is laid out long
before the WebView has a document: the first insets arrive during the first
frame, so the property was being set on a document that was then thrown away,
and nothing published it again — the top bar sat under the clock until the first
rotation. `MainActivity` now keeps the last measured inset and re-publishes it
from Capacitor's own `WebViewListener.onPageLoaded`, which is exactly the
moment there is a page to put it on, and again from `onResume` and
`onWindowFocusChanged` for a return from the background.

### The board is sized by its column, not by the window (Tob, 6 September 2026)

`computeCellPx` measured the viewport, but the board sits in a column that
`.screen` caps at 560px. On a desktop window a 14x14 board came out 700px wide
inside that column and hung over the top bar, the stats row and the toolbar. The
cap is now `BOARD_LAYOUT.maxContentWidth`, next to the padding constants it
belongs with, and the layout test pins both the desktop case and a phone-width
board that must not move.

**A known limitation, recorded rather than fixed:** a _portrait_ viewport
shorter than about 476px still overflows, because `isLandscape` requires the
viewport to be wider than it is tall, and the 20px cell floor then forces a
board taller than the space. It needs a split-screen, a foldable cover display
or a resized desktop window to reach; no phone in portrait is that short. The
landscape half of the same problem was fixed in August (see "Board layout
revisited on a real phone").

### Smaller things, same pass (Tob, 6 September 2026)

- **`Math.random` is now banned across the whole app**, not just the engine and
  the generator. The existing purity test only globbed those two directories, so
  nothing stopped a random number appearing in the renderer or the input layer,
  where it would make an animation or a colour unreproducible.
- **The colour-blind label contrast test was checking a colour the canvas never
  paints.** It asserted the numeral against `PATH_PALETTE`, but the renderer
  fills the dot with `lineColor` — the palette colour lightened. The real
  numbers are comfortable (the worst is navy at 11.6:1), so nothing changed on
  screen; the test now measures what is actually drawn.
- **A segmented control moves with the arrow keys.** It declares
  `role="radiogroup"`, which tells a screen reader to expect radios, and radios
  are moved between with arrows — every option was a separate Tab stop instead.
- **A level tile's state is in its label, from `strings.ts`.** ", solved" and
  " with a hint" were English literals concatenated onto a string-table value,
  in an `aria-label` where no visual sweep would ever have found them.
- **Dead code removed:** `S.hintUsed`, `ICONS.play`, `ICONS.close` and
  `Sfx.close()`, none of which had a caller.
