import { equipmentAvailabilityKey, isoDay, plannedWorkoutForDate } from './domain.js';
import { effectiveGymContext, normalizeGymEquipment } from './gymProfiles.js';

// Draft-only selection. Persisting still belongs to applyTodayAdjustment.
export function todayEquipmentContext(state) {
  const original = plannedWorkoutForDate(state);
  const adjustment = state.todayAdaptation;
  const todayAdaptation = adjustment?.date === isoDay() && adjustment.programDayId === original?.id
    ? adjustment : null;
  const context = effectiveGymContext({ ...state, todayAdaptation },
    !todayAdaptation && original?.temporaryPlanAdjustment ? original : null);
  return { ...context, equipment: normalizeGymEquipment(context.profile.equipment) };
}

export function initialTodayEquipmentSelection(context) {
  return { gymProfileId: context.id || null, custom: !context.id, equipment: [...context.equipment] };
}

export function hasMeaningfulEquipmentChange(current, next) {
  const normalized = normalizeGymEquipment(next);
  return normalized.length > 0 && equipmentAvailabilityKey(current) !== equipmentAvailabilityKey(normalized);
}

export function toggleTodayEquipment(current, value) {
  if (['full gym', 'bodyweight only'].includes(value))
    return current.length === 1 && current[0] === value ? [] : [value];
  const granular = current.filter(item => !['full gym', 'bodyweight only'].includes(item));
  return normalizeGymEquipment(granular.includes(value)
    ? granular.filter(item => item !== value) : [...granular, value]);
}
