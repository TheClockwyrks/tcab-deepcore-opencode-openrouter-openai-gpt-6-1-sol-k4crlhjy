import type { InitApi } from "@clockwyrks/simple-2d";
import type { ParticleSystem } from "@clockwyrks/particle-runtime";
import * as C from "./constants";
import type { Assets, DeepcoreState } from "./model";

// Vite copies these committed files and rewrites every URL relative to the page.
// no-inline keeps every resource on the engine's asset-loading path, even icons.
const files = import.meta.glob<string>("../assets/**/*.{png,json,wav}", {
  eager: true,
  query: "?url&no-inline",
  import: "default",
});
export function assetPath(url: string): string {
  // With a relative base, Vite 8 may express a URL import as new URL(...,
  // import.meta.url).href. Hand the engine the part beneath its root, never that
  // resolved absolute URL. The last segment also handles hosts named /assets/.
  const marker = "/assets/";
  const index = url.lastIndexOf(marker);
  return index >= 0
    ? url.slice(index + marker.length)
    : url.replace(/^assets\//, "");
}
export async function loadAssets(api: InitApi<DeepcoreState>): Promise<Assets> {
  const assets: Assets = { images: {}, effects: {} };
  await Promise.all(
    Object.entries(files).map(async ([source, url]) => {
      const key = source.replace("../assets/", "");
      const path = assetPath(url);
      if (key.endsWith(".png"))
        assets.images[key] = await api.assets.loadImage(path);
      else if (key.startsWith("fx/")) {
        const blob = await api.assets.load(path);
        assets.effects[key.slice(3, -5)] = JSON.parse(
          await blob.text(),
        ) as ParticleSystem;
      } else if (key.endsWith(".wav")) {
        const cue = key.slice(6, -4);
        if (Object.values(C.CUES).includes(cue as C.CueName))
          await api.audio.load(cue, path);
      }
    }),
  );
  return assets;
}
