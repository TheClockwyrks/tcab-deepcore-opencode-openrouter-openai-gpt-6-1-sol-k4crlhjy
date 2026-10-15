import * as C from "./constants";
import type { ReadState } from "./model";
import {
  at,
  cargoSlots,
  cargoWeight,
  depth,
  grounded,
  liftLimit,
  maxFuel,
  maxHull,
  minerCell,
  scanner,
} from "./world";

export function snapshot(s: ReadState) {
  const cell = minerCell(s);
  const drilling = s.miner.drilling;
  const target = drilling ? at(s, drilling.col, drilling.row) : null;
  return {
    version: C.DEEPCORE_DEBUG_VERSION,
    screen: s.screen,
    panel: s.panel,
    mode: s.mode,
    worldSize: s.worldSize,
    coreRow: s.coreRow,
    menuIndex: s.menuIndex,
    muted: s.muted,
    simTime: s.simTime,
    elapsedSeconds: s.elapsedSeconds,
    hasSave: s.hasSave,
    credits: s.credits,
    creditsEarned: s.creditsEarned,
    depthMeters: depth(s),
    deepestDepthMeters: s.deepestDepthMeters,
    coreTimer: s.coreTimer,
    coreGround: s.coreGround ? { ...s.coreGround } : null,
    camera: { ...s.camera },
    miner: {
      ...s.miner,
      ...cell,
      grounded: grounded(s),
      maxFuel: maxFuel(s),
      maxHull: maxHull(s),
      overloaded: cargoWeight(s) >= liftLimit(s),
      drilling: drilling
        ? {
            ...drilling,
            progress:
              target?.health !== null && target?.maxHealth
                ? 1 - target.health! / target.maxHealth
                : 0,
          }
        : null,
    },
    cargo: {
      slotsUsed: cargoSlots(s),
      slotCap: C.CARGO_TIERS[s.tiers.cargo - 1],
      loadKg: cargoWeight(s),
      liftLimitKg: liftLimit(s),
      ore: Object.fromEntries(
        Object.entries(s.cargo).filter(([, n]) => n! > 0),
      ),
    },
    satchel: { ...s.satchel },
    tiers: { ...s.tiers },
    items: { ...s.items },
    nextTeleportHeight: s.nextTeleportHeight,
    nextTeleportSpeed: s.nextTeleportSpeed,
    rocket: {
      installed: C.ROCKET_COMPONENT_IDS.slice(0, s.rocketInstalled),
      nextComponent: C.ROCKET_COMPONENT_IDS[s.rocketInstalled] ?? null,
    },
    scanner: scanner(s),
    notice: s.notice
      ? { hazard: s.notice.hazard, shown: s.notice.shown }
      : null,
    noticesFired: { ...s.noticesFired },
    summary: s.summary ? { ...s.summary } : null,
  };
}
