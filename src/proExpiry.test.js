import { expect, it } from 'vitest';
import { createReturningUserFixture } from './demoFixture.js';
import { startWorkout, completeWorkout, serializeState, deserializeState } from './domain.js';
import { canActivateGeneratedPlan, canCreateSavedWorkout, shouldUsePremiumStyle } from './proPolicy.js';
import { saveWorkoutTemplate, templateDraft, useSavedWorkout } from './savedWorkouts.js';
import { entitlementIsActive } from '../server/rookProServer.mjs';

const pro = { status: 'active', entitlement: 'rook_pro' }, free = { status: 'free', entitlement: null };
function fixture() {
  let state = createReturningUserFixture(2);
  state.program.source = 'ai'; state.ai.lastPlanSource = 'ai';
  state.planVersions = [{ id: 'activated-pro-plan', source: 'Initial plan', timestamp: new Date().toISOString(), program: structuredClone(state.program) }];
  state.profile.stylePreference = 'premium';
  state.conversations = [{ id: 'saved-coach', conversationId: 'chat', user: 'Training question', reply: { text: 'Saved advice' }, createdAt: Date.now() }];
  for (let n = 0; n < 6; n++) state = saveWorkoutTemplate(state, { ...templateDraft(state.program.days[0], state), name: `Saved ${n}` }, { id: `saved-${n}`, access: pro, rollout: true });
  return state;
}
it('I/J: cancellation retains Pro until canonical expiry, then the activated plan still logs and progresses with all data retained', () => {
  const expiry = Date.parse('2026-10-10T10:00:00Z');
  const trial = { expires_date: new Date(expiry).toISOString(), unsubscribe_detected_at: '2026-10-04T10:00:00Z' };
  expect(entitlementIsActive(trial, expiry - 1)).toBe(true);
  expect(entitlementIsActive(trial, expiry)).toBe(false);
  const original = fixture(), dataBefore = serializeState(original);
  expect(canActivateGeneratedPlan(free, true, original)).toBe(false);
  expect(canCreateSavedWorkout(original, free, true)).toBe(false);
  expect(shouldUsePremiumStyle(original.profile.stylePreference, free, true)).toBe(false);
  expect(serializeState(original)).toBe(dataBefore);
  let state = structuredClone(original);
  state.activeWorkout = startWorkout(state, state.program.days[0]);
  state.activeWorkout.exercises.forEach(e => e.sets.forEach(s => { s.completed = true; s.reps = s.reps || 8; s.weight = s.weight || 20; }));
  state = completeWorkout(state);
  expect(state.activeWorkout).toBeNull();
  expect(state.workouts).toHaveLength(original.workouts.length + 1);
  expect(state.workouts.slice(0, original.workouts.length)).toEqual(original.workouts);
  expect(state.program.id).toBe(original.program.id);
  expect(state.program.days).toHaveLength(original.program.days.length);
  expect(state.savedWorkoutTemplates).toEqual(original.savedWorkoutTemplates);
  expect(state.conversations).toEqual(original.conversations);
  expect(state.planVersions).toEqual(original.planVersions);
  expect(state.profile.stylePreference).toBe('premium');
  const restored = deserializeState(serializeState(state), { strict: true });
  expect(restored.program.id).toBe(original.program.id);
  expect(restored.savedWorkoutTemplates).toEqual(original.savedWorkoutTemplates);
  expect(restored.conversations.find(entry => entry.id === 'saved-coach').reply.text).toBe('Saved advice');
});
it('over-limit Saved Workouts can still be used and edited after expiry; only new saves are gated', () => {
  const state = fixture();
  const used = useSavedWorkout(state, { templateId: 'saved-5', revision: 1, requestId: 'after-expiry-use' });
  expect(used.activeWorkout.exercises.length).toBeGreaterThan(0);
  const edited = saveWorkoutTemplate(state, { ...templateDraft(state.program.days[0], state), name: 'Edited after expiry' }, { id: 'saved-5', revision: 1, access: free, rollout: true });
  expect(edited.savedWorkoutTemplates).toHaveLength(6);
  expect(edited.savedWorkoutTemplates[5].name).toBe('Edited after expiry');
  expect(() => saveWorkoutTemplate(state, { ...templateDraft(state.program.days[0], state), name: 'New' }, { id: 'new', access: free, rollout: true })).toThrow('ROOK Pro');
});
it('theme configuration survives Free fallback and is restored with verified Pro', () => {
  const state = fixture(), before = structuredClone(state.profile);
  expect(shouldUsePremiumStyle(state.profile.stylePreference, free, true)).toBe(false);
  expect(state.profile).toEqual(before);
  expect(shouldUsePremiumStyle(state.profile.stylePreference, pro, true)).toBe(true);
});
it('first personal generated plan is Free; stopping it or importing a manual replacement does not create another free allowance', () => {
  const fresh = { program: null, ai: {}, planVersions: [] };
  expect(canActivateGeneratedPlan(free, true, fresh)).toBe(true);
  expect(canActivateGeneratedPlan(free, true, { ...fresh, program: { source: 'ai-import' } })).toBe(true);
  const activated = fixture(); activated.program = null; activated.ai.lastPlanSource = 'manual-edit';
  expect(canActivateGeneratedPlan(free, true, activated)).toBe(false);
  expect(canActivateGeneratedPlan(pro, true, activated)).toBe(true);
});
