/* global window, document, KeyboardEvent, console */
import { chromium } from "playwright";
import { writeFile, mkdir } from "node:fs/promises";
import { gzipSync } from "node:zlib";

const browser = await chromium.launch({ args: ["--no-sandbox"] });
const page = await browser.newPage({
  viewport: { width: 1280, height: 720 },
  deviceScaleFactor: 1,
});
page.on("pageerror", (error) => {
  throw error;
});
page.on("console", (message) => console.log(message.text()));
await page.route("**/@vite/client", (route) =>
  route.fulfill({ contentType: "text/javascript", body: "" }),
);
await page.goto("http://localhost:5173/tools/browser.html");
await page.evaluate(async () => {
  const { createEngine, ConstantClock } =
    await import("/node_modules/@clockwyrks/simple-2d/dist/index.js");
  const { game, BACKGROUND } = await import("/src/game.ts");
  const engine = createEngine({
    canvas: document.querySelector("canvas"),
    width: 1280,
    height: 720,
    game,
    background: BACKGROUND,
    assetRoot: "../assets/",
    clock: new ConstantClock(1000 / 60),
  });
  engine.events.on("asset:failed", (event) =>
    console.error(JSON.stringify(event)),
  );
  await engine.initialize();
  window.captureEngine = engine;
  await engine.advance(1);
});
await mkdir("showcase", { recursive: true });
await page.screenshot({ path: "/tmp/opencode/title.png" });
await page.evaluate(async () => {
  const e = window.captureEngine;
  e.apply((s) => e.debug.setScreen(s, "in-mine"));
  e.apply((s) => e.debug.generateMine(s));
  await e.advance(1);
});
await page.screenshot({ path: "showcase/surface.png" });
await page.evaluate(async () => {
  const e = window.captureEngine;
  e.apply((s) => e.debug.setMinerPosition(s, 1260, 142 * 80 - 72));
  e.apply((s) => e.debug.setFuel(s, 275));
  e.apply((s) => e.debug.setTier(s, "fuel", 3));
  e.apply((s) => e.debug.setTier(s, "hull", 3));
  e.apply((s) => e.debug.setHull(s, 220));
  e.apply((s) => e.debug.setTier(s, "drill", 3));
  e.apply((s) => e.debug.setTier(s, "scanner", 2));
  for (let row = 137; row < 142; row++)
    e.apply((s) => e.debug.setTile(s, 16, row, "tunnel"));
  for (let col = 13; col <= 18; col++)
    e.apply((s) => e.debug.setTile(s, col, 140, "tunnel"));
  e.apply((s) => e.debug.setMinerPosition(s, 16 * 80 + 12, 142 * 80 - 72));
  e.apply((s) => e.debug.setMaterialTile(s, 20, 144, "resonite"));
  for (let row = 142; row <= 153; row++) {
    e.apply((s) =>
      e.debug.setOreTile(s, 16, row, row % 2 ? "cuprite" : "argenite"),
    );
    e.apply((s) => e.debug.setTile(s, 16, row + 1, "rock"));
  }
  await e.advance(1);
  document.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyS" }));
  e.startRecording();
  await e.advance(130);
});
await page.screenshot({ path: "showcase/descent.png" });
await page.evaluate(async () => {
  const e = window.captureEngine;
  await e.advance(45);
  document.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyS" }));
  document.dispatchEvent(new KeyboardEvent("keydown", { code: "Space" }));
  await e.advance(125);
  document.dispatchEvent(new KeyboardEvent("keyup", { code: "Space" }));
});
const recording = await page.evaluate(() =>
  window.captureEngine.stopRecording(),
);
await writeFile(
  "showcase/rockbed-run.json.gz",
  gzipSync(JSON.stringify(recording)),
);
await page.evaluate(async () => {
  const e = window.captureEngine;
  e.apply((s) => e.debug.setPanel(s, "launch-pad"));
  e.apply((s) => e.debug.setCredits(s, 12500));
  e.apply((s) => e.debug.setRocketInstalled(s, 3));
  await e.advance(1);
});
await page.screenshot({ path: "/tmp/opencode/panel.png" });
await page.evaluate(async () => {
  const e = window.captureEngine;
  e.apply((s) => e.debug.setPanel(s, null));
  e.apply((s) => e.debug.setMinerPosition(s, 16 * 80 + 12, 309 * 80 - 72));
  e.apply((s) => e.debug.setMinerVelocity(s, 0, 0));
  e.apply((s) => e.debug.setTier(s, "scanner", 3));
  e.apply((s) => e.debug.setTier(s, "jetpack", 3));
  e.apply((s) => e.debug.setTier(s, "radiator", 3));
  e.apply((s) => e.debug.setCameraLead(s, 0));
  for (let row = 304; row <= 310; row++)
    for (let col = 15; col <= 17; col++)
      e.apply((s) => e.debug.setTile(s, col, row, "tunnel"));
  for (let col = 14; col <= 22; col++)
    e.apply((s) => e.debug.setTile(s, col, 308, "tunnel"));
  for (let row = 310; row <= 312; row++)
    for (let col = 20; col <= 24; col++)
      e.apply((s) => e.debug.setTile(s, col, row, "lava"));
  e.apply((s) => e.debug.setMaterialTile(s, 21, 306, "cryenite"));
  e.apply((s) => e.debug.setOreTile(s, 13, 308, "roselite"));
  e.apply((s) => e.debug.setOreTile(s, 19, 305, "voltite"));
  document.dispatchEvent(new KeyboardEvent("keydown", { code: "Space" }));
  await e.advance(12);
  document.dispatchEvent(new KeyboardEvent("keyup", { code: "Space" }));
});
await page.screenshot({ path: "showcase/deepstone.png" });
await browser.close();
