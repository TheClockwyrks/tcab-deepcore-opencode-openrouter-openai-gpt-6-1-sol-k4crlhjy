import type { RenderApi } from "@clockwyrks/simple-2d";
import { ParticleCanvasPlayer } from "@clockwyrks/particle-runtime/canvas";
import type { ParticleSystem } from "@clockwyrks/particle-runtime";
import * as C from "./constants";
import type { ReadState, Rect, Tile } from "./model";
import {
  at,
  bandAt,
  buildingFootprints,
  atBuilding,
  cargoSlots,
  cargoValue,
  cargoWeight,
  clamp,
  depth,
  liftLimit,
  maxFuel,
  maxHull,
  scanner,
} from "./world";
import { controls, loadLabel, menuItems, menuRect } from "./interface";

const P = {
  bg: "#101a20",
  panel: "#15252d",
  line: "#35484d",
  text: "#e5e5d0",
  muted: "#95a6a4",
  amber: "#e6b469",
  mint: "#a0d9bb",
  red: "#ef886c",
};
const SANS = '"Arial", "Liberation Sans", sans-serif';
const MONO = '"Courier New", monospace';
type Ctx = CanvasRenderingContext2D;
function box(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: string,
  stroke?: string,
  radius = 0,
): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}
function text(
  ctx: Ctx,
  value: string,
  x: number,
  y: number,
  size = 16,
  color = P.text,
  weight = 400,
  mono = false,
): void {
  ctx.font = `${weight} ${size}px ${mono ? MONO : SANS}`;
  ctx.fillStyle = color;
  ctx.textBaseline = "alphabetic";
  ctx.fillText(value, x, y);
}
function rule(ctx: Ctx, x: number, y: number, w: number, color = P.line): void {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, 1);
}
function wrap(
  ctx: Ctx,
  value: string,
  x: number,
  y: number,
  width: number,
  size = 16,
  color = P.muted,
  lineHeight = 25,
): void {
  ctx.font = `400 ${size}px ${SANS}`;
  let line = "",
    row = 0;
  for (const word of value.split(" ")) {
    if (ctx.measureText(line + word).width > width && line) {
      text(ctx, line.trim(), x, y + row++ * lineHeight, size, color);
      line = "";
    }
    line += `${word} `;
  }
  if (line) text(ctx, line.trim(), x, y + row * lineHeight, size, color);
}
function image(
  ctx: Ctx,
  s: ReadState,
  key: string,
  x: number,
  y: number,
  w?: number,
  h?: number,
): void {
  const bitmap = s.assets.images[key] as ImageBitmap;
  if (!bitmap) throw new Error(`Deepcore: missing image ${key}`);
  if (w !== undefined && h !== undefined)
    ctx.drawImage(bitmap, Math.round(x), Math.round(y), w, h);
  else ctx.drawImage(bitmap, Math.round(x), Math.round(y));
}
export function animationFrames(s: ReadState, state: C.MinerState): string[] {
  return Object.keys(s.assets.images)
    .filter((k) => k.startsWith(`miner/${state}/`))
    .sort();
}
function miner(
  ctx: Ctx,
  s: ReadState,
  x: number,
  y: number,
  scale = 1,
  state = s.miner.state,
): void {
  const frames = animationFrames(s, state);
  const index =
    state === "hurt"
      ? Math.min(frames.length - 1, Math.floor(s.animationTime * C.ANIM_FPS))
      : Math.floor(s.animationTime * C.ANIM_FPS) % frames.length;
  ctx.save();
  ctx.translate(Math.round(x + (C.MINER_W * scale) / 2), Math.round(y));
  if (s.miner.facing === "west") ctx.scale(-1, 1);
  image(
    ctx,
    s,
    frames[index],
    (-C.MINER_SPRITE * scale) / 2,
    -4 * scale,
    C.MINER_SPRITE * scale,
    C.MINER_SPRITE * scale,
  );
  ctx.restore();
}
function rockKey(t: Tile, col: number, row: number): string {
  return `tiles/${t.band ?? "coreshell"}-${Math.abs(col * 7 + row * 13) % C.TILE_VARIANTS}.png`;
}
function openCell(
  ctx: Ctx,
  s: ReadState,
  col: number,
  row: number,
  t: Tile,
): void {
  const x = col * C.TILE,
    y = row * C.TILE,
    lip = 9,
    radius = 17;
  const same = (dx: number, dy: number) =>
    row + dy <= 0
      ? t.kind === "tunnel"
      : at(s, col + dx, row + dy).kind === t.kind;
  const left = same(-1, 0),
    right = same(1, 0),
    up = same(0, -1),
    down = same(0, 1);
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x + lip, y + lip, C.TILE - lip * 2, C.TILE - lip * 2, radius);
  if (left) ctx.rect(x, y + lip, C.TILE / 2, C.TILE - lip * 2);
  if (right) ctx.rect(x + C.TILE / 2, y + lip, C.TILE / 2, C.TILE - lip * 2);
  if (up) ctx.rect(x + lip, y, C.TILE - lip * 2, C.TILE / 2);
  if (down) ctx.rect(x + lip, y + C.TILE / 2, C.TILE - lip * 2, C.TILE / 2);
  for (const [dx, dy, a, b] of [
    [-1, -1, left, up],
    [1, -1, right, up],
    [-1, 1, left, down],
    [1, 1, right, down],
  ] as const) {
    if (a && b)
      ctx.rect(
        x + (dx === 1 ? C.TILE - lip : 0),
        y + (dy === 1 ? C.TILE - lip : 0),
        lip,
        lip,
      );
  }
  ctx.clip();
  image(
    ctx,
    s,
    t.kind === "lava"
      ? `hazards/lava/frame${String(Math.floor(s.simTime * 5) % 4).padStart(2, "0")}.png`
      : "tiles/tunnel.png",
    x,
    y,
    C.TILE,
    C.TILE,
  );
  ctx.restore();
  // A diagonal solid keeps a convex quarter-circle of dirt at an L/T bend.
  for (const [dx, dy, a, b] of [
    [-1, -1, left, up],
    [1, -1, right, up],
    [-1, 1, left, down],
    [1, 1, right, down],
  ] as const) {
    if (!a || !b || same(dx, dy)) continue;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, C.TILE, C.TILE);
    ctx.clip();
    ctx.beginPath();
    ctx.arc(
      x + (dx === 1 ? C.TILE : 0),
      y + (dy === 1 ? C.TILE : 0),
      lip,
      0,
      Math.PI * 2,
    );
    ctx.clip();
    image(ctx, s, rockKey(t, col, row), x, y, C.TILE, C.TILE);
    ctx.restore();
  }
}
function cell(ctx: Ctx, s: ReadState, col: number, row: number): void {
  const t = at(s, col, row),
    x = col * C.TILE,
    y = row * C.TILE;
  if (t.kind === "bedrock") {
    image(ctx, s, "tiles/bedrock.png", x, y, C.TILE, C.TILE);
    return;
  }
  image(ctx, s, rockKey(t, col, row), x, y, C.TILE, C.TILE);
  if (t.kind === "tunnel" || t.kind === "lava") openCell(ctx, s, col, row, t);
  else if (t.kind === "stone")
    image(ctx, s, `tiles/stone-${(col + row) % 2}.png`, x, y, C.TILE, C.TILE);
  else if (t.kind === "ore")
    image(ctx, s, `ore/${t.ore}.png`, x, y, C.TILE, C.TILE);
  else if (t.kind === "material" || t.kind === "core")
    image(
      ctx,
      s,
      `materials/${t.material ?? "core"}.png`,
      x,
      y,
      C.TILE,
      C.TILE,
    );
  if (t.health !== null && t.health < t.maxHealth!) {
    const frame = Math.min(
      C.CRACK_FRAMES - 1,
      Math.floor((1 - t.health / t.maxHealth!) * C.CRACK_FRAMES),
    );
    image(
      ctx,
      s,
      `tiles/crack/frame${String(frame).padStart(2, "0")}.png`,
      x,
      y,
      C.TILE,
      C.TILE,
    );
  }
  ctx.strokeStyle = "#0b151b24";
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, C.TILE, C.TILE);
}
function particles(ctx: Ctx, s: ReadState): void {
  // The binding's virtual field is logical units, independent of device pixels.
  // It draws straight through the engine's recorded context. No private canvas.
  let suppressInitialPaint = false;
  const logicalContext = new Proxy(ctx, {
    get(target, property) {
      if (property === "canvas") return { width: 700, height: 700 };
      if (property === "fill" && suppressInitialPaint) return () => undefined;
      const value: unknown = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
    set(target, property, value: unknown) {
      return Reflect.set(target, property, value, target);
    },
  });
  for (const fx of s.effects) {
    if (
      fx.x < s.camera.x - 400 ||
      fx.x > s.camera.x + C.VIEW_W + 400 ||
      fx.y < s.camera.y - 400 ||
      fx.y > s.camera.y + C.VIEW_H + 400
    )
      continue;
    let system = s.assets.effects[fx.name] as ParticleSystem;
    if (!system) continue;
    if (fx.tint && C.BANDS.includes(fx.tint as C.BandName)) {
      const color = {
        topsoil: "#b69a76",
        rockbed: "#8ea5a4",
        deepstone: "#777d9d",
        coreshell: "#c77961",
      }[fx.tint as C.BandName];
      system = {
        ...system,
        emitters: system.emitters.map((e) => ({
          ...e,
          particle: {
            ...e.particle,
            colorGradient: [
              { color, at: 0 },
              { color: "#4e5e63", at: 1 },
            ],
          },
        })),
      };
    } else if (fx.tint?.startsWith("#")) {
      const color = fx.tint;
      system = {
        ...system,
        emitters: system.emitters.map((e) => ({
          ...e,
          particle: {
            ...e.particle,
            colorGradient: [
              { color: "#fff6d4", at: 0 },
              { color, at: 0.3 },
              { color, at: 1 },
            ],
          },
        })),
      };
    }
    ctx.save();
    ctx.translate(fx.x, fx.y - 700);
    suppressInitialPaint = true;
    const player = new ParticleCanvasPlayer(system, logicalContext, {
      clear: false,
      seed: fx.seed,
      pixelRadius: 1.1,
      composite:
        fx.name.includes("dust") || fx.name === "gas-seep"
          ? "source-over"
          : "lighter",
    });
    suppressInitialPaint = false;
    // Reconstruct from the event's immutable age. Rendering twice changes nothing.
    for (let age = 0; age < fx.age; age += 1 / 30)
      player.simulator.step(Math.min(1 / 30, fx.age - age) * 1000);
    player.update(0);
    ctx.restore();
  }
}
function world(ctx: Ctx, s: ReadState): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, C.HUD_H, C.VIEW_W, C.VIEW_H);
  ctx.clip();
  image(ctx, s, "surface/sky.png", 0, C.HUD_H, C.VIEW_W, C.VIEW_H);
  const jitterX = Math.sin(s.simTime * 91) * s.shake,
    jitterY = Math.cos(s.simTime * 77) * s.shake * 0.6;
  ctx.translate(-s.camera.x + jitterX, C.HUD_H - s.camera.y + jitterY);
  const minCol = Math.max(0, Math.floor(s.camera.x / C.TILE)),
    maxCol = Math.min(
      C.WORLD_COLS - 1,
      Math.ceil((s.camera.x + C.VIEW_W) / C.TILE),
    );
  const minRow = Math.max(1, Math.floor(s.camera.y / C.TILE)),
    maxRow = Math.min(s.coreRow, Math.ceil((s.camera.y + C.VIEW_H) / C.TILE));
  for (let row = minRow; row <= maxRow; row++)
    for (let col = minCol; col <= maxCol; col++) cell(ctx, s, col, row);
  if (s.camera.y < C.SURFACE_Y + 200) {
    for (let col = minCol; col <= maxCol; col++)
      if (col !== C.CAVE_MOUTH_COL)
        image(
          ctx,
          s,
          "surface/ground.png",
          col * C.TILE,
          C.SURFACE_Y,
          C.TILE,
          20,
        );
    image(
      ctx,
      s,
      "surface/cave-mouth.png",
      C.CAVE_MOUTH_COL * C.TILE,
      C.SURFACE_Y,
      C.TILE,
      C.TILE,
    );
    for (const [i, b] of buildingFootprints.entries()) {
      image(ctx, s, `surface/${b.id}.png`, b.x, b.y, b.w, b.h);
      const near = atBuilding(s, b);
      const name = b.id.replace(/-/g, " ").toUpperCase();
      box(
        ctx,
        b.x + 5,
        b.y - 30,
        b.w - 10,
        23,
        near ? "#d9b875" : "#15262edb",
        near ? P.amber : P.line,
      );
      text(
        ctx,
        `${String(i + 1).padStart(2, "0")} / ${name}`,
        b.x + 15,
        b.y - 14,
        12,
        near ? P.bg : P.text,
        700,
        true,
      );
      if (near && s.screen === "in-mine" && !s.panel) {
        box(ctx, b.x + 30, C.SURFACE_Y + 28, b.w - 60, 29, P.panel, P.mint, 3);
        text(
          ctx,
          "E  /  ACTIVATE",
          b.x + 43,
          C.SURFACE_Y + 48,
          13,
          P.mint,
          700,
          true,
        );
      }
    }
    const lift =
      s.launchTime === null ? 0 : Math.max(0, s.launchTime - 0.25) ** 2 * 100;
    image(
      ctx,
      s,
      `rocket/stage${s.rocketInstalled}.png`,
      2220,
      C.SURFACE_Y - 280 - lift,
      180,
      280,
    );
    text(
      ctx,
      "↓  MINE ACCESS",
      C.CAVE_MOUTH_COL * C.TILE - 30,
      C.SURFACE_Y - 23,
      13,
      P.amber,
      700,
      true,
    );
  }
  if (s.coreGround) {
    const g = s.coreGround;
    image(
      ctx,
      s,
      "materials/core-sample.png",
      g.col * C.TILE,
      g.row * C.TILE,
      C.TILE,
      C.TILE,
    );
    box(ctx, g.col * C.TILE - 10, g.row * C.TILE - 28, 100, 26, P.bg, P.red);
    text(
      ctx,
      `${s.coreTimer!.toFixed(1)} s`,
      g.col * C.TILE + 4,
      g.row * C.TILE - 9,
      15,
      P.red,
      700,
      true,
    );
  }
  if (s.launchTime === null) miner(ctx, s, s.miner.x, s.miner.y);
  particles(ctx, s);
  ctx.restore();
  // Peripheral darkness preserves detail while the lamp centers the expedition.
  if (depth(s) > 0) {
    const x = s.miner.x + C.MINER_W / 2 - s.camera.x,
      y = s.miner.y + C.MINER_H / 2 - s.camera.y + C.HUD_H;
    const shade = ctx.createRadialGradient(x, y, 130, x, y, 760);
    shade.addColorStop(0, "#07101900");
    shade.addColorStop(0.75, "#07101926");
    shade.addColorStop(1, "#071019aa");
    ctx.fillStyle = shade;
    ctx.fillRect(0, C.HUD_H, C.STAGE_W, C.VIEW_H);
  }
  const band =
    depth(s) <= 0
      ? "SURFACE CAMP"
      : bandAt(
          Math.max(1, Math.floor((s.miner.y + C.MINER_H) / C.TILE)),
          s.coreRow,
        ).toUpperCase();
  box(ctx, 22, 76, 200, 32, "#111e26e8", P.line, 2);
  text(ctx, `●  ${band}`, 36, 97, 12, P.mint, 700, true);
  text(
    ctx,
    `${s.mode.toUpperCase()} / ${s.worldSize.toUpperCase()}`,
    24,
    129,
    10,
    P.muted,
    400,
    true,
  );
  const scan = scanner(s);
  if (scan.locked) {
    box(ctx, 973, 83, 284, 56, "#142830ee", P.mint, 3);
    text(
      ctx,
      `${scan.target!.toUpperCase()}  /  ${scan.distanceTiles!.toFixed(1)} T`,
      1021,
      106,
      13,
      P.mint,
      700,
      true,
    );
    text(ctx, "SCANNER LOCK", 1021, 125, 10, P.muted, 400, true);
    ctx.save();
    ctx.translate(996, 110);
    ctx.rotate(Math.atan2(scan.dirY, scan.dirX));
    ctx.beginPath();
    ctx.moveTo(11, 0);
    ctx.lineTo(-7, -7);
    ctx.lineTo(-3, 0);
    ctx.lineTo(-7, 7);
    ctx.closePath();
    ctx.fillStyle = P.mint;
    ctx.fill();
    ctx.restore();
  }
  if (s.satchel.coreSample) {
    box(ctx, 458, 78, 364, 66, "#2e2728f5", P.red, 3);
    text(
      ctx,
      `CORE UNSTABLE  ${s.coreTimer!.toFixed(1)} s`,
      480,
      105,
      21,
      P.amber,
      700,
      true,
    );
    text(
      ctx,
      "J  /  JETTISON    •    REACH THE PAD",
      480,
      129,
      11,
      P.muted,
      400,
      true,
    );
  }
  if (!s.panel && s.screen === "in-mine") {
    box(ctx, 20, 665, 655, 35, "#111d25ed", P.line, 2);
    text(
      ctx,
      "A D  MOVE / DRILL     S  DIG DOWN     W / SPACE  THRUST",
      34,
      687,
      12,
      P.muted,
      400,
      true,
    );
    box(ctx, 1015, 665, 245, 35, "#111d25ed", P.line, 2);
    text(
      ctx,
      `ROCKET SYSTEMS  ${s.rocketInstalled} / ${C.ROCKET_COMPONENTS.length}`,
      1032,
      687,
      12,
      P.amber,
      700,
      true,
    );
  }
}
function gauge(
  ctx: Ctx,
  x: number,
  value: number,
  max: number,
  color: string,
  label: string,
): void {
  text(ctx, label, x, 19, 10, P.muted, 700, true);
  text(ctx, `${Math.ceil(value)} / ${max}`, x + 68, 19, 11, color, 700, true);
  box(ctx, x, 28, 153, 8, "#293940");
  ctx.fillStyle = color;
  ctx.fillRect(x, 28, 153 * clamp(value / max, 0, 1), 8);
}
function hud(ctx: Ctx, s: ReadState): void {
  box(ctx, 0, 0, C.STAGE_W, C.HUD_H, "#101d25");
  rule(ctx, 0, C.HUD_H - 1, C.STAGE_W, "#53615a");
  image(ctx, s, "icons/fuel.png", 16, 15, C.ICON_SIZE, C.ICON_SIZE);
  gauge(
    ctx,
    48,
    s.miner.fuel,
    maxFuel(s),
    s.miner.fuel < maxFuel(s) * C.LOW_FUEL_FRACTION ? P.red : P.amber,
    "FUEL",
  );
  image(ctx, s, "icons/hull.png", 220, 15, C.ICON_SIZE, C.ICON_SIZE);
  gauge(
    ctx,
    252,
    s.miner.hull,
    maxHull(s),
    s.miner.hull < maxHull(s) * C.LOW_HULL_FRACTION ? P.red : P.mint,
    "HULL",
  );
  image(ctx, s, "icons/cargo.png", 427, 15, C.ICON_SIZE, C.ICON_SIZE);
  text(ctx, "CARGO / LIFT", 460, 18, 10, P.muted, 700, true);
  text(
    ctx,
    loadLabel(s),
    460,
    38,
    14,
    cargoWeight(s) >= liftLimit(s) ||
      cargoSlots(s) >= C.CARGO_TIERS[s.tiers.cargo - 1]
      ? P.red
      : P.text,
    700,
    true,
  );
  image(ctx, s, "icons/credits.png", 685, 15, C.ICON_SIZE, C.ICON_SIZE);
  text(ctx, "CREDITS", 718, 18, 10, P.muted, 700, true);
  text(
    ctx,
    Math.floor(s.credits).toLocaleString(),
    718,
    39,
    18,
    P.amber,
    700,
    true,
  );
  image(ctx, s, "icons/depth.png", 845, 15, C.ICON_SIZE, C.ICON_SIZE);
  text(ctx, "DEPTH", 876, 18, 10, P.muted, 700, true);
  text(
    ctx,
    `${Math.floor(depth(s)).toLocaleString()} m`,
    876,
    39,
    18,
    P.text,
    700,
    true,
  );
  for (const [i, material] of C.MATERIALS.entries()) {
    ctx.globalAlpha = s.satchel[material] > 0 ? 1 : 0.3;
    image(
      ctx,
      s,
      `icons/${material}.png`,
      1002 + i * 34,
      16,
      C.ICON_SIZE,
      C.ICON_SIZE,
    );
    ctx.globalAlpha = 1;
  }
  for (const x of [210, 416, 674, 834, 987, 1080]) {
    ctx.fillStyle = P.line;
    ctx.fillRect(x, 11, 1, 33);
  }
}
function button(
  ctx: Ctx,
  r: Rect,
  label: string,
  selected: boolean,
  enabled = true,
): void {
  const fill = selected && enabled ? P.amber : enabled ? "#1c3038" : "#18272e";
  box(
    ctx,
    r.x,
    r.y,
    r.w,
    r.h,
    fill,
    selected && enabled ? P.amber : enabled ? "#49615f" : "#2d3d42",
    3,
  );
  text(
    ctx,
    label,
    r.x + 17,
    r.y + r.h / 2 + 5,
    Math.min(16, r.h * 0.34),
    !enabled ? "#617373" : selected ? P.bg : P.text,
    700,
    true,
  );
}
/** Field supplies are interface symbols, intentionally authored in code. */
function supplyIcon(
  ctx: Ctx,
  id: C.ItemId,
  x: number,
  y: number,
  scale = 1,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  box(ctx, 0, 0, 30, 30, "#233a41", P.line, 3);
  ctx.strokeStyle = P.mint;
  ctx.lineWidth = 2;
  if (id === "dynamite") {
    for (let i = 0; i < 3; i++) box(ctx, 6 + i * 6, 9, 4, 16, P.red);
    rule(ctx, 5, 17, 21, P.amber);
    ctx.beginPath();
    ctx.moveTo(15, 9);
    ctx.lineTo(15, 4);
    ctx.lineTo(23, 4);
    ctx.stroke();
  } else if (id === "plastic-explosives") {
    box(ctx, 6, 9, 18, 15, "#879885");
    box(ctx, 11, 6, 8, 13, P.amber);
    text(ctx, "+", 12, 16, 10, P.bg, 700, true);
  } else if (id === "quantum-teleporter" || id === "matter-transmitter") {
    ctx.beginPath();
    ctx.ellipse(15, 15, 10, 5, -0.7, 0, Math.PI * 2);
    ctx.ellipse(15, 15, 10, 5, 0.7, 0, Math.PI * 2);
    ctx.stroke();
    box(ctx, 12, 12, 6, 6, id === "quantum-teleporter" ? P.amber : P.mint);
  } else if (id === "nanobots") {
    box(ctx, 7, 7, 16, 16, "#426963");
    box(ctx, 12, 9, 6, 12, P.mint);
    box(ctx, 9, 12, 12, 6, P.mint);
  } else {
    box(ctx, 8, 8, 15, 17, P.amber);
    box(ctx, 12, 4, 7, 5, P.mint);
    box(ctx, 12, 13, 7, 6, P.panel);
  }
  ctx.restore();
}
function panel(ctx: Ctx, s: ReadState): void {
  const id = s.panel!;
  ctx.fillStyle = "#060e16a8";
  ctx.fillRect(0, C.HUD_H, C.STAGE_W, C.VIEW_H);
  box(ctx, 230, 108, 820, 548, P.panel, "#6b7d71", 7);
  box(ctx, 230, 108, 820, 6, P.amber);
  text(
    ctx,
    `CAMP SERVICES  /  ${id === "inventory" ? "FIELD MANIFEST" : "SURFACE OPERATIONS"}`,
    264,
    144,
    11,
    P.mint,
    700,
    true,
  );
  text(ctx, id.replace(/-/g, " ").toUpperCase(), 264, 187, 30, P.text, 700);
  text(
    ctx,
    `${Math.floor(s.credits).toLocaleString()} CR`,
    812,
    184,
    19,
    P.amber,
    700,
    true,
  );
  rule(ctx, 264, 204, 752);
  if (id === "fuel-depot") {
    for (const [i, field] of ["fuel", "hull"].entries()) {
      const value = field === "fuel" ? s.miner.fuel : s.miner.hull,
        maximum = field === "fuel" ? maxFuel(s) : maxHull(s),
        x = 302 + i * 400;
      image(ctx, s, `icons/${field}.png`, x, 239, 40, 40);
      text(
        ctx,
        field === "fuel" ? "JETPACK FUEL" : "SUIT INTEGRITY",
        x + 56,
        252,
        15,
        P.text,
        700,
        true,
      );
      text(
        ctx,
        `${Math.ceil(value)} / ${maximum}`,
        x + 56,
        280,
        27,
        i === 0 ? P.amber : P.mint,
        700,
        true,
      );
      wrap(
        ctx,
        `${field === "fuel" ? C.FUEL_PRICE : C.REPAIR_PRICE} Credit${field === "hull" ? "s" : ""} per ${field === "fuel" ? "unit of fuel" : "point of hull"}. Pay only for what is missing.`,
        x,
        477,
        270,
        16,
        P.muted,
        26,
      );
    }
    text(
      ctx,
      "THE SURFACE IS SAFE. THE NEXT TRIP IS YOUR CALL.",
      302,
      602,
      12,
      P.mint,
      700,
      true,
    );
  } else if (id === "ore-market") {
    text(ctx, "MINERAL", 274, 239, 11, P.muted, 700, true);
    text(ctx, "UNITS", 610, 239, 11, P.muted, 700, true);
    text(ctx, "MARKET VALUE", 792, 239, 11, P.muted, 700, true);
    const held = C.MINERALS.filter((o) => (s.cargo[o.id] ?? 0) > 0);
    held.forEach((o, i) => {
      const y = 271 + i * 22;
      image(ctx, s, `ore/${o.id}.png`, 270, y - 18, 27, 27);
      text(ctx, o.name, 308, y, 15);
      text(ctx, `${s.cargo[o.id]}`, 623, y, 14, P.text, 400, true);
      text(
        ctx,
        `${((s.cargo[o.id] ?? 0) * o.value).toLocaleString()} CR`,
        806,
        y,
        14,
        P.amber,
        700,
        true,
      );
    });
    if (!held.length)
      wrap(
        ctx,
        "An empty bay earns no Credits. Descend, cut a mineral seam, and fly the haul home.",
        300,
        310,
        600,
        20,
      );
    rule(ctx, 274, 560, 722);
    text(
      ctx,
      `TOTAL HAUL  ${cargoValue(s).toLocaleString()} CR`,
      278,
      600,
      18,
      P.amber,
      700,
      true,
    );
  } else if (id === "upgrade-shop") {
    C.TRACKS.forEach((track, i) => {
      const y = 247 + i * 52,
        t = s.tiers[track],
        next = Math.min(t + 1, C.MAX_TIER[track]);
      text(ctx, track.toUpperCase(), 274, y, 15, P.text, 700, true);
      text(ctx, `T${t}`, 421, y, 14, P.amber, 700, true);
      text(ctx, upgradeDescription(track, next), 480, y, 14, P.muted);
      rule(ctx, 274, y + 17, 722, "#293c43");
    });
    text(
      ctx,
      "UPGRADES APPLY IMMEDIATELY. KEEP YOUR ADVANTAGE.",
      274,
      635,
      11,
      P.mint,
      400,
      true,
    );
  } else if (id === "supply-depot") {
    const descriptions = [
      "Clear a 3 × 3 block",
      "Clear a 5 × 5 block",
      "Risk a rough arrival at camp",
      "Return safely to the surface",
      `Restore ${C.NANOBOT_HULL} hull`,
      `Restore ${C.EMERGENCY_FUEL} fuel`,
    ];
    C.ITEMS.forEach((item, i) => {
      const y = 251 + i * 61;
      supplyIcon(ctx, item.id, 274, y - 21);
      text(ctx, `${i + 1} / ${item.name}`, 319, y, 16, P.text, 700);
      text(
        ctx,
        `${descriptions[i]}  /  HELD ${s.items[item.id]}`,
        319,
        y + 20,
        12,
        P.muted,
        400,
        true,
      );
    });
  } else if (id === "launch-pad") {
    image(ctx, s, `rocket/stage${s.rocketInstalled}.png`, 278, 235, 180, 280);
    C.ROCKET_COMPONENTS.forEach((c, i) => {
      const y = 249 + i * 58,
        done = i < s.rocketInstalled;
      box(
        ctx,
        488,
        y - 20,
        25,
        25,
        done ? P.mint : "#21363e",
        done ? P.mint : P.line,
        3,
      );
      text(
        ctx,
        done ? "✓" : String(i + 1),
        494,
        y - 2,
        14,
        done ? P.bg : P.muted,
        700,
        true,
      );
      text(ctx, c.name.toUpperCase(), 530, y, 16, done ? P.mint : P.text, 700);
      text(
        ctx,
        `${c.credits.toLocaleString()} CR${c.material ? `  +  ${c.material.toUpperCase()}` : ""}`,
        530,
        y + 21,
        12,
        P.muted,
        400,
        true,
      );
    });
    text(
      ctx,
      `${s.rocketInstalled} / ${C.ROCKET_COMPONENTS.length} SYSTEMS ONLINE`,
      274,
      599,
      15,
      P.amber,
      700,
      true,
    );
  } else if (id === "inventory") {
    text(
      ctx,
      `${cargoSlots(s)} / ${C.CARGO_TIERS[s.tiers.cargo - 1]} SLOTS  ·  ${cargoWeight(s)} / ${liftLimit(s)} kg`,
      274,
      237,
      14,
      cargoWeight(s) >= liftLimit(s) ? P.red : P.amber,
      700,
      true,
    );
    const held = C.MINERALS.filter((o) => (s.cargo[o.id] ?? 0) > 0);
    held.forEach((o, i) => {
      const y = 282 + i * 25;
      image(ctx, s, `ore/${o.id}.png`, 270, y - 20, 28, 28);
      text(ctx, o.name, 307, y - 2, 14);
      text(
        ctx,
        `${s.cargo[o.id]} × ${o.weightKg}kg`,
        426,
        y - 2,
        12,
        P.muted,
        400,
        true,
      );
    });
    if (!held.length)
      text(ctx, "NO MINERALS HELD", 280, 300, 15, P.muted, 400, true);
    text(ctx, "MATERIAL SATCHEL", 724, 237, 12, P.mint, 700, true);
    for (const [i, m] of C.MATERIALS.entries()) {
      image(ctx, s, `icons/${m}.png`, 725 + i * 140, 249, 24, 24);
      text(
        ctx,
        `${m.slice(0, 3).toUpperCase()} × ${s.satchel[m]}`,
        755 + i * 140,
        268,
        12,
        P.text,
        700,
        true,
      );
    }
    text(ctx, "FIELD SUPPLIES", 724, 300, 12, P.mint, 700, true);
    C.ITEMS.forEach((item, i) => {
      const y = 334 + i * 39;
      supplyIcon(ctx, item.id, 698, y - 17, 0.65);
      text(ctx, `${i + 1}  ${item.name}`, 724, y, 12, P.text, 400);
      text(ctx, `×${s.items[item.id]}`, 890, y, 12, P.amber, 700, true);
    });
    if (cargoWeight(s) >= liftLimit(s))
      text(
        ctx,
        `${C.OVERLOAD} — DROP ORE TO CLIMB`,
        274,
        624,
        13,
        P.red,
        700,
        true,
      );
    else
      text(
        ctx,
        "DROPPED ORE IS LOST. MATERIALS WEIGH NOTHING.",
        274,
        624,
        10,
        P.muted,
        400,
        true,
      );
  }
  text(ctx, "ESC / P  CLOSE", 264, 644, 10, P.muted, 400, true);
}
function upgradeDescription(track: C.TrackName, tier: number): string {
  const i = tier - 1;
  switch (track) {
    case "fuel":
      return `${C.FUEL_TIERS[i]} fuel capacity`;
    case "drill":
      return `Power rating ${tier} / ${C.MAX_TIER.drill}`;
    case "cargo":
      return `${C.CARGO_TIERS[i]} cargo slots`;
    case "hull":
      return `${C.HULL_TIERS[i]} maximum hull`;
    case "jetpack":
      return `${C.JETPACK_TIERS[i].liftLimitKg.toLocaleString()} kg lift / ${C.JETPACK_TIERS[i].emptyClimb} speed`;
    case "radiator":
      return `${Math.round(C.RADIATOR_TIERS[i] * 100)}% lava protection`;
    case "scanner":
      return `${C.SCANNER_TIERS[i] ?? 0} tile lock range`;
  }
}
function titleScene(ctx: Ctx, s: ReadState): void {
  image(ctx, s, "surface/sky.png", 0, 0, C.STAGE_W, C.STAGE_H);
  const shade = ctx.createLinearGradient(0, 0, C.STAGE_W, 0);
  shade.addColorStop(0, "#101b24fa");
  shade.addColorStop(0.48, "#101b24ed");
  shade.addColorStop(1, "#101b2440");
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, C.STAGE_W, C.STAGE_H);
  // A cutaway assembled from the actual in-game assets, presented as a survey plate.
  ctx.save();
  ctx.beginPath();
  ctx.rect(650, 214, 630, 506);
  ctx.clip();
  for (let row = 0; row < 7; row++)
    for (let col = 0; col < 9; col++) {
      const x = 650 + col * C.TILE,
        y = 214 + row * C.TILE;
      image(
        ctx,
        s,
        `tiles/${row < 2 ? "topsoil" : row < 5 ? "rockbed" : "deepstone"}-${(col + row * 2) % C.TILE_VARIANTS}.png`,
        x,
        y,
        C.TILE,
        C.TILE,
      );
      const open =
        (col === 3 && row < 5) ||
        (row === 4 && col >= 3 && col <= 6) ||
        (col === 6 && row >= 4);
      if (open) {
        if ((col === 3 && row < 5) || (col === 6 && row >= 4))
          image(ctx, s, "tiles/tunnel.png", x + 8, y, 64, 80);
        if (row === 4 && col >= 3 && col <= 6)
          image(ctx, s, "tiles/tunnel.png", x, y + 8, 80, 64);
      } else if ((col * 3 + row * 7) % 5 === 0)
        image(
          ctx,
          s,
          `ore/${["ferron", "cuprite", "argenite", "cobaltine"][(col + row) % 4]}.png`,
          x,
          y,
          C.TILE,
          C.TILE,
        );
    }
  ctx.restore();
  box(ctx, 650, 208, 630, 6, "#859282");
  image(ctx, s, "surface/upgrade-shop.png", 681, 67, 240, 144);
  image(ctx, s, "surface/save-pad.png", 984, 65, 200, 150);
  miner(
    ctx,
    { ...s, animationTime: s.simTime } as ReadState,
    905,
    415,
    1.25,
    "drill-down",
  );
  box(ctx, 694, 598, 420, 63, "#13262eef", "#5a7970", 3);
  text(ctx, "DEPTH IS CHEAP.", 716, 625, 17, P.amber, 700, true);
  text(ctx, "THE CLIMB HOME IS WHAT COSTS.", 716, 647, 14, P.text, 400, true);
  rule(ctx, 650, 41, 84, P.mint);
  text(
    ctx,
    "SURVEY 07 / ABANDONED MINING WORLD",
    744,
    46,
    10,
    P.mint,
    400,
    true,
  );
  ctx.fillStyle = "#0c1822bb";
  ctx.fillRect(0, 0, 620, C.STAGE_H);
}
function menu(ctx: Ctx, s: ReadState): void {
  if (s.screen === "paused") {
    ctx.fillStyle = "#09131ccb";
    ctx.fillRect(0, C.HUD_H, C.STAGE_W, C.VIEW_H);
    text(ctx, "SHIFT ON HOLD", 430, 233, 43, P.text, 700);
    text(ctx, "The mine can wait. So can the Core.", 430, 269, 16, P.muted);
  } else if (s.screen === "how-to-play") {
    box(ctx, 48, 45, 1184, 650, "#13232bee", P.line, 5);
    text(ctx, "PROSPECTOR’S FIELD MANUAL", 88, 98, 14, P.mint, 700, true);
    text(ctx, "GO DEEP. COME BACK.", 88, 151, 44, P.text, 700);
    const sections = [
      [
        "01 / MAKE YOUR WAY OFF THIS ROCK",
        "Dig ore. Fly it home. Sell it at the Ore Market, buy fuel and upgrades, then build the five-component escape rocket. Launching is your only way out.",
      ],
      [
        "02 / THE DRILL ONLY GOES DOWN",
        "A / D or ← / → move and cut walls. S / ↓ bores below your boots. W / ↑ / SPACE fires the jetpack. You must stand on solid ground to drill. Never drill upward.",
      ],
      [
        "03 / PLAN THE CLIMB HOME",
        "Fuel powers drilling, jetpack thrust, air drift, and underground life support. At zero underground, the expedition ends. The surface never refills you for free.",
      ],
      [
        "04 / A FULL BAY IS NOT ALWAYS A GOOD BAY",
        "Slots limit how much ore you collect; weight limits what you can lift. I opens inventory. Drop ore if overloaded. E activates camp buildings. 1–6 use field supplies.",
      ],
      [
        "05 / THE PLANET IS THE ADVERSARY",
        "Watch for gas seeps, lava pools, boulders, and hard landings. Buy a scanner to find Resonite and Cryenite. The Core Sample starts a 90-second countdown. J jettisons it.",
      ],
      [
        "06 / BANK YOUR PROGRESS",
        "Save at the surface Save Pad. Standard restores your last save after death; Hardcore deletes it. You cannot save a live Core Sample. ESC / P pauses; M mutes.",
      ],
    ];
    sections.forEach(([heading, body], i) => {
      const x = i < 3 ? 88 : 674,
        y = 210 + (i % 3) * 131;
      text(ctx, heading, x, y, 12, P.amber, 700, true);
      wrap(ctx, body, x, y + 29, 510, 16, P.text, 24);
    });
  } else {
    if (s.screen === "game-over" || s.screen === "victory") {
      world(ctx, s);
      const veil = ctx.createLinearGradient(0, 0, C.STAGE_W, 0);
      veil.addColorStop(0, "#0d1a23ff");
      veil.addColorStop(0.45, "#0d1a23fa");
      veil.addColorStop(0.7, "#0d1a2366");
      veil.addColorStop(1, "#0d1a2322");
      ctx.fillStyle = veil;
      ctx.fillRect(0, 0, C.STAGE_W, C.STAGE_H);
    } else titleScene(ctx, s);
    text(
      ctx,
      "D C  /  DEEP-SPACE EXTRACTION DIVISION",
      104,
      89,
      11,
      P.mint,
      700,
      true,
    );
    if (s.screen === "title") {
      text(ctx, C.TITLE_TEXT, 96, 241, 91, P.text, 900);
      rule(ctx, 104, 269, 112, P.amber);
      text(
        ctx,
        "ONE PROSPECTOR. ONE WAY OUT.",
        104,
        311,
        17,
        P.amber,
        700,
        true,
      );
      wrap(
        ctx,
        "A dead world. A broken ship. Everything you need to leave is buried beneath your boots.",
        104,
        344,
        446,
        17,
        P.muted,
        25,
      );
      text(
        ctx,
        "DIG / HAUL / FABRICATE / ESCAPE",
        104,
        641,
        11,
        P.mint,
        400,
        true,
      );
    } else if (s.screen === "mode-select") {
      text(ctx, "01 / EXPEDITION RULES", 104, 171, 12, P.amber, 700, true);
      text(ctx, "CHOOSE YOUR", 104, 235, 43, P.text, 700);
      text(ctx, "STAKES.", 104, 282, 43, P.text, 700);
      const y = 617;
      wrap(
        ctx,
        s.menuIndex === 1
          ? "HARDCORE: Death deletes your save and ends the expedition. No second shift."
          : "STANDARD: Death lets you restore the expedition from your last visit to the Save Pad.",
        104,
        y,
        450,
        16,
        P.muted,
        25,
      );
    } else if (s.screen === "size-select") {
      text(ctx, "02 / SURVEY DEPTH", 104, 171, 12, P.amber, 700, true);
      text(ctx, "HOW FAR DOWN?", 104, 240, 43, P.text, 700);
      text(
        ctx,
        `${s.mode.toUpperCase()} EXPEDITION`,
        104,
        271,
        12,
        P.mint,
        700,
        true,
      );
      text(
        ctx,
        "SAME PLANET. A DIFFERENT COMMITMENT.",
        104,
        654,
        11,
        P.muted,
        400,
        true,
      );
    } else {
      const win = s.screen === "victory";
      text(
        ctx,
        win
          ? "TRANSMISSION / EXTRACTION COMPLETE"
          : "TRANSMISSION / SIGNAL LOST",
        104,
        143,
        12,
        win ? P.mint : P.red,
        700,
        true,
      );
      text(ctx, win ? "YOU MADE IT" : "THE MINE", 104, 221, 58, P.text, 800);
      text(
        ctx,
        win ? "OFF THE ROCK." : "KEEPS ITS DUE.",
        104,
        285,
        58,
        P.text,
        800,
      );
      const summary = s.summary;
      if (summary) {
        const stats = [
          [
            "DEEPEST",
            `${Math.floor(summary.deepestDepthMeters).toLocaleString()} m`,
          ],
          ["CREDITS EARNED", summary.creditsEarned.toLocaleString()],
          [
            "TIME",
            `${Math.floor(summary.elapsedSeconds / 60)}m ${Math.floor(summary.elapsedSeconds % 60)}s`,
          ],
          [
            "SYSTEMS",
            `${summary.componentsInstalled} / ${C.ROCKET_COMPONENTS.length}`,
          ],
        ];
        stats.forEach(([label, value], i) => {
          const x = 104 + (i % 2) * 243,
            y = 340 + Math.floor(i / 2) * 69;
          text(ctx, label, x, y, 10, P.muted, 700, true);
          text(ctx, value, x, y + 27, 23, P.amber, 700, true);
        });
        text(
          ctx,
          `${summary.mode.toUpperCase()}${summary.deathCause ? ` / ${summary.deathCause.replace(/-/g, " ").toUpperCase()}` : " / EXPEDITION SUCCESS"}`,
          104,
          480,
          11,
          P.mint,
          700,
          true,
        );
      }
    }
    rule(ctx, 48, 689, 1184);
    text(ctx, "DEEPCORE", 48, 710, 10, P.muted, 700, true);
    text(
      ctx,
      "A / D / ↑ / ↓  NAVIGATE     ENTER  CONFIRM     M  SOUND",
      778,
      710,
      10,
      P.muted,
      400,
      true,
    );
  }
  menuItems(s).forEach((item, i) => {
    const r = menuRect(s, i)!;
    if (s.screen === "mode-select" && i < C.MODES.length) {
      button(ctx, r, "", s.menuIndex === i);
      const color = s.menuIndex === i ? P.bg : P.text;
      text(ctx, `›  ${item}`, r.x + 17, r.y + 26, 16, color, 700, true);
      text(
        ctx,
        i === 0
          ? "Death restores your last Save Pad checkpoint."
          : "Death deletes your save. One expedition only.",
        r.x + 17,
        r.y + 48,
        11,
        color,
        400,
        true,
      );
    } else
      button(
        ctx,
        r,
        `${s.menuIndex === i ? "›" : " "}  ${item}`,
        s.menuIndex === i,
      );
    if (s.screen === "size-select" && i < C.WORLD_SIZES.length) {
      text(
        ctx,
        `${Math.round(C.STANDARD_ROWS * C.WORLD_SIZE_SCALE[C.WORLD_SIZES[i]]) * C.METERS_PER_ROW} m`,
        r.x + r.w - 100,
        r.y + 39,
        14,
        s.menuIndex === i ? P.bg : P.muted,
        700,
        true,
      );
    }
  });
}
export function render(s: ReadState, api: RenderApi): void {
  const ctx = api.ctx;
  ctx.imageSmoothingEnabled = false;
  if (
    ["in-mine", "paused"].includes(s.screen) ||
    (s.screen === "victory" && s.launchTime !== null && s.launchTime < 3.2)
  ) {
    world(ctx, s);
    hud(ctx, s);
    if (s.screen === "in-mine") {
      if (s.panel) panel(ctx, s);
      for (const c of controls(s)) {
        if (c.id === "dismiss-notice") continue;
        const selected = s.hover === `control:${c.id}:${c.subject ?? ""}`;
        button(ctx, c, c.label, selected, c.enabled);
      }
      if (s.notice?.shown) {
        box(ctx, 320, 588, 640, 96, "#253039f5", P.amber, 4);
        text(
          ctx,
          s.notice.hazard === "gas"
            ? "VOLATILE GAS / WATCH THE ROCK BREATHE"
            : "MOLTEN ROCK / UPGRADE YOUR RADIATOR",
          342,
          618,
          15,
          P.amber,
          700,
          true,
        );
        wrap(
          ctx,
          s.notice.hazard === "gas"
            ? "A faint seep gives a pocket away. Drill around it, or bring a stronger hull."
            : "Lava burns on contact and when drilled. A radiator cuts the damage. Find a cooler route.",
          342,
          644,
          590,
          15,
          P.text,
          21,
        );
      }
      if (s.noteLeft > 0) {
        const w = clamp(ctx.measureText(s.note).width + 50, 420, 940);
        box(
          ctx,
          (C.STAGE_W - w) / 2,
          s.panel ? 675 : 620,
          w,
          32,
          "#11232cf2",
          P.line,
          3,
        );
        text(
          ctx,
          s.note,
          (C.STAGE_W - w) / 2 + 16,
          s.panel ? 697 : 642,
          13,
          P.mint,
          400,
          true,
        );
      }
    } else if (s.screen === "paused") menu(ctx, s);
  } else menu(ctx, s);
}
