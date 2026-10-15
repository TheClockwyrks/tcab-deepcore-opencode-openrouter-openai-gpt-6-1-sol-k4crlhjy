/* global document, console */
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { URL } from "node:url";
import assert from "node:assert/strict";

// Exercise the actual production bundle from a nested static-host path.
const prefix = "/releases/deepcore/";
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".png": "image/png",
  ".wav": "audio/wav",
  ".json": "application/json",
};
const server = createServer(async (req, res) => {
  try {
    assert(req.url.startsWith(prefix));
    const path = req.url.slice(prefix.length).split("?")[0] || "index.html";
    assert(!path.includes(".."));
    const bytes = await readFile(new URL(`../dist/${path}`, import.meta.url));
    res.writeHead(200, {
      "content-type": types[extname(path)] ?? "application/octet-stream",
    });
    res.end(bytes);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((resolve) => server.listen(4180, "127.0.0.1", resolve));
const browser = await chromium.launch({ args: ["--no-sandbox"] });
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  const errors = [],
    failed = [],
    requests = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("requestfailed", (r) => failed.push(r.url()));
  page.on("response", (r) => {
    if (r.status() >= 400 && !r.url().endsWith("favicon.ico"))
      failed.push(r.url());
  });
  page.on("request", (r) => {
    if (!r.url().endsWith("favicon.ico")) requests.push(r.url());
  });
  await page.goto(`http://127.0.0.1:4180${prefix}`, {
    waitUntil: "networkidle",
  });
  assert.deepEqual(errors, []);
  assert.deepEqual(failed, []);
  await page.screenshot({ path: "/tmp/opencode/production-title.png" });
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press("Enter");
    await page.waitForTimeout(200);
  }
  await page.keyboard.down("KeyS");
  await page.waitForTimeout(1800);
  await page.keyboard.up("KeyS");
  await page.screenshot({ path: "/tmp/opencode/production-dig.png" });
  await page.keyboard.down("Space");
  await page.waitForTimeout(1600);
  await page.keyboard.up("Space");
  await page.keyboard.press("KeyI");
  await page.waitForTimeout(150);
  await page.screenshot({ path: "/tmp/opencode/production-inventory.png" });
  await page.keyboard.press("Escape");
  await page.keyboard.press("KeyP");
  await page.waitForTimeout(150);
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.waitForTimeout(150);
  const dimensions = await page.evaluate(() => ({
    width: document.querySelector("canvas").width,
    height: document.querySelector("canvas").height,
  }));
  assert.equal(dimensions.width, 1640);
  assert.equal(dimensions.height, 2360);
  assert(requests.length > 100);
  assert(requests.every((url) => url.includes(prefix)));
  assert.deepEqual(errors, []);
  assert.deepEqual(failed, []);
  console.log(
    `Chromium production check passed: ${requests.length} relative requests, keyboard dig/climb/inventory/pause, DPR 2, landscape and portrait.`,
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
