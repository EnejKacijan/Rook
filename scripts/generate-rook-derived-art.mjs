import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artDir = path.join(root, "src", "assets", "exercise-art");
const green = "#1f6b4c";

const adaptations = [
  {
    source: "wg-leg-extension.svg",
    target: "wg-rook-single-leg-leg-extension.svg",
    overlay: "",
  },
  {
    source: "wg-single-leg-calf-raise.svg",
    target: "wg-rook-standing-single-leg-leg-curl.svg",
    overlay: "",
  },
  {
    source: "wg-jumping-jack.svg",
    target: "wg-rook-bosu-balance.svg",
    layer: "underlay",
    overlay: `<path fill="${green}" fill-rule="evenodd" d="M87 500c9-31 71-49 169-49s160 18 169 49l1 8H86zm18-12h302c-18-17-69-26-151-26s-133 9-151 26zM76 507h360v11H76z"/>`,
  },
  {
    source: "wg-banded-standing-hip-abduction.svg",
    target: "wg-rook-y-balance-reach.svg",
    layer: "underlay",
    overlay: `<path fill="${green}" d="M211 439h12v68h-12zM217 435l-7 9-137 49 4 12 140-50 182-83-5-12-177 81zM217 441l-6 10 174 55 4-12zM62 489h30v12H62zM379 359h30v12h-30zM378 491h30v12h-30zM202 495h30v12h-30z"/>`,
  },
  {
    source: "wg-jump-squat.svg",
    target: "wg-rook-pogo-jumps.svg",
    overlay: `<path fill="${green}" d="M81 433h92v10H81zM339 433h92v10h-92zM87 389h12v29H87zM78 397l15-22 15 22h-9v9H87v-9zM413 389h12v29h-12zM404 397l15-22 15 22h-9v9h-12v-9z"/>`,
  },
  {
    source: "wg-high-knees.svg",
    target: "wg-rook-forward-single-leg-hops.svg",
    overlay: `<path fill="${green}" d="M339 360h75v-14l34 25-34 25v-14h-75zM75 390h58v10H75zM93 363h51v9H93z"/>`,
  },
  {
    source: "wg-machine-chest-press.svg",
    target: "wg-rook-incline-machine-press.svg",
    overlay: "",
  },
  {
    source: "wg-machine-row.svg",
    target: "wg-rook-machine-high-row.svg",
    overlay: "",
  },
  {
    source: "wg-ez-bar-curl.svg",
    target: "wg-rook-barbell-curl.svg",
    overlay: "",
  },
  {
    source: "wg-banded-pallof-press.svg",
    target: "wg-rook-band-chest-press.svg",
    overlay: "",
  },
  {
    source: "wg-cable-fly.svg",
    target: "wg-rook-band-fly.svg",
    overlay: "",
  },
  {
    source: "wg-standing-dumbbell-press.svg",
    target: "wg-rook-band-overhead-press.svg",
    overlay: "",
  },
  {
    source: "wg-leg-curl.svg",
    target: "wg-rook-band-leg-curl.svg",
    overlay: "",
  },
  {
    source: "wg-bicep-curl.svg",
    target: "wg-rook-band-curl.svg",
    overlay: "",
  },
  {
    source: "wg-tricep-pushdown.svg",
    target: "wg-rook-band-triceps-pressdown.svg",
    overlay: "",
  },
  {
    source: "wg-calf-raise.svg",
    target: "wg-rook-dumbbell-calf-raise.svg",
    overlay: "",
  },
  {
    source: "wg-jump-squat.svg",
    target: "wg-rook-standing-broad-jump.svg",
    // Lean the detailed bilateral takeoff figure into a horizontal airborne
    // phase, then use a short motion cue rather than a ground baseline.
    transform: "rotate(18 256 256) translate(18 -12)",
    overlay: `<path fill="${green}" d="M322 328h76v-13l34 25-34 25v-13h-76zM95 374c29-33 65-50 108-52l1 10c-40 2-73 18-101 49z"/>`,
  },
  {
    source: "wg-lat-pulldown.svg",
    target: "wg-rook-single-arm-cable-lat-pulldown.svg",
    overlay: "",
  },
  {
    source: "wg-hack-squat.svg",
    target: "wg-rook-pendulum-squat.svg",
    overlay: "",
  },
  {
    source: "wg-leg-press.svg",
    target: "wg-rook-single-leg-leg-press.svg",
    overlay: "",
  },
];

for (const { source, target, overlay, transform, layer = "overlay" } of adaptations) {
  const sourceSvg = await readFile(path.join(artDir, source), "utf8");
  const generated = transform
    ? sourceSvg
        .replace(/(<svg\b[^>]*>)/u, `$1<g transform="${transform}">`)
        .replace("</svg>", `</g>${overlay}</svg>`)
    : layer === "underlay" && overlay
      ? sourceSvg.replace(/(<svg\b[^>]*>)/u, `$1${overlay}`)
      : sourceSvg.replace("</svg>", `${overlay}</svg>`);
  await writeFile(path.join(artDir, target), generated);
  console.log(`${target} <- ${source}`);
}
