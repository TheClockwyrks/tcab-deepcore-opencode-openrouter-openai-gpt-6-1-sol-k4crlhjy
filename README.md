# Deepcore

**Go deep. Come back. Build your way off the rock.**

A complete browser mining expedition: drill through four geological bands, haul
ore home on a weight-sensitive jetpack, and turn the proceeds into upgrades and
an escape rocket. Find Resonite and Cryenite, extract an unstable Core Sample,
and make the final climb before its ninety-second timer expires.

Choose Standard or Hardcore, then a Quick, Standard, or Marathon mine. Standard
lets you restore the last expedition saved at the surface Save Pad. Hardcore
deletes that save when you die. Everything runs locally in the browser.

## Run

Requires Node.js 22.12+ (or a compatible current Node release) and npm.

```sh
npm ci
npm run dev
```

Open the Vite address printed in the terminal. To build the self-contained static
site:

```sh
npm run build
npm run preview
```

Publish the contents of `dist/`. It includes a root `index.html` and works at any
static hosting base path; all bundled resources are relative. No backend, account,
API key, or asset-generation program is needed to build or play.

## Controls

| Input | Action |
| --- | --- |
| A / D or Left / Right | Walk, drift, and drill into side walls |
| S or Down | Drill downward while standing on solid ground |
| W / Up / Space | Fire the jetpack |
| E / Enter | Activate a camp building; confirm a menu choice |
| I | Open or close inventory; drop ore to shed weight |
| 1–6 | Use Dynamite, Plastic Explosives, Quantum Teleporter, Matter Transmitter, Nanobots, Emergency Fuel |
| J | Jettison a carried Core Sample |
| Escape / P | Close a panel, or pause / resume |
| M | Mute / unmute all audio |
| Backtick | Toggle the engine's read-only diagnostic overlay |

Menus, camp buildings, panel controls, and the status bar also support mouse,
pen, and touch. Movement uses the keyboard. The in-game field manual explains the
economy, hazards, saving, cargo weight, and escape objective.

**Plan the return trip:** fuel never refills by itself, materials weigh nothing,
and a full cargo bay may be too heavy to lift. Sell at the Ore Market, then buy
fuel and repairs. Save before a risky descent. No save can freeze a live Core Sample.

## Checks and architecture

```sh
npm run typecheck
npm run lint
npm run format
npm test
```

The Simple 2D engine owns input, timing, loading, audio, fitting, diagnostics, and
recording. The game uses immutable frame transitions over a render-free 120 Hz
simulation. Simulation rules, economy transactions, world generation, interface
hit regions, and presentation live in separate modules under `src/`.

`game.initialize` returns the full versioned debug surface beside the state; it is
available through `engine.debug` and uses `engine.apply` for poses. Nothing is
published on the game page. Tests drive a real engine with a scripted clock and
an `@napi-rs/canvas` surface.

Original pixel art, animation, live particle systems, sound effects, and music
are committed under `assets/`. `tools/generate-assets.py` records the one-time
authoring recipe and requires the authoring tools only if deliberately rerun.
The production build simply bundles the finished files.

`showcase/` contains the player-facing description, screenshots, and a genuine
engine draw-command replay. For capture tooling, run the dev server and then
`node tools/capture.mjs`. After a production build,
`node tools/verify-browser.mjs` checks the real bundle in Chromium from a nested
hosting path, at high pixel density and multiple viewport sizes.
