import * as C from "./constants";
import type { DeepcoreState, Drill } from "./model";
import {
  at,
  cameraStep,
  cargoWeight,
  clamp,
  depth,
  grounded,
  liftLimit,
  minable,
} from "./world";
import { effect, signal } from "./session";
import {
  checkDeath,
  collect,
  damage,
  extract,
  timerStep,
} from "./transactions";

export interface Held {
  left: boolean;
  right: boolean;
  down: boolean;
  up: boolean;
}
export const FIXED_STEP = 1 / 120;

function solidAt(
  s: DeepcoreState,
  col: number,
  row: number,
  ignore: Drill | null,
): boolean {
  if (row < 1 && col >= C.PLAYABLE_COL_MIN && col <= C.PLAYABLE_COL_MAX)
    return false;
  if (
    ignore &&
    ignore.col === col &&
    ignore.row === row &&
    ignore.dir === "down"
  )
    return false;
  return at(s, col, row).kind !== "tunnel";
}
function move(s: DeepcoreState, dx: number, dy: number): void {
  const m = s.miner;
  if (!m.travel) return;
  m.x = clamp(m.x + dx, C.TILE, C.WORLD_W - C.TILE - C.MINER_W);
  let left = Math.floor((m.x + 0.001) / C.TILE),
    right = Math.floor((m.x + C.MINER_W - 0.001) / C.TILE);
  const top = Math.floor((m.y + 0.01) / C.TILE),
    bottom = Math.floor((m.y + C.MINER_H - 0.01) / C.TILE);
  for (let row = top; row <= bottom; row++)
    for (let col = left; col <= right; col++) {
      if (!solidAt(s, col, row, m.drilling)) continue;
      if (dx > 0) {
        m.x = col * C.TILE - C.MINER_W;
        m.vx = 0;
      }
      if (dx < 0) {
        m.x = (col + 1) * C.TILE;
        m.vx = 0;
      }
    }
  m.y += dy;
  left = Math.floor((m.x + 0.01) / C.TILE);
  right = Math.floor((m.x + C.MINER_W - 0.01) / C.TILE);
  const newTop = Math.floor((m.y + 0.001) / C.TILE),
    newBottom = Math.floor((m.y + C.MINER_H - 0.001) / C.TILE);
  for (let row = newTop; row <= newBottom; row++)
    for (let col = left; col <= right; col++) {
      if (!solidAt(s, col, row, m.drilling)) continue;
      if (dy > 0) {
        m.y = row * C.TILE - C.MINER_H;
        if (m.vy > C.IMPACT_SAFE_SPEED) {
          const amount = (m.vy - C.IMPACT_SAFE_SPEED) * C.IMPACT_DAMAGE_RATE;
          damage(s, amount);
          s.shake = Math.max(s.shake, Math.max(3, amount * 0.23));
          effect(s, "impact-dust", m.x + C.MINER_W / 2, m.y + C.MINER_H);
          signal(s, C.CUES.impact);
        }
        m.vy = 0;
      } else if (dy < 0) {
        m.y = (row + 1) * C.TILE;
        m.vy = 0;
      }
    }
}
function cutTarget(
  s: DeepcoreState,
  held: Held,
  onGround: boolean,
): Drill | null {
  const m = s.miner;
  if (!m.drill || !onGround || held.up || m.fuel < C.DRILL_HIT_FUEL)
    return null;
  if (held.down) {
    const old = m.drilling;
    const col = Math.floor((m.x + C.MINER_W / 2) / C.TILE);
    const feet = m.y + C.MINER_H;
    const continuing =
      old?.dir === "down" &&
      old.col === col &&
      feet >= old.row * C.TILE - 0.1 &&
      feet <= (old.row + 1) * C.TILE + 0.1;
    const row = continuing ? old.row : Math.floor((feet + 0.1) / C.TILE);
    const t = at(s, col, row);
    if (minable(t) || (t.kind === "core" && s.coreTimer === null))
      return { col, row, dir: "down", progress: 0 };
  }
  if (held.right || held.left) {
    const dir = held.right ? "right" : "left";
    const edge = dir === "right" ? m.x + C.MINER_W : m.x;
    if (Math.abs(edge / C.TILE - Math.round(edge / C.TILE)) > 0.005)
      return null;
    const col = Math.floor((edge + (dir === "right" ? 0.1 : -0.1)) / C.TILE);
    const row = Math.floor((m.y + C.MINER_H / 2) / C.TILE);
    if (minable(at(s, col, row))) return { col, row, dir, progress: 0 };
  }
  return null;
}
function drillStep(s: DeepcoreState, target: Drill | null, dt: number): void {
  const m = s.miner;
  if (!target) {
    if (
      m.drilling?.dir === "down" &&
      minable(at(s, m.drilling.col, m.drilling.row)) &&
      m.travel &&
      Math.floor((m.x + C.MINER_W / 2) / C.TILE) === m.drilling.col &&
      m.y + C.MINER_H > m.drilling.row * C.TILE &&
      m.y + C.MINER_H <= (m.drilling.row + 1) * C.TILE
    )
      m.y = m.drilling.row * C.TILE - C.MINER_H;
    m.drilling = null;
    s.drillClock = 0;
    return;
  }
  if (
    !m.drilling ||
    target.col !== m.drilling.col ||
    target.row !== m.drilling.row ||
    target.dir !== m.drilling.dir
  )
    s.drillClock = 0;
  m.drilling = target;
  s.drillClock += dt;
  let t = at(s, target.col, target.row);
  while (s.drillClock + 1e-10 >= C.DRILL_HIT_INTERVAL) {
    s.drillClock -= C.DRILL_HIT_INTERVAL;
    if (t.kind === "core") {
      extract(s);
      m.drilling = null;
      return;
    }
    if (!minable(t) || m.fuel < C.DRILL_HIT_FUEL) {
      m.drilling = null;
      return;
    }
    m.fuel = Math.max(0, m.fuel - C.DRILL_HIT_FUEL);
    const health = t.health! - C.DRILL_DAMAGE_TIERS[s.tiers.drill - 1];
    if (health <= 0) {
      const below = at(s, target.col, target.row + 1);
      const sinks =
        target.dir === "down" &&
        below.kind !== "tunnel" &&
        below.kind !== "lava";
      collect(s, target.col, target.row);
      if (sinks && m.travel) {
        m.y = (target.row + 1) * C.TILE - C.MINER_H;
        if (t.kind !== "gas") m.vy = 0;
      }
      m.drilling = null;
      return;
    }
    t = { ...t, health };
    s.grid[target.row][target.col] = t;
  }
  if (t.health !== null) {
    target.progress = 1 - t.health / t.maxHealth!;
    const below = at(s, target.col, target.row + 1);
    if (
      target.dir === "down" &&
      below.kind !== "tunnel" &&
      below.kind !== "lava" &&
      m.travel
    ) {
      const nextHit =
        Math.min(t.health, C.DRILL_DAMAGE_TIERS[s.tiers.drill - 1]) /
        t.maxHealth!;
      const fraction = clamp(
        target.progress + (nextHit * s.drillClock) / C.DRILL_HIT_INTERVAL,
        0,
        1,
      );
      m.y = target.row * C.TILE + fraction * C.TILE - C.MINER_H;
      m.vy = 0;
    }
  }
}
function contactsLava(s: DeepcoreState): boolean {
  const m = s.miner;
  for (
    let row = Math.floor((m.y - 0.1) / C.TILE);
    row <= Math.floor((m.y + C.MINER_H + 0.1) / C.TILE);
    row++
  )
    for (
      let col = Math.floor((m.x - 0.1) / C.TILE);
      col <= Math.floor((m.x + C.MINER_W + 0.1) / C.TILE);
      col++
    ) {
      if (m.drilling?.col === col && m.drilling.row === row) continue;
      if (at(s, col, row).kind === "lava") return true;
    }
  return false;
}
function animate(s: DeepcoreState, held: Held): void {
  const m = s.miner;
  const next: C.MinerState = m.drilling
    ? m.drilling.dir === "down"
      ? "drill-down"
      : "drill-side"
    : s.hurtLeft > 0
      ? "hurt"
      : m.fuel <= 0 && depth(s) > 0
        ? "fuel-out"
        : held.up && m.fuel > 0
          ? "jetpack"
          : !grounded(s)
            ? "fall"
            : m.travel && m.vx !== 0
              ? "walk"
              : "idle";
  if (next !== m.state) s.animationTime = 0;
  m.state = next;
}
/** Render-free fixed step. Faculty gates suppress only their named system. */
export function step(s: DeepcoreState, held: Held, dt: number): void {
  if (s.screen !== "in-mine") return;
  s.deepestDepthMeters = Math.max(s.deepestDepthMeters, depth(s));
  checkDeath(s);
  if (s.screen !== "in-mine") return;
  s.elapsedSeconds += dt;
  timerStep(s, dt);
  if (s.screen !== "in-mine") return;
  s.hurtLeft = Math.max(0, s.hurtLeft - dt);
  if (s.panel) {
    checkDeath(s);
    cameraStep(s, 0);
    return;
  }
  s.animationTime += dt;
  const m = s.miner;
  if (held.left) m.facing = "west";
  else if (held.right) m.facing = "east";
  const load = cargoWeight(s) / liftLimit(s);
  const jet = C.JETPACK_TIERS[s.tiers.jetpack - 1];
  const thrust = held.up && m.fuel > 0;
  let onGround = grounded(s);
  const dir = Number(held.right) - Number(held.left);
  if (m.travel) {
    if (dir || s.hurtLeft <= 0) m.vx = dir * C.WALK_SPEED;
    else m.vx *= Math.exp(-dt * 5);
    if (thrust) {
      const accel = jet.emptyAccel * Math.max(0, 1 - load);
      m.vy = Math.max(
        -jet.emptyClimb * (1 - (1 - C.CLIMB_CAP_FLOOR) * Math.min(1, load)),
        m.vy - accel * dt,
      );
    } else if (!m.drilling || m.drilling.dir !== "down")
      m.vy = Math.min(
        C.FALL_TERMINAL_EMPTY +
          (C.FALL_TERMINAL_LOADED - C.FALL_TERMINAL_EMPTY) * Math.min(1, load),
        m.vy + C.GRAVITY * dt,
      );
    move(s, m.vx * dt, m.drilling?.dir === "down" && !thrust ? 0 : m.vy * dt);
    onGround = grounded(s);
  }
  drillStep(s, cutTarget(s, held, onGround), dt);
  if (thrust)
    m.fuel -=
      (C.THRUST_BURN_MAX +
        (C.THRUST_BURN_MIN - C.THRUST_BURN_MAX) *
          Math.min(1, Math.max(0, -m.vy) / C.CRUISE_SPEED)) *
      C.THRUST_BURN_SIZE_MULT[s.worldSize] *
      dt;
  if (dir && !onGround) m.fuel -= C.AIR_BURN * dt;
  if (m.y + C.MINER_H > C.SURFACE_Y + 0.01) m.fuel -= C.LIFE_SUPPORT_BURN * dt;
  m.fuel = Math.max(0, m.fuel);
  if (contactsLava(s)) {
    damage(
      s,
      C.LAVA_CONTACT_DPS * (1 - C.RADIATOR_TIERS[s.tiers.radiator - 1]) * dt,
      "lava",
    );
    if (s.ambientClock <= dt) {
      effect(s, "lava-embers", m.x + C.MINER_W / 2, m.y + C.MINER_H);
      signal(s, C.CUES.lavaSizzle);
    }
  }
  s.deepestDepthMeters = Math.max(s.deepestDepthMeters, depth(s));
  animate(s, held);
  checkDeath(s);
  cameraStep(s, dt);
  s.ambientClock -= dt;
  if (s.ambientClock <= 0) {
    s.ambientClock += 0.12;
    if (m.drilling) {
      const d = m.drilling;
      effect(
        s,
        "drill-debris",
        d.dir === "down"
          ? m.x + C.MINER_W / 2
          : d.dir === "right"
            ? m.x + C.MINER_W
            : m.x,
        d.dir === "down" ? m.y + C.MINER_H : m.y + C.MINER_H / 2,
        at(s, d.col, d.row).band ?? undefined,
      );
    }
    if (thrust)
      effect(
        s,
        "jetpack-exhaust",
        m.x + (m.facing === "east" ? 8 : C.MINER_W - 8),
        m.y + C.MINER_H - 5,
      );
  }
}
export function ambientGas(s: DeepcoreState, oldTime: number): void {
  if (
    Math.floor(oldTime / C.GAS_SEEP_PERIOD) ===
    Math.floor(s.elapsedSeconds / C.GAS_SEEP_PERIOD)
  )
    return;
  for (
    let row = Math.max(1, Math.floor(s.camera.y / C.TILE));
    row <= Math.min(s.coreRow, Math.ceil((s.camera.y + C.VIEW_H) / C.TILE));
    row++
  )
    for (
      let col = Math.max(C.PLAYABLE_COL_MIN, Math.floor(s.camera.x / C.TILE));
      col <=
      Math.min(C.PLAYABLE_COL_MAX, Math.ceil((s.camera.x + C.VIEW_W) / C.TILE));
      col++
    ) {
      if (at(s, col, row).kind === "gas")
        effect(s, "gas-seep", (col + 0.5) * C.TILE, (row + 0.7) * C.TILE);
    }
}
export function visualStep(s: DeepcoreState, dt: number): void {
  if (s.screen === "game-over") s.animationTime += dt;
  s.effects = s.effects
    .map((e) => ({ ...e, age: e.age + dt }))
    .filter((e) => {
      const emitters = s.assets.effects[e.name]?.emitters;
      const lifetime = emitters
        ? Math.max(
            ...emitters.map(
              (p) =>
                (p.lifetimeMs +
                  (p.lifetimeSpread ?? 0) +
                  (p.emission.mode === "burst" ? p.emission.atMs : 0)) /
                1000,
            ),
          )
        : 2.4;
      return e.age < lifetime;
    });
  s.shake = Math.max(0, s.shake - dt * 15);
  s.noteLeft = Math.max(0, s.noteLeft - dt);
  if (s.notice && s.screen === "in-mine") {
    s.notice.age += dt;
    s.notice.shown = s.notice.age >= C.NOTICE_DELAY;
    if (s.notice.age > C.NOTICE_DELAY + C.NOTICE_FADE) s.notice = null;
  }
  if (s.launchTime !== null) {
    const previous = s.launchTime;
    s.launchTime += dt;
    if (
      s.launchTime < 3.2 &&
      Math.floor(previous / 0.12) !== Math.floor(s.launchTime / 0.12)
    )
      effect(
        s,
        "launch-exhaust",
        2300,
        C.SURFACE_Y - Math.max(0, s.launchTime - 0.25) ** 2 * 100,
      );
  }
}
