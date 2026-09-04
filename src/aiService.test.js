import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AI_REQUEST_TIMEOUT_MS,
  IMPORT_PLAN_TIMEOUT_MS,
  PLAN_GENERATION_TIMEOUT_MS,
  AIService,
  detectCoachLanguage,
  normalizeCoachText,
  normalizeFollowUpQuestion,
  parseStructuredTrainingNotes,
  preferredCoachLanguage,
} from "./aiService.js";
import {
  WEEKDAYS,
  adaptedTemplateForToday,
  applyCoachAction,
  blankState,
  buildProgram,
  compatibleReplacementCandidates,
  completeWorkout,
  exerciseCatalog,
  exerciseName,
  isExerciseAllowed,
  startWorkout,
  weekday,
} from "./domain.js";

function stateWithPlan() {
  const state = blankState();
  state.profile = {
    ...state.profile,
    goal: "Build muscle",
    experience: "Intermediate",
    daysPerWeek: 2,
    availableDays: ["Tue", "Sat"],
    sessionMinutes: 45,
    environment: "Home gym",
    equipment: ["dumbbells", "bodyweight only"],
    priorities: ["Back"],
  };
  state.program = buildProgram(state.profile);
  state.selectedDay = "Tue";
  return state;
}
function stateWithTodayPlan() {
  const state = stateWithPlan();
  const today = weekday();
  const otherDay = WEEKDAYS.find((day) => day !== today);
  state.profile.availableDays = [today, otherDay];
  state.program = buildProgram(state.profile);
  state.selectedDay = today;
  return state;
}
const serializeDay = (day) => ({
  weekday: day.weekday,
  name: day.name,
  estimatedMinutes: day.estimatedMinutes,
  exercises: day.exercises.map((item) => ({
    exerciseId: item.exerciseId,
    sets: item.sets.length,
    repMin: item.repMin,
    repMax: item.repMax,
    targetRir: item.targetRir,
    restSeconds: item.restSeconds,
  })),
});
const serializeImportedDay = (day) => ({
  ...serializeDay(day),
  location: day.location || "Commercial gym",
  exercises: day.exercises.map((item) => ({
    exerciseId: item.exerciseId,
    sourceName: exerciseCatalog[item.exerciseId].name,
    sets: item.sets.length,
    repMin: item.repMin,
    repMax: item.repMax,
    targetRir: item.targetRir,
    restSeconds: item.restSeconds,
    notes: null,
    weightKg: null,
    setWeightsKg: null,
  })),
});
const sourceTextFor = (raw) =>
  raw.days
    .flatMap((day) => [
      `${day.weekday} · ${day.name}`,
      ...day.exercises.map(
        (item) =>
          `${item.sourceName} — ${item.sets} × ${item.repMin}–${item.repMax}${Number.isFinite(item.targetRir) ? ` · ${item.targetRir} RIR` : ""}`,
      ),
    ])
    .join("\n");
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("AI service boundary", () => {
  it("offers a validated resume action for an accidentally completed empty workout", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const state = stateWithTodayPlan();
    state.activeWorkout = startWorkout(state, state.program.days[0]);
    const completed = completeWorkout(state);
    const empty = completed.workouts.at(-1);

    const reply = await AIService.coach(
      completed,
      "pomotoma sem zaključil trening, prosim ga ponovno odpri",
    );

    expect(reply.final).toBe(true);
    expect(reply.action).toMatchObject({
      type: "resume-empty-completed-workout",
      targetCompletedWorkoutId: empty.id,
      trainingDate: empty.workoutDateKey,
      expectedCompletedAt: empty.completedAt,
      label: "RESUME WORKOUT",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("treats a successful non-JSON dev-server response as unavailable instead of leaking a rejected promise", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => {
          throw new SyntaxError("Unexpected token");
        },
      })),
    );
    await expect(AIService.status()).resolves.toEqual({
      available: false,
      provider: null,
    });
    await expect(AIService.expertLabStatus()).resolves.toEqual({
      enabled: false,
      feedbackCount: 0,
    });
  });
  it("removes slash-gender wording from Slovenian Coach replies and stored history rendering", () => {
    expect(
      normalizeCoachText(
        "Hvala â€” vesel/a sem, da ti lahko pomagam. Vedno sem pripravljen/a.",
      ),
    ).toBe("Hvala â€” vesel sem, da ti lahko pomagam. Vedno sem pripravljen.");
  });
  it("imports clearly structured Notes locally without waiting for the AI provider", async () => {
    for (const heading of [
      "Monday: Push",
      "Monday : Push",
      "Monday - Push",
      "MONDAY \u2014 PUSH",
      "Mon / Push",
      "Monday (Push)",
      "Monday Push",
    ]) {
      const variant = parseStructuredTrainingNotes(
        `${heading}\nBarbell Bench Press\n3x8 reps`,
        { environment: "Commercial gym" },
      );
      expect(variant?.days[0]).toMatchObject({ weekday: "Mon" });
      expect(variant?.days[0].name.toLowerCase()).toBe("push");
    }
    const compact = parseStructuredTrainingNotes(
      "Mon: Push\n- Barbell Bench Press: 3x8-10\n* Overhead Press - 3 sets x 8 reps\n1. Triceps Pushdown 2x12-15",
      { environment: "Commercial gym" },
    );
    expect(
      compact.days[0].exercises.map((exercise) => [
        exercise.sourceName,
        exercise.sets,
        exercise.repMin,
        exercise.repMax,
      ]),
    ).toEqual([
      ["Barbell Bench Press", 3, 8, 10],
      ["Overhead Press", 3, 8, 8],
      ["Triceps Pushdown", 2, 12, 15],
    ]);
    const notes = `WEEKLY WORKOUT PLAN
Goal: Build muscle

MONDAY \u2014 UPPER A
Barbell Bench Press
3 sets x 8\u201310 reps
Rest: 2\u20133 min

WEDNESDAY \u2014 REST

SATURDAY \u2014 LOWER B
Hack Squat
3 sets x 8\u201312 reps
Rest: 2 min

PROGRESSION
Use double progression.`;
    const parsed = parseStructuredTrainingNotes(notes, {
      environment: "Commercial gym",
    });
    expect(parsed.days.map((day) => [day.weekday, day.name])).toEqual([
      ["Mon", "UPPER A"],
      ["Sat", "LOWER B"],
    ]);
    expect(parsed.days[0].exercises[0]).toMatchObject({
      sourceName: "Barbell Bench Press",
      sets: 3,
      repMin: 8,
      repMax: 10,
      restSeconds: 150,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        throw new Error(
          "The structured fast path should not call the provider.",
        );
      }),
    );
    const result = await AIService.importTrainingPlan(
      {
        ...stateWithPlan().profile,
        environment: "Commercial gym",
        equipment: ["full gym"],
      },
      notes,
    );
    expect(fetch).not.toHaveBeenCalled();
    expect(result.program.days.map((day) => day.name)).toEqual([
      "UPPER A",
      "LOWER B",
    ]);
    expect(result.program.days.map((day) => day.weekday)).toEqual([
      "Mon",
      "Sat",
    ]);
  });
  it("imports slash-separated per-set loads locally without flattening them", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        throw new Error("A safe slash prescription must stay on the local path.");
      }),
    );
    const profile = {
      ...blankState().profile,
      environment: "Commercial gym",
      equipment: ["full gym"],
      units: "kg",
    };
    const result = await AIService.importTrainingPlan(
      profile,
      "Monday — Push\nBench Press 80/80/75 5 reps\nCable Row 3x8",
    );
    expect(fetch).not.toHaveBeenCalled();
    expect(
      result.program.days[0].exercises[0].sets.map((set) => set.weight),
    ).toEqual([80, 80, 75]);
    expect(
      result.program.days[0].exercises[0].sets.map((set) => set.reps),
    ).toEqual([5, 5, 5]);
  });
  it("keeps a slow AI import alive beyond twelve seconds", async () => {
    vi.useFakeTimers();
    let importSignal;
    vi.stubGlobal(
      "fetch",
      vi.fn((url, options = {}) => {
        if (url === "/api/ai/status")
          return Promise.resolve({
            ok: true,
            json: async () => ({ available: true }),
          });
        importSignal = options.signal;
        return new Promise((_resolve, reject) =>
          options.signal.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          ),
        );
      }),
    );
    const importing = AIService.importTrainingPlan(
      blankState().profile,
      "A workout note the deterministic parser cannot safely structure",
    );
    const rejected = expect(importing).rejects.toThrow(/took too long/i);
    await vi.advanceTimersByTimeAsync(12000);
    expect(importSignal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(IMPORT_PLAN_TIMEOUT_MS - 12000);
    await rejected;
  });
  it("detects the latest conversation language without locking Coach to the app language", () => {
    expect(
      detectCoachLanguage("jaz bi rad mel vajo za chest v obeh upperjih"),
    ).toBe("Slovenian");
    expect(
      detectCoachLanguage("Danes imaš načrtovan počitek, zato ni treninga."),
    ).toBe("Slovenian");
    expect(detectCoachLanguage("dodaj neki light trening na torek ja")).toBe(
      "Slovenian",
    );
    expect(detectCoachLanguage("adapt saturday to 35 minutes")).toBe("English");
    expect(detectCoachLanguage("I want to change my current workout")).toBe(
      "English",
    );
    expect(
      preferredCoachLanguage("pokazi te", [
        { user: "dodaj neki light trening na torek ja" },
      ]),
    ).toBe("Slovenian");
    expect(
      preferredCoachLanguage("ja", [
        { user: "Can you change my plan?" },
        { user: "Prosim, prilagodi današnji trening." },
      ]),
    ).toBe("Slovenian");
    expect(preferredCoachLanguage("Please answer in German.", [])).toBe(
      "German",
    );
  });
  it("retries once when the provider replies in a different detectable language", async () => {
    const state = stateWithPlan();
    const bodies = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url, options) => {
        if (url === "/api/ai/status")
          return { ok: true, json: async () => ({ available: true }) };
        bodies.push(JSON.parse(options.body));
        return {
          ok: true,
          json: async () => ({
            data: {
              text:
                bodies.length === 1
                  ? "I can change your workout and explain the plan today."
                  : "Lahko spremenim današnji trening in razložim načrt.",
              action: null,
            },
          }),
        };
      }),
    );
    const reply = await AIService.coach(
      state,
      "jaz bi rad spremenil današnji trening",
    );
    expect(reply.text).toMatch(/Lahko/);
    expect(bodies).toHaveLength(2);
    expect(bodies[0].payload.responseLanguage).toBe("Slovenian");
    expect(bodies[1].payload.previousLanguageMismatch).toMatch(/Slovenian/);
  });
  it("validates physique suggestions and normalizes labels through the local allowlist", async () => {
    const calls = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url, options) => {
        calls.push({ url, options });
        if (url === "/api/ai/status")
          return { ok: true, json: async () => ({ available: true }) };
        return {
          ok: true,
          json: async () => ({
            data: {
              status: "success",
              summary: "Possible areas to emphasize.",
              suggestions: [
                {
                  priorityId: "upper_chest",
                  label: "Wrong provider label",
                  priorityLevel: "high",
                  reason: "May be useful if it matches your goals.",
                },
                {
                  priorityId: "lateral_delts",
                  label: "Also wrong",
                  priorityLevel: "moderate",
                  reason: "Could be an optional focus.",
                },
              ],
              retryMessage: null,
            },
          }),
        };
      }),
    );
    const result = await AIService.reviewPhysique(stateWithPlan().profile, [
      { angle: "front", dataUrl: "data:image/jpeg;base64,abc" },
    ]);
    expect(result.suggestions.map((item) => item.label)).toEqual([
      "Upper chest",
      "Lateral delts",
    ]);
    const body = JSON.parse(calls[1].options.body);
    expect(body.operation).toBe("physique-review");
    expect(body.payload.photos).toHaveLength(1);
    expect(body.payload.profileContext).not.toHaveProperty("name");
  });
  it("returns no invented priorities when the review is insufficient", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) =>
        url === "/api/ai/status"
          ? { ok: true, json: async () => ({ available: true }) }
          : {
              ok: true,
              json: async () => ({
                data: {
                  status: "insufficient",
                  summary: "Not enough visual context.",
                  suggestions: [
                    {
                      priorityId: "chest",
                      label: "Chest",
                      priorityLevel: "high",
                      reason: "Ignore this.",
                    },
                  ],
                  retryMessage: "Try a clearer photo.",
                },
              }),
            },
      ),
    );
    const result = await AIService.reviewPhysique(stateWithPlan().profile, [
      { angle: "side", dataUrl: "data:image/jpeg;base64,abc" },
    ]);
    expect(result.status).toBe("insufficient");
    expect(result.suggestions).toEqual([]);
  });
  it("requests optional onboarding follow-ups through the server boundary", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          data: {
            questions: [
              {
                question: "Do you prefer consecutive training days?",
                hint: null,
              },
            ],
          },
        }),
      })),
    );
    const result = await AIService.generateFollowUpQuestions(
      stateWithPlan().profile,
    );
    expect(result).toEqual({
      questions: [
        { question: "Do you prefer consecutive training days?", hint: null },
      ],
      source: "ai",
    });
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.operation).toBe("follow-ups");
  });
  it("moves legacy examples out of an oversized follow-up heading", () => {
    const result = normalizeFollowUpQuestion(
      "Do you have a preferred 5-day training split (examples: Push/Pull/Legs + Chest day, Upper/Lower + accessory day), or should I choose one?",
    );
    expect(result.question).toBe(
      "Do you have a preferred 5-day training split?",
    );
    expect(result.hint).toMatch(/^examples:/i);
    expect(result.question.split(/\s+/)).toHaveLength(8);
  });
  it("preserves the provider-authored schedule, sets, reps, and RIR after validation", async () => {
    const state = stateWithPlan();
    state.profile.sessionMinutes = 90;
    const local = buildProgram(state.profile);
    const raw = { name: "Provider Plan", days: local.days.map(serializeDay) };
    raw.days[0].exercises[0] = {
      ...raw.days[0].exercises[0],
      sets: 5,
      repMin: 12,
      repMax: 15,
      targetRir: 3,
      restSeconds: 75,
    };
    const stages = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) =>
        url === "/api/ai/status"
          ? { ok: true, json: async () => ({ available: true }) }
          : { ok: true, json: async () => ({ data: raw }) },
      ),
    );
    const result = await AIService.generateTrainingPlan(state.profile, {
      onStage: (stage) => stages.push(stage),
    });
    const authored = result.program.days[0].exercises[0];
    expect(stages).toEqual(["preparing", "building", "checking"]);
    expect(result.source).toBe("ai");
    expect(result.program.name).toBe("Provider Plan");
    expect(result.program.days.map((day) => day.weekday)).toEqual(
      raw.days.map((day) => day.weekday),
    );
    expect(authored.sets).toHaveLength(5);
    expect(authored).toMatchObject({
      repMin: 12,
      repMax: 15,
      targetRir: 3,
      restSeconds: 75,
    });
    expect(authored.sets[0].weight).toBeNull();
  });
  it("sends the safe baseline and explicit split preference to AI personalization", async () => {
    const state = stateWithPlan();
    state.profile = {
      ...state.profile,
      daysPerWeek: 4,
      availableDays: ["Mon", "Tue", "Thu", "Sat"],
      sessionMinutes: 60,
      environment: "Commercial gym",
      equipment: ["full gym"],
      trainingPreferences: "Arnold split",
    };
    const baseline = buildProgram(state.profile);
    const raw = { name: baseline.name, days: baseline.days.map(serializeDay) };
    let body;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url, options) => {
        if (url === "/api/ai/status")
          return { ok: true, json: async () => ({ available: true }) };
        body = JSON.parse(options.body);
        return { ok: true, json: async () => ({ data: raw }) };
      }),
    );
    await AIService.generateTrainingPlan(state.profile, {
      baselineProgram: baseline,
    });
    expect(body.payload.profile.trainingPreferences).toBe("Arnold split");
    expect(body.payload.baselineProgram).toMatchObject({
      name: "Arnold-inspired Hybrid",
      templateId: "T4-ARNOLD",
    });
    expect(body.payload.baselineProgram.days.map((day) => day.name)).toEqual(
      baseline.days.map((day) => day.name),
    );
  });
  it("sends compiled constraints to plan AI without raw restriction text or evidence", async () => {
    const state = stateWithPlan();
    state.profile.avoid = "Avoid squats";
    state.profile.trainingSafetyAnalysis = {
      sourceText: "Avoid squats",
      analysis: {
        schemaVersion: 2,
        findings: [
          {
            kind: "explicit_avoidance",
            confidence: 0.98,
            evidence: [{ start: 0, end: 12, quote: "Avoid squats" }],
            targetText: "squats",
            minimumRir: null,
            allowedBodyRegion: null,
          },
        ],
        unresolved: [],
      },
    };
    state.profile.trainingSafetyLimitsResponse = { status: "test-only" };
    state.profile.trainingSafetySupplementalLimits = {
      text: "private supplemental restriction",
      analysis: null,
    };
    const local = buildProgram(state.profile);
    const raw = { name: local.name, days: local.days.map(serializeDay) };
    let body;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url, options) => {
        if (url === "/api/ai/status")
          return { ok: true, json: async () => ({ available: true }) };
        body = JSON.parse(options.body);
        return { ok: true, json: async () => ({ data: raw }) };
      }),
    );
    await AIService.generateTrainingPlan(state.profile);
    expect(body.payload.profile.avoid).toBeUndefined();
    expect(body.payload.profile.trainingSafetyAnalysis).toBeUndefined();
    expect(body.payload.profile.trainingSafetyLimitsResponse).toBeUndefined();
    expect(body.payload.profile.trainingSafetySupplementalLimits).toBeUndefined();
    expect(body.payload.profile.compiledTrainingSafety.constraints.avoidPatterns).toContain("squat");
    expect(JSON.stringify(body.payload)).not.toContain("Avoid squats");
    expect(JSON.stringify(body.payload)).not.toContain("private supplemental restriction");
  });
  it("rejects a recovery-conflicted AI schedule and asks the provider for a corrected plan", async () => {
    const state = stateWithPlan();
    state.profile = {
      ...state.profile,
      daysPerWeek: 4,
      availableDays: ["Mon", "Tue", "Thu", "Fri"],
      sessionMinutes: 60,
    };
    const local = buildProgram(state.profile);
    const lower = local.days.filter((day) => day.name.startsWith("Lower"));
    const upper = local.days.filter((day) => day.name.startsWith("Upper"));
    const weekdays = state.profile.availableDays;
    const conflicted = [...lower, ...upper].map((day, index) => ({
      ...serializeDay(day),
      weekday: weekdays[index],
    }));
    const corrected = local.days.map(serializeDay);
    const bodies = [];
    let plans = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url, options) => {
        if (url === "/api/ai/status")
          return { ok: true, json: async () => ({ available: true }) };
        bodies.push(JSON.parse(options.body));
        plans += 1;
        return {
          ok: true,
          json: async () => ({
            data: {
              name: "Recovery Plan",
              days: plans === 1 ? conflicted : corrected,
            },
          }),
        };
      }),
    );
    const result = await AIService.generateTrainingPlan(state.profile);
    const lowerDays = result.program.days
      .filter((day) => day.name.startsWith("Lower"))
      .map((day) => WEEKDAYS.indexOf(day.weekday));
    expect(plans).toBe(2);
    expect(bodies[1].payload.previousValidationError).toMatch(
      /recovery|consecutive/i,
    );
    expect(Math.abs(lowerDays[0] - lowerDays[1])).toBeGreaterThan(1);
  });
  it("rejects an AI plan with Upper on Sunday and Upper again on the repeating Monday", async () => {
    const state = stateWithPlan();
    state.profile = {
      ...state.profile,
      environment: "Commercial gym",
      equipment: ["full gym"],
      daysPerWeek: 4,
      availableDays: ["Mon", "Wed", "Sat", "Sun"],
      sessionMinutes: 60,
    };
    const local = buildProgram(state.profile);
    const upper = local.days.filter((day) => day.name.startsWith("Upper"));
    const lower = local.days.filter((day) => day.name.startsWith("Lower"));
    const conflicted = [
      { ...serializeDay(upper[0]), weekday: "Mon" },
      { ...serializeDay(lower[0]), weekday: "Wed" },
      { ...serializeDay(lower[1]), weekday: "Sat" },
      { ...serializeDay(upper[1]), weekday: "Sun" },
    ];
    const corrected = local.days.map(serializeDay);
    const bodies = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url, options) => {
        if (url === "/api/ai/status")
          return { ok: true, json: async () => ({ available: true }) };
        bodies.push(JSON.parse(options.body));
        return {
          ok: true,
          json: async () => ({
            data: {
              name: "Cyclic Recovery Plan",
              days: bodies.length === 1 ? conflicted : corrected,
            },
          }),
        };
      }),
    );
    const result = await AIService.generateTrainingPlan(state.profile);
    expect(bodies).toHaveLength(2);
    expect(bodies[1].payload.previousValidationError).toMatch(
      /Sunday-to-Monday|consecutive/i,
    );
    const mon = result.program.days.find((day) => day.weekday === "Mon");
    const sun = result.program.days.find((day) => day.weekday === "Sun");
    expect([
      mon.name.startsWith("Upper"),
      sun.name.startsWith("Upper"),
    ]).not.toEqual([true, true]);
  });
  it("retries one invalid provider plan before using the validated result", async () => {
    const state = stateWithPlan();
    const local = buildProgram(state.profile);
    const valid = { name: "Retry Plan", days: local.days.map(serializeDay) };
    const stages = [];
    let plans = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) => {
        if (url === "/api/ai/status")
          return { ok: true, json: async () => ({ available: true }) };
        plans += 1;
        return {
          ok: true,
          json: async () => ({
            data: plans === 1 ? { name: "Invalid", days: [] } : valid,
          }),
        };
      }),
    );
    const result = await AIService.generateTrainingPlan(state.profile, {
      onStage: (stage) => stages.push(stage),
    });
    expect(result.source).toBe("ai");
    expect(result.program.name).toBe("Retry Plan");
    expect(plans).toBe(2);
    expect(stages).toEqual([
      "preparing",
      "building",
      "checking",
      "refining",
      "checking",
    ]);
  });
  it("shares one in-flight generation request for duplicate calls with the same profile", async () => {
    const state = stateWithPlan();
    const raw = {
      name: "One Request",
      days: state.program.days.map(serializeDay),
    };
    let release;
    const pending = new Promise((resolve) => {
      release = resolve;
    });
    let planCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) => {
        if (url === "/api/ai/status")
          return { ok: true, json: async () => ({ available: true }) };
        planCalls += 1;
        await pending;
        return { ok: true, json: async () => ({ data: raw }) };
      }),
    );
    const first = AIService.generateTrainingPlan(state.profile);
    await vi.waitFor(() => expect(planCalls).toBe(1));
    const secondStages = [];
    const second = AIService.generateTrainingPlan(state.profile, {
      onStage: (stage) => secondStages.push(stage),
    });
    release();
    const [a, b] = await Promise.all([first, second]);
    expect(planCalls).toBe(1);
    expect(a.program.id).toBe(b.program.id);
    expect(secondStages[0]).toBe("building");
  });
  it("gives plan generation a longer timeout before stopping a stalled request", async () => {
    vi.useFakeTimers();
    const state = stateWithPlan();
    vi.stubGlobal(
      "fetch",
      vi.fn((url, options = {}) => {
        if (url === "/api/ai/status")
          return Promise.resolve({
            ok: true,
            json: async () => ({ available: true }),
          });
        return new Promise((resolve, reject) =>
          options.signal.addEventListener("abort", () =>
            reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
          ),
        );
      }),
    );
    const pending = AIService.generateTrainingPlan(state.profile);
    const rejected = expect(pending).rejects.toThrow(/took too long/i);
    await vi.advanceTimersByTimeAsync(AI_REQUEST_TIMEOUT_MS);
    expect(fetch.mock.calls).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(
      PLAN_GENERATION_TIMEOUT_MS - AI_REQUEST_TIMEOUT_MS,
    );
    await rejected;
  });
  it("rejects copied daily workouts and sends the quality defect back for an AI correction", async () => {
    const state = stateWithPlan();
    const local = buildProgram(state.profile);
    const valid = {
      name: "Corrected Plan",
      days: local.days.map(serializeDay),
    };
    const copied = structuredClone(valid);
    copied.name = "Copied Plan";
    copied.days[1].exercises = structuredClone(copied.days[0].exercises);
    copied.days[0].name = "Push";
    copied.days[1].name = "Pull";
    const bodies = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url, options) => {
        if (url === "/api/ai/status")
          return { ok: true, json: async () => ({ available: true }) };
        bodies.push(JSON.parse(options.body));
        return {
          ok: true,
          json: async () => ({ data: bodies.length === 1 ? copied : valid }),
        };
      }),
    );
    const result = await AIService.generateTrainingPlan(state.profile);
    expect(result.program.name).toBe("Corrected Plan");
    expect(bodies).toHaveLength(2);
    expect(bodies[1].payload.previousValidationError).toMatch(
      /repeats the exact exercise selection|session focus/i,
    );
  });
  it("repairs interchangeable compound duplicates locally without requesting a whole new plan", async () => {
    const state = stateWithPlan();
    state.profile = {
      ...state.profile,
      environment: "Commercial gym",
      equipment: ["full gym"],
    };
    const local = buildProgram(state.profile);
    const redundant = {
      name: "Redundant Chest Plan",
      days: local.days.map(serializeDay),
    };
    redundant.days[0].exercises[0].exerciseId = "barbell-bench-press";
    redundant.days[0].exercises[1].exerciseId = "dumbbell-bench-press";
    const bodies = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url, options) => {
        if (url === "/api/ai/status")
          return { ok: true, json: async () => ({ available: true }) };
        bodies.push(JSON.parse(options.body));
        return { ok: true, json: async () => ({ data: redundant }) };
      }),
    );
    const result = await AIService.generateTrainingPlan(state.profile);
    const firstDayIds = result.program.days[0].exercises.map(
      (item) => item.exerciseId,
    );
    expect(result.program.name).toBe("Redundant Chest Plan");
    expect(bodies).toHaveLength(1);
    expect(firstDayIds).toContain("barbell-bench-press");
    expect(firstDayIds).not.toContain("dumbbell-bench-press");
  });
  it("returns a technically valid but programming-flawed candidate through the compact Expert Lab request", async () => {
    const state = stateWithPlan();
    state.profile = {
      ...state.profile,
      environment: "Commercial gym",
      equipment: ["full gym"],
    };
    const local = buildProgram(state.profile);
    const redundant = {
      name: "Review This Candidate",
      days: local.days.map(serializeDay),
    };
    redundant.days[0].exercises[0].exerciseId = "barbell-bench-press";
    redundant.days[0].exercises[1].exerciseId = "machine-chest-press";
    let planCalls = 0;
    let requestBody;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url, options) => {
        if (url === "/api/ai/status")
          return { ok: true, json: async () => ({ available: true }) };
        planCalls += 1;
        requestBody = JSON.parse(options.body);
        return { ok: true, json: async () => ({ data: redundant }) };
      }),
    );
    const result = await AIService.generateExpertCandidate(state.profile);
    expect(result.program.name).toBe("Review This Candidate");
    expect(
      result.program.days[0].exercises
        .slice(0, 2)
        .map((item) => item.exerciseId),
    ).toEqual(["barbell-bench-press", "machine-chest-press"]);
    expect(planCalls).toBe(1);
    expect(requestBody.payload.expertReviewMode).toBe(true);
    expect(
      requestBody.payload.catalog.some((item) =>
        ["dead-bug", "prone-y-raise"].includes(item.id),
      ),
    ).toBe(false);
    expect(requestBody.payload.catalog[0]).not.toHaveProperty("aliases");
    expect(requestBody.payload.catalog[0]).not.toHaveProperty("increment");
    expect(requestBody.payload.catalog[0]).not.toHaveProperty("restSeconds");
  });
  it("safely resolves an exact catalog-name slug returned instead of the canonical ID", async () => {
    const state = stateWithPlan();
    state.profile.environment = "Commercial gym";
    state.profile.equipment = ["full gym"];
    const local = buildProgram(state.profile);
    const raw = { name: "Alias Plan", days: local.days.map(serializeDay) };
    raw.days[0].exercises.at(-1).exerciseId = "standing-calf-raise";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) =>
        url === "/api/ai/status"
          ? { ok: true, json: async () => ({ available: true }) }
          : { ok: true, json: async () => ({ data: raw }) },
      ),
    );
    const result = await AIService.generateTrainingPlan(state.profile);
    expect(result.source).toBe("ai");
    expect(
      result.program.days[0].exercises.some(
        (item) => item.exerciseId === "calf-raise",
      ),
    ).toBe(true);
  });
  it("imports a pasted Notes plan without inventing RIR that was not written", async () => {
    const state = stateWithPlan();
    const raw = {
      name: "My Notes Plan",
      days: state.program.days.map(serializeImportedDay),
    };
    raw.days
      .flatMap((day) => day.exercises)
      .forEach((exercise) => {
        exercise.targetRir = null;
      });
    raw.days[0].exercises[0].sets = 5;
    raw.days[0].exercises[0].repMin = 12;
    raw.days[0].exercises[0].repMax = 15;
    const source = sourceTextFor(raw);
    const calls = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url, options) => {
        calls.push({ url, options });
        return url === "/api/ai/status"
          ? { ok: true, json: async () => ({ available: true }) }
          : { ok: true, json: async () => ({ data: raw }) };
      }),
    );
    const result = await AIService.importTrainingPlan(state.profile, source);
    expect(result.source).toBe("ai-import");
    expect(result.program.source).toBe("ai-import");
    expect(result.program.days[0].exercises[0].sets).toHaveLength(5);
    expect(result.program.days[0].exercises[0].repMin).toBe(12);
    expect(
      result.program.days
        .flatMap((day) => day.exercises)
        .every((exercise) => exercise.targetRir === null),
    ).toBe(true);
    expect(result.profile.rirEnabled).toBe(false);
    expect(result.profile.daysPerWeek).toBe(raw.days.length);
    expect(calls).toHaveLength(0);
  });
  it("keeps a canonical imported exercise separate from its free-text note", async () => {
    const source =
      "Monday: Legs\nSingle-Leg Leg Extension (curl masina) — 3×10\nLeg Press — 3×8";
    const result = await AIService.importTrainingPlan(
      blankState().profile,
      source,
    );
    const exercise = result.program.days[0].exercises[0];
    expect(exercise.exerciseId).toBe("single-leg-leg-extension");
    expect(exercise.importedName).toBe("Single-Leg Leg Extension");
    expect(exercise.notes).toBe("curl masina");
    expect(exerciseName(exercise)).toBe("Single-Leg Leg Extension");
  });
  it("treats an explicit rest-only calendar entry as a rest day instead of an invalid workout", async () => {
    const state = stateWithPlan();
    const raw = {
      name: "Plan With Rest",
      days: state.program.days.map(serializeImportedDay),
    };
    raw.days.splice(1, 0, {
      weekday: "Wed",
      location: "Home",
      name: "Rest",
      estimatedMinutes: 0,
      exercises: [],
    });
    const source = sourceTextFor(raw);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) =>
        url === "/api/ai/status"
          ? { ok: true, json: async () => ({ available: true }) }
          : { ok: true, json: async () => ({ data: raw }) },
      ),
    );
    const result = await AIService.importTrainingPlan(state.profile, source);
    expect(result.program.days.map((day) => day.weekday)).toEqual([
      "Tue",
      "Sat",
    ]);
    expect(result.profile.daysPerWeek).toBe(2);
    expect(result.program.days.some((day) => day.name === "Rest")).toBe(false);
  });
  it("imports a non-English plan without translating or replacing exercise identities", async () => {
    const source =
      "Ponedeljek · Zgornji del\nPotisk s prsi — 3 serije po 8 @ 72,5 kg\nVeslanje z oporo prsi — 3 serije po 10";
    const raw = {
      name: "Moj program",
      days: [
        {
          weekday: "Mon",
          location: "Commercial gym",
          name: "Zgornji del",
          estimatedMinutes: 30,
          exercises: [
            {
              exerciseId: null,
              sourceName: "Potisk s prsi",
              sets: 3,
              repMin: 8,
              repMax: 8,
              targetRir: null,
              restSeconds: null,
              notes: null,
              weightKg: 999,
              setWeightsKg: null,
            },
            {
              exerciseId: null,
              sourceName: "Veslanje z oporo prsi",
              sets: 3,
              repMin: 10,
              repMax: 10,
              targetRir: null,
              restSeconds: null,
              notes: null,
              weightKg: null,
              setWeightsKg: null,
            },
          ],
        },
      ],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) =>
        url === "/api/ai/status"
          ? { ok: true, json: async () => ({ available: true }) }
          : { ok: true, json: async () => ({ data: raw }) },
      ),
    );
    const result = await AIService.importTrainingPlan(
      blankState().profile,
      source,
    );
    const exercises = result.program.days[0].exercises;
    expect(result.program.name).toBe("Imported plan");
    expect(result.program.days[0].name).toBe("Zgornji del");
    expect(exercises.map((item) => item.importedName)).toEqual([
      "Potisk s prsi",
      "Veslanje z oporo prsi",
    ]);
    expect(exercises.every((item) => item.matchStatus === "unresolved")).toBe(
      true,
    );
    expect(exercises[0].sets.map((set) => set.weight)).toEqual([
      72.5, 72.5, 72.5,
    ]);
  });
  it("does not promote a workout heading to the plan title and removes programming classifications from exercise names", async () => {
    const source =
      "🟢 PONEDELJEK – UPPER A\n1. Incline Dumbbell Press (compound) – 3×6 30 kg\n2. Cable Fly (isolation) – 2×9 35 kg";
    const raw = {
      name: "🟢 PONEDELJEK – UPPER A",
      days: [
        {
          weekday: "Mon",
          location: "Commercial gym",
          name: "🟢 PONEDELJEK – UPPER A",
          estimatedMinutes: 30,
          exercises: [
            {
              exerciseId: null,
              sourceName: "Incline Dumbbell Press (compound",
              sets: 3,
              repMin: 6,
              repMax: 6,
              targetRir: null,
              restSeconds: null,
              notes: null,
              weightKg: null,
              setWeightsKg: null,
            },
            {
              exerciseId: null,
              sourceName: "Cable Fly (isolation",
              sets: 2,
              repMin: 9,
              repMax: 9,
              targetRir: null,
              restSeconds: null,
              notes: null,
              weightKg: null,
              setWeightsKg: null,
            },
          ],
        },
      ],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) =>
        url === "/api/ai/status"
          ? { ok: true, json: async () => ({ available: true }) }
          : { ok: true, json: async () => ({ data: raw }) },
      ),
    );
    const result = await AIService.importTrainingPlan(
      blankState().profile,
      source,
    );
    const exercises = result.program.days[0].exercises;
    expect(result.program.name).toBe("Imported plan");
    expect(exercises.map((item) => item.importedName)).toEqual([
      "Incline Dumbbell Press",
      "Cable Fly",
    ]);
    expect(exercises.map((item) => item.exerciseId)).toEqual([
      "incline-dumbbell-press",
      "cable-fly",
    ]);
    expect(exercises.map((item) => item.sets[0].weight)).toEqual([30, 35]);
  });
  it("trusts explicit source kilograms instead of invented provider weights", async () => {
    const state = stateWithPlan();
    const raw = {
      name: "Weighted Notes",
      days: state.program.days.map(serializeImportedDay),
    };
    const first = raw.days[0].exercises[0];
    const second = raw.days[0].exercises[1];
    first.weightKg = 999;
    second.setWeightsKg = Array.from({ length: second.sets }, () => 999);
    const source = sourceTextFor(raw)
      .replace(
        `${first.sourceName} — ${first.sets} × ${first.repMin}–${first.repMax}`,
        `${first.sourceName} — ${first.sets} × ${first.repMin}–${first.repMax} @ 24 kg`,
      )
      .replace(
        `${second.sourceName} — ${second.sets} × ${second.repMin}–${second.repMax}`,
        `${second.sourceName} — ${second.sets} × ${second.repMin}–${second.repMax} · ${Array.from({ length: second.sets }, (_, index) => `set ${index + 1} ${30 + index * 2.5}kg`).join(", ")}`,
      );
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) =>
        url === "/api/ai/status"
          ? { ok: true, json: async () => ({ available: true }) }
          : { ok: true, json: async () => ({ data: raw }) },
      ),
    );
    const result = await AIService.importTrainingPlan(state.profile, source);
    expect(
      result.program.days[0].exercises[0].sets.map((set) => set.weight),
    ).toEqual(Array.from({ length: first.sets }, () => 24));
    expect(
      result.program.days[0].exercises[1].sets.map((set) => set.weight),
    ).toEqual(
      Array.from({ length: second.sets }, (_, index) => 30 + index * 2.5),
    );
    expect(
      result.program.days
        .slice(1)
        .flatMap((day) => day.exercises)
        .every((exercise) => exercise.sets.every((set) => set.weight === null)),
    ).toBe(true);
  });
  it("corrects an AI exercise substitution from the source without a slow retry", async () => {
    const state = stateWithPlan();
    const correct = {
      name: "Exact Import",
      days: state.program.days.map(serializeImportedDay),
    };
    let source = sourceTextFor(correct);
    for (const day of correct.days)
      source = source.replace(
        `${day.weekday} ·`,
        `Training on ${day.weekday} ·`,
      );
    const substituted = structuredClone(correct);
    substituted.days[0].exercises[0].sourceName = "Machine Chest Press";
    substituted.days[0].exercises[0].exerciseId = "machine-chest-press";
    const bodies = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url, options) => {
        if (url === "/api/ai/status")
          return { ok: true, json: async () => ({ available: true }) };
        bodies.push(JSON.parse(options.body));
        return {
          ok: true,
          json: async () => ({
            data: bodies.length === 1 ? substituted : correct,
          }),
        };
      }),
    );
    const result = await AIService.importTrainingPlan(state.profile, source);
    expect(bodies).toHaveLength(1);
    expect(bodies[0].payload).not.toHaveProperty("catalog");
    expect(result.program.days[0].exercises[0].originalImportedName).toBe(
      correct.days[0].exercises[0].sourceName,
    );
    expect(result.program.days[0].exercises[0].exerciseId).toBe(
      correct.days[0].exercises[0].exerciseId,
    );
  });
  it("preserves explicitly imported RIR and enables RIR logging for that plan", async () => {
    const state = stateWithPlan();
    const raw = {
      name: "RIR Notes",
      days: state.program.days.map(serializeImportedDay),
    };
    raw.days
      .flatMap((day) => day.exercises)
      .forEach((exercise) => {
        exercise.targetRir = null;
      });
    raw.days[0].exercises[0].targetRir = 2;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) =>
        url === "/api/ai/status"
          ? { ok: true, json: async () => ({ available: true }) }
          : { ok: true, json: async () => ({ data: raw }) },
      ),
    );
    const result = await AIService.importTrainingPlan(
      state.profile,
      sourceTextFor(raw),
    );
    expect(result.program.days[0].exercises[0].targetRir).toBe(2);
    expect(result.profile.rirEnabled).toBe(true);
  });
  it("infers clean equipment semantics when a fresh user imports before onboarding", async () => {
    const state = stateWithPlan();
    const commercial = buildProgram({
      ...state.profile,
      environment: "Commercial gym",
      equipment: ["full gym"],
    });
    const raw = {
      name: "Existing Commercial Plan",
      days: commercial.days.map(serializeImportedDay),
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) =>
        url === "/api/ai/status"
          ? { ok: true, json: async () => ({ available: true }) }
          : { ok: true, json: async () => ({ data: raw }) },
      ),
    );
    const result = await AIService.importTrainingPlan(
      blankState().profile,
      sourceTextFor(raw),
    );
    expect(result.profile).toMatchObject({
      environment: "Commercial gym",
      equipment: ["full gym"],
      onboardingComplete: false,
    });
    expect(result.program.profileSnapshot.environment).toBe("Commercial gym");
  });
  it("does not silently replace an unavailable AI plan with a local template", async () => {
    const state = stateWithPlan();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ available: false }),
      })),
    );
    await expect(AIService.generateTrainingPlan(state.profile)).rejects.toThrow(
      /AI plan generation is not configured/i,
    );
  });
  it("calls the real server boundary when configured and sends actual Coach context", async () => {
    const state = stateWithPlan();
    const calls = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url, options) => {
        calls.push({ url, options });
        if (url === "/api/ai/status")
          return {
            ok: true,
            json: async () => ({
              available: true,
              provider: "openai",
              model: "test-model",
            }),
          };
        return {
          ok: true,
          json: async () => ({
            data: { text: "Contextual model answer.", action: null },
          }),
        };
      }),
    );
    const reply = await AIService.coach(state, "Explain my current program.");
    expect(reply).toMatchObject({
      source: "ai",
      text: "Contextual model answer.",
    });
    const body = JSON.parse(calls[1].options.body);
    expect(body.operation).toBe("coach");
    expect(body.payload.context.profile.goal).toBe("Build muscle");
    expect(body.payload.context.program.id).toBe(state.program.id);
    expect(body.payload.context.recentWorkouts).toEqual([]);
    expect(body.payload.context.progressionResults.length).toBeGreaterThan(0);
  });
  it("does not call the model or repeat confirmation after an applied action and a thank-you", async () => {
    const state = stateWithPlan();
    state.activeCoachConversationId = "thread-1";
    state.conversations = [
      {
        id: "message-1",
        conversationId: "thread-1",
        user: "Move the workout.",
        reply: {
          text: "Review this.",
          action: { type: "week-schedule-change", changes: [] },
        },
        actionResult: {
          status: "applied",
          appliedAt: Date.now(),
          scope: "current-week",
        },
      },
    ];
    vi.stubGlobal("fetch", vi.fn());
    const reply = await AIService.coach(
      state,
      "hvala ti, res si najboljsi ai coach",
    );
    expect(fetch).not.toHaveBeenCalled();
    expect(reply).toMatchObject({
      action: null,
      source: "deterministic",
      final: true,
    });
    expect(reply.text).toMatch(/potrjena/i);
  });
  it("validates model-proposed Adapt Today IDs against the actual workout", async () => {
    const state = stateWithTodayPlan();
    const allowed = state.program.days.find((day) => day.weekday === weekday())
      .exercises[0].exerciseId;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) =>
        url === "/api/ai/status"
          ? { ok: true, json: async () => ({ available: true }) }
          : {
              ok: true,
              json: async () => ({
                data: {
                  text: "Review this.",
                  action: {
                    type: "adapt-today",
                    exerciseIds: [allowed, "invented-id"],
                    minutes: 30,
                  },
                },
              }),
            },
      ),
    );
    const reply = await AIService.coach(state, "I only have 30 minutes.");
    expect(reply.source).toBe("ai");
    expect(reply.action.exerciseIds).toEqual([allowed]);
    expect(reply.action.workoutId).toBeNull();
  });
  it("accepts a safe temporary compound addition and bounded set reductions from Coach", async () => {
    const state = stateWithTodayPlan();
    state.profile.environment = "Commercial gym";
    state.profile.equipment = ["full gym"];
    state.program = buildProgram(state.profile);
    const day = state.program.days.find((item) => item.weekday === weekday());
    const existing = day.exercises[0];
    const addition = Object.values(exerciseCatalog).find(
      (item) =>
        item.kind === "compound" &&
        isExerciseAllowed(item, state.profile) &&
        !day.exercises.some((exercise) => exercise.exerciseId === item.id),
    );
    const setTargets = [
      { exerciseId: existing.exerciseId, sets: 1 },
      { exerciseId: addition.id, sets: 2 },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) =>
        url === "/api/ai/status"
          ? { ok: true, json: async () => ({ available: true }) }
          : {
              ok: true,
              json: async () => ({
                data: {
                  text: "I preserved coverage with one compound and fewer sets.",
                  action: {
                    type: "adapt-today",
                    exerciseIds: [existing.exerciseId, addition.id],
                    setTargets,
                    minutes: 25,
                  },
                },
              }),
            },
      ),
    );
    const reply = await AIService.coach(state, "Shorten today to 25 minutes.");
    expect(reply.action).toMatchObject({
      exerciseIds: [existing.exerciseId, addition.id],
      setTargets,
      addedExerciseIds: [addition.id],
    });
    applyCoachAction(state, reply.action);
    expect(
      adaptedTemplateForToday(state).exercises.map(
        (exercise) => exercise.exerciseId,
      ),
    ).toEqual([existing.exerciseId, addition.id]);
  });
  it("keeps the current and already-logged exercises in an active-workout AI adaptation", async () => {
    const state = stateWithPlan();
    state.activeWorkout = startWorkout(state, state.program.days[0]);
    state.activeWorkout.exerciseIndex = 1;
    state.activeWorkout.exercises[0].sets[0].completed = true;
    const requested = state.activeWorkout.exercises.at(-1).exerciseId;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) =>
        url === "/api/ai/status"
          ? { ok: true, json: async () => ({ available: true }) }
          : {
              ok: true,
              json: async () => ({
                data: {
                  text: "Shortened safely.",
                  action: {
                    type: "adapt-today",
                    exerciseIds: [requested],
                    minutes: 20,
                  },
                },
              }),
            },
      ),
    );
    const reply = await AIService.coach(state, "Shorten this workout.");
    expect(reply.action.exerciseIds).toEqual([
      state.activeWorkout.exercises[0].exerciseId,
      state.activeWorkout.exercises[1].exerciseId,
      requested,
    ]);
  });
  it("keeps the verified local Adapt Today action when the model omits its action", async () => {
    const state = stateWithTodayPlan();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) =>
        url === "/api/ai/status"
          ? { ok: true, json: async () => ({ available: true }) }
          : {
              ok: true,
              json: async () => ({
                data: { text: "I can shorten this session.", action: null },
              }),
            },
      ),
    );
    const reply = await AIService.coach(state, "Adapt today to 35 minutes.");
    expect(reply.source).toBe("ai");
    expect(reply.action).toMatchObject({
      type: "adapt-today",
      minutes: 35,
      label: "APPLY TO TODAY",
    });
    expect(reply.action.exerciseIds.length).toBeGreaterThan(0);
  });
  it("never presents a pending Adapt Today proposal as already applied", async () => {
    const state = stateWithTodayPlan();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) =>
        url === "/api/ai/status"
          ? { ok: true, json: async () => ({ available: true }) }
          : {
              ok: true,
              json: async () => ({
                data: {
                  text: "Done — I trimmed today's workout.",
                  action: null,
                },
              }),
            },
      ),
    );
    const reply = await AIService.coach(state, "Adapt today to 35 minutes.");
    expect(reply.action).toMatchObject({
      type: "adapt-today",
      label: "APPLY TO TODAY",
    });
    expect(reply.text).toMatch(/prepared/i);
    expect(reply.text).toMatch(/before applying/i);
    expect(reply.text).not.toMatch(/done|trimmed|applied/i);
  });
  it("validates a named future workout adaptation against that date instead of today", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 23, 12));
    const state = stateWithPlan();
    const saturday = state.program.days.find((day) => day.weekday === "Sat");
    const exerciseIds = saturday.exercises
      .slice(0, 3)
      .map((exercise) => exercise.exerciseId);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) =>
        url === "/api/ai/status"
          ? { ok: true, json: async () => ({ available: true }) }
          : {
              ok: true,
              json: async () => ({
                data: {
                  text: "I prepared Saturday’s shorter workout for review.",
                  action: {
                    type: "adapt-today",
                    targetDate: "2026-08-29",
                    programDayId: saturday.id,
                    exerciseIds,
                    minutes: 35,
                  },
                },
              }),
            },
      ),
    );
    const reply = await AIService.coach(state, "adapt saturday to 35 minutes");
    expect(reply.action).toMatchObject({
      type: "adapt-today",
      label: "APPLY TO SATURDAY",
      targetDate: "2026-08-29",
      programDayId: saturday.id,
      exerciseIds,
    });
  });
  it("imports varied weekly plans locally without rejecting user-authored volume or notes", async () => {
    const slovenianPlan = `🟢 PONEDELJEK – UPPER A
1. Incline Dumbbell Press (compound) – 3×6 30 kg (ful clean) 1 RIR
2. Low Row (compound) – 2×8 36.25 kg
3. Low-to-High Cable Fly – 2×9 35kg
4. Straight-Arm Pulldown – 2×8 110kg
5. Lateral Raises – 2×7 9 kg
6. Straight Bar Cable Pushdown – 2×7 100kg
7. Straight Bar Cable Curl – 2×6 85 kg

Pri compoundih: zadnja čista ponovitev → konec.

🟢 TOREK – NOGE A (MOČ)
Ogrevanje
• Sobno kolo – 5–8 min
• Heel slides ×10
Trening
1. Leg Press – 3×9 155 kg / Leg press masina - 3x8 173kg
2. Hack Squat – 2×6 90kg
3. Single-Leg Leg Extension – 2×12 20kg
4. Single-Leg Hamstring Curl – 2×6 35kg
5. Calf Raises na Leg Press mašini – 2×15 141 kg
6. Step-down – 2×8
7. Ravnotežje – 2×30 s

🟢 SREDA – FUNKCIONALNI DAN
Ogrevanje
• Kolo – 5–10 min
• leg swings
Stabilnost
1. BOSU Balance – 2×45 s
2. Y Balance Reach – 2 kroga
3. Monster Walk – 3 krogi
Pliometrija
4. Pogo Jumps – 3×20
5. Lateral Skater Hops – 3×12/stran
6. Forward Single-Leg Hops – 2×6/operirana noga
Moč
7. Single-Leg RDL – 3×10 16 kg
8. Step-down – 3×10
9. Single-Leg Sit-to-Stand – 2×8
10. Leg Curl Izometrični Hold – 2×30 s
Core
11. Hanging Leg Raises – 2×failure

🟢 ČETRTEK – UPPER B
1. Pull-ups – 3×6–10 @ 1 RIR
2. Incline Machine Press – 2×7 70 kg
3. Low Row – 2×8 35 kg
4. Incline Dumbbell Press – 1×8 26kg
5. Rear Delt Fly – 2×7/stran 35 kg
6. Lateral Raises – 2×8 10 kg
7. Overhead Extension – 2×10 70kg
8. Hammer Curl – 2×7 28 kg
Po upperju – AGILITY + ŽOGA
1. Shuttle Run 5×5 m
• 2 seriji

🟢 PETEK – NOGE B (FUNKCIJA)
Ogrevanje
• Sobno kolo
Trening
1. Leg Press – 3×10 140 kg
2. Single-Leg Leg Press – 2×10 50 kg
3. Step-up – 3×10 12kg
4. Romanian Deadlift – 2×12 34 kg
5. Step-down – 3×8
6. Adductor – 2×12 95 kg
7. Single-Leg Hamstring Curl – 2×7 30 kg
8. Calf Raises na Leg Pressu – 2×15 141 kg

🟢 SOBOTA – AKTIVNI RECOVERY
• 30–60 min sprehoda
🟢 NEDELJA – POČITEK
• Hoja po občutku.
Tvoj glavni princip za progresijo
zadnja čista ponovitev = konec serije`;
    const examples = [
      {
        source: slovenianPlan,
        days: ["Mon", "Tue", "Wed", "Thu", "Fri"],
        counts: [7, 7, 11, 8, 8],
      },
      {
        source:
          "Monday — Push\nBench Press 4x6-8\nCable Fly 3x12\nWednesday — Pull\nPull-up 4x6-10\nLow Row 3x8\nFriday — Legs\nBack Squat 5x5\nLeg Press 4x10",
        days: ["Mon", "Wed", "Fri"],
        counts: [2, 2, 2],
      },
      {
        source:
          "Mon Chest\nMachine Chest Press 6x8\nCable Fly 6x12\nTue Back\nLat Pulldown 6x10\nLow Row 6x8\nWed Legs\nHack Squat 6x8\nLeg Press 6x10\nThu Shoulders\nMachine Shoulder Press 6x8\nLateral Raise 6x12\nFri Arms\nCable Curl 6x10\nCable Triceps Pressdown 6x10",
        days: ["Mon", "Tue", "Wed", "Thu", "Fri"],
        counts: [2, 2, 2, 2, 2],
      },
      {
        source:
          "Ponedeljek: Moj trening\nCustom Belt March – 3 krogi\nWall-supported Hold – 2×30 s\nPetek: Drugi trening\nHanging Leg Raises – 2×failure\nMy Special Row – 3×9",
        days: ["Mon", "Fri"],
        counts: [2, 2],
      },
    ];
    const fetchSpy = vi.fn(() => {
      throw new Error("Structured weekly imports must not call the AI provider.");
    });
    vi.stubGlobal("fetch", fetchSpy);
    for (const example of examples) {
      const result = await AIService.importTrainingPlan(
        blankState().profile,
        example.source,
      );
      expect(result.program.days.map((day) => day.weekday)).toEqual(
        example.days,
      );
      expect(result.program.days.map((day) => day.exercises.length)).toEqual(
        example.counts,
      );
      expect(result.program.source).toBe("ai-import");
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it("validates a Coach-proposed optional workout only on an actual rest day", async () => {
    const state = stateWithPlan();
    const today = weekday();
    state.profile.availableDays = WEEKDAYS.filter((day) => day !== today).slice(
      0,
      2,
    );
    state.program = buildProgram(state.profile);
    const exerciseIds = state.program.days
      .flatMap((day) => day.exercises)
      .slice(0, 3)
      .map((exercise) => exercise.exerciseId);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) =>
        url === "/api/ai/status"
          ? { ok: true, json: async () => ({ available: true }) }
          : {
              ok: true,
              json: async () => ({
                data: {
                  text: "Pripravil sem lažji trening za danes.",
                  action: {
                    type: "add-today-workout",
                    name: "Lažji full body",
                    exerciseIds,
                    minutes: 30,
                    explanation: "Ne spremeni rednega plana.",
                  },
                },
              }),
            },
      ),
    );
    const reply = await AIService.coach(
      state,
      "danes imam rest, pa bi vseeno rad treniral",
    );
    expect(reply.action).toMatchObject({
      type: "add-today-workout",
      label: "APPLY TO TODAY",
      name: "Lažji full body",
      exerciseIds,
      minutes: 30,
    });
    state.program.days[0].weekday = today;
    const rejected = await AIService.coach(state, "danes bi treniral");
    expect(rejected.action?.type).not.toBe("add-today-workout");
  });
  it("validates and labels a visible optional workout for an explicitly requested future rest day", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 23, 12));
    const state = stateWithPlan();
    state.profile.availableDays = ["Mon", "Thu"];
    state.program = buildProgram(state.profile);
    const exerciseIds = state.program.days
      .flatMap((day) => day.exercises)
      .slice(0, 3)
      .map((exercise) => exercise.exerciseId);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) =>
        url === "/api/ai/status"
          ? { ok: true, json: async () => ({ available: true }) }
          : {
              ok: true,
              json: async () => ({
                data: {
                  text: "Pripravil sem lažji trening za torek.",
                  action: {
                    type: "add-today-workout",
                    name: "Lažji trening",
                    targetDate: "2026-08-25",
                    exerciseIds,
                    minutes: 30,
                    explanation:
                      "Lažji opcijski trening brez spremembe rednega plana.",
                  },
                },
              }),
            },
      ),
    );
    const reply = await AIService.coach(
      state,
      "dodaj neki light trening na torek ja",
    );
    expect(reply.action).toMatchObject({
      type: "add-today-workout",
      label: "APPLY TO TUESDAY",
      targetDate: "2026-08-25",
      exerciseIds,
    });
  });
  it("validates a permanent program exercise edit and sends authoritative today status", async () => {
    const state = stateWithPlan();
    const workout = state.program.days[0];
    const addition = Object.values(exerciseCatalog).find(
      (item) =>
        !workout.exercises.some(
          (exercise) => exercise.exerciseId === item.id,
        ) &&
        item.equipment.every((value) =>
          ["dumbbells", "bodyweight"].includes(value),
        ),
    );
    const calls = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url, options) => {
        calls.push({ url, options });
        if (url === "/api/ai/status")
          return { ok: true, json: async () => ({ available: true }) };
        return {
          ok: true,
          json: async () => ({
            data: {
              text: "I prepared the requested recurring change for review.",
              action: {
                type: "program-exercise-change",
                changes: [
                  {
                    workoutId: workout.id,
                    addExerciseIds: [addition.id],
                    removeExerciseIds: [],
                  },
                ],
                explanation:
                  "Add the requested emphasis without changing the other exercises.",
              },
            },
          }),
        };
      }),
    );
    const reply = await AIService.coach(
      state,
      "Add another exercise to this workout.",
    );
    expect(reply.action).toMatchObject({
      type: "program-exercise-change",
      label: "APPLY TO PROGRAM",
      baseProgramVersion: state.program.version,
    });
    expect(reply.action.changes[0].addExerciseIds).toEqual([addition.id]);
    const context = JSON.parse(calls[1].options.body).payload.context;
    expect(["rest-day", "planned-workout"]).toContain(context.todayStatus.type);
    expect(
      context.availableExercises.some(
        (item) => item.exerciseId === addition.id,
      ),
    ).toBe(true);
    expect(context.program.days[0].id).toBe(workout.id);
    expect(context.program.days[0].exercises[0].exerciseEntryId).toBe(
      workout.exercises[0].id,
    );
  });
  it("accepts an exact reviewed replacement for a restricted exercise in an imported plan", async () => {
    const state = stateWithPlan();
    state.profile.environment = "Commercial gym";
    state.profile.equipment = ["full gym"];
    state.program = buildProgram(state.profile);
    state.program.source = "imported";
    const workout = state.program.days[0];
    const source = workout.exercises[0];
    source.exerciseId = "leg-press";
    state.profile.avoid = "Avoid Leg Press";
    const replacement = compatibleReplacementCandidates(
      source,
      state.profile,
      workout.exercises.map((exercise) => exercise.exerciseId),
    )[0];
    expect(replacement).toBeTruthy();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) =>
        url === "/api/ai/status"
          ? { ok: true, json: async () => ({ available: true }) }
          : {
              ok: true,
              json: async () => ({
                data: {
                  text: "I prepared a similar option for review.",
                  action: {
                    type: "program-exercise-change",
                    changes: [{
                      workoutId: workout.id,
                      operations: [{
                        type: "replace",
                        exerciseEntryId: source.id,
                        fromExerciseId: source.exerciseId,
                        toExerciseId: replacement.id,
                      }],
                      addExerciseIds: [],
                      removeExerciseIds: [],
                    }],
                    explanation: "Replace the restricted exercise with a similar option.",
                  },
                },
              }),
            },
      ),
    );
    const reply = await AIService.coach(
      state,
      "Leg Press hurts. Prepare a change to my current plan.",
    );
    expect(reply.text).not.toMatch(/does not match the actual schedule/i);
    expect(reply.action).toMatchObject({
      type: "program-exercise-change",
      baseProgramVersion: state.program.version,
      changes: [{
        workoutId: workout.id,
        operations: [{
          type: "replace",
          exerciseEntryId: source.id,
          fromExerciseId: "leg-press",
          toExerciseId: replacement.id,
        }],
      }],
    });
  });
  it("filters provider replacement IDs through deterministic movement, equipment, and progression rules", async () => {
    const state = stateWithPlan();
    state.profile.environment = "Commercial gym";
    state.profile.equipment = ["full gym"];
    state.program = buildProgram(state.profile);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) =>
        url === "/api/ai/status"
          ? { ok: true, json: async () => ({ available: true }) }
          : {
              ok: true,
              json: async () => ({
                data: { exerciseIds: ["barbell-row", "push-up"], source: "ai" },
              }),
            },
      ),
    );
    const result = await AIService.suggestExerciseReplacements(
      state,
      "dumbbell-bench-press",
    );
    expect(result.source).toBe("ai");
    expect(result.exerciseIds).toEqual([]);
  });
  it("really aborts a slow AI import while preserving a retryable cancellation message", async () => {
    const state = stateWithPlan();
    let markStarted;
    const started = new Promise((resolve) => {
      markStarted = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url, options = {}) => {
        if (url === "/api/ai/status")
          return { ok: true, json: async () => ({ available: true }) };
        markStarted();
        return new Promise((_resolve, reject) => {
          options.signal.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          );
        });
      }),
    );
    const controller = new AbortController();
    const importing = AIService.importTrainingPlan(
      state.profile,
      "Training on Monday — Push\nBench Press 3x8",
      { signal: controller.signal },
    );
    await started;
    controller.abort();
    await expect(importing).rejects.toThrow(
      "Import cancelled. Your notes are still here.",
    );
  });
});
