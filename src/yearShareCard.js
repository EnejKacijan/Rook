// A shareable image of "Your year in Rook". It is drawn on the device from
// the same yearly numbers the story shows and is never uploaded by Rook.
// It holds only totals and one lift, never a name, body data or notes.
import { displayWeight, weightUnit } from './domain.js';
import { exerciseArt } from './exerciseArt.js';
import { exportWorkoutPhoto } from './exportWorkoutPhoto.js';

export const SHARE_CARD_SIZE = { width: 1080, height: 1350 };
const number = value => new Intl.NumberFormat('en').format(value);
const hours = seconds => Math.round(seconds / 360) / 10;
function timeLabel(seconds) {
  if (seconds >= 36000) return `${hours(seconds)} h`;
  const minutes = Math.round(seconds / 60), h = Math.floor(minutes / 60), m = minutes % 60;
  return h ? (m ? `${h} h ${m} min` : `${h} h`) : `${minutes} min`;
}

// The card's text, deterministic for the same history.
export function yearShareContent(stats, units) {
  const unit = weightUnit(units), load = kg => `${number(displayWeight(kg, units))} ${unit}`;
  const lead = stats.improvements?.[0];
  const highlight = lead ? {
    exerciseId: lead.exerciseId, name: lead.name,
    from: `${load(lead.from.weight)} × ${lead.from.reps}`, to: `${load(lead.to.weight)} × ${lead.to.reps}`,
    gain: [lead.loadGain > 0 && `+${load(lead.loadGain)}`, lead.repGain > 0 && `+${lead.repGain} ${lead.repGain === 1 ? 'rep' : 'reps'}`].filter(Boolean).join(' · '),
  } : null;
  const tiles = [{ label: stats.workouts === 1 ? 'Workout' : 'Workouts', value: number(stats.workouts) }];
  // Partial coverage stays visible on the card too.
  if (stats.time?.counted) tiles.push({ label: stats.time.counted < stats.time.of ? `Logged time · ${stats.time.counted} of ${stats.time.of}` : 'Logged time', value: timeLabel(stats.time.totalSeconds) });
  if (stats.activeWeeks) tiles.push({ label: 'Active weeks', value: String(stats.activeWeeks) });
  if (stats.records?.sessions) tiles.push({ label: stats.records.sessions === 1 ? 'Record' : 'Records', value: number(stats.records.sessions) });
  if (tiles.length < 4 && stats.sets) tiles.push({ label: 'Sets', value: number(stats.sets) });
  if (tiles.length < 4 && stats.blocks?.length) tiles.push({ label: 'Blocks', value: String(stats.blocks.length) });
  const line = highlight ? `Biggest jump: ${highlight.name}` : stats.records?.exercises ? `New records on ${stats.records.exercises} ${stats.records.exercises === 1 ? 'exercise' : 'exercises'}` : `${number(stats.workouts)} ${stats.workouts === 1 ? 'workout' : 'workouts'} logged`;
  return { year: stats.year, line, highlight, tiles: tiles.slice(0, 4), fileName: `ROOK-year-${stats.year}.png` };
}

function themeColors(root = document.documentElement) {
  const css = getComputedStyle(root), read = (name, fallback) => css.getPropertyValue(name).trim() || fallback;
  return { bg: read('--rook-bg', '#f6f5f2'), text: read('--rook-text', '#1b1a19'), secondary: read('--rook-secondary', '#6f6c68'),
    accent: read('--rook-accent-fill', '#1f6b4a'), accentText: read('--rook-accent-text', '#1f6b4a'), surface: read('--rook-surface', '#ffffff'),
    border: read('--rook-border', 'rgba(27,26,25,.1)'), font: css.fontFamily || '-apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif' };
}
function loadImage(src, timeout = 1500) {
  if (!src || typeof Image === 'undefined') return Promise.resolve(null);
  return new Promise(resolve => {
    const image = new Image(), timer = setTimeout(() => resolve(null), timeout);
    image.onload = () => { clearTimeout(timer); resolve(image); };
    image.onerror = () => { clearTimeout(timer); resolve(null); };
    image.src = src;
  });
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
// Shrinks text until it fits the width, so long names never overflow.
function fitText(ctx, text, weight, size, font, maxWidth, min = 24) {
  let current = size;
  do { ctx.font = `${weight} ${current}px ${font}`; current -= 2; } while (ctx.measureText(text).width > maxWidth && current >= min);
}
function tracked(ctx, value) { if ('letterSpacing' in ctx) ctx.letterSpacing = value; }

export async function renderYearShareCard(stats, { units, colors = themeColors(), document: doc = document } = {}) {
  const content = yearShareContent(stats, units), { width, height } = SHARE_CARD_SIZE;
  const canvas = doc.createElement('canvas'); canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Images are unavailable on this device.');
  const { font } = colors, pad = 84, inner = width - pad * 2;
  ctx.fillStyle = colors.bg; ctx.fillRect(0, 0, width, height);
  const glow = ctx.createRadialGradient(width / 2, 0, 40, width / 2, 0, height * 0.75);
  glow.addColorStop(0, colors.accent); glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = 0.16; ctx.fillStyle = glow; ctx.fillRect(0, 0, width, height); ctx.globalAlpha = 1;
  ctx.textBaseline = 'alphabetic';

  ctx.fillStyle = colors.accentText; ctx.font = `750 30px ${font}`; tracked(ctx, '5px');
  ctx.fillText('YOUR YEAR IN ROOK', pad, 150); tracked(ctx, '0px');
  ctx.fillStyle = colors.text; ctx.font = `800 290px ${font}`; tracked(ctx, '-14px');
  ctx.fillText(String(content.year), pad - 10, 400); tracked(ctx, '0px');
  ctx.fillStyle = colors.text; fitText(ctx, content.line, 650, 46, font, inner);
  ctx.fillText(content.line, pad, 488);

  let y = 546;
  if (content.highlight) {
    const h = 220; roundRect(ctx, pad, y, inner, h, 40); ctx.fillStyle = colors.surface; ctx.fill();
    ctx.strokeStyle = colors.border; ctx.lineWidth = 2; ctx.stroke();
    const art = await loadImage(exerciseArt({ exerciseId: content.highlight.exerciseId }));
    let textX = pad + 40;
    if (art) { const size = 160; ctx.drawImage(art, pad + 30, y + 30, size, size); textX = pad + 30 + size + 34; }
    const textWidth = pad + inner - 36 - textX;
    ctx.fillStyle = colors.text; fitText(ctx, content.highlight.name, 750, 42, font, textWidth); ctx.fillText(content.highlight.name, textX, y + 74);
    const pair = `${content.highlight.from}  →  ${content.highlight.to}`;
    ctx.fillStyle = colors.secondary; fitText(ctx, pair, 600, 38, font, textWidth); ctx.fillText(pair, textX, y + 130);
    ctx.fillStyle = colors.accentText; fitText(ctx, content.highlight.gain, 750, 36, font, textWidth); ctx.fillText(content.highlight.gain, textX, y + 182);
    y += h + 36;
  } else y += 36;

  const gap = 28, tileW = (inner - gap) / 2, rows = Math.ceil(content.tiles.length / 2);
  const tileH = Math.min(220, (height - 150 - y - gap * (rows - 1)) / rows);
  content.tiles.forEach((tile, index) => {
    const x = pad + (index % 2) * (tileW + gap), top = y + Math.floor(index / 2) * (tileH + gap);
    roundRect(ctx, x, top, tileW, tileH, 34); ctx.fillStyle = colors.surface; ctx.fill(); ctx.strokeStyle = colors.border; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = colors.secondary; ctx.font = `600 30px ${font}`; ctx.fillText(tile.label, x + 34, top + 56);
    ctx.fillStyle = colors.text; fitText(ctx, tile.value, 800, 72, font, tileW - 68); ctx.fillText(tile.value, x + 34, top + tileH - 32);
  });

  ctx.fillStyle = colors.text; ctx.font = `800 36px ${font}`; tracked(ctx, '8px'); ctx.fillText('ROOK', pad, height - 62); tracked(ctx, '0px');
  ctx.fillStyle = colors.secondary; ctx.font = `500 28px ${font}`; ctx.textAlign = 'right';
  ctx.fillText('From logged workouts', width - pad, height - 64); ctx.textAlign = 'left';

  const blob = await new Promise((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('The image could not be created.')), 'image/png'));
  return new File([blob], content.fileName, { type: 'image/png' });
}

// Share sheet where available (iOS app, Web Share), otherwise a download.
export async function shareYearCard(stats, options) {
  const file = await renderYearShareCard(stats, options);
  return exportWorkoutPhoto(file, { title: `Your year in Rook ${stats.year}` });
}
