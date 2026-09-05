import { defaultPlateSetup, normalizePlateSetup } from "./plateCalculator.js";

export const GYM_PROFILE_VERSION = 1;

export const CANONICAL_GYM_EQUIPMENT = Object.freeze([
  "full gym",
  "barbell/rack/bench",
  "dumbbells",
  "cables",
  "machines",
  "pull-up bar",
  "resistance bands",
  "bodyweight only",
]);

const allowedEquipment = new Set(CANONICAL_GYM_EQUIPMENT);
const cleanName = (value) => String(value || "").trim().replace(/\s+/g, " ").slice(0, 50);
const gymId = () => `gym-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export function normalizeGymEquipment(values = []) {
  const equipment = [...new Set((Array.isArray(values) ? values : []).filter((item) => allowedEquipment.has(item)))];
  if (equipment.includes("full gym")) return ["full gym"];
  if (equipment.includes("bodyweight only") && equipment.length > 1)
    return equipment.filter((item) => item !== "bodyweight only");
  return equipment;
}

export function environmentForGymEquipment(equipment = [], preferred = null) {
  if (["Commercial gym", "Home gym"].includes(preferred)) return preferred;
  return normalizeGymEquipment(equipment).includes("full gym")
    ? "Commercial gym"
    : "Home gym";
}

export function equipmentProfile(baseProfile, equipment, environment = null) {
  const normalized = normalizeGymEquipment(equipment);
  return {
    ...baseProfile,
    environment: environmentForGymEquipment(normalized, environment),
    equipment: normalized,
  };
}

function migratedGymId(profile) {
  const suffix = String(profile?.id || "local")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 42);
  return `gym-${suffix || "local"}`;
}

export function normalizeGymProfilesState(state, now = new Date().toISOString()) {
  if (!state || !state.profile) return state;
  const source = Array.isArray(state.gymProfiles) ? state.gymProfiles : [];
  const seen = new Set();
  state.gymProfiles = source
    .map((gym) => {
      if (!gym || typeof gym !== "object") return null;
      const id = String(gym.id || "").trim();
      const name = cleanName(gym.name);
      const equipment = normalizeGymEquipment(gym.equipment);
      if (!id || seen.has(id) || !name || !equipment.length) return null;
      seen.add(id);
      return {
        schemaVersion: GYM_PROFILE_VERSION,
        id,
        name,
        environment: environmentForGymEquipment(equipment, gym.environment),
        equipment,
        plateSetup: normalizePlateSetup(gym.plateSetup, state.profile.units),
        createdAt: gym.createdAt || now,
        updatedAt: gym.updatedAt || gym.createdAt || now,
      };
    })
    .filter(Boolean);

  if (!state.gymProfiles.length && state.profile.onboardingComplete) {
    const equipment = normalizeGymEquipment(state.profile.equipment);
    if (equipment.length) {
      state.gymProfiles.push({
        schemaVersion: GYM_PROFILE_VERSION,
        id: migratedGymId(state.profile),
        name: state.profile.environment === "Home gym" ? "Home" : "Main Gym",
        environment: environmentForGymEquipment(equipment, state.profile.environment),
        equipment,
        plateSetup: defaultPlateSetup(state.profile.units),
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  if (!state.gymProfiles.some((gym) => gym.id === state.defaultGymProfileId))
    state.defaultGymProfileId = state.gymProfiles[0]?.id || null;
  const defaultGym = state.gymProfiles.find((gym) => gym.id === state.defaultGymProfileId);
  if (defaultGym) {
    state.profile.equipment = [...defaultGym.equipment];
    state.profile.environment = defaultGym.environment;
  }

  const repairReference = (target) => {
    if (!target?.gymProfileId) return;
    if (state.gymProfiles.some((gym) => gym.id === target.gymProfileId)) return;
    target.gymProfileId = null;
    target.gymProfileMissing = true;
  };
  repairReference(state.todayAdaptation);
  repairReference(state.activeWorkout?.adjustment);
  for (const workout of state.workouts || []) repairReference(workout?.adjustment);
  return state;
}

export function defaultGymProfile(state) {
  return (state?.gymProfiles || []).find((gym) => gym.id === state.defaultGymProfileId) || null;
}

export function createGymProfile(state, { name, equipment, environment = null, makeDefault = false }, now = new Date().toISOString()) {
  normalizeGymProfilesState(state, now);
  const normalizedName = cleanName(name);
  const normalizedEquipment = normalizeGymEquipment(equipment);
  if (!normalizedName) return { status: "invalid", reason: "Add a gym name." };
  if (!normalizedEquipment.length) return { status: "invalid", reason: "Choose available equipment." };
  const gym = {
    schemaVersion: GYM_PROFILE_VERSION,
    id: gymId(),
    name: normalizedName,
    environment: environmentForGymEquipment(normalizedEquipment, environment),
    equipment: normalizedEquipment,
    plateSetup: defaultPlateSetup(state.profile.units),
    createdAt: now,
    updatedAt: now,
  };
  state.gymProfiles.push(gym);
  if (makeDefault || !state.defaultGymProfileId) setDefaultGymProfile(state, gym.id);
  return { status: "created", gym };
}

export function updateGymProfile(state, id, { name, equipment, environment = null }, now = new Date().toISOString()) {
  normalizeGymProfilesState(state, now);
  const gym = state.gymProfiles.find((item) => item.id === id);
  if (!gym) return { status: "missing" };
  const normalizedName = cleanName(name);
  const normalizedEquipment = normalizeGymEquipment(equipment);
  if (!normalizedName) return { status: "invalid", reason: "Add a gym name." };
  if (!normalizedEquipment.length) return { status: "invalid", reason: "Choose available equipment." };
  gym.name = normalizedName;
  gym.equipment = normalizedEquipment;
  gym.environment = environmentForGymEquipment(normalizedEquipment, environment || gym.environment);
  gym.updatedAt = now;
  if (state.defaultGymProfileId === id) setDefaultGymProfile(state, id);
  return { status: "updated", gym };
}

export function setDefaultGymProfile(state, id) {
  const gym = (state.gymProfiles || []).find((item) => item.id === id);
  if (!gym) return { status: "missing" };
  state.defaultGymProfileId = gym.id;
  state.profile.equipment = [...gym.equipment];
  state.profile.environment = gym.environment;
  return { status: "updated", gym };
}

export function deleteGymProfile(state, id, replacementDefaultId = null) {
  normalizeGymProfilesState(state);
  const gym = state.gymProfiles.find((item) => item.id === id);
  if (!gym) return { status: "missing" };
  if (state.gymProfiles.length === 1)
    return { status: "last-profile", reason: "Keep at least one gym profile." };
  if (state.defaultGymProfileId === id) {
    const replacement = state.gymProfiles.find((item) => item.id === replacementDefaultId && item.id !== id);
    if (!replacement)
      return { status: "default-required", reason: "Choose another default gym first." };
    setDefaultGymProfile(state, replacement.id);
  }
  state.gymProfiles = state.gymProfiles.filter((item) => item.id !== id);
  return { status: "deleted", gym };
}

export function effectiveGymContext(state, workout = state?.activeWorkout) {
  const adjustment = workout?.adjustment || (workout ? null : state?.todayAdaptation);
  if (adjustment?.temporaryEquipment?.length) {
    const gym = (state.gymProfiles || []).find((item) => item.id === adjustment.gymProfileId);
    return {
      id: gym?.id || null,
      name: gym?.name || adjustment.gymProfileName || null,
      profile: equipmentProfile(state.profile, adjustment.temporaryEquipment, gym?.environment),
      todayOnly: true,
    };
  }
  const gym = defaultGymProfile(state);
  return {
    id: gym?.id || null,
    name: gym?.name || null,
    profile: equipmentProfile(
      state.profile,
      gym?.equipment || state.profile?.equipment || [],
      gym?.environment || state.profile?.environment,
    ),
    todayOnly: false,
  };
}

export function effectiveGymProfile(state, workout = state?.activeWorkout) {
  return effectiveGymContext(state, workout).profile;
}
