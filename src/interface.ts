import type { UpdateApi } from "@clockwyrks/simple-2d";
import * as C from "./constants";
import type { DeepcoreState, ReadState, Rect } from "./model";
import {
  buildingFootprints,
  atBuilding,
  cargoSlots,
  cargoValue,
  cargoWeight,
  liftLimit,
  maxFuel,
  maxHull,
} from "./world";
import { resume, start } from "./session";
import * as T from "./transactions";

export interface Control extends Rect {
  id: string;
  subject: string | null;
  label: string;
  enabled: boolean;
}
export function menuItems(s: ReadState): readonly string[] {
  switch (s.screen) {
    case "title":
      return s.hasSave ? C.TITLE_ITEMS : C.TITLE_ITEMS.slice(1);
    case "mode-select":
      return C.MODE_ITEMS;
    case "size-select":
      return C.SIZE_ITEMS;
    case "how-to-play":
      return C.HOW_TO_PLAY_ITEMS;
    case "paused":
      return C.PAUSE_ITEMS;
    case "victory":
      return C.VICTORY_ITEMS;
    case "game-over":
      return s.mode === "standard" && s.hasSave
        ? C.GAME_OVER_SAVE_ITEMS
        : C.GAME_OVER_ITEMS;
    default:
      return [];
  }
}
export function menuRect(s: ReadState, index: number): Rect | null {
  if (!Number.isInteger(index) || index < 0 || index >= menuItems(s).length)
    return null;
  if (s.screen === "how-to-play") return { x: 88, y: 626, w: 280, h: 52 };
  if (s.screen === "paused")
    return { x: 430, y: 310 + index * 78, w: 420, h: 62 };
  if (s.screen === "victory" || s.screen === "game-over")
    return { x: 104, y: 505 + index * 76, w: 420, h: 60 };
  return {
    x: 104,
    y:
      (s.screen === "title" ? 389 : s.screen === "size-select" ? 294 : 325) +
      index * 82,
    w: 450,
    h: 64,
  };
}
export function controls(s: ReadState): Control[] {
  if (s.screen !== "in-mine") return [];
  const list: Control[] = [];
  const add = (
    id: string,
    label: string,
    x: number,
    y: number,
    w = 180,
    enabled = true,
    subject: string | null = null,
    h = 38,
  ) => list.push({ id, subject, label, x, y, w, h, enabled });
  add("inventory", "I", 1090, 8, 52, true, null, 40);
  add("pause", "Ⅱ", 1152, 8, 48, true, null, 40);
  add("mute", s.muted ? "OFF" : "SND", 1210, 8, 56, true, null, 40);
  if (s.notice?.shown)
    add("dismiss-notice", "DISMISS", 320, 588, 640, true, null, 96);
  if (!s.panel) return list;
  add("close-panel", "×", 995, 125, 36, true, null, 36);
  switch (s.panel) {
    case "fuel-depot":
      add(
        "buy-fuel",
        `+${C.FUEL_BUY_INCREMENT} FUEL`,
        302,
        340,
        270,
        s.credits >=
          Math.min(C.FUEL_BUY_INCREMENT, maxFuel(s) - s.miner.fuel) *
            C.FUEL_PRICE && s.miner.fuel < maxFuel(s),
      );
      add(
        "fill-fuel",
        "FILL TO FULL",
        302,
        393,
        270,
        s.credits > 0 && s.miner.fuel < maxFuel(s),
      );
      add(
        "buy-repair",
        `+${C.REPAIR_BUY_INCREMENT} HULL`,
        702,
        340,
        270,
        s.credits >=
          Math.min(C.REPAIR_BUY_INCREMENT, maxHull(s) - s.miner.hull) *
            C.REPAIR_PRICE && s.miner.hull < maxHull(s),
      );
      add(
        "repair-full",
        "REPAIR TO FULL",
        702,
        393,
        270,
        s.credits >= C.REPAIR_PRICE && s.miner.hull < maxHull(s),
      );
      break;
    case "ore-market":
      add(
        "sell",
        `${C.SELL}  /  ${cargoValue(s).toLocaleString()} CR`,
        734,
        574,
        260,
        cargoSlots(s) > 0,
      );
      break;
    case "upgrade-shop":
      C.TRACKS.forEach((t, i) => {
        const tier = s.tiers[t],
          max = tier >= C.MAX_TIER[t],
          price = C.UPGRADE_PRICES[tier - 1];
        add(
          "buy-upgrade",
          max ? "MAX TIER" : `${price.toLocaleString()} CR  +`,
          806,
          222 + i * 52,
          190,
          !max && s.credits >= price,
          t,
        );
      });
      break;
    case "supply-depot":
      C.ITEMS.forEach((item, i) =>
        add(
          "buy-item",
          `${item.price.toLocaleString()} CR  +`,
          806,
          230 + i * 61,
          190,
          s.credits >= item.price,
          item.id,
        ),
      );
      break;
    case "launch-pad":
      add(
        s.rocketInstalled === C.ROCKET_COMPONENTS.length
          ? "launch"
          : "fabricate",
        s.rocketInstalled === C.ROCKET_COMPONENTS.length
          ? C.LAUNCH
          : C.FABRICATE,
        738,
        569,
        258,
        s.rocketInstalled === C.ROCKET_COMPONENTS.length || T.canFabricate(s),
      );
      break;
    case "inventory": {
      C.MINERALS.filter((o) => (s.cargo[o.id] ?? 0) > 0).forEach((o, i) =>
        add("drop-ore", "−  DROP", 574, 265 + i * 25, 100, true, o.id, 23),
      );
      C.ITEMS.forEach((item, i) =>
        add(
          "use-item",
          C.USE,
          924,
          314 + i * 39,
          72,
          s.items[item.id] > 0,
          item.id,
          30,
        ),
      );
      if (s.satchel.coreSample) add("jettison", C.JETTISON, 744, 571, 252);
      break;
    }
  }
  return list;
}
export function controlRect(
  s: ReadState,
  id: string,
  subject: string | null,
): Rect | null {
  const c = controls(s).find((c) => c.id === id && c.subject === subject);
  return c ? { x: c.x, y: c.y, w: c.w, h: c.h } : null;
}
export const contains = (r: Rect, x: number, y: number) =>
  x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;
function go(s: DeepcoreState, screen: C.ScreenName, index = 0): DeepcoreState {
  s.screen = screen;
  s.menuIndex = index;
  s.panel = null;
  s.pointerDown = {};
  return s;
}
export function back(s: DeepcoreState): DeepcoreState {
  switch (s.screen) {
    case "how-to-play":
      return go(
        s,
        "title",
        menuItems({ ...s, screen: "title" }).indexOf(C.TITLE_ITEMS[2]),
      );
    case "mode-select":
      return go(s, "title", s.hasSave ? 1 : 0);
    case "size-select":
      return go(s, "mode-select", C.MODES.indexOf(s.mode));
    case "paused":
      return go(s, "in-mine");
    case "in-mine":
      if (s.panel) {
        s.panel = null;
        return s;
      }
      return go(s, "paused");
    default:
      return s;
  }
}
export function choose(s: DeepcoreState): DeepcoreState {
  const item = menuItems(s)[s.menuIndex];
  switch (s.screen) {
    case "title":
      if (item === C.TITLE_ITEMS[0]) return resume(s);
      return go(s, item === C.TITLE_ITEMS[1] ? "mode-select" : "how-to-play");
    case "mode-select":
      if (s.menuIndex === C.MODES.length) return back(s);
      s.mode = C.MODES[s.menuIndex];
      return go(s, "size-select");
    case "size-select":
      if (s.menuIndex === C.WORLD_SIZES.length) return back(s);
      s.worldSize = C.WORLD_SIZES[s.menuIndex];
      return start(s);
    case "how-to-play":
      return back(s);
    case "paused":
      if (s.menuIndex === 0) return go(s, "in-mine");
      if (s.menuIndex === 1) return start(s);
      return go(s, "title", s.hasSave ? 1 : 0);
    case "victory":
    case "game-over":
      if (s.menuIndex === 1) return go(s, "title", s.hasSave ? 1 : 0);
      return s.screen === "game-over" && s.mode === "standard" && s.hasSave
        ? resume(s)
        : start(s);
    default:
      return s;
  }
}
function activateBuilding(s: DeepcoreState, id: C.BuildingId): void {
  if (id === "save-pad") T.save(s);
  else s.panel = id;
}
export function activateControl(
  s: DeepcoreState,
  c: Control,
  api: UpdateApi,
): DeepcoreState {
  if (!c.enabled) return s;
  switch (c.id) {
    case "inventory":
      s.panel = s.panel === "inventory" ? null : "inventory";
      break;
    case "pause":
      return back(s);
    case "mute":
      api.audio.setMuted(!api.audio.muted());
      break;
    case "close-panel":
      s.panel = null;
      break;
    case "sell":
      T.sell(s);
      break;
    case "buy-fuel":
      T.replenish(s, false, false);
      break;
    case "fill-fuel":
      T.replenish(s, false, true);
      break;
    case "buy-repair":
      T.replenish(s, true, false);
      break;
    case "repair-full":
      T.replenish(s, true, true);
      break;
    case "buy-upgrade":
      T.buyUpgrade(s, c.subject as C.TrackName);
      break;
    case "buy-item":
      T.buyItem(s, c.subject as C.ItemId);
      break;
    case "use-item":
      T.useItem(s, c.subject as C.ItemId);
      break;
    case "drop-ore":
      T.dropOre(s, c.subject as C.OreId);
      break;
    case "fabricate":
      T.fabricate(s);
      break;
    case "launch":
      T.launch(s);
      break;
    case "jettison":
      T.jettison(s);
      break;
    case "dismiss-notice":
      T.dismissNotice(s);
      break;
  }
  return s;
}
export function interfaceStep(s: DeepcoreState, api: UpdateApi): DeepcoreState {
  let next = s;
  if (api.input.pressed("mute")) api.audio.setMuted(!api.audio.muted());
  if (api.input.pressed("pause")) next = back(next);
  else if (next.screen !== "in-mine") {
    const count = menuItems(next).length;
    if (count) {
      if (api.input.pressed("down"))
        next.menuIndex = (next.menuIndex + 1) % count;
      if (api.input.pressed("up"))
        next.menuIndex = (next.menuIndex + count - 1) % count;
      if (api.input.pressed("activate")) next = choose(next);
    }
  } else {
    if (api.input.pressed("inventory"))
      next.panel = next.panel === "inventory" ? null : "inventory";
    if (api.input.pressed("activate") && !next.panel) {
      const b = buildingFootprints.find((b) => atBuilding(next, b));
      if (b) activateBuilding(next, b.id);
    }
    if (api.input.pressed("jettison")) T.jettison(next);
    C.ITEM_IDS.forEach((id, i) => {
      if (api.input.pressed(`supply${i + 1}`)) T.useItem(next, id);
    });
    T.checkDeath(next);
  }
  const hit = (x: number, y: number): string | null => {
    const items = menuItems(next);
    for (let i = 0; i < items.length; i++)
      if (contains(menuRect(next, i)!, x, y)) return `menu:${i}`;
    for (const c of controls(next))
      if (contains(c, x, y) && c.enabled)
        return `control:${c.id}:${c.subject ?? ""}`;
    if (next.screen === "in-mine" && !next.panel && y >= C.HUD_H) {
      const b = buildingFootprints.find(
        (b) =>
          contains(b, x + next.camera.x, y - C.HUD_H + next.camera.y) &&
          atBuilding(next, b),
      );
      if (b) return `building:${b.id}`;
    }
    return null;
  };
  for (const p of api.input.pointerSamples()) {
    const target = hit(p.x, p.y);
    if (p.type === "move" || p.type === "down") {
      next.hover = target;
      if (target?.startsWith("menu:"))
        next.menuIndex = Number(target.split(":")[1]);
    }
    if (p.type === "down") {
      next.pointerDown[p.id] = target ?? "";
      if (target === "control:dismiss-notice:") T.dismissNotice(next);
      if (target?.startsWith("building:"))
        activateBuilding(next, target.slice(9) as C.BuildingId);
    }
    if (p.type === "up") {
      if (target && target === next.pointerDown[p.id]) {
        if (target.startsWith("menu:")) {
          next.menuIndex = Number(target.split(":")[1]);
          next = choose(next);
        } else if (target.startsWith("control:")) {
          const [, id, subject] = target.split(":");
          const c = controls(next).find(
            (c) => c.id === id && c.subject === (subject || null),
          );
          if (c) next = activateControl(next, c, api);
        }
      }
      delete next.pointerDown[p.id];
    }
  }
  next.muted = api.audio.muted();
  return next;
}
export function loadLabel(s: ReadState): string {
  return cargoWeight(s) >= liftLimit(s)
    ? C.OVERLOAD
    : `${cargoSlots(s)}/${C.CARGO_TIERS[s.tiers.cargo - 1]}  ·  ${cargoWeight(s)} kg`;
}
