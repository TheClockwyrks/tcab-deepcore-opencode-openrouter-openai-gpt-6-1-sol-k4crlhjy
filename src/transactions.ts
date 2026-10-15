import * as C from "./constants";
import type { DeepcoreState } from "./model";
import {
  at,
  cargoSlots,
  cargoValue,
  depthFraction,
  maxFuel,
  maxHull,
  minerCell,
  random,
  tile,
} from "./world";
import { effect, end, note, save, signal } from "./session";

export { save };
const mineralColors = [
  "#bfaa89",
  "#e7ba65",
  "#da8552",
  "#d0e2df",
  "#699ed5",
  "#9edcb2",
  "#c9a9ed",
  "#edaa49",
  "#ef7271",
  "#b7f5eb",
  "#65deab",
  "#f296bf",
  "#ffd986",
];
export function damage(
  s: DeepcoreState,
  amount: number,
  hazard?: C.NoticeHazard,
): void {
  if (amount <= 0) return;
  s.miner.hull = Math.max(0, s.miner.hull - amount);
  s.hurtLeft = C.HURT_TIME;
  if (hazard && !s.noticesFired[hazard]) {
    s.noticesFired[hazard] = true;
    s.notice = { hazard, shown: false, age: 0 };
  }
}
export function blastGas(s: DeepcoreState, col: number, row: number): void {
  const x = (col + 0.5) * C.TILE,
    y = (row + 0.5) * C.TILE;
  s.grid[row][col] = tile("tunnel", at(s, col, row).band);
  effect(s, "gas-explosion", x, y);
  signal(s, C.CUES.gasExplosion);
  s.shake = Math.max(s.shake, 15);
  const dx = s.miner.x + C.MINER_W / 2 - x,
    dy = s.miner.y + C.MINER_H / 2 - y;
  const dist = Math.hypot(dx, dy);
  if (dist <= C.GAS_BLAST_TILES * C.TILE) {
    damage(
      s,
      C.GAS_DAMAGE_MIN +
        ((C.GAS_DAMAGE_MAX - C.GAS_DAMAGE_MIN) *
          Math.max(0, depthFraction(row, s.coreRow) - 0.25)) /
          0.75,
      "gas",
    );
    if (s.miner.travel) {
      s.miner.vx = (dx / (dist || 1)) * C.GAS_KNOCKBACK;
      s.miner.vy = (dy / (dist || 1)) * C.GAS_KNOCKBACK;
    }
  }
}
export function collect(s: DeepcoreState, col: number, row: number): void {
  const t = at(s, col, row),
    x = (col + 0.5) * C.TILE,
    y = (row + 0.5) * C.TILE;
  if (t.ore) {
    if (cargoSlots(s) < C.CARGO_TIERS[s.tiers.cargo - 1]) {
      s.cargo[t.ore] = (s.cargo[t.ore] ?? 0) + 1;
      effect(
        s,
        "ore-sparkle",
        x,
        y,
        mineralColors[C.MINERALS.findIndex((o) => o.id === t.ore)],
      );
      signal(s, C.CUES.orePickup);
      const ore = C.MINERALS.find((o) => o.id === t.ore)!;
      note(s, `+ ${ore.name}  /  ${ore.value} Credits  /  ${ore.weightKg} kg`);
    } else note(s, "Cargo full. Ore left behind — sell or drop a unit.");
  }
  if (t.material) {
    s.satchel[t.material]++;
    effect(
      s,
      "material-shimmer",
      x,
      y,
      t.material === "resonite" ? "#a5efc0" : "#a7caff",
    );
    signal(s, C.CUES.materialChime);
    note(s, `${t.material.toUpperCase()} secured. Bring it to the Launch Pad.`);
  }
  if (t.kind === "gas") blastGas(s, col, row);
  else {
    if (t.kind === "lava") {
      damage(
        s,
        (t.band === "coreshell"
          ? C.LAVA_DRILL_CORESHELL
          : C.LAVA_DRILL_DEEPSTONE) *
          (1 - C.RADIATOR_TIERS[s.tiers.radiator - 1]),
        "lava",
      );
      effect(s, "lava-embers", x, y);
      signal(s, C.CUES.lavaSizzle);
    }
    s.grid[row][col] = tile("tunnel", t.band);
  }
}
export function extract(s: DeepcoreState): void {
  if (s.coreTimer !== null) return;
  s.satchel.coreSample = true;
  s.coreTimer = C.CORE_TIMER;
  effect(
    s,
    "core-extract",
    (C.CORE_COL + 0.5) * C.TILE,
    (s.coreRow + 0.5) * C.TILE,
  );
  signal(s, C.CUES.materialChime);
  note(s, "CORE SAMPLE EXTRACTED. Ninety seconds to make it count.");
}
export function dropOre(s: DeepcoreState, ore: C.OreId): void {
  if ((s.cargo[ore] ?? 0) <= 0) {
    note(s, "None of that mineral is held.");
    return;
  }
  s.cargo[ore]!--;
  if (s.cargo[ore] === 0) delete s.cargo[ore];
  note(s, "One unit discarded. Less weight for the climb.");
}
export function sell(s: DeepcoreState): void {
  const value = cargoValue(s);
  if (value <= 0) {
    note(s, "The cargo bay is empty.");
    return;
  }
  s.credits += value;
  s.creditsEarned += value;
  s.cargo = {};
  signal(s, C.CUES.fabricate);
  note(s, `Haul sold. +${value.toLocaleString()} Credits.`);
}
export function replenish(
  s: DeepcoreState,
  hull: boolean,
  full: boolean,
): void {
  const field = hull ? "hull" : "fuel",
    price = hull ? C.REPAIR_PRICE : C.FUEL_PRICE;
  const maximum = hull ? maxHull(s) : maxFuel(s);
  const increment = full
    ? maximum
    : hull
      ? C.REPAIR_BUY_INCREMENT
      : C.FUEL_BUY_INCREMENT;
  const wanted = Math.min(increment, Math.max(0, maximum - s.miner[field]));
  if (!full && s.credits < wanted * price) {
    note(s, "Not enough Credits for that increment.");
    return;
  }
  const amount = Math.min(wanted, s.credits / price);
  if (amount <= 0) {
    note(
      s,
      s.miner[field] >= maximum
        ? "Already at full capacity."
        : "Not enough Credits. Sell a haul first.",
    );
    return;
  }
  s.credits -= amount * price;
  s.miner[field] += amount;
  signal(s, C.CUES.fabricate);
  note(s, `${hull ? "Hull repaired" : "Tank charged"} +${amount.toFixed(1)}.`);
}
export function buyUpgrade(s: DeepcoreState, track: C.TrackName): void {
  const tier = s.tiers[track];
  if (tier >= C.MAX_TIER[track]) {
    note(s, "This system is fully upgraded.");
    return;
  }
  const price = C.UPGRADE_PRICES[tier - 1];
  if (s.credits < price) {
    note(s, "Not enough Credits for this upgrade.");
    return;
  }
  s.credits -= price;
  s.tiers[track]++;
  if (track === "fuel")
    s.miner.fuel += C.FUEL_TIERS[tier] - C.FUEL_TIERS[tier - 1];
  if (track === "hull")
    s.miner.hull += C.HULL_TIERS[tier] - C.HULL_TIERS[tier - 1];
  signal(s, C.CUES.fabricate);
  note(s, `${track.toUpperCase()} upgraded to tier ${tier + 1}.`);
}
export function buyItem(s: DeepcoreState, id: C.ItemId): void {
  const item = C.ITEMS.find((i) => i.id === id)!;
  if (s.credits < item.price) {
    note(s, "Not enough Credits for that supply.");
    return;
  }
  s.credits -= item.price;
  s.items[id]++;
  signal(s, C.CUES.fabricate);
  note(s, `${item.name} added to field supplies.`);
}
export function useItem(s: DeepcoreState, id: C.ItemId): void {
  if (s.items[id] === 0) {
    note(s, "No supply held. Visit the Supply Depot.");
    return;
  }
  const m = s.miner,
    cell = minerCell(s);
  if (id === "nanobots" || id === "emergency-fuel") {
    const field = id === "nanobots" ? "hull" : "fuel";
    const maximum = field === "hull" ? maxHull(s) : maxFuel(s);
    if (m[field] >= maximum) {
      note(s, "Already full. Supply kept.");
      return;
    }
    m[field] = Math.min(
      maximum,
      m[field] + (field === "hull" ? C.NANOBOT_HULL : C.EMERGENCY_FUEL),
    );
    effect(s, "material-shimmer", m.x + C.MINER_W / 2, m.y + C.MINER_H / 2);
  } else if (id === "matter-transmitter" || id === "quantum-teleporter") {
    const x = C.SPAWN_COL * C.TILE + (C.TILE - C.MINER_W) / 2;
    if (
      id === "matter-transmitter" &&
      m.x === x &&
      m.y === C.SURFACE_Y - C.MINER_H &&
      m.vx === 0 &&
      m.vy === 0
    ) {
      note(s, "Already at the camp. Supply kept.");
      return;
    }
    effect(s, "core-extract", m.x + C.MINER_W / 2, m.y + C.MINER_H / 2);
    m.x = x;
    m.vx = 0;
    m.drilling = null;
    s.drillClock = 0;
    if (id === "quantum-teleporter") {
      const height =
        s.nextTeleportHeight ??
        C.TELEPORT_HEIGHT_TILES_MIN +
          random(s) *
            (C.TELEPORT_HEIGHT_TILES_MAX - C.TELEPORT_HEIGHT_TILES_MIN);
      m.y = C.SURFACE_Y - height * C.TILE - C.MINER_H;
      m.vy =
        s.nextTeleportSpeed ??
        C.TELEPORT_SPEED_MIN +
          random(s) * (C.TELEPORT_SPEED_MAX - C.TELEPORT_SPEED_MIN);
      s.nextTeleportHeight = null;
      s.nextTeleportSpeed = null;
    } else {
      m.y = C.SURFACE_Y - C.MINER_H;
      m.vy = 0;
    }
  } else {
    const radius =
      id === "dynamite" ? C.DYNAMITE_RADIUS : C.PLASTIC_EXPLOSIVES_RADIUS;
    let changed = false;
    for (
      let row = Math.max(1, cell.row - radius);
      row <= Math.min(s.coreRow - 1, cell.row + radius);
      row++
    )
      for (
        let col = Math.max(C.PLAYABLE_COL_MIN, cell.col - radius);
        col <= Math.min(C.PLAYABLE_COL_MAX, cell.col + radius);
        col++
      ) {
        const t = at(s, col, row);
        if (["bedrock", "material", "core", "tunnel"].includes(t.kind))
          continue;
        if (t.kind === "gas") blastGas(s, col, row);
        else s.grid[row][col] = tile("tunnel", t.band);
        changed = true;
      }
    if (!changed) {
      note(s, "No breakable cells in range. Supply kept.");
      return;
    }
    effect(
      s,
      "gas-explosion",
      (cell.col + 0.5) * C.TILE,
      (cell.row + 0.5) * C.TILE,
    );
    s.shake = Math.max(s.shake, 10 + radius * 3);
    signal(s, C.CUES.gasExplosion);
  }
  s.items[id]--;
  signal(s, C.CUES.fabricate);
  note(s, `${C.ITEMS.find((i) => i.id === id)!.name} used.`);
  checkDeath(s);
}
export function jettison(s: DeepcoreState): void {
  if (!s.satchel.coreSample) {
    note(s, "No Core Sample to jettison.");
    return;
  }
  s.satchel.coreSample = false;
  s.coreGround = minerCell(s);
  note(s, "Core Sample jettisoned. Move at least three tiles clear.");
}
export function canFabricate(
  s: Readonly<DeepcoreState> | import("./model").ReadState,
): boolean {
  const c = C.ROCKET_COMPONENTS[s.rocketInstalled];
  return (
    !!c &&
    s.credits >= c.credits &&
    (c.material === null ||
      (c.material === "core-sample"
        ? s.satchel.coreSample
        : s.satchel[c.material] > 0))
  );
}
export function fabricate(s: DeepcoreState): void {
  const c = C.ROCKET_COMPONENTS[s.rocketInstalled];
  if (!c) {
    note(s, "All components installed. Ready to launch.");
    return;
  }
  if (!canFabricate(s)) {
    note(s, "Missing Credits or required material.");
    return;
  }
  s.credits -= c.credits;
  if (c.material === "core-sample") {
    s.satchel.coreSample = false;
    s.coreTimer = null;
  } else if (c.material) s.satchel[c.material]--;
  s.rocketInstalled++;
  signal(s, C.CUES.fabricate);
  note(
    s,
    `${c.name} installed. ${s.rocketInstalled}/${C.ROCKET_COMPONENTS.length} systems online.`,
  );
}
export function launch(s: DeepcoreState): void {
  if (s.rocketInstalled < C.ROCKET_COMPONENTS.length) {
    note(s, "Finish all five components before launch.");
    return;
  }
  s.launchTime = 0;
  effect(s, "launch-exhaust", 2300, C.SURFACE_Y);
  signal(s, C.CUES.launch);
  end(s, null);
}
export function dismissNotice(s: DeepcoreState): void {
  s.notice = null;
}
export function checkDeath(s: DeepcoreState): void {
  if (s.screen !== "in-mine") return;
  if (s.miner.hull <= 0) end(s, "hull-destroyed");
  else if (s.miner.fuel <= 0 && s.miner.y + C.MINER_H > C.SURFACE_Y + 0.01)
    end(s, "fuel-out");
}
export function timerStep(s: DeepcoreState, dt: number): void {
  if (s.coreTimer === null) return;
  s.coreTimer = Math.max(0, s.coreTimer - dt);
  if (s.coreTimer > 1e-8) return;
  const ground = s.coreGround;
  const x = ground ? (ground.col + 0.5) * C.TILE : s.miner.x + C.MINER_W / 2;
  const y = ground ? (ground.row + 0.5) * C.TILE : s.miner.y + C.MINER_H / 2;
  const kills =
    s.satchel.coreSample ||
    Math.hypot(s.miner.x + C.MINER_W / 2 - x, s.miner.y + C.MINER_H / 2 - y) <=
      C.CORE_BLAST_TILES * C.TILE;
  s.coreTimer = null;
  s.satchel.coreSample = false;
  s.coreGround = null;
  effect(s, "core-detonation", x, y);
  signal(s, C.CUES.gasExplosion);
  s.shake = 36;
  if (kills) end(s, "core-detonation");
}
