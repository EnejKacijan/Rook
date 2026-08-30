import { describe, expect, it } from "vitest";
import {
  compileTrainingSafety,
  compileProfileTrainingSafety,
  createTrainingClearanceAttestation,
  createTrainingClearanceResponse,
  createTrainingLimitsResponse,
  exerciseAllowedByTrainingSafety,
  trainingSafetyBlocks,
  verifyTrainingSafetyAnalysis,
} from "./trainingSafety.js";
import {
  blankState,
  buildProgram,
  exerciseCatalog,
  startWorkout,
  validateProgram,
} from "./domain.js";

const catalog = Object.values(exerciseCatalog);
const compile = (text, confirmedScopeHash = null) =>
  compileTrainingSafety(text, catalog, { confirmedScopeHash });

function profile(avoid = "") {
  const state = blankState();
  return {
    ...state.profile,
    goal: "Build muscle",
    experience: "Intermediate",
    daysPerWeek: 3,
    availableDays: ["Mon", "Wed", "Fri"],
    sessionMinutes: 60,
    environment: "Commercial gym",
    equipment: ["full gym"],
    priorities: ["Balanced"],
    avoid,
  };
}

describe("training restriction compiler", () => {
  const semantic = (text, kind, extras = {}) => ({
    schemaVersion: 1,
    findings: [
      {
        kind,
        confidence: 0.97,
        evidence: [{ start: 0, end: text.length, quote: text }],
        targetText: null,
        allowedBodyRegion: null,
        ...extras,
      },
    ],
    unresolved: [],
  });

  it.each([
    "I rolled my ankle yesterday and it is still swollen",
    "My shoulder keeps hurting when I train",
    "Še vedno okrevam po natrgani zadnji loži",
    "Rehabilitating a fractured wrist",
    "My back injury has not healed",
  ])("asks about symptom triggers without assuming clinician-given limits: %s", (text) => {
    const safety = compileTrainingSafety(text, catalog, {
      semanticAnalysis: semantic(text, "current_unresolved_pain"),
    });
    expect(safety.status).toBe("needs_trigger_confirmation");
  });

  it("moves pain-only users from no known triggers to the clearance check", () => {
    const text = "My knee hurts";
    const pending = compileTrainingSafety(text, catalog, {
      semanticAnalysis: semantic(text, "current_unresolved_pain"),
    });
    const checked = compileTrainingSafety(text, catalog, {
      semanticAnalysis: semantic(text, "current_unresolved_pain"),
      limitsResponse: createTrainingLimitsResponse(
        pending,
        "no_specific_triggers_reported",
      ),
    });
    expect(checked.status).toBe("needs_clearance_confirmation");
    expect(checked.triggerResponseStatus).toBe("no_specific_triggers_reported");
  });

  it("pauses pain-only users who are unsure what triggers the symptom", () => {
    const text = "My knee hurts";
    const pending = compileTrainingSafety(text, catalog, {
      semanticAnalysis: semantic(text, "current_unresolved_pain"),
    });
    const paused = compileTrainingSafety(text, catalog, {
      semanticAnalysis: semantic(text, "current_unresolved_pain"),
      limitsResponse: createTrainingLimitsResponse(pending, "trigger_unknown"),
    });
    expect(paused.status).toBe("blocked_trigger_unknown");
  });

  it("turns only an explicitly named symptom trigger into an exclusion", () => {
    const text = "My knee hurts when I squat";
    const pain = semantic(text, "current_unresolved_pain").findings[0];
    const triggerQuote = "squat";
    const safety = compileTrainingSafety(text, catalog, {
      semanticAnalysis: {
        schemaVersion: 2,
        findings: [
          { ...pain, minimumRir: null },
          {
            kind: "symptom_trigger",
            confidence: 0.99,
            evidence: [{ start: text.indexOf(triggerQuote), end: text.indexOf(triggerQuote) + triggerQuote.length, quote: triggerQuote }],
            targetText: triggerQuote,
            minimumRir: null,
            allowedBodyRegion: null,
          },
        ],
        unresolved: [],
      },
    });
    expect(safety.status).toBe("needs_clearance_confirmation");
    expect(safety.constraints.avoidPatterns).toEqual(["squat"]);
    expect(safety.constraints.avoidExerciseIds).toEqual([]);
  });

  it("moves from the limits question to clearance when no specific limits were reported", () => {
    const text = "I had knee surgery 6 months ago";
    const pending = compileTrainingSafety(text, catalog, {
      semanticAnalysis: semantic(text, "recent_procedure"),
    });
    expect(pending.status).toBe("needs_limits_confirmation");
    const checked = compileTrainingSafety(text, catalog, {
      semanticAnalysis: semantic(text, "recent_procedure"),
      limitsResponse: createTrainingLimitsResponse(
        pending,
        "no_specific_limits_reported",
      ),
    });
    expect(checked.status).toBe("needs_clearance_confirmation");
    expect(checked.limitsResponseStatus).toBe("no_specific_limits_reported");
  });

  it("pauses without looping when the user does not know their training limits", () => {
    const text = "I had knee surgery 6 months ago";
    const pending = compileTrainingSafety(text, catalog, {
      semanticAnalysis: semantic(text, "recent_procedure"),
    });
    const paused = compileTrainingSafety(text, catalog, {
      semanticAnalysis: semantic(text, "recent_procedure"),
      limitsResponse: createTrainingLimitsResponse(pending, "unknown"),
    });
    expect(paused.status).toBe("blocked_limits_unknown");
    expect(paused.message).toMatch(/won't assume/i);
  });

  it("merges a separately analyzed natural-language limit without replacing the original note", () => {
    const original = "I had knee surgery 6 months ago";
    const supplemental = "Avoid squats and don't take leg press to failure";
    const baseAnalysis = {
      ...semantic(original, "recent_procedure"),
      schemaVersion: 2,
      findings: semantic(original, "recent_procedure").findings.map((finding) => ({
        ...finding,
        minimumRir: null,
      })),
    };
    const evidenceFor = (quote) => ({
      start: supplemental.indexOf(quote),
      end: supplemental.indexOf(quote) + quote.length,
      quote,
    });
    const supplementalAnalysis = {
      schemaVersion: 2,
      findings: [
        {
          kind: "explicit_avoidance",
          confidence: 0.98,
          evidence: [evidenceFor("Avoid squats")],
          targetText: "squats",
          minimumRir: null,
          allowedBodyRegion: null,
        },
        {
          kind: "exercise_effort_limit",
          confidence: 0.98,
          evidence: [evidenceFor("don't take leg press to failure")],
          targetText: "leg press",
          minimumRir: 1,
          allowedBodyRegion: null,
        },
      ],
      unresolved: [],
    };
    const safety = compileProfileTrainingSafety(
      {
        ...profile(original),
        trainingSafetyAnalysis: { sourceText: original, analysis: baseAnalysis },
        trainingSafetySupplementalLimits: {
          text: supplemental,
          analysis: supplementalAnalysis,
        },
      },
      catalog,
    );
    expect(safety.status).toBe("needs_clearance_confirmation");
    expect(safety.constraints.avoidPatterns).toContain("squat");
    expect(safety.constraints.minRirByExerciseId["leg-press"]).toBe(1);
    expect(safety.sourceText).toBe(`${original}\n${supplemental}`);
  });

  it("lets a concrete follow-up resolve an ambiguous original limit", () => {
    const procedure = "I had knee surgery 6 months ago";
    const original = `${procedure}. Don't stress my knee`;
    const vague = "Don't stress my knee";
    const supplemental = "Avoid squats";
    const baseAnalysis = {
      schemaVersion: 2,
      findings: [
        {
          kind: "recent_procedure",
          confidence: 0.98,
          evidence: [{ start: 0, end: procedure.length, quote: procedure }],
          targetText: null,
          minimumRir: null,
          allowedBodyRegion: null,
        },
      ],
      unresolved: [
        {
          evidence: {
            start: original.indexOf(vague),
            end: original.indexOf(vague) + vague.length,
            quote: vague,
          },
          reason: "ambiguous_clinician_limit",
        },
      ],
    };
    const supplementalAnalysis = {
      schemaVersion: 2,
      findings: [
        {
          kind: "explicit_avoidance",
          confidence: 0.98,
          evidence: [{ start: 0, end: supplemental.length, quote: supplemental }],
          targetText: "squats",
          minimumRir: null,
          allowedBodyRegion: null,
        },
      ],
      unresolved: [],
    };
    const safety = compileProfileTrainingSafety(
      {
        ...profile(original),
        trainingSafetyAnalysis: { sourceText: original, analysis: baseAnalysis },
        trainingSafetySupplementalLimits: {
          text: supplemental,
          analysis: supplementalAnalysis,
          resolvesUnresolved: true,
        },
      },
      catalog,
    );
    expect(safety.status).toBe("needs_clearance_confirmation");
    expect(safety.constraints.avoidPatterns).toContain("squat");
    expect(safety.semanticAnalysis.unresolved).toEqual([]);
  });

  it("turns the reported surgery example into a clearance check with enforceable limits", () => {
    const text = "I had knee surgery 1 month ago: I cant do leg press til failure and i have to avoid squats";
    const evidence = [{ start: 0, end: text.length, quote: text }];
    const analysis = {
      schemaVersion: 2,
      findings: [
        { kind: "recent_procedure", confidence: 0.98, evidence, targetText: null, minimumRir: null, allowedBodyRegion: null },
        { kind: "exercise_effort_limit", confidence: 0.98, evidence, targetText: "leg press", minimumRir: 1, allowedBodyRegion: null },
        { kind: "explicit_avoidance", confidence: 0.98, evidence, targetText: "squats", minimumRir: null, allowedBodyRegion: null },
      ],
      unresolved: [],
    };
    const pending = compileTrainingSafety(text, catalog, { semanticAnalysis: analysis });
    expect(pending.status).toBe("needs_clearance_confirmation");
    expect(pending.constraints.avoidPatterns).toContain("squat");
    expect(pending.constraints.minRirByExerciseId["leg-press"]).toBe(1);
    const attestation = createTrainingClearanceAttestation(pending);
    const confirmed = compileTrainingSafety(text, catalog, {
      semanticAnalysis: analysis,
      clearanceAttestation: attestation,
    });
    expect(confirmed.status).toBe("constraints_active");
    expect(exerciseAllowedByTrainingSafety(exerciseCatalog["back-squat"], confirmed)).toBe(false);
    expect(
      compileTrainingSafety(text, catalog, {
        semanticAnalysis: analysis,
        clearanceDeclinedHash: pending.constraintHash,
      }).status,
    ).toBe("blocked_unresolved");
    for (const [response, status] of [
      ["clinician_not_cleared", "blocked_not_cleared"],
      ["not_asked", "blocked_clearance_not_asked"],
      ["unknown", "blocked_clearance_unknown"],
    ])
      expect(
        compileTrainingSafety(text, catalog, {
          semanticAnalysis: analysis,
          clearanceResponse: createTrainingClearanceResponse(pending, response),
        }).status,
      ).toBe(status);
    expect(
      compileTrainingSafety(`${text}.`, catalog, {
        semanticAnalysis: {
          ...analysis,
          findings: analysis.findings.map((finding) => ({
            ...finding,
            evidence: [{ start: 0, end: text.length, quote: text }],
          })),
        },
        clearanceAttestation: attestation,
      }).status,
    ).toBe("needs_clearance_confirmation");
  });

  it("does not offer clearance confirmation when the user explicitly says they are not cleared", () => {
    const text = "I have not been cleared after knee surgery";
    const analysis = semantic(text, "not_medically_cleared");
    expect(
      compileTrainingSafety(text, catalog, { semanticAnalysis: analysis }).status,
    ).toBe("blocked_not_cleared");
  });

  it("keeps explicit missing clearance terminal even if another extracted target is unusable", () => {
    const text = "I had surgery and my doctor has not cleared me to lift yet";
    const evidence = [{ start: 0, end: text.length, quote: text }];
    const analysis = {
      schemaVersion: 2,
      findings: [
        { kind: "recent_procedure", confidence: 0.98, evidence, targetText: null, minimumRir: null, allowedBodyRegion: null },
        { kind: "not_medically_cleared", confidence: 0.98, evidence, targetText: null, minimumRir: null, allowedBodyRegion: null },
        { kind: "explicit_avoidance", confidence: 0.98, evidence, targetText: "lift", minimumRir: null, allowedBodyRegion: null },
      ],
      unresolved: [],
    };
    expect(compileTrainingSafety(text, catalog, { semanticAnalysis: analysis }).status).toBe(
      "blocked_not_cleared",
    );
  });

  it.each([
    "My physio said leg press must stay under 40 kg",
    "Don't bend my knee past 90 degrees during squats",
    "I'm only allowed two working sets for chest per workout",
  ])("blocks a clear limit the app cannot enforce end-to-end: %s", (text) => {
    const analysis = {
      schemaVersion: 2,
      findings: [
        {
          kind: "unsupported_explicit_limit",
          confidence: 0.98,
          evidence: [{ start: 0, end: text.length, quote: text }],
          targetText: null,
          minimumRir: null,
          allowedBodyRegion: null,
        },
      ],
      unresolved: [],
    };
    const safety = compileTrainingSafety(text, catalog, { semanticAnalysis: analysis });
    expect(safety.status).toBe("unsupported_limit");
    expect(safety.unsupportedLimits).toContain(text);
    expect(trainingSafetyBlocks(safety.status)).toBe(true);
  });

  it("does not mistake a numeric range-of-motion limit for full exercise avoidance", () => {
    const text = "Don't bend my knee past 90 degrees during squats";
    const analysis = {
      schemaVersion: 2,
      findings: [
        {
          kind: "explicit_avoidance",
          confidence: 0.98,
          evidence: [{ start: 0, end: text.length, quote: text }],
          targetText: "bend my knee past 90 degrees during squats",
          minimumRir: null,
          allowedBodyRegion: null,
        },
      ],
      unresolved: [],
    };
    expect(compileTrainingSafety(text, catalog, { semanticAnalysis: analysis }).status).toBe(
      "unsupported_limit",
    );
  });

  it("resolves a common informal Slovenian squat restriction", () => {
    const text = "Dr je reku brez počepov";
    const analysis = {
      schemaVersion: 2,
      findings: [
        {
          kind: "explicit_avoidance",
          confidence: 0.98,
          evidence: [{ start: 0, end: text.length, quote: text }],
          targetText: "brez počepov",
          minimumRir: null,
          allowedBodyRegion: null,
        },
      ],
      unresolved: [],
    };
    const safety = compileTrainingSafety(text, catalog, { semanticAnalysis: analysis });
    expect(safety.status).toBe("constraints_active");
    expect(safety.constraints.avoidPatterns).toContain("squat");
  });

  it("keeps vague take-it-easy wording in clarification even if AI labels it unsupported", () => {
    const text = "My physio said just take it easy on my knee";
    const analysis = {
      schemaVersion: 2,
      findings: [
        {
          kind: "unsupported_explicit_limit",
          confidence: 0.98,
          evidence: [{ start: 0, end: text.length, quote: text }],
          targetText: null,
          minimumRir: null,
          allowedBodyRegion: null,
        },
      ],
      unresolved: [],
    };
    expect(compileTrainingSafety(text, catalog, { semanticAnalysis: analysis }).status).toBe(
      "needs_clarification",
    );
  });

  it("understands an explicit report that no specific limits were given", () => {
    const text = "I had knee surgery 6 months ago. No specific training limits were given.";
    const evidence = [{ start: 0, end: text.length, quote: text }];
    const analysis = {
      schemaVersion: 2,
      findings: [
        { kind: "recent_procedure", confidence: 0.98, evidence, targetText: null, minimumRir: null, allowedBodyRegion: null },
        { kind: "no_specific_limits_reported", confidence: 0.98, evidence, targetText: null, minimumRir: null, allowedBodyRegion: null },
      ],
      unresolved: [],
    };
    const safety = compileTrainingSafety(text, catalog, { semanticAnalysis: analysis });
    expect(safety.status).toBe("needs_clearance_confirmation");
    expect(safety.limitsResponseStatus).toBe("no_specific_limits_reported");
  });

  it("pauses when the original note explicitly says the limits are unknown", () => {
    const text = "I had surgery but I don't know if they gave me any restrictions.";
    const evidence = [{ start: 0, end: text.length, quote: text }];
    const analysis = {
      schemaVersion: 2,
      findings: [
        { kind: "recent_procedure", confidence: 0.98, evidence, targetText: null, minimumRir: null, allowedBodyRegion: null },
        { kind: "limits_unknown", confidence: 0.98, evidence, targetText: null, minimumRir: null, allowedBodyRegion: null },
      ],
      unresolved: [],
    };
    expect(compileTrainingSafety(text, catalog, { semanticAnalysis: analysis }).status).toBe(
      "blocked_limits_unknown",
    );
  });

  it("keeps an ambiguous post-surgery limit in clarification even if clearance could be confirmed", () => {
    const text = "Surgery last month, don't stress my knee";
    const analysis = {
      ...semantic(text, "recent_procedure"),
      unresolved: [
        {
          evidence: { start: 20, end: text.length, quote: "don't stress my knee" },
          reason: "ambiguous_clinician_limit",
        },
      ],
    };
    expect(
      compileTrainingSafety(text, catalog, { semanticAnalysis: analysis }).status,
    ).toBe("needs_clarification");
  });

  it("rejects fabricated or offset-mismatched model evidence", () => {
    const text = "My ankle hurts";
    const analysis = semantic(text, "current_unresolved_pain");
    analysis.findings[0].evidence[0].quote = "My knee hurts";
    expect(() => verifyTrainingSafetyAnalysis(text, analysis)).toThrow(/evidence/i);
  });

  it("treats low-confidence and ambiguous safety language as clarification, never normal", () => {
    const text = "My old shoulder might sometimes be an issue";
    const analysis = semantic(text, "current_unresolved_pain");
    analysis.findings[0].confidence = 0.61;
    expect(
      compileTrainingSafety(text, catalog, { semanticAnalysis: analysis }).status,
    ).toBe("needs_clarification");
  });

  it("keeps semantic extraction separate from deterministic exercise resolution", () => {
    const text = "Please never program squats";
    const analysis = semantic(text, "explicit_avoidance", {
      targetText: "squats",
    });
    const safety = compileTrainingSafety(text, catalog, { semanticAnalysis: analysis });
    expect(safety.status).toBe("constraints_active");
    expect(safety.constraints.avoidPatterns).toContain("squat");
  });

  it.each([
    "I had knee surgery recently",
    "Recent knee surgery",
    "3 weeks post-op on my knee",
    "I had knee surgery 6 weeks ago",
    "I had an operation 2 months ago",
    "My knee still hurts",
    "Recovering from an operation",
  ])("fails closed for unresolved medical wording: %s", (text) => {
    const safety = compile(text);
    expect(safety.status).toBe("blocked_unresolved");
    expect(trainingSafetyBlocks(safety.status)).toBe(true);
  });

  it("hard-blocks deterministic explicit not-cleared wording", () => {
    expect(compile("I'm not cleared to lift yet").status).toBe("blocked_not_cleared");
  });

  it.each([
    "Old knee injury, no pain now",
    "Shoulder injury years ago, pain-free now",
    "I have no knee pain",
  ])("does not invent a current restriction for resolved or negated wording: %s", (text) => {
    const safety = compile(text);
    expect(safety.status).toBe("normal");
    expect(safety.signals.some((signal) => signal.kind === "current_pain")).toBe(false);
  });

  it("maps only explicit enforceable avoidance", () => {
    const safety = compile("Avoid squats and overhead pressing");
    expect(safety.status).toBe("constraints_active");
    expect(exerciseAllowedByTrainingSafety(exerciseCatalog["back-squat"], safety)).toBe(false);
    expect(exerciseAllowedByTrainingSafety(exerciseCatalog["barbell-overhead-press"], safety)).toBe(false);
    expect(exerciseAllowedByTrainingSafety(exerciseCatalog["romanian-deadlift"], safety)).toBe(true);
  });

  it("requires clarification instead of guessing a body-part-wide rule", () => {
    expect(compile("Avoid things that stress my knee").status).toBe("needs_clarification");
    expect(compile("Physio said keep it easy").status).toBe("needs_clarification");
  });

  it("requires semantic confirmation before applying a clinician scope", () => {
    const parsed = compile("Post-op knee; surgeon cleared upper-body strength training only");
    expect(parsed.status).toBe("needs_confirmation");
    const confirmed = compile(parsed.sourceText, parsed.constraintHash);
    expect(confirmed.status).toBe("constraints_active");
    expect(exerciseAllowedByTrainingSafety(exerciseCatalog["machine-chest-press"], confirmed)).toBe(true);
    expect(exerciseAllowedByTrainingSafety(exerciseCatalog["back-squat"], confirmed)).toBe(false);
  });
});

describe("training safety enforcement", () => {
  it("rejects a plan that takes an explicitly limited exercise too close to failure", () => {
    const text = "Knee surgery last month; do not take leg press to failure";
    const procedureQuote = "Knee surgery last month";
    const effortQuote = "do not take leg press to failure";
    const analysis = {
      schemaVersion: 2,
      findings: [
        {
          kind: "recent_procedure",
          confidence: 0.98,
          evidence: [{ start: 0, end: procedureQuote.length, quote: procedureQuote }],
          targetText: null,
          minimumRir: null,
          allowedBodyRegion: null,
        },
        {
          kind: "exercise_effort_limit",
          confidence: 0.98,
          evidence: [{ start: text.indexOf(effortQuote), end: text.length, quote: effortQuote }],
          targetText: "leg press",
          minimumRir: 1,
          allowedBodyRegion: null,
        },
      ],
      unresolved: [],
    };
    const pending = compileTrainingSafety(text, catalog, { semanticAnalysis: analysis });
    const restrictedProfile = {
      ...profile(text),
      trainingSafetyAnalysis: { sourceText: text, analysis },
      trainingSafetyClearanceAttestation:
        createTrainingClearanceAttestation(pending),
    };
    const program = buildProgram(restrictedProfile);
    program.days[0].exercises[0].exerciseId = "leg-press";
    program.days[0].exercises[0].targetRir = 0;
    expect(validateProgram(program, restrictedProfile).errors.join(" ")).toMatch(
      /Leg Press must stay at least 1 reps in reserve/i,
    );
    const state = blankState();
    state.profile = restrictedProfile;
    state.program = program;
    expect(() => startWorkout(state, program.days[0])).toThrow(
      /Leg Press must stay at least 1 reps in reserve/i,
    );
  });

  it("blocks deterministic generation for unresolved surgery", () => {
    expect(() => buildProgram(profile("I had knee surgery recently"))).toThrow(
      /recent injury|training scope/i,
    );
  });

  it("keeps explicitly avoided squat-pattern exercises out of a generated plan", () => {
    const program = buildProgram(profile("Avoid squats"));
    const patterns = program.days.flatMap((day) =>
      day.exercises.map((exercise) => exerciseCatalog[exercise.exerciseId]?.pattern),
    );
    expect(patterns).not.toContain("squat");
  });

  it("builds only inside a confirmed clinician-approved body-region scope", () => {
    const scoped = profile("Post-op knee; surgeon cleared upper-body strength training only");
    scoped.daysPerWeek = 4;
    scoped.availableDays = ["Mon", "Tue", "Thu", "Sat"];
    const parsed = compile(scoped.avoid);
    scoped.trainingSafetyConfirmedHash = parsed.constraintHash;
    const program = buildProgram(scoped);
    expect(program.days).toHaveLength(4);
    expect(program.days.every((day) => day.exercises.length >= 2)).toBe(true);
    const safety = compile(scoped.avoid, scoped.trainingSafetyConfirmedHash);
    expect(
      program.days.every((day) =>
        day.exercises.every((exercise) =>
          exerciseAllowedByTrainingSafety(exerciseCatalog[exercise.exerciseId], safety),
        ),
      ),
    ).toBe(true);
  });

  it("rechecks restrictions at workout start and blocks a stale plan", () => {
    const safeProfile = profile();
    const program = buildProgram(safeProfile);
    const state = blankState();
    state.profile = { ...safeProfile, avoid: "I had surgery recently" };
    state.program = program;
    expect(() => startWorkout(state, program.days[0])).toThrow(/training scope|recent injury/i);
  });
});
