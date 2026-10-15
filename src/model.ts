import type { DeepReadonly } from "ts-essentials";
import type { ParticleSystem } from "@clockwyrks/particle-runtime";
import type * as C from "./constants";

export interface Tile {
  readonly kind: C.TileKind;
  readonly band: C.BandName | null;
  readonly ore: C.OreId | null;
  readonly material: C.MaterialId | null;
  readonly health: number | null;
  readonly maxHealth: number | null;
}
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Assets {
  images: Record<string, ImageBitmap>;
  effects: Record<string, ParticleSystem>;
}
export interface Drill {
  col: number;
  row: number;
  dir: "down" | "left" | "right";
  progress: number;
}
export interface Miner {
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: C.Facing;
  state: C.MinerState;
  travel: boolean;
  drill: boolean;
  fuel: number;
  hull: number;
  drilling: Drill | null;
}
export interface Summary {
  deepestDepthMeters: number;
  creditsEarned: number;
  elapsedSeconds: number;
  mode: C.Mode;
  componentsInstalled: number;
  deathCause: C.DeathCause | null;
}
export interface Effect {
  id: number;
  name: string;
  x: number;
  y: number;
  age: number;
  seed: number;
  tint?: string;
}
export interface Signal {
  cue: C.CueName;
}
export interface DeepcoreState {
  assets: Assets;
  screen: C.ScreenName;
  panel: C.PanelId | null;
  mode: C.Mode;
  worldSize: C.WorldSize;
  coreRow: number;
  menuIndex: number;
  muted: boolean;
  simTime: number;
  elapsedSeconds: number;
  hasSave: boolean;
  credits: number;
  creditsEarned: number;
  deepestDepthMeters: number;
  grid: Tile[][];
  miner: Miner;
  camera: { x: number; y: number; lead: number };
  cargo: Partial<Record<C.OreId, number>>;
  satchel: { resonite: number; cryenite: number; coreSample: boolean };
  tiers: Record<C.TrackName, number>;
  items: Record<C.ItemId, number>;
  rocketInstalled: number;
  coreTimer: number | null;
  coreGround: { col: number; row: number } | null;
  noticesFired: Record<C.NoticeHazard, boolean>;
  notice: { hazard: C.NoticeHazard; shown: boolean; age: number } | null;
  summary: Summary | null;
  nextTeleportHeight: number | null;
  nextTeleportSpeed: number | null;
  seed: number;
  accumulator: number;
  drillClock: number;
  animationTime: number;
  hurtLeft: number;
  effects: Effect[];
  nextEffect: number;
  signals: Signal[];
  shake: number;
  note: string;
  noteLeft: number;
  pointerDown: Record<number, string>;
  hover: string | null;
  ambientClock: number;
  alarmClock: number;
  launchTime: number | null;
}
export type ReadState = DeepReadonly<DeepcoreState>;

/** Only private, newly allocated copies are edited during a transition. Tiles and
 * decoded assets are immutable values and can be shared between frames. */
export function copy(s: ReadState): DeepcoreState {
  return {
    ...s,
    assets: s.assets as Assets,
    grid: s.grid.map((row) => row.slice()),
    miner: {
      ...s.miner,
      drilling: s.miner.drilling ? { ...s.miner.drilling } : null,
    },
    camera: { ...s.camera },
    cargo: { ...s.cargo },
    satchel: { ...s.satchel },
    tiers: { ...s.tiers },
    items: { ...s.items },
    noticesFired: { ...s.noticesFired },
    notice: s.notice ? { ...s.notice } : null,
    coreGround: s.coreGround ? { ...s.coreGround } : null,
    summary: s.summary ? { ...s.summary } : null,
    effects: s.effects.map((e) => ({ ...e })),
    signals: s.signals.map((e) => ({ ...e })),
    pointerDown: { ...s.pointerDown },
  };
}
