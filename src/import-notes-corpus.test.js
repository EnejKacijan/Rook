import { describe, expect, it } from "vitest";
import { parseStructuredTrainingNotes } from "./aiService.js";

const profile = {
  environment: "Both",
  availableDays: ["Mon", "Wed", "Fri", "Sat"],
  units: "kg",
};

const accepted = [
  ["English full weekday", "Monday — Push\nBench Press 3x8", "Mon", "Bench Press", 3],
  ["English short weekday", "Wed: Pull\nCable Row 4x10", "Wed", "Cable Row", 4],
  ["Slovenian Monday", "Ponedeljek: Noge\nPočep 3x6", "Mon", "Počep", 3],
  ["Slovenian Tuesday", "Torek – Zgornji del\nPotisk s prsi 3x10", "Tue", "Potisk s prsi", 3],
  ["Slovenian Wednesday", "Sreda / Funkcija\nStep-down 2x8", "Wed", "Step-down", 2],
  ["Slovenian Thursday", "Četrtek: Upper\nLow Row 3x9", "Thu", "Low Row", 3],
  ["Croatian Monday", "Ponedjeljak — Push\nBench Press 3x8", "Mon", "Bench Press", 3],
  ["Croatian Wednesday", "Srijeda — Pull\nLat Pulldown 3x10", "Wed", "Lat Pulldown", 3],
  ["Croatian Thursday", "Četvrtak — Legs\nLeg Press 4x12", "Thu", "Leg Press", 4],
  ["German Monday", "Montag — Oberkörper\nBankdrücken 3x8", "Mon", "Bankdrücken", 3],
  ["German Wednesday", "Mittwoch: Unterkörper\nBeinpresse 4x10", "Wed", "Beinpresse", 4],
  ["German Friday", "Freitag — Ganzkörper\nKniebeuge 3x6", "Fri", "Kniebeuge", 3],
  ["Spanish Monday", "Lunes — Empuje\nPress banca 3x8", "Mon", "Press banca", 3],
  ["Spanish Wednesday", "Miércoles: Tirón\nRemo sentado 3x10", "Wed", "Remo sentado", 3],
  ["Spanish Saturday", "Sábado — Piernas\nPrensa 4x12", "Sat", "Prensa", 4],
  ["Sunday parenthesized", "Sunday (Full body)\nGoblet Squat 3x10", "Sun", "Goblet Squat", 3],
  ["emoji heading", "🟢 PETEK – NOGE B\nLeg Press 3×10", "Fri", "Leg Press", 3],
  ["punctuated heading", "*** THURSDAY | UPPER B\nMachine Row 2×12", "Thu", "Machine Row", 2],
  ["Day 1 heading", "Day 1 — Push\nBench Press 3x8", "Mon", "Bench Press", 3],
  ["Dan 2 heading", "Dan 2: Pull\nLow Row 3x10", "Mon", "Low Row", 3],
  ["Tag 1 heading", "Tag 1 - Beine\nBeinpresse 3x10", "Mon", "Beinpresse", 3],
  ["Dia heading", "Día 1 — Empuje\nPress banca 3x8", "Mon", "Press banca", 3],
  ["Workout A heading", "Workout A\nIncline Press 3x8", "Mon", "Incline Press", 3],
  ["Training B heading", "Training B\nCable Row 3x10", "Mon", "Cable Row", 3],
  ["Trening A heading", "Trening A\nLeg Press 4x10", "Mon", "Leg Press", 4],
  ["Session 1 heading", "Session 1\nRomanian Deadlift 3x8", "Mon", "Romanian Deadlift", 3],
  ["Push heading", "Push\nMachine Chest Press 3x10", "Mon", "Machine Chest Press", 3],
  ["Pull B heading", "Pull B\nPulldown 4x8", "Mon", "Pulldown", 4],
  ["Legs A heading", "Legs A\nHack Squat 3x10", "Mon", "Hack Squat", 3],
  ["Upper body heading", "Upper Body\nChest-Supported Row 3x8", "Mon", "Chest-Supported Row", 3],
  ["Lower B heading", "Lower B\nLeg Curl 3x12", "Mon", "Leg Curl", 3],
  ["Full body heading", "Full Body\nGoblet Squat 3x12", "Mon", "Goblet Squat", 3],
  ["Noge heading", "Noge A\nLeg Press 3x10", "Mon", "Leg Press", 3],
  ["Celo telo heading", "Celo telo\nPočep 3x8", "Mon", "Počep", 3],
  ["Oberkorper heading", "Oberkörper\nRudern 3x10", "Mon", "Rudern", 3],
  ["sets of", "Monday\nBench Press 3 sets of 8", "Mon", "Bench Press", 3],
  ["serije po", "Ponedeljek\nLeg Press 3 serije po 10", "Mon", "Leg Press", 3],
  ["German sets", "Montag\nRudern 3 Sätze mit 8", "Mon", "Rudern", 3],
  ["Spanish sets", "Lunes\nPrensa 4 series de 12", "Mon", "Prensa", 4],
  ["weight first", "Monday\nBench Press 80kg x 8 x 3", "Mon", "Bench Press", 3],
  ["asterisk notation", "Monday\nBench Press 3*8", "Mon", "Bench Press", 3],
  ["keyed columns inline", "Monday\nBench Press sets: 3 reps: 8-10", "Mon", "Bench Press", 3],
  ["AMRAP", "Monday\nPull-up 3xAMRAP", "Mon", "Pull-up", 3],
  ["failure Slovenian", "Ponedeljek\nHanging Leg Raise 2x do odpovedi", "Mon", "Hanging Leg Raise", 2],
  ["per-set reps", "Monday\nBench Press reps: 8/8/7", "Mon", "Bench Press", 3],
  ["timed seconds", "Monday\nPlank 3x30s", "Mon", "Plank", 3],
  ["RIR after prescription", "Monday\nSquat 3x6 @ 2 RIR", "Mon", "Squat", 3],
  ["RIR before value", "Monday\nSquat 3x6 | RIR 2", "Mon", "Squat", 3],
  ["RPE conversion", "Monday\nDeadlift 3x5 RPE 8", "Mon", "Deadlift", 3],
  ["next-line prescription", "Workout A\nBench Press\n3x8", "Mon", "Bench Press", 3],
  ["checklist", "Monday\n- [ ] Bench Press 3x8", "Mon", "Bench Press", 3],
  ["checked checklist", "Monday\n☑ Cable Row 4x10", "Mon", "Cable Row", 4],
  ["superset label", "Upper\nA1. Bench Press 3x8\nA2. Cable Row 3x10", "Mon", "Bench Press", 3],
  ["semicolon line", "Monday\nBench Press 3x8; Cable Row 3x10", "Mon", "Bench Press", 3],
  ["markdown table", "Monday\n| Exercise | Sets | Reps | Weight |\n|---|---:|---:|---:|\n| Bench Press | 3 | 8 | 80 kg |", "Mon", "Bench Press", 3],
  ["tab table", "Monday\nExercise\tSets\tReps\tRIR\nCable Row\t4\t10\t2", "Mon", "Cable Row", 4],
  ["CSV table", "Monday\nExercise,Sets,Reps,Weight\nLeg Press,3,12,140 kg", "Mon", "Leg Press", 3],
  ["localized table", "Ponedeljek\nVaja | Serije | Ponovitve | Teža\nPočep | 3 | 8-10 | 60 kg", "Mon", "Počep", 3],
  ["circuit rounds", "Workout A\nCircuit x3 rounds\nSquat 12 reps\nPush-up 10 reps", "Mon", "Squat", 3],
  ["ISO date heading", "2026-09-04 — Legs\nLeg Press 3x10", "Fri", "Leg Press", 3],
  ["EU date heading", "04.09.2026\nRomanian Deadlift 3x8", "Fri", "Romanian Deadlift", 3],
  ["single workout no heading", "Bench Press 3x8\nCable Row 3x10", "Mon", "Bench Press", 3],
  ["set-per-line app export", "Workout A\nBench Press\n80 kg x 8\n80 kg x 8\n75 kg x 7", "Mon", "Bench Press", 3],
  ["clock duration", "Workout A\nPlank 3x00:30", "Mon", "Plank", 3],
  ["duration before sets", "Workout A\nPlank 30 sec x 3", "Mon", "Plank", 3],
  ["superset rounds", "Workout A\nSuperset A x3\nBench Press 8 reps\nCable Row 10 reps", "Mon", "Bench Press", 3],
  ["body-part split", "Chest and Triceps\nBench Press 3x8", "Mon", "Bench Press", 3],
  ["uppercase custom session", "FOOTBALL REHAB\nStep-down 3x10", "Mon", "Step-down", 3],
  ["semicolon table with decimal comma", "Monday\nExercise;Sets;Reps;Weight\nDumbbell Press;3;8;32,5 kg", "Mon", "Dumbbell Press", 3],
  ["prescription before exercise", "Monday\n3x8 Bench Press", "Mon", "Bench Press", 3],
  ["one set before exercise", "Monday\n1x10 Leg Press", "Mon", "Leg Press", 1],
  ["sets-of before exercise", "Monday\n3 sets of 8 Bench Press", "Mon", "Bench Press", 3],
  ["Slovenian sets before exercise", "Ponedeljek\n3 serije po 8 Počep", "Mon", "Počep", 3],
  ["set then exercise then reps", "Monday\n1 set Bench Press 8 reps", "Mon", "Bench Press", 1],
  ["sets then exercise then rep range", "Monday\n3 sets Bench Press 8-10 reps", "Mon", "Bench Press", 3],
  ["keyed prefix", "Monday\nSets: 3 Reps: 8 Bench Press", "Mon", "Bench Press", 3],
  ["weight prescription before exercise", "Monday\n80kg x 8 x 3 Bench Press", "Mon", "Bench Press", 3],
  ["prefix with RIR", "Monday\n3x8 Bench Press @ 2 RIR", "Mon", "Bench Press", 3],
  ["one set to failure before exercise", "Monday\n1 set Bench Press AMRAP", "Mon", "Bench Press", 1],
  ["one set then exercise then bare reps", "Monday\n1 set Bench Press 8", "Mon", "Bench Press", 1],
  ["one set then exercise then x reps", "Monday\n1 set — Bench Press — x10", "Mon", "Bench Press", 1],
  ["per-set loads with shared reps", "Monday\nBench Press 80/80/75 5 reps", "Mon", "Bench Press", 3],
  ["per-set loads before Slovenian exercise", "Ponedeljek\n80/80/75 5 repov Bench Press", "Mon", "Bench Press", 3],
  ["explicit load unit and multiplication mark", "Monday\nBench Press 80/80/75 kg × 5 reps", "Mon", "Bench Press", 3],
  ["decimal-comma per-set loads", "Monday\nBench Press 80,5/80,5/75 kg × 5 reps", "Mon", "Bench Press", 3],
  ["next-line per-set loads", "Monday\nBench Press\n80/80/75 5 reps", "Mon", "Bench Press", 3],
  ["per-set loads with RIR", "Monday\nBench Press 80/80/75 kg × 5 reps, 2 RIR", "Mon", "Bench Press", 3],
];

const rejected = [
  "Buy milk\nEggs\nBread",
  "Packing list\nShoes\nTowel\nPassport",
  "Monday meeting\nCall Alex at 3",
  "Recipe\nFlour 300 g\nBake 30 min",
  "Medication\nTake one tablet twice daily",
  "Budget\nRent 800\nFood 300",
  "Chapter 3\nRead pages 8-10",
  "Hotel booking\n3 nights\n2 guests",
  "Flight 3x8 delayed",
  "Buy batteries 3x8",
  "Order tiles 4x12",
  "Boxes 3x10",
  "Screws 5x20",
  "Photo prints 3x8",
  "Meeting room 3x10",
  "Password 3x8",
  "Invoice 4x10",
  "Week 3x8",
  "Sets 3x8",
  "Reps 4x10",
  "Monday — Rest day\nWalk if desired",
  "Ponedeljek — Počitek\nSprehod po občutku",
  "Sunday — Off\nNo training",
  "Warm-up ideas\nArm circles\nEasy walk",
  "Progression\nAdd weight when ready",
  "Monday\nBench Press 80/80/75",
  "Monday\nBench Press 80/75 5/6",
];

describe("Notes workout import corpus", () => {
  it.each(accepted)("accepts %s", (_label, source, weekday, exercise, sets) => {
    const result = parseStructuredTrainingNotes(source, profile);
    expect(result).not.toBeNull();
    expect(result.days[0].weekday).toBe(weekday);
    expect(result.days[0].exercises[0]).toMatchObject({
      sourceName: exercise,
      sets,
    });
  });

  it.each(rejected.map((source, index) => [`negative ${index + 1}`, source]))(
    "rejects %s",
    (_label, source) => {
      expect(parseStructuredTrainingNotes(source, profile)).toBeNull();
    },
  );

  it("maps schedule-free workout blocks onto the user's available days in order", () => {
    const result = parseStructuredTrainingNotes(
      "PUSH A\nBench Press 3x8\nPULL A\nCable Row 3x10\nLEGS A\nLeg Press 4x10",
      profile,
    );
    expect(result.days.map((day) => day.weekday)).toEqual(["Mon", "Wed", "Fri"]);
    expect(result.days.map((day) => day.exercises[0].sourceName)).toEqual([
      "Bench Press",
      "Cable Row",
      "Leg Press",
    ]);
  });

  it("does not silently accept a lossy partial parse", () => {
    expect(
      parseStructuredTrainingNotes(
        "Monday — Upper\nBench Press 3x8\nCable Row 0x10",
        profile,
      ),
    ).toBeNull();
  });

  it("does not invent repetitions when only a set count is supplied", () => {
    expect(
      parseStructuredTrainingNotes("Monday\nBench Press — 1 set", profile),
    ).toBeNull();
  });

  it("preserves safe slash-separated loads and the shared rep target", () => {
    const result = parseStructuredTrainingNotes(
      "Monday\nBench Press 80,5/80,5/75 kg × 5 reps, 2 RIR",
      profile,
    );
    expect(result.days[0].exercises[0]).toMatchObject({
      sourceName: "Bench Press",
      sets: 3,
      repMin: 5,
      repMax: 5,
      targetRir: 2,
      setWeightsKg: [80.5, 80.5, 75],
    });
  });

  it("uses the profile unit only when the shared rep label makes the sequence unambiguous", () => {
    const result = parseStructuredTrainingNotes(
      "Monday\nBench Press 176/176/165 5 reps",
      { ...profile, units: "lb" },
    );
    expect(result.days[0].exercises[0].setWeightsKg).toEqual([
      79.83, 79.83, 74.84,
    ]);
  });
});
