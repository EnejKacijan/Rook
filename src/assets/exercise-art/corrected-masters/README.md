# Corrected exercise illustrations

These 26 reviewed SVG masters replace the schematic, wrong-apparatus and weak/noisy illustrations identified in `artifacts/art-contact-audit/REVIEW.md`.

Original raster illustrations were produced with the built-in imagegen tool, one exercise per image. The Single-Leg Leg Press image served as the style reference. `prompts.json` records the art direction. Raster source copies and source-path manifest are in `artifacts/art-corrections/`; no runtime dependency on those files exists.

Format conversion uses `scripts/vectorize-corrected-art.mjs`: extract the single green ink channel, trace to closed paths, retain transparent interiors. `scripts/corrected-art-qa.mjs` normalizes painted bounds to the existing 88% safety envelope. The shipped assets remain ordinary 512px SVGs with #1f6b4c filled paths, no embedded raster, new CSS, or rendering changes.

`node scripts/generate-rook-derived-art.mjs` copies these masters into the live illustration directory. The old schematic generator has been removed so it cannot restore the rejected drawings or substitute hack-squat/calf-raise machines for different exercises. Other illustrations remain untouched by regeneration.

For a future art edit, change the master, regenerate, run the illustration audit and corrected-art tests, and visually check both detail and thumbnail size. A file-format test alone does not verify anatomy or exercise accuracy. Exercise images identify a movement, not a full technique tutorial.
