export const PLATE_SETUP_VERSION = 1;
export const LB_PER_KG = 2.2046226218;

export const PLATE_LOADING_RELATION_BY_EXERCISE_ID = Object.freeze({
  "barbell-bench-press": "symmetric-barbell-total",
  "incline-barbell-bench-press": "symmetric-barbell-total",
  "decline-bench-press": "symmetric-barbell-total",
  "close-grip-bench-press": "symmetric-barbell-total",
  "back-squat": "symmetric-barbell-total",
  "front-squat": "symmetric-barbell-total",
  deadlift: "symmetric-barbell-total",
  "romanian-deadlift": "symmetric-barbell-total",
  "sumo-deadlift": "symmetric-barbell-total",
  "barbell-row": "symmetric-barbell-total",
  "pendlay-row": "symmetric-barbell-total",
  "barbell-overhead-press": "symmetric-barbell-total",
  "push-press": "symmetric-barbell-total",
  "good-morning": "symmetric-barbell-total",
  "hip-thrust": "symmetric-barbell-total",
  "barbell-glute-bridge": "symmetric-barbell-total",
  "rack-pull": "symmetric-barbell-total",
});

const round = (value, digits = 4) =>
  Number(Number(value).toFixed(digits));
const validUnit = (value) => (value === "lb" ? "lb" : "kg");
const setupId = (prefix, value) =>
  `${prefix}-${String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;

export function defaultPlateSetup(unit = "kg") {
  const normalizedUnit = validUnit(unit);
  if (normalizedUnit === "lb")
    return {
      schemaVersion: PLATE_SETUP_VERSION,
      unit: "lb",
      selectedBarId: "bar-45-lb",
      bars: [{ id: "bar-45-lb", name: "Olympic bar", weight: 45 }],
      plates: [
        { size: 45, pairs: 4 },
        { size: 35, pairs: 2 },
        { size: 25, pairs: 2 },
        { size: 10, pairs: 4 },
        { size: 5, pairs: 2 },
        { size: 2.5, pairs: 2 },
      ],
    };
  return {
    schemaVersion: PLATE_SETUP_VERSION,
    unit: "kg",
    selectedBarId: "bar-20-kg",
    bars: [
      { id: "bar-20-kg", name: "Olympic bar", weight: 20 },
      { id: "bar-15-kg", name: "15 kg bar", weight: 15 },
    ],
    plates: [
      { size: 20, pairs: 4 },
      { size: 15, pairs: 2 },
      { size: 10, pairs: 2 },
      { size: 5, pairs: 2 },
      { size: 2.5, pairs: 2 },
      { size: 1.25, pairs: 2 },
    ],
  };
}

export function normalizePlateSetup(value, fallbackUnit = "kg") {
  const source = value && typeof value === "object" ? value : {};
  const unit = validUnit(source.unit || fallbackUnit);
  const fallback = defaultPlateSetup(unit);
  const bars = (Array.isArray(source.bars) ? source.bars : fallback.bars)
    .map((bar, index) => {
      const weight = Number(bar?.weight);
      if (!(weight > 0) || weight > 200) return null;
      const name = String(bar?.name || `${round(weight)} ${unit} bar`)
        .trim()
        .replace(/\s+/g, " ")
        .slice(0, 40);
      if (!name) return null;
      return {
        id: String(bar?.id || setupId("bar", `${weight}-${unit}-${index}`)),
        name,
        weight: round(weight),
      };
    })
    .filter(Boolean);
  const usableBars = bars.length ? bars : fallback.bars;
  const mergedPlates = new Map();
  for (const plate of Array.isArray(source.plates) ? source.plates : fallback.plates) {
    const size = round(Number(plate?.size));
    const pairs = Math.floor(Number(plate?.pairs));
    if (!(size > 0) || size > 200 || !(pairs > 0) || pairs > 20) continue;
    mergedPlates.set(size, Math.min(20, (mergedPlates.get(size) || 0) + pairs));
  }
  const plates = [...mergedPlates.entries()]
    .map(([size, pairs]) => ({ size, pairs }))
    .sort((left, right) => right.size - left.size);
  return {
    schemaVersion: PLATE_SETUP_VERSION,
    unit,
    selectedBarId: usableBars.some((bar) => bar.id === source.selectedBarId)
      ? source.selectedBarId
      : usableBars[0].id,
    bars: usableBars,
    plates,
  };
}

export function selectedPlateBar(setup) {
  const normalized = normalizePlateSetup(setup, setup?.unit);
  return (
    normalized.bars.find((bar) => bar.id === normalized.selectedBarId) ||
    normalized.bars[0]
  );
}

function betterCombination(next, current, sizes) {
  if (!current) return true;
  const nextCount = next.reduce((sum, count) => sum + count, 0);
  const currentCount = current.reduce((sum, count) => sum + count, 0);
  if (nextCount !== currentCount) return nextCount < currentCount;
  for (let index = 0; index < sizes.length; index++) {
    if (next[index] !== current[index]) return next[index] > current[index];
  }
  return false;
}

export function calculatePlateLoad({ target, barWeight, plates = [] } = {}) {
  const requested = Number(target);
  const bar = Number(barWeight);
  if (!Number.isFinite(requested) || !Number.isFinite(bar) || !(bar > 0))
    return { status: "invalid", target: requested, barWeight: bar };
  const normalizedPlates = normalizePlateSetup(
    { unit: "kg", bars: [{ id: "bar", name: "Bar", weight: bar }], selectedBarId: "bar", plates },
    "kg",
  ).plates;
  const scale = 100;
  const sizes = normalizedPlates.map((plate) => Math.round(plate.size * scale));
  const combinations = new Map([[0, Array(sizes.length).fill(0)]]);
  normalizedPlates.forEach((plate, plateIndex) => {
    const before = [...combinations.entries()];
    for (const [sum, combination] of before) {
      for (let count = 1; count <= plate.pairs; count++) {
        const nextSum = sum + sizes[plateIndex] * count;
        const next = [...combination];
        next[plateIndex] += count;
        if (betterCombination(next, combinations.get(nextSum), sizes))
          combinations.set(nextSum, next);
      }
    }
  });
  const options = [...combinations.entries()]
    .map(([perSideUnits, combination]) => ({
      total: round(bar + (2 * perSideUnits) / scale),
      perSide: round(perSideUnits / scale),
      plates: normalizedPlates
        .map((plate, index) => ({ size: plate.size, count: combination[index] }))
        .filter((plate) => plate.count > 0),
    }))
    .sort((left, right) => left.total - right.total);
  const epsilon = 0.0001;
  const exact = options.find((option) => Math.abs(option.total - requested) < epsilon) || null;
  const lower = [...options].reverse().find((option) => option.total < requested - epsilon) || null;
  const upper = options.find((option) => option.total > requested + epsilon) || null;
  return {
    status: exact ? "exact" : requested < bar ? "below-bar" : "nearest",
    target: round(requested),
    barWeight: round(bar),
    exact,
    lower,
    upper,
  };
}

export function kgToPlateUnit(weightKg, unit = "kg") {
  const value = Number(weightKg);
  if (!Number.isFinite(value)) return null;
  return round(unit === "lb" ? value * LB_PER_KG : value, 2);
}

export function plateUnitToKg(weight, unit = "kg") {
  const value = Number(weight);
  if (!Number.isFinite(value)) return null;
  return round(unit === "lb" ? value / LB_PER_KG : value, 4);
}

export function plateLoadingRelation(exercise) {
  const id = typeof exercise === "string" ? exercise : exercise?.exerciseId || exercise?.id;
  return PLATE_LOADING_RELATION_BY_EXERCISE_ID[id] || null;
}
