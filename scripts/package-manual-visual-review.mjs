import { mkdir, readdir, copyFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const sources = ['backup-restore', 'recovery-path', 'adjust-today', 'gym-profiles', 'smart-substitutions', 'plate-calculator', 'plan-history', 'training-blocks', 'performance-insights', 'workout-photo-timeline', 'custom-exercises', 'historical-workout-import', 'advanced-logging', 'rest-notifications', 'onboarding-layout', 'onboarding-restrictions', 'header-alignment', 'modal-scaffold'];
const destination = path.resolve('artifacts', `ROOK-manual-review-${new Date().toISOString().replace(/[:.]/g, '-')}`);
await mkdir(destination, { recursive: true });
const manifest = [];
const sections = [];
for (const [index, source] of sources.entries()) {
  const folder = `${String(index + 1).padStart(2, '0')}-${source}`;
  await mkdir(path.join(destination, folder));
  const legacyOnboarding = new Set(['04-frequency.png', '05-days.png', '06-duration.png', '07-environment.png', '08-equipment.png', '09-priorities.png', '10-effort.png', '11-preferences.png']);
  const files = (await readdir(path.resolve('artifacts', source))).filter(f => f.endsWith('.png') && !(source === 'onboarding-layout' && legacyOnboarding.has(f))).sort();
  for (const file of files) {
    const original = path.resolve('artifacts', source, file);
    await copyFile(original, path.join(destination, folder, file));
    manifest.push({ file: `${folder}/${file}`, capturedAt: (await stat(original)).mtime.toISOString(), referenceOnly: source === 'modal-scaffold' });
  }
  sections.push(`<section><h2>${folder}${source === 'modal-scaffold' ? ' — established reference screens' : ''}</h2><div>${files.map(f => `<a href="${folder}/${f}"><img loading="lazy" src="${folder}/${f}"><span>${f}</span></a>`).join('')}</div></section>`);
}
await writeFile(path.join(destination, 'INDEX.html'), `<!doctype html><meta charset="utf-8"><title>ROOK manual visual review</title><style>body{font:16px system-ui;margin:32px;background:#eeece7;color:#202522}section{margin:40px 0}section>div{display:flex;flex-wrap:wrap;gap:20px}a{width:230px;color:inherit;text-decoration:none;overflow-wrap:anywhere;font-size:12px}img{display:block;width:100%;height:420px;object-fit:contain;object-position:top;background:#ddd}span{display:block;margin-top:8px}</style><h1>ROOK · manual visual review</h1><p>Open full-resolution images by clicking thumbnails. Capture timestamps are recorded in MANIFEST.json. Established references are separate. Red horizontal lines in “guide” images are QA overlays, not application UI.</p>${sections.join('')}`);
await writeFile(path.join(destination, 'MANIFEST.json'), JSON.stringify(manifest, null, 2));
await writeFile(path.join(destination, 'CHATGPT-PROMPT.txt'), `Act as a strict senior product designer reviewing ROOK, a restrained, local-first workout app. I will upload screenshots in batches from a numbered review folder. Wait until I say ALL BATCHES UPLOADED before giving your consolidated verdict; acknowledge intermediate batches briefly.

Scope: Backup/Restore and logout recovery; Adjust Today; Gym Profiles; Smart Substitutions; Plate Calculator; Plan Version History; Training Blocks; Performance Insights; private Workout Photo Timeline; Custom Exercises/Aliases; historical workout import; advanced set types and optional per-side logging; rest notifications; onboarding equipment and restrictions; KG/REPS/RIR header alignment.

Use the established screens in folder 18 as visual references, not as new features. Compare the new screens with those references and with one another. ROOK should remain factual, quiet and useful. No gamification, decorative redesign, extra navigation, or permanently denser workout logging.

Evaluate: close X and back controls (no browser-default blue); typography/capitalization; header spacing and empty space; bottom-sheet consistency; clear primary/secondary CTAs; tappable rows; readable selected/disabled states; Light/Dark/Premium restraint; 320px layout; safe-area and reachable bottom actions; long names and reviews; consistent destructive confirmations; concise explanations; honest offline/recovery/notification limitations. For KG/REPS/RIR, assess vertical alignment only; preserve existing horizontal positions and controls. Red lines in filenames ending -guide are temporary QA guides, not app UI.

Do not infer runtime correctness from screenshots. Identify anything that requires interaction testing separately as UNVERIFIED, not a proven defect. Do not invent failures, and do not claim unseen states were reviewed. Describe missing evidence explicitly.

For each meaningful issue, provide priority (P1/P2/P3), exact folder/filename, visible evidence, why it matters, the smallest concrete fix, and what must remain unchanged. Consolidate repeated issues into one shared-component recommendation. Avoid subjective micro-tweaks, scope expansion, and oscillating between equally acceptable designs. If screenshots are too small, ask for the original individual PNG instead of guessing.

Finish with: (1) reviewed coverage and missing evidence, (2) prioritized actionable issues, (3) regression checklist for proposed changes. If there are no meaningful visual/UX issues in the reviewed evidence, write APPROVED — no meaningful visual/UX issues remain, and state the scope of that approval. Otherwise write CHANGES REQUESTED. After fixes I will send replacement screenshots; re-review those changes and their regressions without restarting a redesign.
`);
await writeFile(path.join(destination, 'PREBERI-ME.txt'), `ROOK — posnetki za rocni ChatGPT pregled

1. Odpri INDEX.html za pregled vseh posnetkov. Klik na sliko odpre original.
2. Kopiraj CHATGPT-PROMPT.txt v ChatGPT.
3. Posiljaj PNG-je po funkcionalnostih, npr. 2–3 mape naenkrat. Ce naletis na omejitev priponk, razdeli v manjse pakete.
4. Dodaj nekaj primerjalnih slik iz 18-modal-scaffold.
5. Ko koncas, napisi ALL BATCHES UPLOADED.

Posnetki so iz lokalnih testnih podatkov, ne dokaz fizicnega testiranja na telefonu. MANIFEST.json hrani cas vsakega posnetka; referencni zasloni so starejsi. Slike -guide imajo namerno dodano merilno crto. ZIP je za prenos/arhiv; za vizualni pregled raje nalozi posamezne PNG-je. Nic ni bilo poslano ChatGPT-ju.
`);
console.log(JSON.stringify({ destination, screenshots: manifest.length }));
