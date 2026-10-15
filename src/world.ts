import * as C from "./constants";
import type { DeepcoreState, ReadState, Tile, Rect } from "./model";

export const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));
export const depthFraction = (row: number, core: number) =>
  (row - 1) / (core - 1);
export const bandAt = (row: number, core: number): C.BandName =>
  C.BANDS[
    clamp(Math.floor(4 * depthFraction(row, core)), 0, C.BANDS.length - 1)
  ];
export const minable = (t: Tile) => t.health !== null;
export function tile(
  kind: C.TileKind,
  band: C.BandName | null,
  ore: C.OreId | null = null,
  material: C.MaterialId | null = null,
): Tile {
  const health =
    ["rock", "ore", "material", "gas", "lava"].includes(kind) && band
      ? C.BAND_HEALTH[band]
      : null;
  return { kind, band, ore, material, health, maxHealth: health };
}
export const OUTSIDE: Tile = tile("bedrock", null);
export function at(s: ReadState, col: number, row: number): Tile {
  if (row < 0 && col >= C.PLAYABLE_COL_MIN && col <= C.PLAYABLE_COL_MAX)
    return tile("tunnel", null);
  return s.grid[row]?.[col] ?? OUTSIDE;
}
export function emptyMine(core: number): Tile[][] {
  return Array.from({ length: core + 1 }, (_, row) =>
    Array.from({ length: C.WORLD_COLS }, (_, col) => {
      if (col === 0 || col === C.WORLD_COLS - 1 || row === core)
        return tile(
          row === core && col === C.CORE_COL ? "core" : "bedrock",
          null,
        );
      return tile("tunnel", row === 0 ? null : bandAt(row, core));
    }),
  );
}
export function random(s: DeepcoreState): number {
  s.seed = (Math.imul(s.seed, 1664525) + 1013904223) >>> 0;
  return s.seed / 4294967296;
}
function shuffled<T>(s: DeepcoreState, values: T[]): T[] {
  for (let i = values.length - 1; i > 0; i--) {
    const j = Math.floor(random(s) * (i + 1));
    [values[i], values[j]] = [values[j], values[i]];
  }
  return values;
}
export function generate(s: DeepcoreState): void {
  // Entropy is sampled only when a fresh mine is requested, never per frame.
  // Its PRNG then owns all placement and weighted mineral draws for that mine.
  s.seed = (s.seed ^ Math.floor(Math.random() * 4294967296)) >>> 0;
  const grid = emptyMine(s.coreRow);
  const nodes = C.MATERIALS.map((material) => {
    const rows = Array.from({ length: s.coreRow - 1 }, (_, i) => i + 1).filter(
      (r) => bandAt(r, s.coreRow) === C.MATERIAL_BAND[material],
    );
    return {
      material,
      row: rows[Math.floor(random(s) * rows.length)],
      col: 2 + Math.floor(random(s) * (C.PLAYABLE_COL_MAX - 2)),
    };
  });
  const safe = (col: number, row: number) =>
    col === C.CAVE_MOUTH_COL ||
    (row === s.coreRow - 1 && col >= C.CORE_COL && col <= C.CAVE_MOUTH_COL) ||
    nodes.some(
      (n) =>
        n.row === row &&
        col >= Math.min(n.col, C.CAVE_MOUTH_COL) &&
        col <= Math.max(n.col, C.CAVE_MOUTH_COL),
    );
  for (const band of C.BANDS) {
    const cells: { col: number; row: number }[] = [];
    for (let row = 1; row < s.coreRow; row++)
      if (bandAt(row, s.coreRow) === band) {
        for (let col = C.PLAYABLE_COL_MIN; col <= C.PLAYABLE_COL_MAX; col++) {
          grid[row][col] = tile("rock", band);
          cells.push({ col, row });
        }
      }
    const avg =
      cells.reduce((sum, c) => sum + depthFraction(c.row, s.coreRow), 0) /
      cells.length;
    const eligible = shuffled(
      s,
      cells.filter((c) => !safe(c.col, c.row)),
    );
    const density = (a: number, b: number, start: number) =>
      a + ((b - a) * (avg - start)) / (1 - start);
    // Pool growth picks neighbors before a new seed, keeping lava contiguous.
    if (C.BANDS.indexOf(band) >= 2) {
      let left = Math.round(
        cells.length * density(C.LAVA_DENSITY_MIN, C.LAVA_DENSITY_MAX, 0.5),
      );
      for (const c of eligible) {
        if (left <= 0) break;
        for (let dy = 0; dy < 2; dy++)
          for (let dx = 0; dx < 3; dx++) {
            const col = c.col + dx,
              row = c.row + dy;
            if (
              left > 0 &&
              col <= C.PLAYABLE_COL_MAX &&
              row < s.coreRow &&
              bandAt(row, s.coreRow) === band &&
              !safe(col, row) &&
              grid[row][col].kind === "rock"
            ) {
              grid[row][col] = tile("lava", band);
              left--;
            }
          }
      }
    }
    for (const [kind, count] of [
      [
        "stone",
        C.BANDS.indexOf(band) >= 1
          ? Math.round(
              cells.length *
                density(C.STONE_DENSITY_MIN, C.STONE_DENSITY_MAX, 0.25),
            )
          : 0,
      ],
      [
        "gas",
        C.BANDS.indexOf(band) >= 1
          ? Math.round(
              cells.length *
                density(C.GAS_DENSITY_MIN, C.GAS_DENSITY_MAX, 0.25),
            )
          : 0,
      ],
    ] as const) {
      let left = count;
      for (const c of eligible)
        if (left > 0 && grid[c.row][c.col].kind === "rock") {
          grid[c.row][c.col] = tile(kind, band);
          left--;
        }
    }
    let oreLeft = Math.round(
      cells.filter((c) => c.row >= C.ORE_MIN_ROW).length * C.ORE_DENSITY,
    );
    for (const c of shuffled(
      s,
      cells.filter((c) => c.row >= C.ORE_MIN_ROW),
    )) {
      if (oreLeft <= 0) break;
      if (grid[c.row][c.col].kind !== "rock") continue;
      const f = depthFraction(c.row, s.coreRow);
      const weights = C.MINERALS.map(
        (o) => o.pick * Math.max(0, 1 - Math.abs(f - o.peak) / o.spread),
      );
      let pick = random(s) * weights.reduce((a, b) => a + b, 0);
      const index = weights.findIndex((w) => (pick -= w) <= 0);
      grid[c.row][c.col] = tile("ore", band, C.MINERALS[Math.max(0, index)].id);
      oreLeft--;
    }
  }
  for (const n of nodes)
    grid[n.row][n.col] = tile(
      "material",
      C.MATERIAL_BAND[n.material],
      null,
      n.material,
    );
  grid[1][C.CAVE_MOUTH_COL] = tile("tunnel", bandAt(1, s.coreRow));
  s.grid = grid;
}

export const buildingFootprints: (Rect & { id: C.BuildingId })[] =
  C.BUILDINGS.map((id, i) => {
    const x = [130, 460, 800, 1120, 1450, 2200][i];
    const w = id === "launch-pad" ? 200 : 240;
    const h = id === "launch-pad" ? 220 : 180;
    return { id, x, y: C.SURFACE_Y - h, w, h };
  });
export function minerCell(s: ReadState) {
  return {
    col: Math.floor((s.miner.x + C.MINER_W / 2) / C.TILE),
    row: Math.max(0, Math.floor((s.miner.y + C.MINER_H / 2) / C.TILE)),
  };
}
export function grounded(s: ReadState): boolean {
  const m = s.miner;
  const feet = m.y + C.MINER_H;
  const d = m.drilling;
  if (
    d?.dir === "down" &&
    minable(at(s, d.col, d.row)) &&
    Math.floor((m.x + C.MINER_W / 2) / C.TILE) === d.col &&
    feet >= d.row * C.TILE - 0.1 &&
    feet <= (d.row + 1) * C.TILE + 0.1
  )
    return true;
  if (feet < C.SURFACE_Y - 0.01) return false;
  const row = Math.floor((feet + 0.1) / C.TILE);
  if (Math.abs(feet - row * C.TILE) > 0.5) return false;
  return [m.x + 0.1, m.x + C.MINER_W - 0.1].some(
    (x) => at(s, Math.floor(x / C.TILE), row).kind !== "tunnel",
  );
}
export function atBuilding(s: ReadState, b: Rect): boolean {
  const center = s.miner.x + C.MINER_W / 2;
  return (
    center >= b.x &&
    center <= b.x + b.w &&
    Math.abs(s.miner.y + C.MINER_H - C.SURFACE_Y) < 0.5 &&
    grounded(s)
  );
}
export const depth = (s: ReadState) =>
  Math.max(
    0,
    ((s.miner.y + C.MINER_H - C.SURFACE_Y) / C.TILE) * C.METERS_PER_ROW,
  );
export const maxFuel = (s: ReadState) => C.FUEL_TIERS[s.tiers.fuel - 1];
export const maxHull = (s: ReadState) => C.HULL_TIERS[s.tiers.hull - 1];
export const cargoSlots = (s: ReadState) =>
  Object.values(s.cargo).reduce((a, b) => a + (b ?? 0), 0);
export const cargoWeight = (s: ReadState) =>
  C.MINERALS.reduce((a, o) => a + (s.cargo[o.id] ?? 0) * o.weightKg, 0);
export const cargoValue = (s: ReadState) =>
  C.MINERALS.reduce((a, o) => a + (s.cargo[o.id] ?? 0) * o.value, 0);
export const liftLimit = (s: ReadState) =>
  C.JETPACK_TIERS[s.tiers.jetpack - 1].liftLimitKg;
export function scanner(s: ReadState) {
  const empty = {
    locked: false,
    target: null,
    dirX: 0,
    dirY: 0,
    distanceTiles: null,
  };
  const range = C.SCANNER_TIERS[s.tiers.scanner - 1];
  if (range === null) return empty;
  const mc = minerCell(s);
  let nearest: {
    target: C.MaterialId;
    dx: number;
    dy: number;
    distance: number;
  } | null = null;
  for (
    let row = Math.max(1, mc.row - range);
    row <= Math.min(s.coreRow - 1, mc.row + range);
    row++
  ) {
    for (let col = C.PLAYABLE_COL_MIN; col <= C.PLAYABLE_COL_MAX; col++) {
      const t = at(s, col, row);
      if (!t.material || s.satchel[t.material] > 0) continue;
      const dx = col - mc.col,
        dy = row - mc.row,
        distance = Math.hypot(dx, dy);
      if (distance <= range && (!nearest || distance < nearest.distance))
        nearest = { target: t.material, dx, dy, distance };
    }
  }
  if (!nearest) return empty;
  return {
    locked: true,
    target: nearest.target,
    dirX: nearest.dx / (nearest.distance || 1),
    dirY: nearest.dy / (nearest.distance || 1),
    distanceTiles: nearest.distance,
  };
}
export function cameraStep(s: DeepcoreState, dt: number): void {
  const target =
    Math.abs(s.miner.vy) <= C.CAM_STILL_SPEED
      ? 0
      : Math.sign(s.miner.vy) * C.CAM_LEAD_MAX;
  const current = s.camera.lead;
  let remaining = dt;
  let lead = current;
  if (lead !== 0 && (target === 0 || Math.sign(target) !== Math.sign(lead))) {
    const rate = (C.CAM_LEAD_MAX / C.CAM_LEAD_RAMP) * C.CAM_UNWIND_MULT;
    const used = Math.min(remaining, Math.abs(lead) / rate);
    lead -= Math.sign(lead) * used * rate;
    remaining -= used;
  }
  const rate = C.CAM_LEAD_MAX / C.CAM_LEAD_RAMP;
  lead +=
    Math.sign(target - lead) *
    Math.min(Math.abs(target - lead), remaining * rate);
  s.camera = {
    x: clamp(s.miner.x + C.MINER_W / 2 - C.VIEW_W / 2, 0, C.WORLD_W - C.VIEW_W),
    y: Math.min(
      s.miner.y + C.MINER_H / 2 - C.VIEW_H / 2 + lead,
      (s.coreRow + 1) * C.TILE - C.VIEW_H,
    ),
    lead,
  };
}
