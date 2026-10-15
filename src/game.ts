import type { Game } from "@clockwyrks/simple-2d";
import * as C from "./constants";
import { copy, type DeepcoreState } from "./model";
import { makeDebug, type DeepcoreDebugApi } from "./debug";
import { loadAssets } from "./assets";
import { initial } from "./session";
import { interfaceStep } from "./interface";
import { ambientGas, FIXED_STEP, step, visualStep } from "./simulation";
import { maxFuel } from "./world";
import { render } from "./render";
import { snapshot } from "./observations";

export type { DeepcoreState } from "./model";
export type { DeepcoreDebugApi } from "./debug";
export const BACKGROUND = "#101a20";

export const game: Game<DeepcoreState, DeepcoreDebugApi> = {
  async initialize(api) {
    for (const name of C.ACTION_NAMES)
      api.input.register(name, { keys: [...C.ACTIONS[name]] });
    const assets = await loadAssets(api);
    const sources: Record<
      string,
      (s: ReturnType<typeof snapshot>) => string | number | boolean
    > = {
      screen: (s) => `${s.screen} / ${s.panel ?? "no panel"}`,
      expedition: (s) => `${s.mode} / ${s.worldSize}`,
      position: (s) => `${s.miner.x.toFixed(1)}, ${s.miner.y.toFixed(1)}`,
      velocity: (s) => `${s.miner.vx.toFixed(1)}, ${s.miner.vy.toFixed(1)}`,
      miner: (s) =>
        `${s.miner.state} / ${s.miner.facing} / grounded ${s.miner.grounded}`,
      fuel: (s) => `${s.miner.fuel.toFixed(2)} / ${s.miner.maxFuel}`,
      hull: (s) => `${s.miner.hull.toFixed(2)} / ${s.miner.maxHull}`,
      drill: (s) =>
        s.miner.drilling
          ? `${s.miner.drilling.dir} ${s.miner.drilling.col},${s.miner.drilling.row} ${(s.miner.drilling.progress * 100).toFixed(1)}%`
          : "none",
      credits: (s) => s.credits,
      depth: (s) => s.depthMeters,
      cargo: (s) =>
        `${s.cargo.slotsUsed}/${s.cargo.slotCap} slots / ${s.cargo.loadKg}kg / overload ${s.miner.overloaded}`,
      satchel: (s) =>
        `Res ${s.satchel.resonite}, Cry ${s.satchel.cryenite}, Core ${s.satchel.coreSample}`,
      tiers: (s) => C.TRACKS.map((t) => `${t}:${s.tiers[t]}`).join(" "),
      core: (s) => s.coreTimer ?? "none",
      scanner: (s) => `${s.scanner.locked} / ${s.scanner.target ?? "none"}`,
    };
    for (const [name, source] of Object.entries(sources))
      api.diagnostics.register(name, (s) => source(snapshot(s)));
    return [initial(assets), makeDebug()];
  },
  update(state, api, dt) {
    let s = copy(state);
    s.simTime += dt;
    s = interfaceStep(s, api);
    const active = s.screen === "in-mine";
    const held = {
      left: api.input.value("left") > 0,
      right: api.input.value("right") > 0,
      down: api.input.value("down") > 0,
      up: api.input.value("up") > 0,
    };
    if (active) {
      const oldTime = s.elapsedSeconds;
      s.accumulator += dt;
      while (s.accumulator + 1e-10 >= FIXED_STEP) {
        step(s, held, FIXED_STEP);
        s.accumulator -= FIXED_STEP;
      }
      ambientGas(s, oldTime);
      s.alarmClock -= dt;
      if (s.alarmClock <= 0) {
        if (s.coreTimer !== null) {
          api.audio.play(C.CUES.alarmCore);
          s.alarmClock = s.coreTimer < 15 ? 0.3 : s.coreTimer < 30 ? 0.6 : 1.2;
        } else if (s.miner.fuel < maxFuel(s) * C.LOW_FUEL_FRACTION) {
          api.audio.play(C.CUES.alarmFuel);
          s.alarmClock = 2;
        }
      }
    }
    if (s.screen !== "paused") visualStep(s, dt);
    api.audio.loop(C.CUES.music);
    for (const [cue, on] of [
      [C.CUES.drill, active && !s.panel && s.miner.drilling !== null],
      [C.CUES.thrust, active && !s.panel && held.up && s.miner.fuel > 0],
    ] as const) {
      if (on) api.audio.loop(cue);
      else api.audio.stop(cue);
    }
    for (const signal of s.signals) api.audio.play(signal.cue);
    s.signals = [];
    s.muted = api.audio.muted();
    return s;
  },
  render,
};
