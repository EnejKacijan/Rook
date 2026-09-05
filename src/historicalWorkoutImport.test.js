import { describe, expect, it } from "vitest";
import { buildBackupArchive, parseBackupArchive } from "./backup.js";
import { blankState, buildProgram, consistencyForCurrentWeek, exerciseCatalog, isoDay, weekday } from "./domain.js";
import { createCustomExercise, rememberExerciseAlias } from "./customExercises.js";
import {
  GENERIC_HISTORY_CSV_HEADER,
  applyHistoricalWorkoutImport,
  historicalWorkoutFingerprint,
  parseCsv,
  parseHistoricalWorkoutCsv,
  resolveHistoricalExercise,
} from "./historicalWorkoutImport.js";

const hevy = `title,start_time,end_time,description,exercise_title,superset_id,exercise_notes,set_index,set_type,weight_lbs,reps,distance_miles,duration_seconds,rpe
Push Day,"28 Mar 2025, 17:29","28 Mar 2025, 18:45",Good session,Bench Press,,Paused,1,normal,185,8,,,8
Push Day,"28 Mar 2025, 17:29","28 Mar 2025, 18:45",Good session,Bench Press,,,2,normal,185,7,,,9`;

const strong = `Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE
2025-03-28 17:29:00,Push Day,1h 16m,Bench Press,1,80,8,,,Paused,Good session,8
2025-03-28 17:29:00,Push Day,1h 16m,Bench Press,2,80,7,,,,Good session,9`;

const generic = (rows) => `${GENERIC_HISTORY_CSV_HEADER}\n${rows.join("\n")}`;

describe("historical workout import", () => {
  it("parses RFC 4180 quoted fields", () => {
    expect(parseCsv('a,b\n"one, two","say ""hi"""')).toEqual([
      ["a", "b"],
      ["one, two", 'say "hi"'],
    ]);
  });

  it("parses the verified Hevy export shape with explicit pounds", () => {
    const preview = parseHistoricalWorkoutCsv({ source: "hevy", text: hevy, state: blankState() });
    expect(preview.summary).toMatchObject({ workouts: 1, sets: 2, reviewExercises: 0 });
    expect(preview.workouts[0].exercises[0].sets[0].weight).toBeCloseTo(83.91, 2);
    expect(preview.workouts[0].exercises[0].sets[0].rir).toBeNull();
    expect(preview.workouts[0].exercises[0].sets[0].rawImport.rpe).toBe(8);
  });

  it("requires an explicit unit for the verified Strong export", () => {
    expect(() => parseHistoricalWorkoutCsv({ source: "strong", text: strong, state: blankState() }))
      .toThrow(/Choose the weight unit/);
    const preview = parseHistoricalWorkoutCsv({ source: "strong", text: strong, strongUnit: "kg", state: blankState() });
    expect(preview.workouts[0].durationSeconds).toBe(4560);
    expect(preview.workouts[0].exercises[0].sets[0].weight).toBe(80);
  });

  it("preserves a verified Strong warm-up marker without treating it as a unit", () => {
    const preview = parseHistoricalWorkoutCsv({
      source: "strong", strongUnit: "lb", state: blankState(),
      text: strong.replace(",1,80,8,", ",W1,80,8,"),
    });
    expect(preview.workouts[0].exercises[0].sets[0].setType).toBe("warmup");
    expect(preview.workouts[0].exercises[0].sets[0].weight).toBeCloseTo(36.29, 2);
  });

  it("supports the documented Generic CSV with mixed explicit units", () => {
    const preview = parseHistoricalWorkoutCsv({
      source: "generic",
      state: blankState(),
      text: generic([
        "2025-03-28 17:29:00,Upper,Bench Press,1,100,kg,5,,,",
        "2025-03-28 17:29:00,Upper,Bench Press,2,220.462,lb,5,,,",
      ]),
    });
    expect(preview.workouts[0].exercises[0].sets.map((set) => set.weight)).toEqual([100, 100]);
  });

  it("never interprets an unknown unit", () => {
    const preview = parseHistoricalWorkoutCsv({
      source: "generic",
      state: blankState(),
      text: generic([
        "2025-03-28,Upper,Bench Press,1,80,stone,8,,,",
        "2025-03-28,Upper,Bench Press,2,80,kg,8,,,",
      ]),
    });
    expect(preview.summary.invalidRows).toBe(1);
    expect(preview.summary.sets).toBe(1);
  });

  it("uses saved aliases and exact custom exercises conservatively", () => {
    const state = blankState();
    createCustomExercise(state, { name: "Prime Incline Press" });
    rememberExerciseAlias(state, "Prime Press", state.customExercises[0].id, { builtInCatalog: exerciseCatalog });
    const preview = parseHistoricalWorkoutCsv({
      source: "generic",
      state,
      text: generic([
        "2025-03-28,Upper,Prime Press,1,80,kg,8,,,",
        "2025-03-28,Upper,Prime Incline Press,2,80,kg,8,,,",
      ]),
    });
    expect(preview.summary.reviewExercises).toBe(0);
    expect(preview.exerciseMappings.every((item) => item.exerciseId === state.customExercises[0].id)).toBe(true);
  });

  it("requires review for unknown exercises and can remember a manual match", () => {
    const state = blankState();
    let preview = parseHistoricalWorkoutCsv({
      source: "generic",
      state,
      text: generic(["2025-03-28,Upper,Prime Chest Machine,1,80,kg,8,,,"]),
    });
    expect(preview.summary.reviewExercises).toBe(1);
    preview = resolveHistoricalExercise(preview, state, "Prime Chest Machine", {
      type: "match", exerciseId: "barbell-bench-press", rememberMatch: true,
    });
    const applied = applyHistoricalWorkoutImport(state, preview);
    expect(applied.state.exerciseAliases[0].alias).toBe("Prime Chest Machine");
    expect(applied.state.workouts[0].exercises[0].exerciseId).toBe("barbell-bench-press");
  });

  it("creates a custom exercise only on explicit import", () => {
    const state = blankState();
    let preview = parseHistoricalWorkoutCsv({
      source: "generic", state,
      text: generic(["2025-03-28,Upper,Unknown Machine,1,80,kg,8,,,"]),
    });
    preview = resolveHistoricalExercise(preview, state, "Unknown Machine", { type: "custom" });
    expect(state.customExercises).toHaveLength(0);
    const applied = applyHistoricalWorkoutImport(state, preview);
    expect(applied.state.customExercises[0].name).toBe("Unknown Machine");
    expect(applied.state.workouts[0].exercises[0].importedExercise.name).toBe("Unknown Machine");
  });

  it("can explicitly ignore an unsupported exercise", () => {
    const state = blankState();
    let preview = parseHistoricalWorkoutCsv({
      source: "generic", state,
      text: generic([
        "2025-03-28,Upper,Bench Press,1,80,kg,8,, ,",
        "2025-03-28,Upper,Mystery Cardio,1,,kg,,300,,",
      ]),
    });
    preview = resolveHistoricalExercise(preview, state, "Mystery Cardio", { type: "ignore" });
    const applied = applyHistoricalWorkoutImport(state, preview);
    expect(applied.state.workouts[0].exercises).toHaveLength(1);
    expect(applied.result.ignoredExercises).toBe(1);
  });

  it("skips exact duplicates and requires a choice for same-day ambiguous duplicates", () => {
    const state = blankState();
    const first = parseHistoricalWorkoutCsv({
      source: "generic", state,
      text: generic(["2025-03-28,Upper,Bench Press,1,80,kg,8,,,"]),
    });
    const imported = applyHistoricalWorkoutImport(state, first).state;
    const exact = parseHistoricalWorkoutCsv({ source: "generic", state: imported, text: generic(["2025-03-28,Upper,Bench Press,1,80,kg,8,,,"]) });
    expect(exact.summary.exactDuplicates).toBe(1);
    expect(applyHistoricalWorkoutImport(imported, exact).result.imported).toBe(0);
    const changed = parseHistoricalWorkoutCsv({ source: "generic", state: imported, text: generic(["2025-03-28,Upper,Bench Press,1,82.5,kg,8,,,"]) });
    expect(changed.summary.ambiguousDuplicates).toBe(1);
    expect(() => applyHistoricalWorkoutImport(imported, changed)).toThrow(/possible duplicates/i);
    expect(applyHistoricalWorkoutImport(imported, changed, { ambiguousAction: "skip" }).result.imported).toBe(0);
    expect(applyHistoricalWorkoutImport(imported, changed, { ambiguousAction: "import" }).result.imported).toBe(1);
  });

  it("rejects guessed third-party schemas and malformed files", () => {
    expect(() => parseHistoricalWorkoutCsv({ source: "hevy", state: blankState(), text: "date,name,weight\n2025-01-01,Push,80" }))
      .toThrow(/current Hevy workout export/);
    expect(() => parseHistoricalWorkoutCsv({ source: "generic", state: blankState(), text: 'a,b\n"broken' }))
      .toThrow(/unclosed quoted field/);
  });

  it("collects malformed rows without partially applying them", () => {
    const state = blankState();
    const before = structuredClone(state);
    const preview = parseHistoricalWorkoutCsv({
      source: "generic", state,
      text: generic([
        "bad,Upper,Bench Press,1,80,kg,8,,,",
        "2025-03-28,Upper,Bench Press,1,80,kg,8,,,",
      ]),
    });
    expect(preview.summary.invalidRows).toBe(1);
    expect(state).toEqual(before);
    expect(() => applyHistoricalWorkoutImport(state, { ...preview, summary: { ...preview.summary, reviewExercises: 1 } })).toThrow();
    expect(state).toEqual(before);
  });

  it("handles more than 1,000 workouts deterministically", () => {
    const rows = Array.from({ length: 1001 }, (_, index) => {
      const date = new Date(Date.UTC(2020, 0, 1 + index));
      return `${date.toISOString()},Session ${index},Bench Press,1,${80 + index % 5},kg,8,,,`;
    });
    const preview = parseHistoricalWorkoutCsv({ source: "generic", state: blankState(), text: generic(rows) });
    expect(preview.summary.workouts).toBe(1001);
    expect(new Set(preview.workouts.map(historicalWorkoutFingerprint)).size).toBe(1001);
    expect(applyHistoricalWorkoutImport(blankState(), preview).state.workouts).toHaveLength(1001);
  });

  it("round-trips imported history, raw units, aliases and custom exercises through Backup & Restore", async () => {
    const state = blankState();
    let preview = parseHistoricalWorkoutCsv({
      source: "generic", state,
      text: generic(["2025-03-28,Upper,Prime Machine,1,220.462,lb,8,,,Good day"]),
    });
    preview = resolveHistoricalExercise(preview, state, "Prime Machine", { type: "custom" });
    const applied = applyHistoricalWorkoutImport(state, preview).state;
    const archive = await buildBackupArchive(applied, []);
    const restored = await parseBackupArchive(archive.bytes);
    expect(restored.state.workouts).toHaveLength(1);
    expect(restored.state.workouts[0].historicalImport.source).toBe("generic");
    expect(restored.state.workouts[0].exercises[0].sets[0].rawImport.weightUnit).toBe("lb");
    expect(restored.state.customExercises[0].name).toBe("Prime Machine");
  });

  it("does not let an imported fact satisfy a current ROOK schedule slot", () => {
    const state = blankState();
    state.profile = { ...state.profile, onboardingComplete: true, daysPerWeek: 1, availableDays: [weekday()] };
    state.program = buildProgram(state.profile);
    const preview = parseHistoricalWorkoutCsv({
      source: "generic", state,
      text: generic([`${isoDay()},Imported Session,Bench Press,1,80,kg,8,,,`]),
    });
    const applied = applyHistoricalWorkoutImport(state, preview).state;
    expect(consistencyForCurrentWeek(applied).completed).toBe(0);
  });
});
