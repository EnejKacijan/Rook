import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {legalDocuments,legalDraft,LEGAL_VERSION} from '../src/legalDocuments.js';
import {THEME_PRESETS,personalThemeModel} from '../src/personalThemes.js';
import {LEGAL_THEME_ROLES} from '../src/legalAppearance.js';
const escape=value=>String(value).replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
const chevron='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>';
const themeRoles=LEGAL_THEME_ROLES;
export function legalThemeCss() {
  const typography=[...readFileSync(resolve('src/typography.css'),'utf8').matchAll(/(--rook-type-[\w-]+)\s*:\s*([^;]+);/g)].map(([,name,value])=>`${name}:${value.trim()}`).join(';');
  const tokens=(theme,appearance)=>{const model=personalThemeModel({basePalette:theme,appearance,paletteCustomizations:{}});return themeRoles.map(role=>`--rook-${role}:${model.tokens[`--rook-${role}`]}`).join(';');};
  return `/* Generated from the app's semantic theme resolver. */\n:root{${typography};${tokens('forest','light')}}\n@media(prefers-color-scheme:dark){:root:not([data-appearance="light"]){${tokens('forest','dark')}}}\n${THEME_PRESETS.flatMap(theme=>['light','dark'].map(appearance=>`:root[data-appearance="${appearance}"][data-legal-theme="${theme.id}"]{${tokens(theme.id,appearance)}}`)).join('\n')}\n`;
}
export function legalAppearanceScript() {
  return `// Visual hints only: no account, storage, analytics or app bundle.\n(() => {\n  const themes = ${JSON.stringify(THEME_PRESETS.map(theme=>theme.id))};\n  const parameters = new URLSearchParams(location.search);\n  const explicit = parameters.get('appearance');\n  const theme = themes.includes(parameters.get('theme')) ? parameters.get('theme') : 'forest';\n  const colours = parameters.get('colours');\n  const roles = ${JSON.stringify(LEGAL_THEME_ROLES)};\n  const validColours = (explicit === 'light' || explicit === 'dark') && /^[a-f0-9]{6}(?:-[a-f0-9]{6}){7}$/i.test(colours || '');\n  if (validColours) colours.split('-').forEach((colour,index) => document.documentElement.style.setProperty('--rook-' + roles[index], '#' + colour));\n  const system = matchMedia('(prefers-color-scheme: dark)');\n  const apply = () => {\n    const appearance = explicit === 'light' || explicit === 'dark' ? explicit : system.matches ? 'dark' : 'light';\n    document.documentElement.dataset.appearance = appearance;\n    document.documentElement.dataset.legalTheme = theme;\n    document.documentElement.style.colorScheme = appearance;\n    document.querySelectorAll('[data-legal-document]').forEach(link => {\n      const url = new URL(link.getAttribute('href'), location.href);\n      url.searchParams.set('appearance', appearance);\n      url.searchParams.set('theme', theme);\n      if (validColours) url.searchParams.set('colours', colours);\n      else url.searchParams.delete('colours');\n      link.setAttribute('href', url.pathname + url.search);\n    });\n  };\n  apply();\n  document.addEventListener('DOMContentLoaded', apply, {once:true});\n  if (explicit !== 'light' && explicit !== 'dark') system.addEventListener?.('change', apply);\n})();\n`;
}
export function legalPage(document) {
  const nav=legalDocuments.map(item=>`<a data-legal-document href="/legal/${item.id}.html"${item.id===document?.id?' aria-current="page"':''}><span>${escape(item.title)}</span>${chevron}</a>`).join('');
  const intro=`<div class="legal-title"><p class="eyebrow">ROOK · Privacy &amp; legal</p><h1>${escape(document?.title||'Privacy & legal')}</h1><p class="intro">${document?escape(document.summary):'Choose a notice below. These pages are available without an account.'}</p></div>`;
  const content=document?`${document.sections.map(([title,paragraphs])=>`<section><h2>${escape(title)}</h2>${paragraphs.map(p=>`<p>${escape(p)}</p>`).join('')}</section>`).join('')}${document.links?`<section><h2>References</h2><ul>${document.links.map(([title,url])=>`<li><a href="${escape(url)}">${escape(title)}</a></li>`).join('')}</ul></section>`:''}`:'';
  return `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="color-scheme" content="light dark"><meta name="robots" content="${legalDraft?'noindex,nofollow':'index,follow'}"><title>${escape(document?.title||'Privacy & legal')} · ROOK</title><script src="/legal/appearance.js"></script><link rel="stylesheet" href="/legal/theme.css"><link rel="stylesheet" href="/legal/legal.css"></head><body><a class="skip" href="#content">Skip to content</a><header class="legal-header"><a class="legal-back" href="/"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 5-7 7 7 7"/></svg><span>Back to ROOK</span></a></header><main id="content" tabindex="-1">${intro}${legalDraft?'<aside class="draft" aria-label="Draft notice"><strong>Draft — not ready for public release</strong><p>Verified operator/contact details and the release checks must be completed before these notices become final.</p></aside>':''}${content}<p class="version">Prepared 1 November 2026 · ${escape(LEGAL_VERSION)}</p></main><footer class="legal-footer"><p class="eyebrow">Legal documents</p><nav aria-label="Legal documents">${nav}</nav></footer></body></html>\n`;
}
export function generateLegalPages({check=false}={}) {
  const directory=resolve('public/legal');if(!check)mkdirSync(directory,{recursive:true});
  for(const [name,content] of [['theme.css',legalThemeCss()],['appearance.js',legalAppearanceScript()]]) {
    const path=resolve(directory,name);
    if(check){if(readFileSync(path,'utf8')!==content)throw new Error(`Legal asset needs regeneration: ${path}`);}
    else writeFileSync(path,content);
  }
  for(const document of [null,...legalDocuments]) {
    const path=resolve(directory,`${document?.id||'index'}.html`),html=legalPage(document);
    if(check){if(readFileSync(path,'utf8')!==html)throw new Error(`Legal page needs regeneration: ${path}`);}
    else writeFileSync(path,html);
  }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {generateLegalPages({check:process.argv.includes('--check')});console.log(`Legal pages ${process.argv.includes('--check')?'verified':'generated'} (${legalDraft?'draft':'operator details supplied'}).`);}
