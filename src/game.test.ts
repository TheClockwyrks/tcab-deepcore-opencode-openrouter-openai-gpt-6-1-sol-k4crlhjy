/// <reference types="node" />
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { createCanvas, loadImage, Image } from "@napi-rs/canvas";
import { readFile } from "node:fs/promises";
import { Buffer } from "node:buffer";
import {
  createEngine,
  ConstantClock,
  SequenceClock,
  type Engine,
  type Game,
} from "@clockwyrks/simple-2d";
import {
  game,
  BACKGROUND,
  type DeepcoreState,
  type DeepcoreDebugApi,
} from "./game";
import * as C from "./constants";
import { generate, at, bandAt, cargoWeight, tile } from "./world";
import { initial, resume, start } from "./session";
import { makeDebug } from "./debug";
import { assetPath } from "./assets";
import { copy, type Assets, type ReadState } from "./model";
import { step, FIXED_STEP } from "./simulation";
import * as T from "./transactions";
import { menuItems, menuRect, controls } from "./interface";

type TestEngine = Engine<DeepcoreState, DeepcoreDebugApi>;
let assets: Assets;
const memory = new Map<string, string>();
const storage = {
  getItem: (k: string) => memory.get(k) ?? null,
  setItem: (k: string, v: string) => {
    memory.set(k, v);
  },
  removeItem: (k: string) => {
    memory.delete(k);
  },
};
const engines: TestEngine[] = [];

beforeAll(async () => {
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal(
    "fetch",
    async (input: string) =>
      new Response(
        await readFile(new URL(`../${input.split("?")[0]}`, import.meta.url)),
      ),
  );
  vi.stubGlobal("createImageBitmap", async (blob: Blob) =>
    loadImage(Buffer.from(await blob.arrayBuffer())),
  );
  vi.stubGlobal("ImageBitmap", Image);
  vi.stubGlobal("OffscreenCanvas", function (width: number, height: number) {
    return createCanvas(width, height);
  });
  vi.stubGlobal(
    "AudioContext",
    class {
      async decodeAudioData(bytes: ArrayBuffer) {
        expect(Buffer.from(bytes).toString("ascii", 0, 4)).toBe("RIFF");
        return {
          duration: bytes.byteLength / 88200,
          numberOfChannels: 1,
          sampleRate: 44100,
        };
      }
    },
  );
  const { engine } = await fixture(true, true);
  assets = engine.state.assets as Assets;
  engine.destroy();
});
beforeEach(() => {
  memory.clear();
});
afterEach(() => {
  for (const e of engines) e.destroy();
  engines.length = 0;
});

async function fixture(render = false, load = false) {
  const target = new EventTarget();
  const canvas = createCanvas(C.STAGE_W, C.STAGE_H);
  const testGame: Game<DeepcoreState, DeepcoreDebugApi> = {
    ...game,
    initialize: load
      ? game.initialize
      : async (api) => {
          for (const name of C.ACTION_NAMES)
            api.input.register(name, { keys: [...C.ACTIONS[name]] });
          for (const cue of Object.values(C.CUES))
            api.audio.define(cue, { freq: 100, durationMs: 10 });
          return [initial(assets), makeDebug()];
        },
    render: render ? game.render : () => undefined,
  };
  const engine = createEngine({
    canvas: canvas as unknown as HTMLCanvasElement,
    width: C.STAGE_W,
    height: C.STAGE_H,
    game: testGame,
    background: BACKGROUND,
    clock: new ConstantClock(1000 / 60),
    surface: {
      cssWidth: () => C.STAGE_W,
      cssHeight: () => C.STAGE_H,
      dpr: () => 1,
      events: () => target,
    },
  });
  await engine.initialize();
  engines.push(engine);
  const key = (code: string, down = true) =>
    target.dispatchEvent(
      Object.assign(new Event(down ? "keydown" : "keyup"), {
        code,
        repeat: false,
      }),
    );
  const press = async (code: string) => {
    key(code);
    await engine.advance(1);
    key(code, false);
  };
  const pose = (f: (d: DeepcoreDebugApi, s: ReadState) => DeepcoreState) =>
    engine.apply((s) => f(engine.debug, s));
  const snap = () => engine.debug.snapshot(engine.state);
  const pointer = (
    type: string,
    x: number,
    y: number,
    id = 1,
    device = "mouse",
  ) =>
    target.dispatchEvent(
      Object.assign(new Event(type), {
        clientX: x,
        clientY: y,
        pointerId: id,
        pointerType: device,
        isPrimary: true,
        button: 0,
        buttons: type === "pointerup" ? 0 : 1,
      }),
    );
  return { engine, key, press, pose, snap, pointer, canvas };
}
async function mineFixture(row = 20, render = false) {
  const f = await fixture(render);
  f.pose((d, s) => d.setScreen(s, "in-mine"));
  f.pose((d, s) => d.clearMine(s));
  f.pose((d, s) =>
    d.setMinerPosition(s, 12 * C.TILE + 12, row * C.TILE - C.MINER_H),
  );
  f.pose((d, s) => d.setTile(s, 12, row, "rock"));
  f.pose((d, s) => d.setTile(s, 12, row + 1, "rock"));
  return f;
}

describe("asset loading and presentation", () => {
  it("keeps Vite development and production URLs inside the engine asset root", () => {
    expect(assetPath("/assets/miner/idle/frame00.png?no-inline")).toBe(
      "miner/idle/frame00.png?no-inline",
    );
    expect(assetPath("./assets/frame00-hash.png")).toBe("frame00-hash.png");
    expect(
      assetPath("https://example.test/nested/deepcore/assets/frame00-hash.png"),
    ).toBe("frame00-hash.png");
  });
  it("loads all original cycles, environments, sounds and particle definitions", () => {
    expect(Object.keys(assets.images).length).toBeGreaterThan(90);
    expect(Object.keys(assets.effects)).toHaveLength(12);
    for (const state of C.MINER_STATES)
      expect(
        Object.keys(assets.images).filter((k) =>
          k.startsWith(`miner/${state}/`),
        ).length,
      ).toBeGreaterThanOrEqual(2);
  });
  it("registers diagnostics as live, pure readings of the engine state", async () => {
    const f = await fixture(false, true);
    f.pose((d, s) => d.setCredits(s, 4321));
    const before = f.snap();
    const readings = f.engine.diagnostics();
    expect(readings).toHaveLength(15);
    expect(readings.every((r) => !r.error)).toBe(true);
    expect(readings.find((r) => r.name === "credits")?.value).toBe(4321);
    expect(f.snap()).toEqual(before);
  });
  it("renders every screen and every panel through a real canvas", async () => {
    const f = await fixture(true);
    for (const screen of C.SCREENS) {
      f.pose((d, s) => d.setScreen(s, screen));
      await f.engine.advance(1);
    }
    f.pose((d, s) => d.setScreen(s, "in-mine"));
    for (const panel of C.PANELS) {
      f.pose((d, s) => d.setPanel(s, panel));
      await f.engine.advance(1);
    }
    expect(f.canvas.toBuffer("image/png").byteLength).toBeGreaterThan(15000);
  });
  it("records actual draw commands and produced images", async () => {
    const f = await mineFixture(20, true);
    f.engine.startRecording();
    f.key("KeyS");
    await f.engine.advance(10);
    f.key("KeyS", false);
    const recording = f.engine.stopRecording();
    expect(recording.frames).toHaveLength(10);
    expect(recording.images.length).toBeGreaterThan(10);
    expect(recording.ops.length).toBeGreaterThan(100);
  });
});

describe("menus and input", () => {
  it("activates services only while standing at the building, while debug controls remain location-free", async () => {
    const f = await fixture();
    f.pose((d, s) => d.generateMine(s));
    f.pose((d, s) => d.setScreen(s, "in-mine"));
    await f.press("KeyE");
    expect(f.snap().panel).toBe("fuel-depot");
    await f.press("Escape");
    const pad = f.engine.debug
      .buildings(f.engine.state)
      .find((b) => b.id === "save-pad")!;
    f.pose((d, s) => d.setMinerPosition(s, pad.x + 30, 4 * C.TILE));
    await f.press("KeyE");
    expect(f.snap().hasSave).toBe(false);
    f.pose((d, s) => d.save(s));
    expect(f.snap().hasSave).toBe(true);
  });
  it("a complete pointer click on a reported panel control performs the real purchase", async () => {
    const f = await fixture();
    f.pose((d, s) => d.setScreen(s, "in-mine"));
    f.pose((d, s) => d.setPanel(s, "fuel-depot"));
    f.pose((d, s) => d.setFuel(s, 10));
    f.pose((d, s) => d.setCredits(s, 100));
    const r = f.engine.debug.controlRect(f.engine.state, "fill-fuel", null)!;
    f.pointer("pointerdown", r.x + 20, r.y + 20);
    f.pointer("pointerup", r.x + 20, r.y + 20);
    await f.engine.advance(1);
    expect(f.snap().miner.fuel).toBe(100);
    expect(f.snap().credits).toBe(10);
  });
  it("starts at title, selects mode then size, and begins with an empty bay", async () => {
    const f = await fixture();
    expect(f.snap().screen).toBe("title");
    await f.press("Enter");
    expect(f.snap().screen).toBe("mode-select");
    await f.press("ArrowDown");
    await f.press("Enter");
    expect(f.snap().mode).toBe("hardcore");
    await f.press("Enter");
    expect(f.snap().screen).toBe("in-mine");
    expect(f.snap().coreRow).toBe(C.STANDARD_ROWS * C.WORLD_SIZE_SCALE.quick);
    expect(f.snap().cargo.slotsUsed).toBe(0);
    expect(f.snap().miner.fuel).toBe(C.FUEL_TIERS[0]);
  });
  it("wraps menu navigation and returns to the entry that led away", async () => {
    const f = await fixture();
    await f.press("ArrowUp");
    expect(f.snap().menuIndex).toBe(1);
    await f.press("Enter");
    expect(f.snap().screen).toBe("how-to-play");
    await f.press("Escape");
    expect(f.snap().menuIndex).toBe(1);
    await f.press("ArrowUp");
    await f.press("Enter");
    await f.press("Enter");
    await f.press("KeyP");
    expect(f.snap().screen).toBe("mode-select");
    await f.press("Escape");
    expect(f.snap().screen).toBe("title");
    expect(f.snap().menuIndex).toBe(0);
  });
  it("requires both pointer edges inside one item and accepts touch", async () => {
    const f = await fixture();
    const r = f.engine.debug.menuItemRect(f.engine.state, 0)!;
    f.pointer("pointerdown", r.x + 20, r.y + 20);
    f.pointer("pointerup", r.x - 10, r.y - 10);
    await f.engine.advance(1);
    expect(f.snap().screen).toBe("title");
    f.pointer("pointerdown", r.x + 20, r.y + 20, 3, "touch");
    f.pointer("pointerup", r.x + 20, r.y + 20, 3, "touch");
    await f.engine.advance(1);
    expect(f.snap().screen).toBe("mode-select");
  });
  it("opens inventory anywhere, closes it before pausing, and freezes the expedition", async () => {
    const f = await mineFixture();
    await f.press("KeyI");
    expect(f.snap().panel).toBe("inventory");
    await f.press("Escape");
    expect(f.snap().panel).toBeNull();
    await f.press("KeyP");
    const paused = f.snap();
    await f.engine.advance(60);
    expect(f.snap().elapsedSeconds).toBe(paused.elapsedSeconds);
    expect(f.snap().simTime).toBeGreaterThan(paused.simTime);
    await f.press("Escape");
    expect(f.snap().screen).toBe("in-mine");
  });
  it("mirrors the engine mute preference and exposes only drawn controls", async () => {
    const f = await fixture();
    expect(f.engine.debug.controlRect(f.engine.state, "sell", null)).toBeNull();
    await f.press("KeyM");
    expect(f.snap().muted).toBe(true);
    f.pose((d, s) => d.setScreen(s, "in-mine"));
    f.pose((d, s) => d.setPanel(s, "ore-market"));
    expect(
      f.engine.debug.controlRect(f.engine.state, "sell", null),
    ).not.toBeNull();
    expect(f.engine.debug.menuItemRect(f.engine.state, 0)).toBeNull();
  });
});

describe("world generation and resizing", () => {
  it.each(C.WORLD_SIZES)(
    "generates all bands, exact material nodes, and a safe route at %s size",
    (size) => {
      let s = initial(assets);
      s = makeDebug().setWorldSize(s, size);
      generate(s);
      expect(s.grid.length).toBe(s.coreRow + 1);
      expect(at(s, C.CORE_COL, s.coreRow).kind).toBe("core");
      expect(at(s, C.CAVE_MOUTH_COL, 1).kind).toBe("tunnel");
      for (const material of C.MATERIALS)
        expect(
          s.grid.flat().filter((t) => t.material === material),
        ).toHaveLength(1);
      for (let row = 1; row < s.coreRow; row++) {
        expect(at(s, 0, row).kind).toBe("bedrock");
        expect(at(s, C.WORLD_COLS - 1, row).kind).toBe("bedrock");
        expect(["lava", "stone"]).not.toContain(
          at(s, C.CAVE_MOUTH_COL, row).kind,
        );
      }
      for (const band of C.BANDS) {
        const cells = s.grid.flat().filter((t) => t.band === band);
        const share =
          cells.filter((t) => t.kind === "ore").length / cells.length;
        expect(share).toBeGreaterThan(
          C.ORE_DENSITY * (1 - C.DENSITY_TOLERANCE),
        );
        expect(share).toBeLessThan(C.ORE_DENSITY * (1 + C.DENSITY_TOLERANCE));
      }
      for (const n of s.grid.flat().filter((t) => t.material))
        expect(n.band).toBe(C.MATERIAL_BAND[n.material!]);
    },
  );
  it("resizes without regenerating shared cells or their original band and health", () => {
    const d = makeDebug();
    let s = initial(assets);
    s = d.setOreTile(s, 5, 200, "adamite");
    s = d.setTileHealth(s, 5, 200, 3);
    const before = d.tileAt(s, 5, 200);
    s = d.setWorldSize(s, "quick");
    expect(d.tileAt(s, 5, 200)).toEqual(before);
    expect(before.band).not.toBe(bandAt(200, s.coreRow));
    s = d.setWorldSize(s, "marathon");
    expect(d.tileAt(s, 5, 200)).toEqual(before);
    expect(d.tileAt(s, C.CORE_COL, 250).kind).toBe("tunnel");
    expect(d.tileAt(s, 10, 900).kind).toBe("tunnel");
  });
  it("places six separated buildings with bases on the camp ground", () => {
    const buildings = makeDebug().buildings(initial(assets));
    expect(buildings).toHaveLength(C.BUILDINGS.length);
    for (let i = 0; i < buildings.length; i++) {
      const b = buildings[i];
      expect(b.y + b.h).toBe(C.SURFACE_Y);
      if (i)
        expect(
          b.x - buildings[i - 1].x - buildings[i - 1].w,
        ).toBeGreaterThanOrEqual(C.BUILDING_GAP);
    }
  });
});

describe("movement, drilling and immutable transitions", () => {
  it("integrates gravity, reaches terminal speed and collides without crossing the floor", async () => {
    const f = await mineFixture(25);
    f.pose((d, s) => d.setMinerPosition(s, 12 * C.TILE + 12, 20 * C.TILE));
    await f.engine.advance(120);
    expect(f.snap().miner.y + C.MINER_H).toBe(25 * C.TILE);
    expect(f.snap().miner.vy).toBe(0);
    expect(f.snap().miner.hull).toBeLessThan(C.HULL_TIERS[0]);
  });
  it("drills at the exact cadence, preserves cell damage, and spends fuel per hit", async () => {
    const f = await mineFixture();
    f.pose((d, s) => d.setMinerTravel(s, false));
    f.key("KeyS");
    await f.engine.advance(15);
    f.key("KeyS", false);
    expect(f.engine.debug.tileAt(f.engine.state, 12, 20).health).toBe(2);
    expect(f.snap().miner.fuel).toBeCloseTo(
      100 - 2 * C.DRILL_HIT_FUEL - 0.25 * C.LIFE_SUPPORT_BURN,
      5,
    );
    await f.engine.advance(10);
    expect(f.engine.debug.tileAt(f.engine.state, 12, 20).health).toBe(2);
    f.key("KeyS");
    await f.engine.advance(15);
    expect(f.engine.debug.tileAt(f.engine.state, 12, 20).kind).toBe("tunnel");
  });
  it("sinks continuously during a down cut and banks exactly one ore", async () => {
    const f = await mineFixture();
    f.pose((d, s) => d.setOreTile(s, 12, 20, "cuprite"));
    const y = f.snap().miner.y;
    f.key("KeyS");
    await f.engine.advance(5);
    expect(f.snap().miner.y).toBeGreaterThan(y);
    await f.engine.advance(25);
    f.key("KeyS", false);
    expect(f.snap().cargo.ore.cuprite).toBe(1);
    expect(f.snap().miner.y + C.MINER_H).toBeCloseTo(21 * C.TILE, 5);
  });
  it("cuts only on the ground and only after reaching a side wall", async () => {
    const f = await mineFixture();
    f.pose((d, s) => d.setTile(s, 13, 19, "rock"));
    f.key("KeyD");
    await f.engine.advance(2);
    expect(f.engine.debug.tileAt(f.engine.state, 13, 19).health).toBe(
      C.BAND_HEALTH.topsoil,
    );
    await f.engine.advance(40);
    expect(f.engine.debug.tileAt(f.engine.state, 13, 19).kind).toBe("tunnel");
    f.pose((d, s) => d.setMinerPosition(s, 12 * C.TILE + 12, 15 * C.TILE));
    f.key("KeyS");
    await f.engine.advance(10);
    expect(f.snap().miner.drilling).toBeNull();
  });
  it("honors travel and drill faculty gates independently", async () => {
    const f = await mineFixture();
    f.pose((d, s) => d.setMinerTravel(s, false));
    const pos = f.snap().miner.y;
    f.key("KeyS");
    await f.engine.advance(15);
    expect(f.snap().miner.y).toBe(pos);
    expect(f.engine.debug.tileAt(f.engine.state, 12, 20).health).toBe(2);
    f.pose((d, s) => d.setMinerDrill(s, false));
    await f.engine.advance(30);
    expect(f.engine.debug.tileAt(f.engine.state, 12, 20).health).toBe(2);
  });
  it("cannot drill bedrock, stone or upward", async () => {
    const f = await mineFixture();
    f.pose((d, s) => d.setTile(s, 12, 20, "stone"));
    f.key("KeyS");
    await f.engine.advance(60);
    expect(f.snap().miner.drilling).toBeNull();
    expect(f.engine.debug.tileAt(f.engine.state, 12, 20).kind).toBe("stone");
    f.key("KeyS", false);
    f.key("Space");
    await f.engine.advance(20);
    expect(f.snap().miner.state).toBe("jetpack");
  });
  it("does not sink while cutting a bridge above an opening", async () => {
    const f = await mineFixture();
    f.pose((d, s) => d.setTile(s, 12, 21, "tunnel"));
    const y = f.snap().miner.y;
    f.key("KeyS");
    await f.engine.advance(20);
    expect(f.snap().miner.y).toBe(y);
  });
  it("scales load against lift, and dropping ore restores climb acceleration", async () => {
    const f = await mineFixture();
    f.pose((d, s) => d.setCargo(s, "adamite", 5));
    f.key("Space");
    await f.engine.advance(30);
    expect(f.snap().miner.overloaded).toBe(true);
    expect(f.snap().miner.vy).toBe(0);
    f.pose((d, s) => d.dropOre(s, "adamite"));
    await f.engine.advance(30);
    expect(f.snap().miner.vy).toBeLessThan(0);
    expect(f.snap().cargo.loadKg).toBe(4 * 84);
  });
  it("does not mutate the prior frame or a posed state", async () => {
    const f = await mineFixture();
    const previous = f.engine.state;
    const before = f.engine.debug.snapshot(previous);
    const gridBefore = previous.grid[20][12];
    f.key("KeyS");
    await f.engine.advance(20);
    expect(f.engine.debug.snapshot(previous)).toEqual(before);
    expect(previous.grid[20][12]).toEqual(gridBefore);
    expect(previous.grid[20][12].health).toBe(C.BAND_HEALTH.topsoil);
  });
  it("gives identical simulation results across different frame partitions", () => {
    const d = makeDebug();
    let base = d.clearMine(initial(assets));
    base = d.setScreen(base, "in-mine");
    base = d.setMinerPosition(base, 500, 1000);
    base = d.setFuel(base, 500);
    base = d.setMinerDrill(base, false);
    const simulate = (steps: number) => {
      const s = copy(base);
      for (let i = 0; i < steps; i++)
        step(
          s,
          { left: false, right: false, down: false, up: true },
          1 / steps,
        );
      return d.snapshot(s);
    };
    const a = simulate(120),
      b = simulate(240);
    expect(a.miner.fuel).toBeCloseTo(b.miner.fuel, 1);
    expect(a.miner.vy).toBeCloseTo(b.miner.vy, 5);
    expect(Math.abs(a.miner.y - b.miner.y)).toBeLessThan(6);
  });
});

describe("hazards, cargo, scanner and time", () => {
  it("clears ore but does not bank it when the bay is full", async () => {
    const f = await mineFixture();
    f.pose((d, s) => d.setCargo(s, "ferron", C.CARGO_TIERS[0]));
    f.pose((d, s) => d.setOreTile(s, 12, 20, "cuprite"));
    f.key("KeyS");
    await f.engine.advance(30);
    expect(f.snap().cargo.slotsUsed).toBe(C.CARGO_TIERS[0]);
    expect(f.engine.debug.tileAt(f.engine.state, 12, 20).kind).toBe("tunnel");
  });
  it("banks weightless materials and points the scanner toward what is missing", async () => {
    const f = await mineFixture(150);
    f.pose((d, s) => d.setTier(s, "scanner", 2));
    f.pose((d, s) => d.setMaterialTile(s, 15, 150, "resonite"));
    expect(f.snap().scanner.locked).toBe(true);
    expect(f.snap().scanner.target).toBe("resonite");
    expect(f.snap().scanner.dirX).toBeGreaterThan(0);
    f.pose((d, s) => d.setMaterial(s, "resonite", 1));
    expect(f.snap().scanner.locked).toBe(false);
    expect(f.snap().cargo.loadKg).toBe(0);
  });
  it("gas deals depth-scaled damage, raises a delayed one-time notice, and shakes", async () => {
    const f = await mineFixture(150);
    f.pose((d, s) => d.setHull(s, 1000));
    f.pose((d, s) => d.setMinerTravel(s, false));
    f.pose((d, s) => d.setTier(s, "drill", 5));
    f.pose((d, s) => d.setTile(s, 12, 150, "gas"));
    f.key("KeyS");
    await f.engine.advance(15);
    f.key("KeyS", false);
    expect(f.snap().miner.hull).toBeLessThan(940);
    expect(f.snap().notice?.shown).toBe(false);
    expect(f.engine.state.shake).toBeGreaterThan(0);
    await f.engine.advance(100);
    expect(f.snap().notice?.shown).toBe(true);
    f.pose((d, s) => d.dismissNotice(s));
    expect(f.snap().notice).toBeNull();
    expect(f.snap().noticesFired.gas).toBe(true);
  });
  it("radiator reduces the single lava-drill burn and suppresses contact damage on the cut", async () => {
    const f = await mineFixture(300);
    f.pose((d, s) => d.setTier(s, "radiator", 5));
    f.pose((d, s) => d.setTier(s, "drill", 5));
    f.pose((d, s) => d.setHull(s, 1000));
    f.pose((d, s) => d.setTile(s, 12, 300, "lava"));
    f.pose((d, s) => d.setMinerTravel(s, false));
    f.key("KeyS");
    await f.engine.advance(23);
    f.key("KeyS", false);
    expect(f.snap().miner.hull).toBeCloseTo(
      1000 - C.LAVA_DRILL_DEEPSTONE * (1 - C.RADIATOR_TIERS[4]),
      5,
    );
  });
  it("ticks Core timers through inventory but freezes them on the pause menu", async () => {
    const f = await mineFixture();
    f.pose((d, s) => d.setCoreCarried(s, true));
    f.pose((d, s) => d.setPanel(s, "inventory"));
    await f.engine.advance(60);
    expect(f.snap().coreTimer).toBeCloseTo(C.CORE_TIMER - 1, 5);
    f.pose((d, s) => d.setScreen(s, "paused"));
    await f.engine.advance(60);
    expect(f.snap().coreTimer).toBeCloseTo(C.CORE_TIMER - 1, 5);
  });
  it("extracts an inexhaustible Core only downward and only one live Sample", async () => {
    const f = await mineFixture();
    const row = f.snap().coreRow;
    f.pose((d, s) =>
      d.setMinerPosition(s, C.CORE_COL * C.TILE + 12, row * C.TILE - C.MINER_H),
    );
    f.key("KeyS");
    await f.engine.advance(8);
    expect(f.snap().satchel.coreSample).toBe(true);
    expect(f.engine.debug.tileAt(f.engine.state, C.CORE_COL, row).kind).toBe(
      "core",
    );
    expect(() => f.pose((d, s) => d.setCoreCarried(s, true))).toThrow();
  });
  it("jettison keeps the clock and only kills inside the ground blast radius", async () => {
    const f = await mineFixture();
    f.pose((d, s) => d.setCoreCarried(s, true));
    f.pose((d, s) => d.setCoreTimer(s, 0.2));
    f.pose((d, s) => d.jettison(s));
    const time = f.snap().coreTimer;
    expect(time).toBe(0.2);
    f.pose((d, s) => d.setMinerPosition(s, 3 * C.TILE, 20 * C.TILE));
    await f.engine.advance(20);
    expect(f.snap().screen).toBe("in-mine");
    expect(f.snap().coreTimer).toBeNull();
    f.pose((d, s) => d.setCoreCarried(s, true));
    f.pose((d, s) => d.setCoreTimer(s, 0.05));
    await f.engine.advance(5);
    expect(f.snap().summary?.deathCause).toBe("core-detonation");
  });
  it("continuously detects zero hull through an inventory overlay", async () => {
    const f = await mineFixture();
    f.pose((d, s) => d.setPanel(s, "inventory"));
    f.pose((d, s) => d.setHull(s, 0));
    await f.engine.advance(1);
    expect(f.snap().screen).toBe("game-over");
    expect(f.snap().summary?.deathCause).toBe("hull-destroyed");
  });
  it("detects stranded fuel underground but allows an empty tank at camp", async () => {
    const f = await mineFixture();
    f.pose((d, s) => d.setFuel(s, 0));
    await f.engine.advance(1);
    expect(f.snap().summary?.deathCause).toBe("fuel-out");
    f.pose((d, s) => d.reset(s));
    f.pose((d, s) => d.setScreen(s, "in-mine"));
    f.pose((d, s) => d.setTile(s, C.SPAWN_COL, 1, "rock"));
    f.pose((d, s) => d.setFuel(s, 0));
    await f.engine.advance(1);
    expect(f.snap().screen).toBe("in-mine");
  });
  it("uses carried camera lead, ramps with time, and unwinds four times faster", async () => {
    const f = await mineFixture();
    f.pose((d, s) => d.setMinerTravel(s, false));
    f.pose((d, s) => d.setMinerVelocity(s, 0, 300));
    await f.engine.advance(120);
    expect(f.snap().camera.lead).toBeCloseTo(C.CAM_LEAD_MAX, 5);
    f.pose((d, s) => d.setMinerVelocity(s, 0, 0));
    await f.engine.advance(30);
    expect(f.snap().camera.lead).toBeCloseTo(0, 5);
  });
});

describe("economy, supplies, rocket and persistence", () => {
  it("sells at canonical values, empties only cargo, and partially fills to the affordable amount", () => {
    const d = makeDebug();
    let s = initial(assets);
    s = d.setCargo(s, "cuprite", 3);
    s = d.setMaterial(s, "resonite", 1);
    s = d.sell(s);
    expect(s.credits).toBe(
      3 * C.MINERALS.find((o) => o.id === "cuprite")!.value,
    );
    expect(s.creditsEarned).toBe(s.credits);
    expect(cargoWeight(s)).toBe(0);
    expect(s.satchel.resonite).toBe(1);
    s = d.setFuel(s, 10);
    s = d.setCredits(s, 7);
    s = d.fillFuel(s);
    expect(s.miner.fuel).toBe(17);
    expect(s.credits).toBe(0);
  });
  it.each(C.TRACKS)(
    "buys %s tiers at the price ladder and rejects maxed or unaffordable purchases",
    (track) => {
      const d = makeDebug();
      let s = initial(assets);
      const noMoney = d.buyUpgrade(s, track);
      expect(noMoney.tiers[track]).toBe(1);
      s = d.setCredits(s, 50000);
      const before = s.credits;
      s = d.buyUpgrade(s, track);
      expect(s.tiers[track]).toBe(2);
      expect(s.credits).toBe(before - C.UPGRADE_PRICES[0]);
      s = d.setTier(s, track, C.MAX_TIER[track]);
      const balance = s.credits;
      s = d.buyUpgrade(s, track);
      expect(s.credits).toBe(balance);
    },
  );
  it("a larger tank and hull add only the capacity delta, not a free refill", () => {
    const d = makeDebug();
    let s = d.setCredits(initial(assets), 1000);
    s = d.setFuel(s, 30);
    s = d.buyUpgrade(s, "fuel");
    expect(s.miner.fuel).toBe(105);
    s = d.setHull(s, 20);
    s = d.buyUpgrade(s, "hull");
    expect(s.miner.hull).toBe(70);
  });
  it("explosives destroy ore and stone, leave materials and bedrock, and cost no fuel", () => {
    const d = makeDebug();
    let s = d.clearMine(initial(assets));
    s = d.setMinerPosition(s, 12 * C.TILE, 20 * C.TILE);
    s = d.setItemCount(s, "dynamite", 1);
    s = d.setOreTile(s, 12, 20, "adamite");
    s = d.setTile(s, 13, 20, "stone");
    s = d.setMaterialTile(s, 11, 20, "resonite");
    const fuel = s.miner.fuel;
    s = d.useItem(s, "dynamite");
    expect(at(s, 12, 20).kind).toBe("tunnel");
    expect(at(s, 13, 20).kind).toBe("tunnel");
    expect(at(s, 11, 20).kind).toBe("material");
    expect(s.miner.fuel).toBe(fuel);
    expect(s.cargo).toEqual({});
  });
  it("consumes posed Quantum outcomes independently and returns matter safely", () => {
    const d = makeDebug();
    let s = d.setItemCount(initial(assets), "quantum-teleporter", 1);
    s = d.setNextTeleportHeight(s, 8);
    s = d.setNextTeleportSpeed(s, 700);
    s = d.useItem(s, "quantum-teleporter");
    expect(s.miner.y + C.MINER_H).toBe(C.SURFACE_Y - 8 * C.TILE);
    expect(s.miner.vy).toBe(700);
    expect(s.nextTeleportHeight).toBeNull();
    expect(s.nextTeleportSpeed).toBeNull();
    s = d.setItemCount(s, "matter-transmitter", 1);
    s = d.useItem(s, "matter-transmitter");
    expect(s.miner.vy).toBe(0);
    expect(s.miner.y + C.MINER_H).toBe(C.SURFACE_Y);
  });
  it("does not consume restorative supplies when full and caps their effect", () => {
    const d = makeDebug();
    let s = d.setItemCount(initial(assets), "nanobots", 2);
    s = d.useItem(s, "nanobots");
    expect(s.items.nanobots).toBe(2);
    s = d.setHull(s, 95);
    s = d.useItem(s, "nanobots");
    expect(s.miner.hull).toBe(100);
    expect(s.items.nanobots).toBe(1);
    s = d.setItemCount(s, "emergency-fuel", 1);
    s = d.setFuel(s, 80);
    s = d.useItem(s, "emergency-fuel");
    expect(s.miner.fuel).toBe(100);
  });
  it("fabricates in order, consumes requirements, stabilizes the Core, and launches to victory", () => {
    const d = makeDebug();
    let s = d.setScreen(initial(assets), "in-mine");
    s = d.setCredits(s, C.ROCKET_TOTAL_CREDITS);
    s = d.fabricate(s);
    s = d.fabricate(s);
    s = d.fabricate(s);
    expect(s.rocketInstalled).toBe(2);
    s = d.setMaterial(s, "resonite", 1);
    s = d.fabricate(s);
    s = d.setMaterial(s, "cryenite", 1);
    s = d.fabricate(s);
    s = d.setCoreCarried(s, true);
    s = d.fabricate(s);
    expect(s.coreTimer).toBeNull();
    expect(s.credits).toBe(0);
    expect(s.rocketInstalled).toBe(C.ROCKET_COMPONENTS.length);
    s = d.launch(s);
    expect(s.screen).toBe("victory");
    expect(s.summary?.deathCause).toBeNull();
  });
  it("saves the actual mine and holdings and restores on the surface", () => {
    const d = makeDebug();
    let s = start(initial(assets));
    s = d.setCargo(s, "adamite", 2);
    s = d.setCredits(s, 4321);
    s = d.setTileHealth(s, 5, 10, 1);
    s = d.save(s);
    expect(s.hasSave).toBe(true);
    const restored = resume(initial(assets));
    expect(restored.credits).toBe(4321);
    expect(restored.cargo.adamite).toBe(2);
    expect(at(restored, 5, 10).health).toBe(1);
    expect(restored.miner.y + C.MINER_H).toBe(C.SURFACE_Y);
  });
  it("packs a complete Marathon mine within the single-slot storage budget", () => {
    const d = makeDebug();
    let s = d.setWorldSize(initial(assets), "marathon");
    s = start(s);
    s = d.save(s);
    expect(s.hasSave).toBe(true);
    const payload = [...memory.values()][0];
    expect(payload.length * 2).toBeLessThan(5 * 1024 * 1024);
    const restored = resume(initial(assets));
    expect(restored.grid).toEqual(s.grid);
    expect(restored.coreRow).toBe(
      C.STANDARD_ROWS * C.WORLD_SIZE_SCALE.marathon,
    );
  });
  it("does not buy a fixed increment it cannot afford, but can make a partial fill", () => {
    const d = makeDebug();
    let s = d.setCredits(initial(assets), 7);
    s = d.setFuel(s, 10);
    s = d.buyFuel(s);
    expect(s.miner.fuel).toBe(10);
    expect(s.credits).toBe(7);
    s = d.fillFuel(s);
    expect(s.miner.fuel).toBe(17);
    expect(s.credits).toBe(0);
  });
  it("refuses both carried and jettisoned live Samples in saves", () => {
    const d = makeDebug();
    let s = d.setCoreCarried(initial(assets), true);
    s = d.save(s);
    expect(s.hasSave).toBe(false);
    s = d.jettison(s);
    s = d.save(s);
    expect(s.hasSave).toBe(false);
  });
  it.each(C.MODES)(
    "%s applies its save consequence at the instant of death",
    async (mode) => {
      const f = await mineFixture();
      f.pose((d, s) => d.setMode(s, mode));
      f.pose((d, s) => d.save(s));
      expect(f.snap().hasSave).toBe(true);
      f.pose((d, s) => d.setHull(s, 0));
      await f.engine.advance(1);
      expect(f.snap().hasSave).toBe(mode === "standard");
      expect(menuItems(f.engine.state)[0]).toBe(
        mode === "standard" ? C.GAME_OVER_SAVE_ITEMS[0] : C.GAME_OVER_ITEMS[0],
      );
    },
  );
  it("works when browser storage is unavailable", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    });
    const s = initial(assets);
    T.save(s);
    expect(s.hasSave).toBe(false);
    expect(s.note).toContain("unavailable");
    vi.stubGlobal("localStorage", storage);
  });
});

describe("debug contract", () => {
  it("reconciles derived values without moving anything or consuming held input", async () => {
    const f = await mineFixture();
    f.pose((d, s) => d.setCargo(s, "aurite", 10));
    f.pose((d, s) => d.setFuel(s, 1000));
    f.pose((d, s) => d.setMinerPosition(s, 300, 2000));
    const before = f.snap();
    f.pose((d, s) => d.reconcile(s));
    expect(f.snap()).toEqual(before);
    expect(f.snap().miner.fuel).toBe(1000);
    expect(f.snap().cargo.loadKg).toBe(1160);
    expect(f.snap().deepestDepthMeters).toBe(0);
  });
  it("rejects undefined poses loudly and returns outside-grid bedrock", () => {
    const d = makeDebug(),
      s = initial(assets);
    expect(() => d.setTile(s, 3, 0, "rock")).toThrow();
    expect(() => d.setFuel(s, -1)).toThrow();
    expect(() => d.setTier(s, "fuel", 6)).toThrow();
    expect(() => d.setCargo(s, "ferron", 0.5)).toThrow();
    expect(() => d.setCoreTimer(s, 2)).toThrow();
    expect(() => d.setTileHealth(s, 0, 1, 1)).toThrow();
    expect(d.tileAt(s, 100, 100)).toEqual({
      kind: "bedrock",
      band: null,
      ore: null,
      material: null,
      health: null,
      maxHealth: null,
    });
  });
  it("reset restores the session, keeps mute and save preference, and clear operations bank nothing", () => {
    const d = makeDebug();
    let s = initial(assets, true);
    s.hasSave = true;
    s = d.setCredits(s, 100);
    s = d.setCargo(s, "ferron", 3);
    s = d.clearCargo(s);
    expect(s.credits).toBe(100);
    s = d.setMinerDrill(s, false);
    s = d.reset(s);
    expect(d.snapshot(s)).toMatchObject({
      screen: "title",
      mode: "standard",
      worldSize: "standard",
      menuIndex: 0,
      muted: true,
      hasSave: true,
      simTime: 0,
      elapsedSeconds: 0,
      credits: 0,
    });
    expect(s.miner.drill).toBe(true);
  });
  it("reports hit regions inside the stage for every menu and operable control", () => {
    const d = makeDebug();
    let s = initial(assets);
    for (const screen of C.SCREENS) {
      s = d.setScreen(s, screen);
      for (let i = 0; i < menuItems(s).length; i++) {
        const r = menuRect(s, i)!;
        expect(r.x + r.w).toBeLessThanOrEqual(C.STAGE_W);
        expect(r.y + r.h).toBeLessThanOrEqual(C.STAGE_H);
      }
    }
    s = d.setScreen(s, "in-mine");
    for (const panel of C.PANELS) {
      s = d.setPanel(s, panel);
      for (const r of controls(s)) {
        expect(r.x + r.w).toBeLessThanOrEqual(C.STAGE_W);
        expect(r.y + r.h).toBeLessThanOrEqual(C.STAGE_H);
      }
    }
  });
  it("fixed-step accumulator handles an uneven engine clock", async () => {
    const f = await mineFixture();
    f.pose((d, s) => d.setMinerTravel(s, false));
    f.engine.setClock(new SequenceClock([7, 13, 30]));
    await f.engine.advance(60);
    expect(f.snap().elapsedSeconds).toBeCloseTo(1, 6);
    expect(f.snap().miner.fuel).toBeCloseTo(100 - C.LIFE_SUPPORT_BURN, 6);
    expect(FIXED_STEP).toBeGreaterThan(0);
    expect(tile("rock", "topsoil").health).toBe(C.BAND_HEALTH.topsoil);
  });
});
