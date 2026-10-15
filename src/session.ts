import * as C from "./constants";
import { copy, type Assets, type DeepcoreState, type ReadState } from "./model";
import { cameraStep, emptyMine, generate, tile } from "./world";

const SAVE_KEY = "deepcore.expedition.v1";
type PackedTile = [number, number, number, number, number | null];
interface SaveEnvelope {
  version: number;
  state: Omit<Partial<DeepcoreState>, "grid"> & { grid: PackedTile[][] };
}
export function loadSave(): Partial<DeepcoreState> | null {
  try {
    const raw = globalThis.localStorage?.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as SaveEnvelope;
    const s = data.state;
    if (
      data.version !== C.DEEPCORE_DEBUG_VERSION ||
      !s ||
      !Array.isArray(s.grid) ||
      !s.tiers ||
      !s.miner ||
      !s.items ||
      !s.cargo ||
      !s.satchel ||
      !s.noticesFired ||
      !C.WORLD_SIZES.includes(s.worldSize!) ||
      !C.MODES.includes(s.mode!) ||
      s.grid.length !== s.coreRow! + 1
    )
      return null;
    if (
      s.coreRow !==
      Math.round(C.STANDARD_ROWS * C.WORLD_SIZE_SCALE[s.worldSize!])
    )
      return null;
    if (
      C.TRACKS.some(
        (t) =>
          !Number.isInteger(s.tiers![t]) ||
          s.tiers![t] < 1 ||
          s.tiers![t] > C.MAX_TIER[t],
      )
    )
      return null;
    if (
      C.ITEM_IDS.some(
        (id) => !Number.isInteger(s.items![id]) || s.items![id] < 0,
      )
    )
      return null;
    if (
      ![
        s.credits,
        s.creditsEarned,
        s.elapsedSeconds,
        s.deepestDepthMeters,
        s.miner.fuel,
        s.miner.hull,
        s.satchel.resonite,
        s.satchel.cryenite,
      ].every((v) => typeof v === "number" && Number.isFinite(v) && v >= 0)
    )
      return null;
    if (
      !Number.isInteger(s.rocketInstalled) ||
      s.rocketInstalled! < 0 ||
      s.rocketInstalled! > C.ROCKET_COMPONENTS.length
    )
      return null;
    const grid = s.grid.map((row) => {
      if (!Array.isArray(row) || row.length !== C.WORLD_COLS)
        throw new Error("Invalid saved row");
      return row.map((packed) => {
        if (!Array.isArray(packed) || packed.length !== 5)
          throw new Error("Invalid saved cell");
        const [kind, band, ore, material, health] = packed;
        if (
          !C.TILE_KINDS[kind] ||
          band < -1 ||
          band >= C.BANDS.length ||
          ore < -1 ||
          ore >= C.MINERALS.length ||
          material < -1 ||
          material >= C.MATERIALS.length
        )
          throw new Error("Invalid saved tile id");
        const t = tile(
          C.TILE_KINDS[kind],
          C.BANDS[band] ?? null,
          C.MINERALS[ore]?.id ?? null,
          C.MATERIALS[material] ?? null,
        );
        if (
          t.health !== null &&
          (health === null || health <= 0 || health > t.maxHealth!)
        )
          throw new Error("Invalid saved health");
        return { ...t, health };
      });
    });
    return { ...s, grid };
  } catch {
    return null;
  }
}
export function deleteSave(s: DeepcoreState): void {
  try {
    globalThis.localStorage?.removeItem(SAVE_KEY);
  } catch {
    /* Storage is optional. */
  }
  s.hasSave = false;
}
export function note(s: DeepcoreState, text: string): void {
  s.note = text;
  s.noteLeft = 4;
}
export function signal(s: DeepcoreState, cue: C.CueName): void {
  s.signals.push({ cue });
}
export function effect(
  s: DeepcoreState,
  name: string,
  x: number,
  y: number,
  tint?: string,
): void {
  s.effects.push({
    id: s.nextEffect++,
    name,
    x,
    y,
    age: 0,
    seed: s.nextEffect * 7127,
    tint,
  });
}
export function initial(assets: Assets, muted = false): DeepcoreState {
  const coreRow = Math.round(C.STANDARD_ROWS * C.WORLD_SIZE_SCALE.standard);
  const s: DeepcoreState = {
    assets,
    screen: "title",
    panel: null,
    mode: "standard",
    worldSize: "standard",
    coreRow,
    menuIndex: 0,
    muted,
    simTime: 0,
    elapsedSeconds: 0,
    hasSave: loadSave() !== null,
    credits: 0,
    creditsEarned: 0,
    deepestDepthMeters: 0,
    grid: emptyMine(coreRow),
    miner: {
      x: C.SPAWN_COL * C.TILE + (C.TILE - C.MINER_W) / 2,
      y: C.SURFACE_Y - C.MINER_H,
      vx: 0,
      vy: 0,
      facing: "east",
      state: "idle",
      travel: true,
      drill: true,
      fuel: C.FUEL_TIERS[0],
      hull: C.HULL_TIERS[0],
      drilling: null,
    },
    camera: { x: 0, y: 0, lead: 0 },
    cargo: {},
    satchel: { resonite: 0, cryenite: 0, coreSample: false },
    tiers: Object.fromEntries(C.TRACKS.map((t) => [t, 1])) as Record<
      C.TrackName,
      number
    >,
    items: Object.fromEntries(C.ITEM_IDS.map((i) => [i, 0])) as Record<
      C.ItemId,
      number
    >,
    rocketInstalled: 0,
    coreTimer: null,
    coreGround: null,
    noticesFired: { gas: false, lava: false },
    notice: null,
    summary: null,
    nextTeleportHeight: null,
    nextTeleportSpeed: null,
    seed: 71026,
    accumulator: 0,
    drillClock: 0,
    animationTime: 0,
    hurtLeft: 0,
    effects: [],
    nextEffect: 1,
    signals: [],
    shake: 0,
    note: "",
    noteLeft: 0,
    pointerDown: {},
    hover: null,
    ambientClock: 0,
    alarmClock: 0,
    launchTime: null,
  };
  cameraStep(s, 0);
  return s;
}
export function start(s: ReadState): DeepcoreState {
  const next = initial(s.assets as Assets, s.muted);
  next.mode = s.mode;
  next.worldSize = s.worldSize;
  next.coreRow = Math.round(C.STANDARD_ROWS * C.WORLD_SIZE_SCALE[s.worldSize]);
  next.screen = "in-mine";
  next.simTime = s.simTime;
  next.seed = (s.seed + 956719) >>> 0;
  generate(next);
  deleteSave(next);
  cameraStep(next, 0);
  note(next, "First shift. Dig for ore, then bring it home.");
  return next;
}
export function save(s: DeepcoreState): void {
  if (s.coreTimer !== null) {
    note(s, "Cannot save: a Core Sample is destabilizing.");
    return;
  }
  const payload = {
    mode: s.mode,
    worldSize: s.worldSize,
    coreRow: s.coreRow,
    // Compact tuples keep even a Marathon mine well within browser slot quotas.
    grid: s.grid.map((row) =>
      row.map(
        (t) =>
          [
            C.TILE_KINDS.indexOf(t.kind),
            t.band === null ? -1 : C.BANDS.indexOf(t.band),
            t.ore === null ? -1 : C.MINERALS.findIndex((o) => o.id === t.ore),
            t.material === null ? -1 : C.MATERIALS.indexOf(t.material),
            t.health,
          ] as PackedTile,
      ),
    ),
    credits: s.credits,
    creditsEarned: s.creditsEarned,
    tiers: s.tiers,
    rocketInstalled: s.rocketInstalled,
    items: s.items,
    cargo: s.cargo,
    satchel: s.satchel,
    miner: s.miner,
    noticesFired: s.noticesFired,
    elapsedSeconds: s.elapsedSeconds,
    deepestDepthMeters: s.deepestDepthMeters,
    seed: s.seed,
  };
  try {
    if (!globalThis.localStorage) throw new Error("No storage");
    globalThis.localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({ version: C.DEEPCORE_DEBUG_VERSION, state: payload }),
    );
    s.hasSave = true;
    note(s, "Expedition saved. Your next shift starts here.");
    signal(s, C.CUES.fabricate);
  } catch {
    note(s, "Storage unavailable. Keep this expedition open.");
  }
}
export function resume(s: ReadState): DeepcoreState {
  const saved = loadSave();
  if (!saved) {
    const n = copy(s);
    n.hasSave = false;
    note(n, "No expedition in the save slot.");
    return n;
  }
  const next = initial(s.assets as Assets, s.muted);
  Object.assign(next, saved);
  next.miner = {
    ...next.miner,
    x: C.SPAWN_COL * C.TILE + (C.TILE - C.MINER_W) / 2,
    y: C.SURFACE_Y - C.MINER_H,
    vx: 0,
    vy: 0,
    drilling: null,
    state: "idle",
    travel: true,
    drill: true,
  };
  next.screen = "in-mine";
  next.panel = null;
  next.hasSave = true;
  next.simTime = s.simTime;
  cameraStep(next, 0);
  note(next, "Expedition restored. Welcome back, prospector.");
  return next;
}
export function end(s: DeepcoreState, cause: C.DeathCause | null): void {
  if (s.screen === "game-over" || s.screen === "victory") return;
  s.summary = {
    deepestDepthMeters: s.deepestDepthMeters,
    creditsEarned: s.creditsEarned,
    elapsedSeconds: s.elapsedSeconds,
    mode: s.mode,
    componentsInstalled: s.rocketInstalled,
    deathCause: cause,
  };
  s.screen = cause ? "game-over" : "victory";
  s.panel = null;
  s.menuIndex = 0;
  s.coreTimer = null;
  s.coreGround = null;
  s.satchel.coreSample = false;
  if (cause) {
    s.animationTime = 0;
    if (cause === "fuel-out") s.miner.state = "fuel-out";
    else s.miner.state = "hurt";
    effect(
      s,
      "death-burst",
      s.miner.x + C.MINER_W / 2,
      s.miner.y + C.MINER_H / 2,
    );
    signal(s, C.CUES.death);
  }
  if (!cause || s.mode === "hardcore") deleteSave(s);
}
