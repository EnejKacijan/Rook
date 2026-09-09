import { describe, it, expect, vi } from 'vitest';
import { AIService } from './aiService.js';
import { blankState } from './domain.js';
import { persistPlanImport, preparePlanImport } from './planImportTransaction.js';
import { buildBackupArchive, parseBackupArchive } from './backup.js';

async function fixture() {
  const state = blankState();
  const result = await AIService.importTrainingPlan(state.profile, 'Monday - Push\nBench Press 3x8 RIR 2', { review: true });
  return { state, ...result };
}
const options = { date: '2026-09-06', weekday: 'Sun', initial: true };
describe('atomic imported plan acceptance', () => {
  it('normalizes the accepted gym before one final write', async () => {
    const {state,program,profile}=await fixture();
    const before=structuredClone(state),persist=vi.fn(()=>true);
    const next=persistPlanImport(state,program,profile,options,persist);
    expect(persist).toHaveBeenCalledExactlyOnceWith(next);
    expect(next.gymProfiles.length).toBeGreaterThan(0);
    expect(next.defaultGymProfileId).toBe(next.gymProfiles[0].id);
    expect(state).toEqual(before);
  });
  it('builds one version and block without mutating source state', async () => {
    const { state, program, profile } = await fixture();
    const before = structuredClone(state);
    const next = preparePlanImport(state, program, profile, options);
    expect(state).toEqual(before);
    expect(next.planVersions).toHaveLength(1);
    expect(next.planVersions[0].source).toBe('Imported plan');
    expect(next.program.trainingBlock).toBeTruthy();
    expect(next.profile.availableDays).toEqual(['Mon']);
    expect(JSON.stringify(next)).not.toContain('parseReview');
    expect(JSON.stringify(next)).not.toContain('sourceReview');
  });
  it.each(['activeWorkout','activeOptionalSession'])('blocks %s without writing', async field => {
    const { state, program, profile } = await fixture();
    state[field] = { id: 'active' };
    const persist = vi.fn();
    expect(() => persistPlanImport(state,program,profile,options,persist)).toThrow(/active workout/);
    expect(persist).not.toHaveBeenCalled();
    expect(state[field]).toEqual({id:'active'});
  });
  it('leaves existing state untouched when storage fails', async () => {
    const {state,program,profile} = await fixture();
    const before = structuredClone(state);
    expect(() => persistPlanImport(state,program,profile,options,()=>false)).toThrow(/unchanged/);
    expect(state).toEqual(before);
  });
  it('rejects unresolved schedule and duplicate structural IDs', async () => {
    const {state,program,profile} = await fixture();
    program.days[0].weekday = null;
    expect(()=>preparePlanImport(state,program,profile,options)).toThrow(/Review/);
    program.days[0].weekday = 'Mon';
    program.days[0].exercises[0].sets[1].id = program.days[0].exercises[0].sets[0].id;
    expect(()=>preparePlanImport(state,program,profile,options)).toThrow(/Review/);
  });
  it('keeps completed history and previous versions on replacement', async () => {
    const {state,program,profile} = await fixture();
    const initial = preparePlanImport(state,program,profile,options);
    initial.workouts = [{id:'completed', note:'Existing session'}];
    initial.todayAdaptation = {id:'temporary'};
    const next = preparePlanImport(initial,program,profile,{...options,initial:false});
    expect(next.planVersions).toHaveLength(2);
    expect(next.workouts).toEqual(initial.workouts);
    expect(next.todayAdaptation).toBeNull();
    expect(next.planVersions[1].parentVersionId).toBe(next.planVersions[0].id);
  });
  it('round-trips the imported plan, block and version through backup', async () => {
    const {state,program,profile} = await fixture();
    const next=preparePlanImport(state,program,profile,options);
    const archive=await buildBackupArchive(next,[]);
    const restored=await parseBackupArchive(archive.bytes);
    expect(restored.state.program.days).toEqual(next.program.days);
    expect(restored.state.program.trainingBlock.id).toBe(next.program.trainingBlock.id);
    expect(restored.state.planVersions).toHaveLength(1);
  });
});
