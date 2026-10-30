import { afterEach, describe, expect, it, vi } from "vitest";
import { combineExample } from './combineWorkouts.fixture.js';
import { applyCombinedProposal, buildCombinedProposal, combineSources } from './combineWorkouts.js';
import { adaptedTemplateForToday, completeWorkout, currentWeekSchedule, serializeState, startWorkout } from './domain.js';
import {
  buildWeeklyPlanExport,
  buildWorkoutExport,
  exportFilename,
  exportLoadLabel,
  formatExportSet,
} from "./workoutExport.js";

const exercise = (overrides = {}) => ({
  id: "entry-1",
  exerciseId: "custom",
  name: "Custom exercise",
  loadRequirement: "required",
  repMin: 8,
  repMax: 8,
  targetRir: 2,
  sets: [{ reps: 8, weight: 20, rir: 2, completed: false }],
  ...overrides,
});

describe("workout text export", () => {
  afterEach(() => vi.useRealTimers());
  it("keeps missing load distinct from an explicitly recorded zero", () => {
    expect(exportLoadLabel(exercise(), null, "kg")).toBe("Load not logged");
    expect(exportLoadLabel(exercise(), 0, "lb")).toBe("0 lb");
    expect(formatExportSet(exercise(), { reps: 8, weight: 0 }, { units: "kg" }))
      .toContain("0 kg");
    expect(formatExportSet(exercise(), { reps: 8, weight: null }, { units: "kg" }))
      .toContain("Load not specified");
  });

  it("describes bodyweight, added weight, bands and timed work honestly", () => {
    const bodyweight = exercise({
      exerciseId: "push-up",
      name: "Push-up",
      loadRequirement: "optional",
      equipment: ["bodyweight"],
    });
    const band = exercise({
      name: "Monster Walk",
      loadRequirement: "none",
      equipment: ["bands"],
      measure: "seconds",
    });
    expect(exportLoadLabel(bodyweight, null)).toBe("Bodyweight");
    expect(exportLoadLabel(bodyweight, 10)).toBe("Bodyweight +10 kg");
    expect(formatExportSet(band, { reps: 45, weight: null })).toBe(
      "45 sec - Band",
    );
  });

  it("exports completed and incomplete sets with the actual workout date", () => {
    const workout = {
      name: "Upper Body",
      canonicalPlanDate: "2026-09-02",
      completedAt: "2026-09-03T00:15:00Z",
      exercises: [
        exercise({
          sets: [
            { reps: 8, weight: 20, rir: 2, completed: true },
            { reps: 8, weight: null, rir: 2, completed: false },
          ],
        }),
      ],
    };
    const result = buildWorkoutExport({ workout, completed: true });
    expect(result.filename).toBe("rook-upper-body-2026-09-03-completed.txt");
    expect(result.text).toContain("Completed 1 / 2 sets");
    expect(result.text).toContain("✓ 8 reps - 20 kg - RIR 2");
    expect(result.text).toContain("○ 8 reps - Load not logged - RIR 2 - Not completed");
  });

  it("keeps notes private by default and includes them only when requested", () => {
    const workout = {
      name: "Lower",
      sessionNote: "Knee felt good",
      exercises: [exercise({ notes: "Slow eccentric" })],
    };
    expect(buildWorkoutExport({ workout }).text).not.toContain("Knee felt good");
    const included = buildWorkoutExport({ workout, includeNotes: true }).text;
    expect(included).toContain("Knee felt good");
    expect(included).toContain("Slow eccentric");
  });

  it("exports all seven plan days including rest days", () => {
    const state = {
      profile: { units: "kg" },
      program: {
        name: "Functional week",
        days: [
          {
            id: "monday",
            weekday: "Mon",
            name: "Functional day",
            exercises: [exercise()],
          },
        ],
      },
      weekScheduleOverrides: {},
      workoutOccurrenceOverrides: {},
    };
    const result = buildWeeklyPlanExport({ state, date: "2026-09-02" });
    expect(result.title).toBe("Functional week");
    expect(result.filename).toBe("rook-weekly-plan-2026-08-31.txt");
    expect(result.text).toContain("MON - Functional day");
    expect(result.text).toContain("SUN - Rest");
  });

  it("sanitizes downloaded filenames", () => {
    expect(exportFilename("Upper / Body!", "2026-09-02")).toBe(
      "rook-upper-body-2026-09-02.txt",
    );
  });

  it.each(['pending', 'active', 'completed'])('keeps source plan prescriptions in export when a combined workout is %s', phase => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-12T12:00:00'));
    const original = combineExample();
    const request = {sourceIds: combineSources(original).filter(source => source.status === 'missed').map(source => source.logicalSessionId), minutes: 60};
    const result = buildCombinedProposal(original, request);
    expect(result.status, result.error).toBe('ready');
    let state = applyCombinedProposal(original, result.proposal, () => true);
    if (phase !== 'pending') state.activeWorkout = startWorkout(state, adaptedTemplateForToday(state));
    if (phase === 'completed') {
      state.activeWorkout.exercises.forEach(row => row.sets.forEach(set => { set.completed = true; }));
      state = completeWorkout(state);
      expect(state.workouts[0].combinedSourcesResolved).toBe(true);
    }
    // The training UI correctly hides reserved/resolved source sessions. A plan
    // export must still contain their prescriptions, rather than calling them rest.
    expect(currentWeekSchedule(state, '2026-09-07')).toHaveLength(0);
    const before = serializeState(state);
    const exported = buildWeeklyPlanExport({state, date: '2026-09-12'});
    expect(exported.text).toContain('MON - Push');
    expect(exported.text).toContain('WED - Pull');
    expect(exported.text).not.toContain('Combined workout');
    expect(exported.text).toBe(buildWeeklyPlanExport({state: original, date: '2026-09-12'}).text);
    expect(serializeState(state)).toBe(before);
  });
});
