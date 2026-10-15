# Original Deepcore assets

All visual and audio assets in this directory were authored for this game during
the build. `tools/generate-assets.py` is the original recipe. It invokes `draw`
for environment and icon PNGs, `draw-sheet` for individual animation drawings,
`particle-2d` for the live effect definitions, `sfx-synth` and `sfx-sample` for the
sound cues, and `music` for the original sequenced soundtrack.

The prospector has eight animated states (32 animation frames in total), built from the
same helmet, utility suit, drill and twin-cylinder backpack. Rock has three
fine-grained variants per band. Mineral seams, gemstones, raw crystals, boulders,
lava, and the six-stage rocket each use their own authored artwork.

The music is a 24-second, eight-bar industrial descent bed: low sustained pads,
electric-bass pulses, and reverberant vibraphone fragments. The impact, mineral
pickup, and fabrication cues layer samples from the tools' supplied `combat-core`
pack with original synthesized voices. The music uses the supplied `gm-lite`
instrument bank. No external art or audio was downloaded.

These files are finished runtime assets. **Generating them is not part of the
build.** Vite bundles the committed PNG, JSON, and WAV files; the engine loads
them through its asset API. The MIDI file is the soundtrack's source companion.
Particle definitions are played live through the supplied particle canvas runtime.
