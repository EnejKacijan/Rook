import {
  HOME_EQUIPMENT,
  PHYSIQUE_PRIORITY_OPTIONS,
  adaptedTemplateForToday,
  authoritativeImportedExerciseNames,
  authoritativeImportedWeights,
  cleanImportedExerciseLabel,
  coachContext,
  compatibleReplacementCandidates,
  deterministicCoach,
  estimateSessionMinutes,
  exerciseCatalog,
  isExerciseAllowed,
  isExerciseAutoGenerationBlocked,
  isExerciseGloballyBlocked,
  isoDay,
  matchImportedExerciseName,
  normalizeGeneratedProgram,
  normalizeWorkoutName,
  optionalStrengthForDate,
  plannedWorkoutForDate,
  splitImportedExerciseLabel,
  validateProgramExerciseChanges,
  validateWeekScheduleChanges,
  weekKey,
} from "./domain.js";
import { plannerCatalog, summarizeTrainingHistory } from "./planQuality.js";
import {
  compileProfileTrainingSafety,
  trainingSafetyBlocks,
} from "./trainingSafety.js";

export const AI_REQUEST_TIMEOUT_MS = 60000;
export const PLAN_GENERATION_TIMEOUT_MS = 240000;
export const IMPORT_PLAN_TIMEOUT_MS = 20000;
export const TRAINING_SAFETY_TIMEOUT_MS = 65000;
let activePlanGeneration = null;
const availableExerciseCatalog = Object.values(exerciseCatalog).filter(
  (item) => !isExerciseGloballyBlocked(item),
);
const planCatalog = plannerCatalog(
  availableExerciseCatalog.filter(
    (item) => !isExerciseAutoGenerationBlocked(item),
  ),
);
function pendingAdaptationText(action, responseLanguage) {
  const rawEstimate =
    Number(action?.estimatedMinutes) || Number(action?.minutes) || 0;
  const estimated =
    rawEstimate > 0 ? Math.max(5, Math.round(rawEstimate / 5) * 5) : 0;
  if (responseLanguage === "Slovenian")
    return estimated
      ? `Pripravil sem približno ${estimated}-minutno različico te vadbe. Preglej jo spodaj, preden uporabiš spremembe.`
      : "Pripravil sem krajšo različico te vadbe. Preglej jo spodaj, preden uporabiš spremembe.";
  return estimated
    ? `I've prepared an approximately ${estimated}-minute version of this workout. Review it below before applying changes.`
    : "I prepared a shorter version of this workout. Review it below before applying changes.";
}
async function request(
  operation,
  payload,
  { timeoutMs = AI_REQUEST_TIMEOUT_MS } = {},
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch("/api/ai", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ operation, payload }),
      signal: controller.signal,
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || "AI service unavailable.");
    return body.data;
  } catch (error) {
    if (error?.name === "AbortError")
      throw new Error("The request took too long. Please try again.");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function preparePhysiquePhoto(file) {
  if (!file || !String(file.type || "").startsWith("image/"))
    throw new Error("Choose an image file.");
  if (file.size > 15_000_000)
    throw new Error("Each photo must be smaller than 15 MB.");
  let image;
  let objectUrl;
  try {
    if (typeof createImageBitmap === "function")
      image = await createImageBitmap(file);
  } catch {
    image = null;
  }
  if (!image) {
    objectUrl = URL.createObjectURL(file);
    image = await new Promise((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () =>
        reject(new Error("That image format could not be read."));
      element.src = objectUrl;
    });
  }
  const scale = Math.min(1, 1280 / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  canvas
    .getContext("2d", { alpha: false })
    .drawImage(image, 0, 0, canvas.width, canvas.height);
  image.close?.();
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  return canvas.toDataURL("image/jpeg", 0.78);
}

function planGenerationKey(profile) {
  return JSON.stringify(profile);
}
const LANGUAGE_WORDS = {
  Slovenian: [
    "jaz",
    "sem",
    "si",
    "smo",
    "bi",
    "rad",
    "rada",
    "imam",
    "imaš",
    "mel",
    "vajo",
    "vaje",
    "trening",
    "treninga",
    "danes",
    "dans",
    "dan",
    "lahko",
    "prosim",
    "zakaj",
    "kako",
    "kaj",
    "ker",
    "tudi",
    "tud",
    "še",
    "zaj",
    "zdaj",
    "hočem",
    "nočem",
    "naj",
    "pa",
    "da",
    "počitek",
    "počitka",
    "načrtovan",
    "načrtovanega",
    "zato",
    "povej",
    "pripravim",
    "kratek",
    "načrt",
    "dodaj",
    "neki",
    "torek",
    "pokaži",
    "pokazi",
    "prikaži",
    "prikazi",
  ],
  English: [
    "the",
    "and",
    "you",
    "your",
    "i",
    "want",
    "would",
    "can",
    "please",
    "why",
    "how",
    "today",
    "workout",
    "exercise",
    "plan",
    "change",
    "with",
    "this",
    "that",
    "adapt",
    "minutes",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
  ],
  German: [
    "ich",
    "du",
    "mein",
    "bitte",
    "warum",
    "wie",
    "heute",
    "training",
    "übung",
    "plan",
    "ändern",
    "und",
    "mit",
    "nicht",
  ],
  Spanish: [
    "yo",
    "quiero",
    "puedes",
    "por",
    "favor",
    "porque",
    "cómo",
    "hoy",
    "entrenamiento",
    "ejercicio",
    "plan",
    "cambiar",
    "con",
    "para",
  ],
  French: [
    "je",
    "veux",
    "peux",
    "vous",
    "pourquoi",
    "comment",
    "aujourd",
    "entraînement",
    "exercice",
    "programme",
    "changer",
    "avec",
    "pour",
  ],
  Italian: [
    "io",
    "voglio",
    "puoi",
    "perché",
    "come",
    "oggi",
    "allenamento",
    "esercizio",
    "programma",
    "cambiare",
    "con",
    "per",
  ],
  Portuguese: [
    "eu",
    "quero",
    "pode",
    "por",
    "favor",
    "porque",
    "como",
    "hoje",
    "treino",
    "exercício",
    "plano",
    "mudar",
    "com",
  ],
  Croatian: [
    "ja",
    "želim",
    "možeš",
    "zašto",
    "kako",
    "danas",
    "trening",
    "vježbu",
    "plan",
    "promijeni",
    "nije",
    "imam",
  ],
};
function explicitLanguageRequest(text) {
  const targets = [
    ["Slovenian", /sloven(?:ian|e)|slovenšč|slovensk/i],
    ["English", /english|anglešč|angl(?:e|i)s/i],
    ["German", /german|deutsch|nemšč/i],
    ["Spanish", /spanish|español|španšč/i],
    ["French", /french|français|francois|francošč/i],
    ["Italian", /italian|italiano|italijanšč/i],
    ["Portuguese", /portuguese|português|portugalšč/i],
    ["Croatian", /croatian|hrvatsk|hrvašč/i],
  ];
  return targets.find(([, pattern]) => pattern.test(text))?.[0] || null;
}
export function detectCoachLanguage(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  const explicit = explicitLanguageRequest(text);
  if (explicit) return explicit;
  if (/\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}/u.test(text))
    return "the same Chinese or Japanese language used by the user";
  if (/\p{Script=Hangul}/u.test(text)) return "Korean";
  if (/\p{Script=Arabic}/u.test(text))
    return "the same Arabic-script language used by the user";
  if (/\p{Script=Cyrillic}/u.test(text))
    return "the same Cyrillic-script language used by the user";
  const tokens =
    text
      .toLocaleLowerCase()
      .normalize("NFKC")
      .match(/\p{L}+/gu) || [];
  let best = null;
  let bestScore = 0;
  for (const [language, words] of Object.entries(LANGUAGE_WORDS)) {
    const set = new Set(words);
    const score = tokens.reduce(
      (sum, token) => sum + (set.has(token) ? 1 : 0),
      0,
    );
    if (score > bestScore) {
      best = language;
      bestScore = score;
    }
  }
  return bestScore >= 2 ? best : null;
}
export function preferredCoachLanguage(message, conversations = []) {
  const current = detectCoachLanguage(message);
  if (current) return current;
  for (const entry of [...conversations].reverse().slice(0, 6)) {
    const detected = detectCoachLanguage(entry.user);
    if (detected) return detected;
  }
  return "Detect and use the language of the latest user message";
}
function replyMatchesLanguage(text, expected) {
  if (
    !expected ||
    expected.startsWith("Detect") ||
    expected.startsWith("the same")
  )
    return true;
  const actual = detectCoachLanguage(text);
  return !actual || actual === expected;
}
export function normalizeCoachText(value) {
  return String(value || "")
    .replace(/\bvesel\s*\/\s*a\b/giu, "vesel")
    .replace(/\bpripravljen\s*\/\s*a\b/giu, "pripravljen")
    .replace(/\bhvale\u017een\s*\/\s*na\b/giu, "hvale\u017een")
    .replace(/\bzadovoljen\s*\/\s*na\b/giu, "zadovoljen");
}
export function normalizeFollowUpQuestion(value) {
  const supplied =
    typeof value === "object" && value
      ? value
      : { question: value, hint: null };
  const raw = String(supplied.question || "").trim();
  let question = raw;
  let hint = supplied.hint ? String(supplied.hint).trim() : "";
  const detailAt = raw.search(/\s*\((?:examples?|e\.g\.)\s*:/i);
  if (detailAt > 0) {
    question = raw
      .slice(0, detailAt)
      .trim()
      .replace(/[,:;]+$/, "");
    hint ||= raw
      .slice(detailAt)
      .trim()
      .replace(/^\(/, "")
      .replace(/\)\??$/, "");
  }
  if (question && !/[?]$/.test(question)) question += "?";
  return {
    question: question.slice(0, 120),
    hint: hint ? hint.slice(0, 260) : null,
  };
}
function reportGeneration(entry, stage) {
  entry.stage = stage;
  for (const listener of entry.listeners) listener?.(stage);
}
function exposeGenerationStage(entry) {
  if (![...entry.listeners].some((listener) => typeof listener === "function"))
    return Promise.resolve();
  if (typeof requestAnimationFrame === "function")
    return new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
  return new Promise((resolve) => setTimeout(resolve, 0));
}

const NOTE_WEEKDAYS = {
  mon: "Mon",
  monday: "Mon",
  tue: "Tue",
  tues: "Tue",
  tuesday: "Tue",
  wed: "Wed",
  wednesday: "Wed",
  thu: "Thu",
  thur: "Thu",
  thurs: "Thu",
  thursday: "Thu",
  fri: "Fri",
  friday: "Fri",
  sat: "Sat",
  saturday: "Sat",
  sun: "Sun",
  sunday: "Sun",
  ponedeljek: "Mon",
  torek: "Tue",
  sreda: "Wed",
  cetrtek: "Thu",
  petek: "Fri",
  sobota: "Sat",
  nedelja: "Sun",
  ponedjeljak: "Mon",
  utorak: "Tue",
  srijeda: "Wed",
  cetvrtak: "Thu",
  subota: "Sat",
  nedjelja: "Sun",
};
const cleanNoteItem = (value) =>
  String(value || "")
    .trim()
    .replace(/^(?:[-*\u2022]\s+|\d+[.)]\s+)/u, "")
    .trim();
const foldNoteText = (value) =>
  String(value || "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
function parsedDayHeading(value) {
  const raw = String(value || "")
    .trim()
    .replace(/^[^\p{L}\p{N}]+/u, "");
  const match = raw.match(/^([\p{L}.]+)(.*)$/u);
  if (!match) return null;
  const key = foldNoteText(match[1]).replace(/\s/g, "");
  const weekday = NOTE_WEEKDAYS[key];
  if (!weekday) return null;
  let name = String(match[2] || "").trim();
  if (!name) return { weekday, name: "" };
  const separated = name.match(/^[\u00b7:|/\u2013\u2014-]+\s*(.+)$/u);
  if (separated) name = separated[1].trim();
  else {
    const parenthesized = name.match(/^\(\s*(.+?)\s*\)$/u);
    if (parenthesized) name = parenthesized[1].trim();
  }
  return { weekday, name };
}
function noteSectionMode(value) {
  const section = foldNoteText(cleanNoteItem(value));
  if (
    /^(?:ogrevanje|warm up|warmup|agility|delo z zogo|ball work|aktivni recovery|active recovery)(?:\s|$)/.test(
      section,
    ) ||
    /(?:^|\s)agility(?:\s|$)/.test(section)
  )
    return "skip";
  if (
    /^(?:trening|workout|strength|moc|stabilnost|stability|pliometrija|plyometrics|core)(?:\s|$)/.test(
      section,
    )
  )
    return "exercises";
  return null;
}
const NOTE_SET_WORD =
  "(?:sets?|serije?|seriji|serij|series?|rounds?|krogi?|kroga|krogov)";
function parseNotePrescription(value) {
  const source = String(value || "");
  const standard = source.match(
    new RegExp(
      `(\\d+)\\s*(?:${NOTE_SET_WORD}\\s*)?[x×]\\s*(\\d+)(?:\\s*[–—-]\\s*(\\d+))?\\s*(?:reps?|ponovitev|ponovitve)?`,
      "iu",
    ),
  );
  if (standard)
    return {
      index: standard.index,
      length: standard[0].length,
      count: Number(standard[1]),
      repMin: Number(standard[2]),
      repMax: Number(standard[3] || standard[2]),
      suffix: source.slice(standard.index + standard[0].length),
      failure: false,
    };
  const failure = source.match(/(\d+)\s*[x×]\s*(?:failure|do\s+odpovedi)/iu);
  if (failure)
    return {
      index: failure.index,
      length: failure[0].length,
      count: Number(failure[1]),
      repMin: 1,
      repMax: 1,
      suffix: source.slice(failure.index + failure[0].length),
      failure: true,
    };
  const rounds = source.match(
    new RegExp(
      `(\\d+)\\s*${NOTE_SET_WORD}(?:\\s*(?:x|×|po)\\s*(\\d+))?`,
      "iu",
    ),
  );
  if (rounds)
    return {
      index: rounds.index,
      length: rounds[0].length,
      count: Number(rounds[1]),
      repMin: Number(rounds[2] || 1),
      repMax: Number(rounds[2] || 1),
      suffix: source.slice(rounds.index + rounds[0].length),
      failure: false,
    };
  return null;
}
function prescribedExerciseNames(sourceText) {
  return String(sourceText || "")
    .split(/\r?\n/u)
    .map(cleanNoteItem)
    .map((line) => {
      const prescription = parseNotePrescription(line);
      if (!prescription || prescription.index <= 0) return null;
      const name = line
        .slice(0, prescription.index)
        .replace(/[\s\u00b7:|/\u2013\u2014-]+$/gu, "")
        .trim();
      return name && !parsedDayHeading(name)
        ? cleanImportedExerciseLabel(name)
        : null;
    })
    .filter(Boolean);
}
function parsedRestSeconds(value) {
  const match = String(value || "").match(
    /^rest\s*:\s*(\d+(?:[.,]\d+)?)\s*(?:[\u2013\u2014-]\s*(\d+(?:[.,]\d+)?))?\s*(min(?:ute)?s?|sec(?:ond)?s?)\b/i,
  );
  if (!match) return null;
  const first = Number(match[1].replace(",", "."));
  const second = match[2] ? Number(match[2].replace(",", ".")) : first;
  const amount = (first + second) / 2;
  return Math.round(amount * (/^min/i.test(match[3]) ? 60 : 1));
}
export function parseStructuredTrainingNotes(sourceText, profile = {}) {
  const lines = String(sourceText || "")
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return null;
  const goal = lines
    .find((line) => /^goal\s*:/i.test(line))
    ?.replace(/^goal\s*:\s*/i, "")
    .trim();
  const firstDayIndex = lines.findIndex((line) => parsedDayHeading(line));
  const explicitTitle = lines
    .slice(0, firstDayIndex < 0 ? 0 : firstDayIndex)
    .find(
      (line) =>
        !/^goal\s*:/i.test(line) &&
        !/^(?:schedule|frequency|days?\s+per\s+week)\s*:/i.test(line) &&
        !noteSectionMode(line) &&
        !/^(?:weekly workout plan|training plan|workout plan)$/i.test(
          foldNoteText(line),
        ),
    );
  const days = [];
  let current = null;
  let sectionMode = "exercises";
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const heading = parsedDayHeading(line);
    if (heading) {
      const weekday = heading.weekday;
      const headingName = heading.name;
      if (
        /^(?:rest|rest day|recovery|off|pocitek|aktivni recovery|active recovery|regeneracija)(?:\s|$)/.test(
          foldNoteText(headingName),
        )
      ) {
        current = null;
        continue;
      }
      current = days.find((day) => day.weekday === weekday);
      if (!current) {
        current = {
          weekday,
          location: "Commercial gym",
          name: normalizeWorkoutName(headingName || "Workout", weekday),
          estimatedMinutes: 60,
          exercises: [],
        };
        days.push(current);
      }
      sectionMode = "exercises";
      continue;
    }
    if (!current) continue;
    const nextSectionMode = noteSectionMode(line);
    if (nextSectionMode) {
      sectionMode = nextSectionMode;
      continue;
    }
    if (/^(?:progression|progresija|tvoj glavni princip)/i.test(foldNoteText(line))) {
      current = null;
      continue;
    }
    if (sectionMode === "skip") continue;
    const rest = parsedRestSeconds(line);
    if (rest !== null && current.exercises.length) {
      current.exercises.at(-1).restSeconds = rest;
      continue;
    }
    const cleanedLine = cleanNoteItem(line);
    let sourceName = cleanedLine;
    let prescription = parseNotePrescription(cleanNoteItem(lines[index + 1]));
    let consumedPrescriptionLine = Boolean(prescription);
    const inline = parseNotePrescription(cleanedLine);
    if (inline) {
      sourceName = cleanedLine
        .slice(0, inline.index)
        .replace(/[\s\u00b7:|/\u2013\u2014-]+$/gu, "")
        .trim();
      prescription = inline;
      consumedPrescriptionLine = false;
    }
    if (!prescription || !sourceName) continue;
    const count = prescription.count;
    const repMin = prescription.repMin;
    const repMax = prescription.repMax;
    const suffix = String(prescription.suffix || "").trim();
    const timed = /^(?:s|sec|secs|second|seconds|sek|sekund|sekunde)\b/i.test(
      suffix,
    );
    const detail = suffix
      .replace(
        timed
          ? /^(?:s|sec|secs|second|seconds|sek|sekund|sekunde)\b/iu
          : /$^/u,
        "",
      )
      .replace(/^[\s\u00b7,|;]+/u, "")
      .trim();
    const rirMatch = detail.match(/\b([0-4])\s*RIR\b/i);
    const inlineRest = parsedRestSeconds(detail);
    const note = detail
      .replace(/\b[0-4]\s*RIR\b/gi, "")
      .replace(/^[\s\u00b7,|;]+|[\s\u00b7,|;]+$/gu, "")
      .trim();
    if (count < 1 || count > 20 || repMin < 1 || repMax < repMin) continue;
    const importedLabel = splitImportedExerciseLabel(sourceName);
    const parsedNote = prescription.failure
      ? ["To failure", note].filter(Boolean).join(" · ")
      : note && inlineRest === null && !/^[@\d]/.test(note)
        ? note
        : null;
    current.exercises.push({
      exerciseId: null,
      sourceName: importedLabel.name,
      sets: count,
      repMin,
      repMax,
      targetRir: rirMatch ? Number(rirMatch[1]) : null,
      restSeconds: inlineRest,
      measure: timed ? "seconds" : null,
      failureTarget: prescription.failure,
      notes:
        [...new Set([importedLabel.note, parsedNote].filter(Boolean))].join(
          " · ",
        ) || null,
      weightKg: null,
      setWeightsKg: null,
    });
    if (consumedPrescriptionLine) index++;
  }
  const trainingDays = days.filter((day) => day.exercises.length);
  if (!trainingDays.length) return null;
  for (const day of trainingDays) {
    const requiresCommercialGym = day.exercises.some((exercise) => {
      const match = matchImportedExerciseName(exercise.sourceName);
      return exerciseCatalog[match.exerciseId]?.equipment?.some(
        (item) => item === "machines" || item === "cables",
      );
    });
    day.location =
      requiresCommercialGym || profile.environment !== "Home gym"
        ? "Commercial gym"
        : "Home";
  }
  return {
    name: explicitTitle
      ? String(explicitTitle).trim().slice(0, 80)
      : goal
        ? `Imported plan: ${goal}`
        : "Imported plan",
    days: trainingDays,
  };
}

function finalizeImportedPlan(profile, existingPlanText, data) {
  if (!Array.isArray(data.days) || data.days.length < 1 || data.days.length > 7)
    throw new Error(
      "The imported plan must contain between 1 and 7 calendar days.",
    );
  const verifiedData = structuredClone(data);
  verifiedData.days = verifiedData.days.filter(
    (day) => Array.isArray(day.exercises) && day.exercises.length > 0,
  );
  if (!verifiedData.days.length)
    throw new Error(
      "The imported plan does not contain a training day with exercises.",
    );
  const labelKey = (value) =>
    String(value || "")
      .normalize("NFKD")
      .replace(/\p{M}/gu, "")
      .toLocaleLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim()
      .replace(/\s+/g, " ");
  const planNameKey = labelKey(verifiedData.name);
  const dayNameKeys = verifiedData.days
    .map((day) => labelKey(day.name))
    .filter(Boolean);
  if (
    !planNameKey ||
    dayNameKeys.some(
      (dayName) =>
        dayName === planNameKey ||
        dayName.endsWith(` ${planNameKey}`) ||
        planNameKey.endsWith(` ${dayName}`),
    )
  )
    verifiedData.name = "Imported plan";
  const proposed = verifiedData.days
    .flatMap((day) => day.exercises)
    .map((exercise) => exercise.sourceName);
  const prescribedNames = prescribedExerciseNames(existingPlanText);
  const alignedSourceNames =
    prescribedNames.length === proposed.length ? prescribedNames : null;
  const verifiedAgainstSource = proposed.map((name, index) => {
    if (alignedSourceNames)
      return { name: alignedSourceNames[index], exact: true };
    try {
      return {
        name: authoritativeImportedExerciseNames(existingPlanText, [name])[0],
        exact: true,
      };
    } catch {
      return { name: cleanImportedExerciseLabel(name), exact: false };
    }
  });
  const proposedExercises = verifiedData.days.flatMap((day) => day.exercises);
  const alignedWeights = alignedSourceNames
    ? authoritativeImportedWeights(
        existingPlanText,
        proposedExercises.map((exercise, index) => ({
          ...exercise,
          sourceName: alignedSourceNames[index],
        })),
      )
    : null;
  let sourceIndex = 0;
  verifiedData.days.forEach((day) =>
    day.exercises.forEach((exercise) => {
      const sourceMatch = verifiedAgainstSource[sourceIndex];
      const importedLabel = splitImportedExerciseLabel(sourceMatch.name);
      exercise.sourceName = importedLabel.name;
      exercise.notes =
        [...new Set([importedLabel.note, exercise.notes].filter(Boolean))].join(
          " · ",
        ) || null;
      exercise.sourceVerified = sourceMatch.exact;
      const weights = alignedWeights
        ? alignedWeights[sourceIndex]
        : sourceMatch.exact
        ? authoritativeImportedWeights(existingPlanText, [
            proposedExercises[sourceIndex],
          ])[0]
        : { weightKg: null, setWeightsKg: null };
      exercise.weightKg = weights.weightKg;
      exercise.setWeightsKg = weights.setWeightsKg;
      sourceIndex++;
    }),
  );
  const schedule = {
    daysPerWeek: verifiedData.days.length,
    availableDays: [...new Set(verifiedData.days.map((day) => day.weekday))],
  };
  const normalizationProfile = {
    ...profile,
    ...schedule,
    environment: "Both",
    equipment: ["full gym", ...HOME_EQUIPMENT],
  };
  const program = normalizeGeneratedProgram(
    verifiedData,
    normalizationProfile,
    { preservePrescription: true },
  );
  program.source = "ai-import";
  const baseImportedProfile = inferImportedProfile(profile, program, schedule);
  const containsExplicitRir = program.days.some((day) =>
    day.exercises.some((exercise) => Number.isFinite(exercise.targetRir)),
  );
  const importedProfile = {
    ...baseImportedProfile,
    rirEnabled: Boolean(profile.rirEnabled || containsExplicitRir),
  };
  program.profileSnapshot = structuredClone(importedProfile);
  return { program, profile: importedProfile, source: "ai-import" };
}
function plannerBaseline(program) {
  if (!program?.days) return null;
  return {
    name: program.name,
    templateId: program.templateId || null,
    splitPreference: program.splitPreference || null,
    trainingStyle: program.trainingStyle || null,
    conditioning: program.conditioning || null,
    days: program.days.map((day) => ({
      weekday: day.weekday,
      location: day.location,
      name: day.name,
      estimatedMinutes: day.estimatedMinutes,
      exercises: day.exercises.map((exercise) => ({
        exerciseId: exercise.exerciseId,
        sets: exercise.sets.length,
        repMin: exercise.repMin,
        repMax: exercise.repMax,
        targetRir: exercise.targetRir,
        restSeconds: exercise.restSeconds,
      })),
    })),
  };
}
function planRequestProfile(profile) {
  const trainingSafety = compileProfileTrainingSafety(
    profile,
    availableExerciseCatalog,
  );
  if (trainingSafetyBlocks(trainingSafety.status))
    throw new Error(trainingSafety.message || "Training restrictions need review.");
  const {
    avoid: _rawRestrictionText,
    trainingSafetyAnalysis: _semanticEvidence,
    trainingSafetyConfirmedHash: _confirmationHash,
    trainingSafetyClearanceAttestation: _clearanceAttestation,
    trainingSafetyClearanceDeclinedHash: _clearanceDeclinedHash,
    trainingSafetyClearanceResponse: _clearanceResponse,
    trainingSafetyLimitsResponse: _limitsResponse,
    trainingSafetySupplementalLimits: _supplementalLimits,
    ...safeProfile
  } = profile;
  return {
    ...safeProfile,
    compiledTrainingSafety: {
      status: trainingSafety.status,
      constraints: trainingSafety.constraints,
      appliedLabels: trainingSafety.appliedLabels,
      clinicianScopeConfirmed: trainingSafety.clinicianScopeConfirmed,
    },
  };
}
async function runPlanGeneration(
  profile,
  entry,
  {
    expertReview = false,
    workouts = [],
    currentProgram = null,
    baselineProgram = null,
  } = {},
) {
  reportGeneration(entry, "preparing");
  const safeRequestProfile = planRequestProfile(profile);
  const status = await AIService.status();
  if (!status.available)
    throw new Error(
      "AI plan generation is not configured. Add a valid OpenAI API key and try again.",
    );
  let failure = null;
  const variationSeed = expertReview
    ? globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`
    : null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      reportGeneration(entry, attempt === 0 ? "building" : "refining");
      if (attempt > 0) await exposeGenerationStage(entry);
      const trainingHistorySummary = summarizeTrainingHistory(
        workouts,
        currentProgram,
        { catalog: Object.values(exerciseCatalog) },
      );
      const data = await request(
        "plan",
        {
          catalog: planCatalog,
          profile: safeRequestProfile,
          baselineProgram: plannerBaseline(baselineProgram),
          trainingHistorySummary,
          previousValidationError: failure?.message || null,
          expertReviewMode: expertReview,
          variationSeed,
        },
        { timeoutMs: PLAN_GENERATION_TIMEOUT_MS },
      );
      reportGeneration(entry, "checking");
      await exposeGenerationStage(entry);
      return {
        program: normalizeGeneratedProgram(data, profile, {
          expertReview,
          repairInterchangeableCompounds: !expertReview,
        }),
        source: "ai",
      };
    } catch (error) {
      failure = error;
      if (/took too long|not configured/i.test(error.message || ""))
        throw error;
    }
  }
  throw new Error(
    failure?.message || "AI could not create a valid personalized plan.",
  );
}

export const AIService = {
  async analyzeTrainingSafety(sourceText, questionContext = null) {
    return request(
      "training-safety",
      { sourceText: String(sourceText || ""), questionContext },
      { timeoutMs: TRAINING_SAFETY_TIMEOUT_MS },
    );
  },
  async expertLabStatus() {
    try {
      const response = await fetch("/api/expert-lab/status", {
        cache: "no-store",
      });
      if (!response.ok) return { enabled: false, feedbackCount: 0 };
      return await response.json();
    } catch {
      return { enabled: false, feedbackCount: 0 };
    }
  },
  async saveExpertFeedback(feedback) {
    const response = await fetch("/api/expert-feedback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(feedback),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok)
      throw new Error(body.error || "Expert feedback could not be saved.");
    return body.data;
  },
  async status() {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch("/api/ai/status", {
        signal: controller.signal,
        cache: "no-store",
        headers: { accept: "application/json" },
      });
      if (!response.ok) return { available: false, provider: null };
      return await response.json();
    } catch {
      return { available: false, provider: null };
    } finally {
      clearTimeout(timeout);
    }
  },
  async generateFollowUpQuestions(profile) {
    try {
      const data = await request("follow-ups", { profile });
      return {
        questions: Array.isArray(data.questions)
          ? data.questions
              .slice(0, 4)
              .map(normalizeFollowUpQuestion)
              .filter((item) => item.question)
          : [],
        source: "ai",
      };
    } catch {
      return { questions: [], source: "unavailable" };
    }
  },
  async generateTrainingPlan(
    profile,
    {
      onStage,
      workouts = [],
      currentProgram = null,
      baselineProgram = null,
    } = {},
  ) {
    const key = planGenerationKey(profile);
    if (activePlanGeneration) {
      if (activePlanGeneration.key !== key)
        throw new Error("Another program is already being built.");
      activePlanGeneration.listeners.add(onStage);
      onStage?.(activePlanGeneration.stage);
      try {
        return await activePlanGeneration.promise;
      } finally {
        activePlanGeneration?.listeners.delete(onStage);
      }
    }
    const entry = {
      key,
      listeners: new Set([onStage]),
      stage: "preparing",
      promise: null,
    };
    activePlanGeneration = entry;
    entry.promise = runPlanGeneration(profile, entry, {
      workouts,
      currentProgram,
      baselineProgram,
    });
    try {
      return await entry.promise;
    } finally {
      if (activePlanGeneration === entry) activePlanGeneration = null;
    }
  },
  async generateExpertCandidate(
    profile,
    { onStage, workouts = [], currentProgram = null } = {},
  ) {
    const entry = { listeners: new Set([onStage]), stage: "preparing" };
    return runPlanGeneration(profile, entry, {
      expertReview: true,
      workouts,
      currentProgram,
    });
  },
  async reviewPhysique(profile, photos) {
    const prepared = (photos || [])
      .filter(
        (photo) =>
          photo?.dataUrl && ["front", "back", "side"].includes(photo.angle),
      )
      .slice(0, 3);
    if (!prepared.length) throw new Error("Add at least one photo.");
    const status = await this.status();
    if (!status.available)
      throw new Error("AI physique review is not configured.");
    const data = await request(
      "physique-review",
      {
        profileContext: { goal: profile.goal, experience: profile.experience },
        photos: prepared,
      },
      { timeoutMs: 60000 },
    );
    if (
      !["success", "insufficient"].includes(data?.status) ||
      !Array.isArray(data?.suggestions)
    )
      throw new Error("The review result was invalid.");
    const suggestions = data.suggestions
      .slice(0, 4)
      .filter((item) => PHYSIQUE_PRIORITY_OPTIONS[item.priorityId])
      .map((item) => ({
        priorityId: item.priorityId,
        label: PHYSIQUE_PRIORITY_OPTIONS[item.priorityId].label,
        priorityLevel: item.priorityLevel === "high" ? "high" : "moderate",
        reason: String(item.reason || "").slice(0, 240),
      }));
    if (data.status === "success" && suggestions.length < 2)
      return {
        status: "insufficient",
        summary: "The photos did not provide enough useful context.",
        suggestions: [],
        retryMessage:
          "Try clearer photos from another angle, or choose priorities yourself.",
      };
    return {
      status: data.status,
      summary: String(data.summary || "").slice(0, 320),
      suggestions: data.status === "insufficient" ? [] : suggestions,
      retryMessage: data.retryMessage
        ? String(data.retryMessage).slice(0, 240)
        : null,
    };
  },
  async importTrainingPlan(profile, existingPlanText) {
    const locallyParsed = parseStructuredTrainingNotes(
      existingPlanText,
      profile,
    );
    if (locallyParsed) {
      try {
        return finalizeImportedPlan(profile, existingPlanText, locallyParsed);
      } catch {
        /* Fall through to AI for formats that only looked structured. */
      }
    }
    const status = await this.status();
    if (!status.available) throw new Error("AI provider is not configured.");
    const data = await request(
      "import-plan",
      {
        profile,
        existingPlanText,
        previousValidationError: null,
      },
      { timeoutMs: IMPORT_PLAN_TIMEOUT_MS },
    );
    return finalizeImportedPlan(profile, existingPlanText, data);
  },
  async coach(state, message) {
    const deterministic = deterministicCoach(state, message);
    const responseLanguage = preferredCoachLanguage(
      message,
      state.conversations,
    );
    if (deterministic.final) return deterministic;
    try {
      const status = await this.status();
      if (!status.available) return deterministic;
      const payload = {
        message,
        responseLanguage,
        context: coachContext(state),
        deterministicAnalysis:
          deterministic.source === "offline" ? null : deterministic,
      };
      let data = await request("coach", payload);
      if (!replyMatchesLanguage(data.text, responseLanguage))
        data = await request("coach", {
          ...payload,
          previousLanguageMismatch: `The previous reply was not in ${responseLanguage}. Rewrite the answer and any explanation entirely in ${responseLanguage}.`,
        });
      data.text = normalizeCoachText(data.text);
      const aiAction = validateAIAction(data.action, state);
      const fallbackAction = validateAIAction(deterministic.action, state);
      if (!aiAction && fallbackAction?.type === "add-today-workout")
        return { ...deterministic, action: fallbackAction };
      if (data.action && !aiAction && !fallbackAction)
        return {
          text:
            responseLanguage === "Slovenian"
              ? "Tega predloga ne morem varno prikazati ali uporabiti, ker se ne ujema z dejanskim urnikom. Ničesar nisem spremenil."
              : "I cannot safely show or apply that proposal because it does not match the actual schedule. Nothing was changed.",
          action: null,
          source: "validated-fallback",
        };
      const action = aiAction || fallbackAction;
      // A proposal is not a mutation. Keep the conversational copy aligned with
      // the explicit Apply control even if a provider phrases a draft as complete.
      const text =
        action?.type === "adapt-today"
          ? pendingAdaptationText(action, responseLanguage)
          : data.text;
      return { text, action, source: "ai" };
    } catch (error) {
      return {
        ...deterministic,
        text: `AI Coach request failed: ${error.message} ${deterministic.text}`,
        degraded: true,
        error: error.message,
      };
    }
  },
  async adaptToday(state, minutes) {
    return this.coach(
      state,
      `Adapt today's actual workout to ${minutes} minutes.`,
    );
  },
  async suggestExerciseReplacements(state, source, { excludeIds = [] } = {}) {
    const exercise =
      typeof source === "string"
        ? state.activeWorkout?.exercises.find(
            (item) => item.exerciseId === source,
          ) || { exerciseId: source }
        : source;
    const excluded = new Set(excludeIds);
    const compatible = compatibleReplacementCandidates(
      exercise,
      state.profile,
    ).filter((item) => !excluded.has(item.id));
    try {
      const status = await this.status();
      if (!status.available)
        return {
          exerciseIds: compatible.map((item) => item.id),
          source: "deterministic",
        };
      const data = await request("replacements", {
        exerciseId: exercise?.exerciseId || null,
        exercise: {
          name: exercise
            ? exercise.originalImportedName ||
              exercise.importedName ||
              exercise.importedExercise?.name ||
              exerciseCatalog[exercise.exerciseId]?.name
            : null,
          pattern:
            exerciseCatalog[exercise?.exerciseId]?.pattern ||
            exercise?.importedExercise?.pattern ||
            null,
          muscles:
            exerciseCatalog[exercise?.exerciseId]?.muscles ||
            exercise?.importedExercise?.muscles ||
            null,
        },
        excludeIds: [...excluded],
        context: coachContext(state),
        catalog: availableExerciseCatalog,
      });
      const allowed = new Set(compatible.map((item) => item.id));
      return {
        exerciseIds: [...new Set(data.exerciseIds || [])].filter((id) =>
          allowed.has(id),
        ),
        source: "ai",
      };
    } catch {
      return { exerciseIds: [], source: "unavailable" };
    }
  },
};

function inferImportedProfile(profile, program, schedule) {
  const locations = new Set(program.days.map((day) => day.location));
  const homeDays = program.days.filter((day) => day.location === "Home");
  const homeRequirements = new Set(
    homeDays.flatMap((day) =>
      day.exercises.flatMap(
        (exercise) => exerciseCatalog[exercise.exerciseId]?.equipment || [],
      ),
    ),
  );
  const homeEquipment = [];
  if (["barbell", "rack", "bench"].some((item) => homeRequirements.has(item)))
    homeEquipment.push("barbell/rack/bench");
  if (homeRequirements.has("dumbbells")) homeEquipment.push("dumbbells");
  if (homeRequirements.has("pull-up bar")) homeEquipment.push("pull-up bar");
  if (homeRequirements.has("resistance bands"))
    homeEquipment.push("resistance bands");
  if (homeRequirements.has("bodyweight")) homeEquipment.push("bodyweight only");
  if (locations.has("Home") && !locations.has("Commercial gym"))
    return {
      ...profile,
      ...schedule,
      environment: "Home gym",
      equipment: homeEquipment.length ? homeEquipment : ["bodyweight only"],
    };
  if (locations.has("Home"))
    return {
      ...profile,
      ...schedule,
      environment: "Both",
      equipment: ["full gym", ...homeEquipment],
    };
  return {
    ...profile,
    ...schedule,
    environment: "Commercial gym",
    equipment: ["full gym"],
  };
}

function validateAIAction(action, state) {
  if (!action || typeof action !== "object") return null;
  if (action.type === "add-today-workout") {
    const today = isoDay();
    const targetDate = /^\d{4}-\d{2}-\d{2}$/.test(
      String(action.targetDate || ""),
    )
      ? action.targetDate
      : today;
    const target = new Date(`${targetDate}T12:00:00`);
    const daysAhead = Math.round(
      (target - new Date(`${today}T12:00:00`)) / 86400000,
    );
    if (
      !Number.isFinite(target.getTime()) ||
      daysAhead < 0 ||
      daysAhead > 28 ||
      (daysAhead === 0 && state.activeWorkout) ||
      plannedWorkoutForDate(state, target) ||
      optionalStrengthForDate(state, target)
    )
      return null;
    const ids = [...new Set(action.exerciseIds || [])]
      .filter(
        (id) =>
          exerciseCatalog[id] &&
          isExerciseAllowed(exerciseCatalog[id], state.profile),
      )
      .slice(0, 6);
    const minutes = Number(action.minutes || 35);
    if (
      ids.length < 2 ||
      !Number.isFinite(minutes) ||
      minutes < 10 ||
      minutes > 120
    )
      return null;
    const dayLabel =
      daysAhead === 0
        ? "TODAY"
        : new Intl.DateTimeFormat("en", { weekday: "long" })
            .format(target)
            .toUpperCase();
    return {
      type: "add-today-workout",
      label: `APPLY TO ${dayLabel}`,
      name:
        String(action.name || "Optional workout")
          .trim()
          .slice(0, 60) || "Optional workout",
      exerciseIds: ids,
      minutes,
      explanation: String(
        action.explanation ||
          "A recovery-aware optional session. Your recurring plan stays unchanged.",
      ).slice(0, 320),
      targetDate,
    };
  }
  if (action.type === "adapt-today") {
    const today = isoDay();
    const targetDate = /^\d{4}-\d{2}-\d{2}$/.test(
      String(action.targetDate || ""),
    )
      ? action.targetDate
      : today;
    const target = new Date(`${targetDate}T12:00:00`);
    const daysAhead = Math.round(
      (target - new Date(`${today}T12:00:00`)) / 86400000,
    );
    const active = targetDate === today ? state.activeWorkout : null;
    const source = active || adaptedTemplateForToday(state, target);
    const actual = new Set(
      (source?.exercises || []).map((item) => item.exerciseId),
    );
    const sourceById = new Map(
      (source?.exercises || []).map((item) => [item.exerciseId, item]),
    );
    const rawIds = [...new Set(action.exerciseIds || [])];
    const requestedAdditions = rawIds.filter((id) => !actual.has(id));
    if (requestedAdditions.length > 2) return null;
    const allowedAdditions = requestedAdditions.filter(
      (id) =>
        exerciseCatalog[id] &&
        isExerciseAllowed(exerciseCatalog[id], state.profile),
    );
    const locked = active
      ? source.exercises
          .filter(
            (exercise, index) =>
              index === active.exerciseIndex ||
              exercise.sets.some((set) => set.completed),
          )
          .map((exercise) => exercise.exerciseId)
      : [];
    const requested = new Set([...rawIds, ...locked]);
    const ids = [
      ...source.exercises
        .filter((exercise) => requested.has(exercise.exerciseId))
        .map((exercise) => exercise.exerciseId),
      ...allowedAdditions,
    ];
    const requestedSets = new Map(
      (action.setTargets || []).map((item) => [
        item.exerciseId,
        Number(item.sets),
      ]),
    );
    const setTargets = ids.map((id) => {
      const existing = sourceById.get(id);
      const maximum = existing ? existing.sets.length : 3;
      const completed =
        existing?.sets.filter((set) => set.completed).length || 0;
      return {
        exerciseId: id,
        sets: Math.max(
          1,
          completed,
          Math.min(
            maximum,
            Number.isFinite(requestedSets.get(id))
              ? requestedSets.get(id)
              : maximum,
          ),
        ),
      };
    });
    const minutes = Number(action.minutes || state.profile.sessionMinutes);
    if (
      !Number.isFinite(target.getTime()) ||
      daysAhead < 0 ||
      daysAhead > 28 ||
      !source ||
      (action.programDayId &&
        action.programDayId !== (source.programDayId || source.id)) ||
      !ids.length ||
      !Number.isFinite(minutes) ||
      minutes < 10 ||
      minutes > 240
    )
      return null;
    const fittedTargets = setTargets.map((item) => ({ ...item }));
    const materialized = () =>
      ids.map((id) => {
        const existing = sourceById.get(id);
        const targetSets =
          fittedTargets.find((item) => item.exerciseId === id)?.sets || 1;
        return existing
          ? { ...existing, sets: existing.sets.slice(0, targetSets) }
          : {
              exerciseId: id,
              restSeconds: exerciseCatalog[id]?.restSeconds || 90,
              sets: Array.from({ length: targetSets }, () => ({})),
            };
      });
    while (fittedTargets.length) {
      const currentEstimate = estimateSessionMinutes(materialized());
      const currentDistance = Math.abs(currentEstimate - minutes);
      const candidates = fittedTargets
        .map((item) => {
          const existing = sourceById.get(item.exerciseId);
          const completed =
            existing?.sets.filter((set) => set.completed).length || 0;
          if (item.sets <= Math.max(1, completed)) return null;
          item.sets -= 1;
          const estimate = estimateSessionMinutes(materialized());
          item.sets += 1;
          return { item, estimate, distance: Math.abs(estimate - minutes) };
        })
        .filter(
          (candidate) => candidate && candidate.distance < currentDistance,
        )
        .sort((a, b) => a.distance - b.distance || b.item.sets - a.item.sets);
      if (!candidates.length) break;
      candidates[0].item.sets -= 1;
    }
    const estimatedMinutes = estimateSessionMinutes(materialized());
    const dayLabel =
      targetDate === today
        ? "TODAY"
        : new Intl.DateTimeFormat("en", { weekday: "long" })
            .format(target)
            .toUpperCase();
    return {
      type: "adapt-today",
      label: `APPLY TO ${dayLabel}`,
      exerciseIds: ids,
      setTargets: fittedTargets,
      addedExerciseIds: ids.filter((id) => !actual.has(id)),
      skippedExerciseIds: [...actual].filter((id) => !ids.includes(id)),
      minutes,
      requestedMinutes: minutes,
      estimatedMinutes,
      workoutId: active?.id || null,
      baseWorkoutUpdatedAt: active?.updatedAt || null,
      programDayId: source.programDayId || source.id,
      targetDate,
    };
  }
  if (action.type === "week-schedule-change") {
    const checked = validateWeekScheduleChanges(state, action.changes);
    if (!checked.valid) return null;
    return {
      type: "week-schedule-change",
      label: "APPLY TO THIS WEEK",
      changes: checked.changes,
      explanation: String(
        action.explanation || "Review the proposed changes to this week.",
      ),
      weekKey: weekKey(),
    };
  }
  if (action.type === "program-exercise-change") {
    const checked = validateProgramExerciseChanges(state, action.changes);
    if (!checked.valid) return null;
    return {
      type: "program-exercise-change",
      label: "APPLY TO PROGRAM",
      changes: checked.changes,
      explanation: String(
        action.explanation || "Review the proposed recurring program changes.",
      ),
    };
  }
  return null;
}
