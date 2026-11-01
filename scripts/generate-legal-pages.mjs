import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {legalDocuments,legalDraft,LEGAL_VERSION} from '../src/legalDocuments.js';
const escape=value=>String(value).replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
export function legalPage(document) {
  const nav=legalDocuments.map(item=>`<a href="/legal/${item.id}.html"${item.id===document?.id?' aria-current="page"':''}>${escape(item.title)}</a>`).join('');
  const content=document?`<h1>${escape(document.title)}</h1><p class="intro">${escape(document.summary)}</p>${document.sections.map(([title,paragraphs])=>`<section><h2>${escape(title)}</h2>${paragraphs.map(p=>`<p>${escape(p)}</p>`).join('')}</section>`).join('')}${document.links?`<section><h2>References</h2><ul>${document.links.map(([title,url])=>`<li><a href="${escape(url)}">${escape(title)}</a></li>`).join('')}</ul></section>`:''}`:'<h1>Privacy &amp; legal</h1><p>Choose a notice below. These pages are available without an account.</p>';
  return `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="robots" content="${legalDraft?'noindex,nofollow':'index,follow'}"><title>${escape(document?.title||'Privacy & legal')} · ROOK</title><link rel="stylesheet" href="/legal/legal.css"></head><body><a class="skip" href="#content">Skip to content</a><header><a href="/">ROOK · Back to app</a></header><main id="content" tabindex="-1">${legalDraft?'<aside class="draft" aria-label="Draft notice"><strong>Draft — not ready for public release</strong><p>Verified operator/contact details and the release checks must be completed before these notices become final.</p></aside>':''}${content}<p class="version">Prepared 1 November 2026 · ${escape(LEGAL_VERSION)}</p></main><nav aria-label="Legal documents">${nav}</nav></body></html>\n`;
}
export function generateLegalPages({check=false}={}) {
  const directory=resolve('public/legal');if(!check)mkdirSync(directory,{recursive:true});
  for(const document of [null,...legalDocuments]) {
    const path=resolve(directory,`${document?.id||'index'}.html`),html=legalPage(document);
    if(check){if(readFileSync(path,'utf8')!==html)throw new Error(`Legal page needs regeneration: ${path}`);}
    else writeFileSync(path,html);
  }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {generateLegalPages({check:process.argv.includes('--check')});console.log(`Legal pages ${process.argv.includes('--check')?'verified':'generated'} (${legalDraft?'draft':'operator details supplied'}).`);}
