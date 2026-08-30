import { exerciseCatalog } from "../src/domain.js";
import { compileTrainingSafety } from "../src/trainingSafety.js";

const baseUrl = process.env.ROOK_BASE_URL || "http://127.0.0.1:5173";
const cases = [
  ["recent surgery", "I had knee surgery 6 weeks ago.", "needs_limits_confirmation"],
  ["current pain", "My shoulder still hurts when I train.", "needs_trigger_confirmation"],
  ["pain trigger", "My knee hurts when I squat.", "needs_clearance_confirmation"],
  ["pain trigger exercise", "Leg Press makes my knee hurt.", "needs_clearance_confirmation"],
  ["recovering injury", "I sprained my ankle recently and I'm still recovering.", "needs_limits_confirmation"],
  ["exercise avoidance", "Don't put Leg Press in my workouts.", "constraints_active"],
  ["movement avoidance", "Avoid squats and lunges.", "constraints_active"],
  ["effort limit", "I can do leg press but don't take it to failure.", "constraints_active"],
  ["load cap", "My physio said leg press must stay under 40 kg.", "unsupported_limit"],
  ["range limit", "Don't bend my knee past 90 degrees during squats.", "unsupported_limit"],
  ["volume limit", "I'm only allowed two working sets for chest per workout.", "unsupported_limit"],
  ["body-region scope", "My surgeon cleared upper-body strength training only.", "needs_confirmation"],
  ["vague clinician wording", "My physio said just take it easy on my knee.", "needs_clarification"],
  ["contradiction", "I have to avoid squats, but squats are also okay now.", "needs_clarification"],
  ["resolved history", "I tore my ACL years ago, fully recovered, no pain now.", "normal"],
  ["not cleared", "I had surgery and my doctor has not cleared me to lift yet.", "blocked_not_cleared"],
  ["no specific limits", "I had knee surgery 6 months ago. No specific training limits were given.", "needs_clearance_confirmation"],
  ["unknown limits", "I had surgery but I don't know if they gave me any restrictions.", "blocked_limits_unknown"],
  ["Slovenian informal", "Pred 2 mescema sm mel operacijo kolena, dr je reku brez počepov pa leg press ne do odpovedi.", "needs_clearance_confirmation"],
  ["combined constraints", "Shoulder surgery 3 months ago. Surgeon said upper body only, avoid overhead pressing, and don't take Machine Chest Press to failure.", "needs_confirmation"],
];

async function analyze([name, sourceText, expectedStatus]) {
  const response = await fetch(`${baseUrl}/api/ai`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ operation: "training-safety", payload: { sourceText } }),
    signal: AbortSignal.timeout(75_000),
  });
  const body = await response.json();
  if (!response.ok)
    return {
      name,
      sourceText,
      expectedStatus,
      status: "request_error",
      error: body.error || String(response.status),
    };
  const safety = compileTrainingSafety(sourceText, Object.values(exerciseCatalog), {
    semanticAnalysis: body.data,
  });
  return {
    name,
    sourceText,
    expectedStatus,
    status: safety.status,
    findings: body.data.findings.map((item) => ({
      kind: item.kind,
      targetText: item.targetText,
      minimumRir: item.minimumRir,
      allowedBodyRegion: item.allowedBodyRegion,
    })),
    unresolved: body.data.unresolved.map((item) => item.reason),
    constraints: safety.constraints,
  };
}

const results = [];
for (let index = 0; index < cases.length; index += 3) {
  results.push(...(await Promise.all(cases.slice(index, index + 3).map(analyze))));
}
for (const result of results) console.log(JSON.stringify(result));
const failures = results.filter((result) => result.status !== result.expectedStatus);
if (failures.length) {
  console.error(`MATRIX FAILED: ${failures.map((item) => `${item.name}=${item.status}`).join(", ")}`);
  process.exitCode = 1;
} else console.log(`MATRIX PASSED: ${results.length}/${results.length}`);
