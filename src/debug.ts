import * as C from "./constants";
import { copy, type Assets, type DeepcoreState, type ReadState } from "./model";
import {
  at,
  bandAt,
  buildingFootprints,
  emptyMine,
  generate,
  maxFuel,
  maxHull,
  minerCell,
  OUTSIDE,
  tile,
} from "./world";
import { controlRect, menuItems, menuRect } from "./interface";
import { deleteSave, initial } from "./session";
import { snapshot } from "./observations";
import * as T from "./transactions";

function requireValue(condition: boolean, message: string): asserts condition {
  if (!condition) throw new RangeError(`Deepcore debug: ${message}`);
}
function number(
  value: number,
  min = -Infinity,
  max = Infinity,
  integer = false,
): void {
  requireValue(
    Number.isFinite(value) &&
      value >= min &&
      value <= max &&
      (!integer || Number.isInteger(value)),
    `invalid number ${value}`,
  );
}
function member<T extends string>(value: T, list: readonly T[]): void {
  requireValue(list.includes(value), `unknown id ${value}`);
}
function cell(s: ReadState, col: number, row: number): void {
  number(col, 0, C.WORLD_COLS - 1, true);
  number(row, 1, s.coreRow, true);
}
const transition = (
  s: ReadState,
  fn: (next: DeepcoreState) => void,
): DeepcoreState => {
  const next = copy(s);
  fn(next);
  return next;
};
const oreIds = C.MINERALS.map((o) => o.id);

export function makeDebug() {
  return {
    version: C.DEEPCORE_DEBUG_VERSION,
    snapshot,
    tileAt(s: ReadState, col: number, row: number) {
      number(col, -Infinity, Infinity, true);
      number(row, -Infinity, Infinity, true);
      const t =
        col < 0 || col >= C.WORLD_COLS || row < 0 || row > s.coreRow
          ? OUTSIDE
          : at(s, col, row);
      return { ...t };
    },
    findTile(s: ReadState, kind: C.TileKind) {
      member(kind, C.TILE_KINDS);
      const m = minerCell(s);
      let best: { col: number; row: number } | null = null,
        distance = Infinity;
      for (let row = 0; row <= s.coreRow; row++)
        for (let col = 0; col < C.WORLD_COLS; col++)
          if (at(s, col, row).kind === kind) {
            const d = (col - m.col) ** 2 + (row - m.row) ** 2;
            if (d < distance) {
              distance = d;
              best = { col, row };
            }
          }
      return best;
    },
    buildings: (_s: ReadState) => buildingFootprints.map((b) => ({ ...b })),
    menuItemRect: menuRect,
    controlRect(s: ReadState, control: string, subject: string | null) {
      const oreControls = ["drop-ore"];
      const itemControls = ["buy-item", "use-item"];
      const trackControls = ["buy-upgrade"];
      const simpleControls = [
        "jettison",
        "sell",
        "buy-fuel",
        "fill-fuel",
        "buy-repair",
        "repair-full",
        "fabricate",
        "launch",
        "dismiss-notice",
        "inventory",
        "pause",
        "mute",
      ];
      requireValue(
        [
          ...oreControls,
          ...itemControls,
          ...trackControls,
          ...simpleControls,
        ].includes(control),
        "unknown control",
      );
      if (oreControls.includes(control))
        requireValue(
          oreIds.includes(subject as C.OreId),
          "unknown ore subject",
        );
      else if (itemControls.includes(control))
        requireValue(
          C.ITEM_IDS.includes(subject as C.ItemId),
          "unknown item subject",
        );
      else if (trackControls.includes(control))
        requireValue(
          C.TRACKS.includes(subject as C.TrackName),
          "unknown track subject",
        );
      else requireValue(subject === null, "control has no subject");
      return controlRect(s, control, subject);
    },
    reset(s: ReadState) {
      const n = initial(s.assets as Assets, s.muted);
      n.hasSave = s.hasSave;
      return n;
    },
    reconcile: (s: ReadState) => copy(s),
    generateMine: (s: ReadState) => transition(s, generate),
    clearMine: (s: ReadState) =>
      transition(s, (n) => {
        for (let row = 1; row < n.coreRow; row++)
          for (let col = C.PLAYABLE_COL_MIN; col <= C.PLAYABLE_COL_MAX; col++)
            n.grid[row][col] = tile("tunnel", at(n, col, row).band);
      }),
    clearCargo: (s: ReadState) =>
      transition(s, (n) => {
        n.cargo = {};
      }),
    clearItems: (s: ReadState) =>
      transition(s, (n) => {
        for (const id of C.ITEM_IDS) n.items[id] = 0;
      }),
    setTile(
      s: ReadState,
      col: number,
      row: number,
      kind: Exclude<C.TileKind, "ore" | "material">,
    ) {
      cell(s, col, row);
      member(kind, [
        "rock",
        "gas",
        "lava",
        "stone",
        "bedrock",
        "tunnel",
        "core",
      ]);
      return transition(s, (n) => {
        n.grid[row][col] = tile(kind, bandAt(row, s.coreRow));
      });
    },
    setOreTile(s: ReadState, col: number, row: number, ore: C.OreId) {
      cell(s, col, row);
      member(ore, oreIds);
      return transition(s, (n) => {
        n.grid[row][col] = tile("ore", bandAt(row, s.coreRow), ore);
      });
    },
    setMaterialTile(
      s: ReadState,
      col: number,
      row: number,
      material: C.MaterialId,
    ) {
      cell(s, col, row);
      member(material, C.MATERIALS);
      return transition(s, (n) => {
        n.grid[row][col] = tile(
          "material",
          bandAt(row, s.coreRow),
          null,
          material,
        );
      });
    },
    setTileHealth(s: ReadState, col: number, row: number, health: number) {
      cell(s, col, row);
      const t = at(s, col, row);
      requireValue(t.health !== null, "cell is not minable");
      number(health, Number.MIN_VALUE, t.maxHealth!);
      return transition(s, (n) => {
        n.grid[row][col] = { ...t, health };
      });
    },
    placeCoreSample(s: ReadState, col: number, row: number) {
      cell(s, col, row);
      requireValue(
        s.coreTimer === null && at(s, col, row).kind === "tunnel",
        "sample needs open tunnel and no live sample",
      );
      return transition(s, (n) => {
        n.coreGround = { col, row };
        n.coreTimer = C.CORE_TIMER;
      });
    },
    setMinerPosition(s: ReadState, x: number, y: number) {
      number(x);
      number(y);
      return transition(s, (n) => {
        n.miner.x = x;
        n.miner.y = y;
      });
    },
    setMinerVelocity(s: ReadState, vx: number, vy: number) {
      number(vx);
      number(vy);
      return transition(s, (n) => {
        n.miner.vx = vx;
        n.miner.vy = vy;
      });
    },
    setFacing(s: ReadState, facing: C.Facing) {
      member(facing, C.FACINGS);
      return transition(s, (n) => {
        n.miner.facing = facing;
      });
    },
    setFuel(s: ReadState, value: number) {
      number(value, 0);
      return transition(s, (n) => {
        n.miner.fuel = value;
      });
    },
    setHull(s: ReadState, value: number) {
      number(value, 0);
      return transition(s, (n) => {
        n.miner.hull = value;
      });
    },
    setMinerTravel(s: ReadState, enabled: boolean) {
      requireValue(typeof enabled === "boolean", "travel must be boolean");
      return transition(s, (n) => {
        n.miner.travel = enabled;
      });
    },
    setMinerDrill(s: ReadState, enabled: boolean) {
      requireValue(typeof enabled === "boolean", "drill must be boolean");
      return transition(s, (n) => {
        n.miner.drill = enabled;
      });
    },
    setScreen(s: ReadState, screen: C.ScreenName) {
      member(screen, C.SCREENS);
      return transition(s, (n) => {
        n.screen = screen;
      });
    },
    setPanel(s: ReadState, panel: C.PanelId | null) {
      if (panel !== null) member(panel, C.PANELS);
      return transition(s, (n) => {
        n.panel = panel;
      });
    },
    setMenuIndex(s: ReadState, index: number) {
      number(index, 0, menuItems(s).length - 1, true);
      return transition(s, (n) => {
        n.menuIndex = index;
      });
    },
    setMode(s: ReadState, mode: C.Mode) {
      member(mode, C.MODES);
      return transition(s, (n) => {
        n.mode = mode;
      });
    },
    setWorldSize(s: ReadState, size: C.WorldSize) {
      member(size, C.WORLD_SIZES);
      return transition(s, (n) => {
        const core = Math.round(C.STANDARD_ROWS * C.WORLD_SIZE_SCALE[size]);
        const fresh = emptyMine(core);
        for (let row = 0; row < Math.min(core, s.coreRow); row++)
          fresh[row] = s.grid[row].slice();
        n.worldSize = size;
        n.coreRow = core;
        n.grid = fresh;
      });
    },
    setCredits(s: ReadState, value: number) {
      number(value, 0);
      return transition(s, (n) => {
        n.credits = value;
      });
    },
    setTier(s: ReadState, track: C.TrackName, tier: number) {
      member(track, C.TRACKS);
      number(tier, 1, C.MAX_TIER[track], true);
      return transition(s, (n) => {
        n.tiers[track] = tier;
        n.miner.fuel = Math.min(n.miner.fuel, maxFuel(n));
        n.miner.hull = Math.min(n.miner.hull, maxHull(n));
      });
    },
    setCargo(s: ReadState, ore: C.OreId, count: number) {
      member(ore, oreIds);
      number(count, 0, Infinity, true);
      return transition(s, (n) => {
        if (count) n.cargo[ore] = count;
        else delete n.cargo[ore];
      });
    },
    setMaterial(s: ReadState, material: C.MaterialId, count: number) {
      member(material, C.MATERIALS);
      number(count, 0, Infinity, true);
      return transition(s, (n) => {
        n.satchel[material] = count;
      });
    },
    setCoreCarried(s: ReadState, carried: boolean) {
      requireValue(
        typeof carried === "boolean" && (!carried || s.coreTimer === null),
        "sample already live or invalid boolean",
      );
      return transition(s, (n) => {
        n.satchel.coreSample = carried;
        if (carried) n.coreTimer = C.CORE_TIMER;
        else if (s.satchel.coreSample) n.coreTimer = null;
      });
    },
    setCoreTimer(s: ReadState, seconds: number) {
      number(seconds, Number.MIN_VALUE);
      requireValue(s.coreTimer !== null, "no live Core Sample");
      return transition(s, (n) => {
        n.coreTimer = seconds;
      });
    },
    setItemCount(s: ReadState, item: C.ItemId, count: number) {
      member(item, C.ITEM_IDS);
      number(count, 0, Infinity, true);
      return transition(s, (n) => {
        n.items[item] = count;
      });
    },
    setRocketInstalled(s: ReadState, count: number) {
      number(count, 0, C.ROCKET_COMPONENTS.length, true);
      return transition(s, (n) => {
        n.rocketInstalled = count;
      });
    },
    setNoticeFired(s: ReadState, hazard: C.NoticeHazard, fired: boolean) {
      member(hazard, C.NOTICE_HAZARDS);
      requireValue(typeof fired === "boolean", "notice must be boolean");
      return transition(s, (n) => {
        n.noticesFired[hazard] = fired;
      });
    },
    setCameraLead(s: ReadState, lead: number) {
      number(lead, -C.CAM_LEAD_MAX, C.CAM_LEAD_MAX);
      return transition(s, (n) => {
        n.camera.lead = lead;
      });
    },
    setElapsed(s: ReadState, seconds: number) {
      number(seconds, 0);
      return transition(s, (n) => {
        n.elapsedSeconds = seconds;
      });
    },
    clearSave: (s: ReadState) => transition(s, deleteSave),
    setNextTeleportHeight(s: ReadState, tiles: number | null) {
      if (tiles !== null)
        number(tiles, C.TELEPORT_HEIGHT_TILES_MIN, C.TELEPORT_HEIGHT_TILES_MAX);
      return transition(s, (n) => {
        n.nextTeleportHeight = tiles;
      });
    },
    setNextTeleportSpeed(s: ReadState, speed: number | null) {
      if (speed !== null)
        number(speed, C.TELEPORT_SPEED_MIN, C.TELEPORT_SPEED_MAX);
      return transition(s, (n) => {
        n.nextTeleportSpeed = speed;
      });
    },
    dropOre(s: ReadState, ore: C.OreId) {
      member(ore, oreIds);
      return transition(s, (n) => {
        T.dropOre(n, ore);
      });
    },
    sell: (s: ReadState) => transition(s, T.sell),
    buyFuel: (s: ReadState) =>
      transition(s, (n) => {
        T.replenish(n, false, false);
      }),
    fillFuel: (s: ReadState) =>
      transition(s, (n) => {
        T.replenish(n, false, true);
      }),
    buyRepair: (s: ReadState) =>
      transition(s, (n) => {
        T.replenish(n, true, false);
      }),
    repairFull: (s: ReadState) =>
      transition(s, (n) => {
        T.replenish(n, true, true);
      }),
    buyUpgrade(s: ReadState, track: C.TrackName) {
      member(track, C.TRACKS);
      return transition(s, (n) => {
        T.buyUpgrade(n, track);
      });
    },
    buyItem(s: ReadState, item: C.ItemId) {
      member(item, C.ITEM_IDS);
      return transition(s, (n) => {
        T.buyItem(n, item);
      });
    },
    useItem(s: ReadState, item: C.ItemId) {
      member(item, C.ITEM_IDS);
      return transition(s, (n) => {
        T.useItem(n, item);
      });
    },
    jettison: (s: ReadState) => transition(s, T.jettison),
    fabricate: (s: ReadState) => transition(s, T.fabricate),
    launch: (s: ReadState) => transition(s, T.launch),
    save: (s: ReadState) => transition(s, T.save),
    dismissNotice: (s: ReadState) => transition(s, T.dismissNotice),
  };
}
export type DeepcoreDebugApi = ReturnType<typeof makeDebug>;
