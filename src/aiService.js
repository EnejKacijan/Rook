import {
  HOME_EQUIPMENT,
  PHYSIQUE_PRIORITY_OPTIONS,
  adaptedTemplateForToday,
  authoritativeImportedExerciseNames,
  authoritativeImportedWeights,
  cleanImportedExerciseLabel,
  coachContext,
  completedWorkoutCanResume,
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
  workoutPlanDate,
} from "./domain.js";
import { plannerCatalog, summarizeTrainingHistory } from "./planQuality.js";
import {
  compileProfileTrainingSafety,
  trainingSafetyBlocks,
} from "./trainingSafety.js";

export const AI_REQUEST_TIMEOUT_MS = 60000;
export const PLAN_GENERATION_TIMEOUT_MS = 240000;
export const IMPORT_PLAN_TIMEOUT_MS = 95000;
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
  { timeoutMs = AI_REQUEST_TIMEOUT_MS, signal = null } = {},
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const abortFromCaller = () => controller.abort();
  signal?.addEventListener("abort", abortFromCaller, { once: true });
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
    if (error?.name === "AbortError" && signal?.aborted)
      throw new Error("Import cancelled. Your notes are still here.");
    if (error?.name === "AbortError")
      throw new Error("The request took too long. Please try again.");
    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abortFromCaller);
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
  montag: "Mon",
  dienstag: "Tue",
  mittwoch: "Wed",
  donnerstag: "Thu",
  freitag: "Fri",
  samstag: "Sat",
  sonntag: "Sun",
  lunes: "Mon",
  martes: "Tue",
  miercoles: "Wed",
  jueves: "Thu",
  viernes: "Fri",
  sabado: "Sat",
  domingo: "Sun",
};
const NOTE_WEEKDAY_ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const cleanNoteItem = (value) =>
  String(value || "")
    .trim()
    .replace(/^(?:[-*\u2022]\s*)?\[[ xX✓✔]?\]\s*/u, "")
    .replace(/^[☐☑✅✓✔◦▪︎▸►→]+\s*/u, "")
    .replace(/^(?:[-*\u2022]\s+|\d+[.)]\s+|[A-Z]\d+[.):]?\s+)/u, "")
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
function weekdayForDateHeading(value) {
  const cleaned = cleanNoteItem(value);
  let match = cleaned.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/u);
  let year;
  let month;
  let day;
  if (match) [, year, month, day] = match;
  else {
    match = cleaned.match(/\b(\d{1,2})[.](\d{1,2})[.](20\d{2})\b/u);
    if (!match) return null;
    [, day, month, year] = match;
  }
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (
    date.getUTCFullYear() !== Number(year) ||
    date.getUTCMonth() !== Number(month) - 1 ||
    date.getUTCDate() !== Number(day)
  )
    return null;
  return NOTE_WEEKDAY_ORDER[(date.getUTCDay() + 6) % 7];
}
const GENERIC_WORKOUT_HEADING =
  /^(?:(?:day|dan|tag|dia)\s*[#.]?\s*\d+[a-z]?(?:\s+.+)?|(?:workout|training|trening|session|sesija|rutina|entrenamiento)\s+(?:[a-z]|[1-7]|push|pull|legs|upper|lower|full\s+body)(?:\s+.+)?|push(?:\s+[ab12])?|pull(?:\s+[ab12])?|legs(?:\s+[ab12])?|upper(?:\s+(?:body|a|b|1|2))?|lower(?:\s+(?:body|a|b|1|2))?|full\s*body(?:\s+[ab12])?|chest(?:\s+(?:and|back))*|back|arms?|shoulders?|noge(?:\s+[ab12])?|zgornji(?:\s+del)?|spodnji(?:\s+del)?|celo\s+telo|oberkorper|unterkorper|ganzkorper|empuje|tiron|piernas)$/i;
const COMMON_SPLIT_HEADING =
  /^(?:chest|back|shoulders?|arms?|glutes?|hamstrings?|quads?|prsa|hrbet|rame|roke|zadnjica)(?:\s+(?:and|in|und|y)\s+(?:chest|back|shoulders?|arms?|biceps|triceps|glutes?|hamstrings?|quads?|prsa|hrbet|rame|roke|zadnjica))?(?:\s+[ab12])?$/i;
function genericWorkoutHeading(value) {
  const cleaned = cleanNoteItem(value).replace(/^[^\p{L}\p{N}]+/u, "").trim();
  if (
    !cleaned ||
    parseNotePrescription(cleaned) ||
    !GENERIC_WORKOUT_HEADING.test(foldNoteText(cleaned)) &&
    !COMMON_SPLIT_HEADING.test(foldNoteText(cleaned))
  )
    return null;
  return cleaned.replace(/[:|/\u2013\u2014-]+$/u, "").trim();
}
function contextualWorkoutHeading(value, nextValue) {
  const cleaned = cleanNoteItem(value).replace(/[:|/\u2013\u2014-]+$/u, "").trim();
  const nextPrescription = parseNotePrescription(cleanNoteItem(nextValue));
  const folded = ` ${foldNoteText(cleaned)} `;
  const containsUnparsedWeekday = Object.keys(NOTE_WEEKDAYS).some(
    (token) => token.length >= 3 && folded.includes(` ${token} `),
  );
  if (
    !cleaned ||
    cleaned.length > 50 ||
    parsedDayHeading(cleaned) ||
    containsUnparsedWeekday ||
    noteSectionMode(cleaned) ||
    !nextPrescription ||
    nextPrescription.index <= 0
  )
    return null;
  const letters = cleaned.replace(/[^\p{L}]/gu, "");
  const uppercase = letters.length >= 3 && letters === letters.toLocaleUpperCase();
  const coded = /(?:\s|[-–—])(?:[AB]|[1-7])$/u.test(cleaned);
  return uppercase || coded ? cleaned : null;
}
function sequentialImportWeekdays(profile, used = []) {
  const preferred = Array.isArray(profile?.availableDays)
    ? profile.availableDays.filter((day) => NOTE_WEEKDAY_ORDER.includes(day))
    : [];
  return [...new Set([...preferred, ...NOTE_WEEKDAY_ORDER])].filter(
    (day) => !used.includes(day),
  );
}
function noteSectionMode(value) {
  const section = foldNoteText(cleanNoteItem(value));
  if (
    /^(?:ogrevanje|warm up|warmup|general warm up|mobility|mobilnost|activation|aktivacija|prep|preparation|primer|dynamic warm up|ramp up|ramp sets|warm up sets|agility|delo z zogo|ball work|aktivni recovery|active recovery)(?:\s|$)/.test(
      section,
    ) ||
    /(?:^|\s)agility(?:\s|$)/.test(section)
  )
    return "warmup";
  if (
    /^(?:trening|workout|strength|moc|stabilnost|stability|pliometrija|plyometrics|core)(?:\s|$)/.test(
      section,
    )
  )
    return "exercises";
  return null;
}
function parseWarmupNoteItem(value) {
  const raw = cleanNoteItem(value)
    .replace(
      /^(?:ogrevanje|warm[ -]?up|general warm[ -]?up|mobility|mobilnost|activation|aktivacija|prep(?:aration)?|primer|dynamic warm[ -]?up|ramp[ -]?up|ramp sets|warm[ -]?up sets|agility|delo z zogo|ball work|aktivni recovery|active recovery)\s*[:\-–—]?\s*/iu,
      "",
    )
    .trim();
  if (!raw) return null;
  const duration = raw.match(/(?:^|\s)(\d+)\s*(sec(?:ond)?s?|s|min(?:ute)?s?)\b/iu);
  const prescription = parseNotePrescription(raw);
  let label = raw;
  let sets = 1;
  let reps = null;
  let seconds = null;
  let minutes = 1;
  if (prescription) {
    sets = prescription.count;
    reps = prescription.repMin;
    label = raw
      .slice(0, prescription.index)
      .replace(/[\s:|,\-–—]+$/gu, "")
      .trim();
  }
  if (duration) {
    const amount = Number(duration[1]);
    const isMinutes = /^min/iu.test(duration[2]);
    seconds = isMinutes ? amount * 60 : amount;
    minutes = Math.max(1, Math.ceil(seconds / 60));
    reps = null;
    label = raw.replace(duration[0], " ").replace(/^[\s:|,\-–—]+|[\s:|,\-–—]+$/gu, "").trim();
  }
  if (!label) label = "Warm-up movement";
  return {
    label: label.slice(0, 80),
    sets: Math.max(1, Math.min(10, sets)),
    reps,
    seconds,
    minutes,
    provenance: "imported",
  };
}
const NOTE_SET_WORD =
  "(?:sets?|serije?|seriji|serij|series?|rounds?|krogi?|kroga|krogov|satz|satze|sätze|runden?|series?|rondas?)";
const NOTE_REP_WORD =
  "(?:reps?|repov|ponovitev|ponovitve|ponavljanj|wdh|repeticiones?)";
function parseNotePrescription(value) {
  const source = String(value || "");
  const clock = source.match(
    /(\d+)\s*[x×*]\s*(?:(\d{1,2}):)?(\d{1,2}):(\d{2})/u,
  );
  if (clock) {
    const seconds = Number(clock[2] || 0) * 3600 + Number(clock[3]) * 60 + Number(clock[4]);
    return {
      index: clock.index,
      length: clock[0].length,
      count: Number(clock[1]),
      repMin: seconds,
      repMax: seconds,
      suffix: `seconds ${source.slice(clock.index + clock[0].length)}`,
      failure: false,
    };
  }
  const timeFirst = source.match(
    /(\d+)\s*(s|sec(?:ond)?s?|sek(?:und[ei]?)?)\s*[x×*]\s*(\d+)/iu,
  );
  if (timeFirst)
    return {
      index: timeFirst.index,
      length: timeFirst[0].length,
      count: Number(timeFirst[3]),
      repMin: Number(timeFirst[1]),
      repMax: Number(timeFirst[1]),
      suffix: `seconds ${source.slice(timeFirst.index + timeFirst[0].length)}`,
      failure: false,
    };
  const perSetLoads = source.match(
    new RegExp(
      `(\\d+(?:[.,]\\d+)?(?:\\s*\\/\\s*\\d+(?:[.,]\\d+)?){1,19})\\s*(kg|kgs|lb|lbs)?\\s*(?:[x×*]\\s*)?(\\d+)\\s*${NOTE_REP_WORD}\\b`,
      "iu",
    ),
  );
  if (perSetLoads) {
    const loads = perSetLoads[1]
      .split("/")
      .map((entry) => Number(entry.trim().replace(",", ".")));
    return {
      index: perSetLoads.index,
      length: perSetLoads[0].length,
      count: loads.length,
      repMin: Number(perSetLoads[3]),
      repMax: Number(perSetLoads[3]),
      suffix: source.slice(perSetLoads.index + perSetLoads[0].length),
      failure: false,
      setLoads: loads,
      loadUnit: perSetLoads[2]?.toLowerCase() || null,
    };
  }
  const weightFirst = source.match(
    /(\d+(?:[.,]\d+)?)\s*(kg|kgs|lb|lbs)\s*[x×*]\s*(\d+)(?:\s*[x×*]\s*(\d+))?/iu,
  );
  if (weightFirst)
    return {
      index: weightFirst.index,
      length: weightFirst[0].length,
      count: Number(weightFirst[4] || 1),
      repMin: Number(weightFirst[3]),
      repMax: Number(weightFirst[3]),
      suffix: source.slice(weightFirst.index + weightFirst[0].length),
      failure: false,
    };
  const keyed = source.match(
    /(?:sets?|serije?|satze|sätze|series?)\s*[:=]?\s*(\d+)\s*[,|; ]+\s*(?:reps?|ponovitve?|wdh|repeticiones?)\s*[:=]?\s*(\d+)(?:\s*[–—-]\s*(\d+))?/iu,
  );
  if (keyed)
    return {
      index: keyed.index,
      length: keyed[0].length,
      count: Number(keyed[1]),
      repMin: Number(keyed[2]),
      repMax: Number(keyed[3] || keyed[2]),
      suffix: source.slice(keyed.index + keyed[0].length),
      failure: false,
    };
  const setsOf = source.match(
    new RegExp(
      `(\\d+)\\s*${NOTE_SET_WORD}\\s*(?:of|po|de|a|à|mit|x|×)?\\s*(\\d+)(?:\\s*[–—-]\\s*(\\d+))?`,
      "iu",
    ),
  );
  if (setsOf)
    return {
      index: setsOf.index,
      length: setsOf[0].length,
      count: Number(setsOf[1]),
      repMin: Number(setsOf[2]),
      repMax: Number(setsOf[3] || setsOf[2]),
      suffix: source.slice(setsOf.index + setsOf[0].length),
      failure: false,
    };
  const standard = source.match(
    new RegExp(
      `(\\d+)\\s*(?:${NOTE_SET_WORD}\\s*)?[x×*]\\s*(\\d+)(?:\\s*[–—-]\\s*(\\d+))?\\s*(?:reps?|ponovitev|ponovitve|wdh|repeticiones?)?`,
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
  const failure = source.match(
    /(\d+)\s*[x×*]\s*(?:amrap|max(?:\s+reps?)?|failure|do\s+odpovedi|al\s+fallo)/iu,
  );
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
  const repList = source.match(
    new RegExp(
      `(?:${NOTE_REP_WORD}\\s*[:=]?\\s*(\\d+(?:\\s*\\/\\s*\\d+){1,19})|(\\d+(?:\\s*\\/\\s*\\d+){1,19})\\s*${NOTE_REP_WORD}\\b)`,
      "iu",
    ),
  );
  if (repList) {
    const values = (repList[1] || repList[2]).split("/").map(Number);
    return {
      index: repList.index,
      length: repList[0].length,
      count: values.length,
      repMin: Math.min(...values),
      repMax: Math.max(...values),
      suffix: source.slice(repList.index + repList[0].length),
      failure: false,
    };
  }
  const rounds = source.match(
    new RegExp(
      `(\\d+)\\s*(${NOTE_SET_WORD})(?:\\s*(?:x|×|po)\\s*(\\d+))?`,
      "iu",
    ),
  );
  if (rounds)
    return {
      index: rounds.index,
      length: rounds[0].length,
      count: Number(rounds[1]),
      repMin: Number(rounds[3] || 1),
      repMax: Number(rounds[3] || 1),
      suffix: source.slice(rounds.index + rounds[0].length),
      failure: false,
      implicitReps: !rounds[3],
      setUnit: foldNoteText(rounds[2]),
    };
  return null;
}
function prefixedNoteExercise(value) {
  const source = cleanNoteItem(value);
  const prescription = parseNotePrescription(source);
  if (!prescription || prescription.index !== 0) return null;
  let remainder = source
    .slice(prescription.length)
    .replace(/^[\s\u00b7:|/\u2013\u2014-]+/u, "")
    .trim();
  if (!remainder) return null;
  if (prescription.implicitReps) {
    const trailingReps = remainder.match(
      /^(.+?)[\s\u00b7:|/\u2013\u2014-]+[x×]?(\d+)(?:\s*[–—-]\s*(\d+))?\s*(?:reps?|ponovitev|ponovitve|wdh|repeticiones?)?$/iu,
    );
    const trailingFailure = remainder.match(
      /^(.+?)[\s\u00b7:|/\u2013\u2014-]+(?:amrap|failure|do\s+odpovedi|al\s+fallo)$/iu,
    );
    if (trailingReps) {
      remainder = trailingReps[1].trim();
      prescription.repMin = Number(trailingReps[2]);
      prescription.repMax = Number(trailingReps[3] || trailingReps[2]);
      prescription.implicitReps = false;
      prescription.suffix = "";
    } else if (trailingFailure) {
      remainder = trailingFailure[1].trim();
      prescription.failure = true;
      prescription.implicitReps = false;
      prescription.suffix = "";
    } else {
      return null;
    }
  }
  const detailAt = remainder.search(
    /\s+(?:@\s*(?:(?:[0-4]\s*)?RIR|(?:[6-9]|10)\s*RPE)|(?:RIR|RPE|rest|po[cč]itek|odmor|pause|descanso)\s*:)/iu,
  );
  const detail = detailAt >= 0 ? remainder.slice(detailAt).trim() : "";
  const sourceName = (detailAt >= 0 ? remainder.slice(0, detailAt) : remainder)
    .replace(/[\s\u00b7:|/\u2013\u2014-]+$/u, "")
    .trim();
  if (
    !sourceName ||
    /^(?:circuit|krog|circuito|zirkel|giant set|superset|super set|super serija)\b/iu.test(
      sourceName,
    )
  )
    return null;
  return {
    sourceName,
    prescription: { ...prescription, suffix: detail },
  };
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
    /^(?:rest|po[cč]itek|odmor|pause|descanso)\s*:?\s*(\d+(?:[.,]\d+)?)\s*(?:[\u2013\u2014-]\s*(\d+(?:[.,]\d+)?))?\s*(min(?:ute)?s?|sec(?:ond)?s?|s|sek(?:und[ei]?)?)\b/i,
  );
  if (!match) return null;
  const first = Number(match[1].replace(",", "."));
  const second = match[2] ? Number(match[2].replace(",", ".")) : first;
  const amount = (first + second) / 2;
  return Math.round(amount * (/^min/i.test(match[3]) ? 60 : 1));
}
function clearlyNotExerciseName(value) {
  return /^(?:buy|order|call|email|message|meeting|appointment|chapter|page|room|photo|print|battery|batteries|tiles?|boxes?|screws?|recipe|dose|tablet|password|invoice|budget|hotel|flight|train ticket|week|month|year|sets?|reps?)\b/i.test(
    foldNoteText(value),
  );
}
function parsedLoggedSetLine(value) {
  const source = cleanNoteItem(value);
  const weighted = source.match(
    /^(\d+(?:[.,]\d+)?)\s*(kg|kgs|lb|lbs)\s*[x×]\s*(\d+)(?:\s*(?:reps?))?(.*)$/iu,
  );
  if (weighted)
    return {
      reps: Number(weighted[3]),
      suffix: weighted[4].trim(),
    };
  const repsOnly = source.match(/^x\s*(\d+)(?:\s*reps?)?(.*)$/iu);
  if (repsOnly)
    return { reps: Number(repsOnly[1]), suffix: repsOnly[2].trim() };
  return null;
}
function noteTableCells(value) {
  const line = String(value || "").trim();
  let cells = null;
  if (line.includes("\t")) cells = line.split(/\t+/u);
  else if ((line.match(/\|/g) || []).length >= 2)
    cells = line.replace(/^\||\|$/g, "").split("|");
  else if (/^(?:exercise|vaja|ubung|übung|ejercicio)\s*,/iu.test(line))
    cells = line.split(",");
  else if (
    /^(?:exercise|vaja|ubung|übung|ejercicio)\s*;/iu.test(line) &&
    (line.match(/;/g) || []).length >= 2
  )
    cells = line.split(";");
  return cells?.map((cell) => cell.trim()).filter((cell, index, all) => cell || all.length > 1) || null;
}
function noteTableHeader(cells) {
  if (!cells) return null;
  const aliases = {
    name: /^(?:exercise|movement|vaja|ubung|übung|ejercicio|name)$/i,
    sets: /^(?:sets?|serije?|satze|sätze|series?)$/i,
    reps: /^(?:reps?|ponovitve?|wdh|repeticiones?)$/i,
    weight: /^(?:weight|load|teza|teža|gewicht|peso)(?:\s*\([^)]*\))?$/i,
    rir: /^(?:rir|rpe|effort)$/i,
    rest: /^(?:rest|pocitek|počitek|odmor|pause|descanso)$/i,
    notes: /^(?:notes?|opombe?|notizen|notas?)$/i,
  };
  const header = {};
  cells.forEach((cell, index) => {
    const key = Object.entries(aliases).find(([, pattern]) => pattern.test(cell))?.[0];
    if (key && header[key] === undefined) header[key] = index;
  });
  return header.name !== undefined && (header.sets !== undefined || header.reps !== undefined)
    ? header
    : null;
}
function tableExerciseLine(cells, header) {
  if (!cells || !header) return null;
  const at = (key) =>
    header[key] === undefined ? "" : String(cells[header[key]] || "").trim();
  const name = at("name");
  const sets = Number(at("sets"));
  const reps = at("reps").replace(/^x\s*/i, "");
  if (!name || !Number.isInteger(sets) || sets < 1 || sets > 20 || !/^\d+(?:\s*[–—-]\s*\d+)?$/u.test(reps))
    return null;
  return [
    name,
    `${sets}x${reps}`,
    at("weight"),
    at("rir") && /r(?:ir|pe)/i.test(at("rir")) ? at("rir") : at("rir") ? `RIR ${at("rir")}` : "",
    at("rest") ? `rest: ${at("rest")}` : "",
    at("notes"),
  ]
    .filter(Boolean)
    .join(" | ");
}
function expandStructuredNoteLines(sourceText) {
  const rawLines = String(sourceText || "").split(/\r?\n/u);
  const expanded = [];
  let tableHeader = null;
  for (const rawLine of rawLines) {
    const line = rawLine.trim();
    if (!line) continue;
    let cells = noteTableCells(line);
    if (!cells && tableHeader && line.includes(";"))
      cells = line.split(";").map((cell) => cell.trim());
    if (!cells && tableHeader && line.includes(","))
      cells = line.split(",").map((cell) => cell.trim());
    const header = noteTableHeader(cells);
    if (header) {
      tableHeader = header;
      continue;
    }
    if (tableHeader && /^\s*:?-{2,}/u.test(line.replace(/^\|/u, ""))) continue;
    const tableLine = tableExerciseLine(cells, tableHeader);
    if (tableLine) {
      expanded.push(tableLine);
      continue;
    }
    if (cells && tableHeader) tableHeader = null;
    const semicolonParts = line.split(/\s*;\s*/u).filter(Boolean);
    if (
      semicolonParts.length > 1 &&
      semicolonParts.filter((part) => parseNotePrescription(cleanNoteItem(part))).length >= 2
    ) {
      expanded.push(...semicolonParts);
      continue;
    }
    expanded.push(line);
  }
  return expanded;
}
function prescribedSourceCandidates(lines) {
  const names = [];
  for (let index = 0; index < lines.length; index++) {
    const cleaned = cleanNoteItem(lines[index]);
    const prefixed = prefixedNoteExercise(cleaned);
    if (prefixed) {
      names.push(prefixed.sourceName);
      continue;
    }
    const inline = parseNotePrescription(cleaned);
    if (inline?.index > 0) {
      const rawName = cleaned
        .slice(0, inline.index)
        .replace(/[\s\u00b7:|/\u2013\u2014-]+$/gu, "")
        .trim();
      const name = splitImportedExerciseLabel(rawName).name;
      if (
        name &&
        !/^(?:circuit|krog|circuito|zirkel|giant set|superset|super set|super serija)\b/iu.test(
          name,
        ) &&
        !parsedDayHeading(name) &&
        !genericWorkoutHeading(name) &&
        !noteSectionMode(name) &&
        !clearlyNotExerciseName(name)
      )
        names.push(name);
      continue;
    }
    const next = parseNotePrescription(cleanNoteItem(lines[index + 1]));
    if (
      next?.index === 0 &&
      cleaned &&
      !parseNotePrescription(cleaned) &&
      !parsedDayHeading(cleaned) &&
      !genericWorkoutHeading(cleaned) &&
      !noteSectionMode(cleaned) &&
      !clearlyNotExerciseName(cleaned)
    ) {
      names.push(cleaned);
      index++;
    }
  }
  return names;
}
export function parseStructuredTrainingNotes(sourceText, profile = {}) {
  const lines = expandStructuredNoteLines(sourceText);
  if (!lines.length) return null;
  const goal = lines
    .find((line) => /^goal\s*:/i.test(line))
    ?.replace(/^goal\s*:\s*/i, "")
    .trim();
  const firstDayIndex = lines.findIndex(
    (line, index) =>
      parsedDayHeading(line) ||
      weekdayForDateHeading(line) ||
      genericWorkoutHeading(line) ||
      contextualWorkoutHeading(line, lines[index + 1]),
  );
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
  const explicitWeekdays = lines
    .map((line) => parsedDayHeading(line)?.weekday || weekdayForDateHeading(line))
    .filter(Boolean);
  const unresolvedDayMarker = lines.some((line) => {
    if (parsedDayHeading(line) || weekdayForDateHeading(line) || genericWorkoutHeading(line))
      return false;
    const folded = ` ${foldNoteText(line)} `;
    return Object.keys(NOTE_WEEKDAYS).some(
      (token) => token.length >= 3 && folded.includes(` ${token} `),
    );
  });
  const availableSequentialDays = sequentialImportWeekdays(profile, explicitWeekdays);
  let sequentialDayIndex = 0;
  let current = null;
  let sectionMode = "exercises";
  let circuitSets = null;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const explicitHeading = parsedDayHeading(line);
    const dateWeekday = explicitHeading ? null : weekdayForDateHeading(line);
    const genericHeading =
      explicitHeading || dateWeekday
        ? null
        : genericWorkoutHeading(line) ||
          contextualWorkoutHeading(line, lines[index + 1]);
    const heading = explicitHeading ||
      (dateWeekday
        ? { weekday: dateWeekday, name: cleanNoteItem(line) }
        : genericHeading
          ? {
              weekday:
                availableSequentialDays[sequentialDayIndex++] ||
                NOTE_WEEKDAY_ORDER[(days.length + explicitWeekdays.length) % 7],
              name: genericHeading,
            }
          : null);
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
          warmup: null,
        };
        days.push(current);
      }
      sectionMode = "exercises";
      circuitSets = null;
      continue;
    }
    if (
      !current &&
      !unresolvedDayMarker &&
      (parseNotePrescription(cleanNoteItem(line)) ||
        parseNotePrescription(cleanNoteItem(lines[index + 1])))
    ) {
      const weekday = sequentialImportWeekdays(profile)[0] || "Mon";
      current = {
        weekday,
        location: "Commercial gym",
        name: normalizeWorkoutName("Workout", weekday),
        estimatedMinutes: 60,
        exercises: [],
        warmup: null,
      };
      days.push(current);
    }
    if (!current) continue;
    const nextSectionMode = noteSectionMode(line);
    if (nextSectionMode) {
      sectionMode = nextSectionMode;
      if (sectionMode === "warmup") {
        current.warmup ||= { items: [], rampUpSets: [] };
        const inlineItem = parseWarmupNoteItem(line);
        if (inlineItem) current.warmup.items.push(inlineItem);
      }
      continue;
    }
    const circuit = cleanNoteItem(line).match(
      /^(?:circuit|krog|circuito|zirkel|giant set|superset|super set|super serija)\s*(?:[a-z]\s*)?(?:x|×|:|-)?\s*(\d+)\s*(?:rounds?|krogi?|runden?|rondas?|sets?|serije?)?/iu,
    );
    if (circuit) {
      circuitSets = Math.max(1, Math.min(20, Number(circuit[1])));
      continue;
    }
    if (/^(?:progression|progresija|tvoj glavni princip)/i.test(foldNoteText(line))) {
      current = null;
      continue;
    }
    if (sectionMode === "warmup") {
      const warmupItem = parseWarmupNoteItem(line);
      if (warmupItem) current.warmup.items.push(warmupItem);
      continue;
    }
    const rest = parsedRestSeconds(line);
    if (rest !== null && current.exercises.length) {
      current.exercises.at(-1).restSeconds = rest;
      continue;
    }
    const cleanedLine = cleanNoteItem(line);
    let sourceName = cleanedLine;
    const loggedSets = [];
    for (let cursor = index + 1; cursor < lines.length; cursor++) {
      const logged = parsedLoggedSetLine(lines[cursor]);
      if (!logged) break;
      loggedSets.push(logged);
    }
    const nextLinePrescription = parseNotePrescription(
      cleanNoteItem(lines[index + 1]),
    );
    let prescription = loggedSets.length
      ? {
          index: 0,
          length: 0,
          count: loggedSets.length,
          repMin: Math.min(...loggedSets.map((set) => set.reps)),
          repMax: Math.max(...loggedSets.map((set) => set.reps)),
          suffix: loggedSets.map((set) => set.suffix).filter(Boolean).join(" · "),
          failure: false,
        }
      : nextLinePrescription?.index === 0
        ? nextLinePrescription
        : null;
    let consumedPrescriptionLines = loggedSets.length || (prescription ? 1 : 0);
    const inline = parseNotePrescription(cleanedLine);
    const prefixed = prefixedNoteExercise(cleanedLine);
    if (prefixed) {
      sourceName = prefixed.sourceName;
      prescription = prefixed.prescription;
      consumedPrescriptionLines = 0;
    } else if (
      inline &&
      (!inline.implicitReps || /^(?:round|krog|rund|ronda)/i.test(inline.setUnit))
    ) {
      sourceName = cleanedLine
        .slice(0, inline.index)
        .replace(/[\s\u00b7:|/\u2013\u2014-]+$/gu, "")
        .trim();
      prescription = inline;
      consumedPrescriptionLines = 0;
    }
    if (!prescription && circuitSets) {
      const circuitReps = cleanedLine.match(
        /^(.*?)[\s:|-]+(\d+)(?:\s*[–—-]\s*(\d+))?\s*(?:reps?|ponovitev|ponovitve|wdh|repeticiones?)$/iu,
      );
      if (circuitReps?.[1]) {
        sourceName = circuitReps[1].trim();
        prescription = {
          index: circuitReps[1].length,
          length: circuitReps[0].length - circuitReps[1].length,
          count: circuitSets,
          repMin: Number(circuitReps[2]),
          repMax: Number(circuitReps[3] || circuitReps[2]),
          suffix: "Circuit",
          failure: false,
        };
        consumedPrescriptionLines = 0;
      }
    }
    if (!prescription || !sourceName || clearlyNotExerciseName(sourceName)) continue;
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
    const rirMatch = detail.match(/\b(?:RIR\s*[:=]?\s*([0-4])|([0-4])\s*RIR)\b/i);
    const rpeMatch = detail.match(/\b(?:RPE\s*[:=]?\s*([6-9]|10)|([6-9]|10)\s*RPE)\b/i);
    const inlineRest = parsedRestSeconds(detail);
    const note = detail
      .replace(/\b(?:RIR\s*[:=]?\s*[0-4]|[0-4]\s*RIR)\b/gi, "")
      .replace(/\b(?:RPE\s*[:=]?\s*(?:[6-9]|10)|(?:[6-9]|10)\s*RPE)\b/gi, "")
      .replace(/^[\s\u00b7,|;]+|[\s\u00b7,|;]+$/gu, "")
      .trim();
    if (count < 1 || count > 20 || repMin < 1 || repMax < repMin) continue;
    const importedLabel = splitImportedExerciseLabel(sourceName);
    const parsedNote = prescription.failure
      ? ["To failure", note].filter(Boolean).join(" · ")
      : note && inlineRest === null && !/^[@\d]/.test(note)
        ? note
        : null;
    const prescriptionUnit = /^(?:lb|lbs)$/iu.test(
      String(prescription.loadUnit || ""),
    )
      ? "lb"
      : /^(?:kg|kgs)$/iu.test(String(prescription.loadUnit || ""))
        ? "kg"
        : profile.units === "lb"
          ? "lb"
          : profile.units === "kg"
            ? "kg"
            : null;
    const parsedSetWeights =
      Array.isArray(prescription.setLoads) && prescriptionUnit
        ? prescription.setLoads.map((load) =>
            Number(
              (prescriptionUnit === "lb" ? load * 0.45359237 : load).toFixed(
                2,
              ),
            ),
          )
        : null;
    current.exercises.push({
      exerciseId: null,
      sourceName: importedLabel.name,
      sets: count,
      repMin,
      repMax,
      targetRir: rirMatch
        ? Number(rirMatch[1] || rirMatch[2])
        : rpeMatch
          ? Math.max(0, Math.min(4, 10 - Number(rpeMatch[1] || rpeMatch[2])))
          : null,
      restSeconds: inlineRest,
      measure: timed ? "seconds" : null,
      failureTarget: prescription.failure,
      notes:
        [...new Set([importedLabel.note, parsedNote].filter(Boolean))].join(
          " · ",
        ) || null,
      weightKg: null,
      setWeightsKg: parsedSetWeights,
    });
    if (consumedPrescriptionLines) index += consumedPrescriptionLines;
  }
  const trainingDays = days.filter((day) => day.exercises.length);
  if (!trainingDays.length) return null;
  const parsedNameCounts = new Map();
  for (const name of trainingDays.flatMap((day) => [
    ...day.exercises.map((exercise) => exercise.sourceName),
    ...(day.warmup?.items || []).map((item) => item.label),
  ])) {
    const key = foldNoteText(name);
    parsedNameCounts.set(key, (parsedNameCounts.get(key) || 0) + 1);
  }
  const missingPrescribedSource = prescribedSourceCandidates(lines).some((name) => {
    const key = foldNoteText(name);
    const remaining = parsedNameCounts.get(key) || 0;
    if (!remaining) return true;
    parsedNameCounts.set(key, remaining - 1);
    return false;
  });
  if (missingPrescribedSource) return null;
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
        profile.units,
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
          ], profile.units)[0]
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
  async importTrainingPlan(profile, existingPlanText, { signal = null } = {}) {
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
        importAttemptId:
          globalThis.crypto?.randomUUID?.() ||
          `import-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      },
      { timeoutMs: IMPORT_PLAN_TIMEOUT_MS, signal },
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
  if (action.type === "resume-empty-completed-workout") {
    const target = state.workouts.find(
      (workout) => workout.id === action.targetCompletedWorkoutId,
    );
    if (!target || !completedWorkoutCanResume(state, target.id)) return null;
    const trainingDate = workoutPlanDate(target);
    if (action.trainingDate && action.trainingDate !== trainingDate) return null;
    return {
      type: "resume-empty-completed-workout",
      label: "RESUME WORKOUT",
      targetCompletedWorkoutId: target.id,
      trainingDate,
      expectedCompletedAt: target.completedAt,
      operationId: `coach-resume:${target.id}:${target.completedAt}`,
    };
  }
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
      baseProgramVersion: Number(state.program?.version || 1),
      explanation: String(
        action.explanation || "Review the proposed recurring program changes.",
      ),
    };
  }
  return null;
}
