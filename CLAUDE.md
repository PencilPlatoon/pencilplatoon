# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
npm run dev       # Start dev server (Express + Vite HMR) at http://localhost:8888
npm run build     # Build frontend (Vite → dist/public/) + backend (esbuild → dist/index.js)
npm start         # Run production server (NODE_ENV=production)
npm run check     # TypeScript type checking (tsc --noEmit)
```

No test runner or linter is configured. Type checking via `npm run check` is the primary validation step.

## Project Structure

Monorepo with client/server separation. All game logic runs client-side; the server only serves static files.

- `client/src/game/` — Core game engine classes (GameEngine, Player, Enemy, Terrain, Physics, Camera, CollisionSystem, etc.)
- `client/src/figures/` — Canvas 2D rendering classes (HumanFigure, ShootingWeaponFigure, etc.). These are pure rendering utilities, stateless.
- `client/src/components/` — React components (Game.tsx is the main entry, GameCanvas, GameUI, MobileControls, DesignerMode)
- `client/src/lib/stores/` — Zustand stores (useGameStore for game state, useAudio for sound)
- `client/src/designer/` — Design/testing tools for weapon positioning
- `client/public/` — Static assets (sounds, SVGs)
- `server/` — Express backend with Vite integration for dev mode
- `shared/` — Shared types and schemas
- `ai/rules/` — Cursor rule files (MDC format)

## Architecture

### Game Engine
`GameEngine` runs a 60 FPS `requestAnimationFrame` loop that updates all entities and renders to a Canvas 2D context. The entity system is based on the `GameObject` interface (transform, velocity, bounds, health). Key sub-interfaces: `DamageableEntity`, `ExplodingEntity`, `Holder`, `HoldableObject`.

### Coordinate System
Y-axis is positive UP (0 at bottom, ~600 at top of visible screen). Terrain is continuous sloped ground generated with Perlin-like noise, not discrete platforms.

### Weapon System
Three weapon categories: `ShootingWeapon` (guns), `LaunchingWeapon` (rocket launchers), and `Grenade` (throwables). Weapons use a dual-hold system with primary (grip) and secondary (barrel/foregrip) hand positions defined as ratio coordinates on the weapon SVG.

### Rendering
Figure classes in `client/src/figures/` handle all Canvas 2D drawing. They are stateless — they receive entity state and a canvas context, then draw. Character rendering includes articulated arms with elbow joints and walking animation cycles.

### State Management
Zustand stores bridge game engine state to React UI. `useGameStore` tracks game phase, score, level, debug mode, and seed. `useAudio` manages background music and sound effect mute states.

### Input
Keyboard: A/D movement, Space jump, J shoot, I/K aim up/down. Mobile: on-screen touch controls auto-appear on mobile devices.

### Levels
Three levels defined in `LevelConfig.ts` (Grasslands, Desert, Mountains) with increasing difficulty. Terrain generation uses a seeded random for deterministic level layout.

## Path Aliases

- `@/*` → `client/src/*`
- `@shared/*` → `shared/*`

## Production Base Path

Dev serves at `/`, production build uses base path `/pencilplatoon/` (configured in `vite.config.ts`).

## Conventions

- Conventional commits: `type[(scope)][!]: description` (types: fix, feat, chore, docs, refactor, test, perf, build, ci, style, revert). First line ≤50 chars.
- Favor functional programming: pure functions, immutability, `const` over `let`.
- Separate state management, UI, and side effects into different modules.

## Refactoring

- Do the following when refactoring:
  - Look to make the code and design "elegant"
  - Consolidate repetition of code
  - Consolidate repetition of patterns based on the same concept
    - If the same groupings of parameters are passed around in multiple places, encapsulate them
  - Break apart long functions (anything longer than 50 lines is suspicious; the more indented, the more it needs to be broken apart)
  - Break apart long files
  - Avoid deeply nested code (anything 4 or more levels deep is suspicious, especially the more lines of code it is)
  - Make sure each unit (file, function, class) has a clear responsibility and not multiple, and at a single level of granularity (think: don't combine paragraph work with character work)
  - Define constants or config instead of hard-coded numbers
  - Move logic out of display classes
  - Look for ways that different use cases have slightly different logic, when there is no inherent reason for them to be different, and merge them
  - Decouple units by using callbacks, etc so that classes refer to each other directly less often
  - Look for places with too many edge cases and come up with more robust, general logic instead
