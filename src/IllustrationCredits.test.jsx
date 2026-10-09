// @vitest-environment jsdom
import React from 'react';
import {beforeEach,describe,it,expect,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {IllustrationCredits} from './IllustrationCredits.jsx';
import {Detail} from './App.jsx';
import {blankState,exerciseCatalog,makeProgramExercise} from './domain.js';
import {exerciseArt,exerciseIllustrationProvenance} from './exerciseArt.js';

beforeEach(()=>{
  window.matchMedia=vi.fn(()=>({matches:false,addEventListener(){},removeEventListener(){}}));
});
function detailMarkup(id){
  const state=blankState();
  const exercise=makeProgramExercise(exerciseCatalog[id],state.profile);
  return renderToStaticMarkup(<Detail detail={{exercise}} state={state} update={()=>{}} close={()=>{}} setDetail={()=>{}} setPage={()=>{}}/>);
}
describe('public illustration credits',()=>{
  it('shows no per-image third-party source line, AI badge or empty credit container for verified AI artwork',()=>{
    const markup=detailMarkup('barbell-bench-press');
    expect(markup).toContain('exercise-detail-art');
    expect(markup).toContain('wg-bench-press.svg');
    expect(markup).not.toMatch(/Workout Guide|Bryl Lim|Everkinetic|AI-generated|appearance-credits|illustration-credit|Source:/);
    expect(markup).toContain('HISTORY');
  });
  it('retains required authorship and licensing in the existing global Appearance section',()=>{
    const state=blankState();
    const markup=renderToStaticMarkup(<Detail detail="appearance" state={state} update={()=>{}} close={()=>{}}/>);
    const doc=new DOMParser().parseFromString(markup,'text/html');
    const section=doc.querySelector('[aria-label="Illustration credits"]');
    expect(section.textContent).toContain('Cable Crunch illustration by Bryl Lim / Workout Guide.');
    expect(section.textContent).toContain('Recolored and reframed for ROOK.');
    expect(section.querySelector('a[href="https://creativecommons.org/licenses/by-sa/4.0/"]')?.textContent).toBe('CC BY-SA 4.0');
    expect(section.textContent).not.toContain('Library illustrations by');
  });
  it('renders any required third-party entry rather than hardcoding the current exception',()=>{
    const entry={assetId:'fixture',label:'Licensed test asset',creator:'Actual creator',sourceName:'Actual library',sourceUrl:'https://example.org/source',changes:'Reframed.',license:'Example license',licenseUrl:'https://example.org/license'};
    const markup=renderToStaticMarkup(<IllustrationCredits entries={[entry]} disclosure={null}/>);
    expect(markup).toContain('Licensed test asset illustration by');
    expect(markup).toContain('Actual creator / Actual library');
    expect(markup).toContain('href="https://example.org/source"');
    expect(markup).toContain('href="https://example.org/license"');
    expect(markup).not.toContain('Most exercise illustrations');
  });
  it('labels catalog information as references, separate from image authorship',()=>{
    const markup=renderToStaticMarkup(<IllustrationCredits/>);
    const doc=new DOMParser().parseFromString(markup,'text/html');
    const referenceHeader=[...doc.querySelectorAll('.eyebrow')].find(el=>el.textContent==='EXERCISE REFERENCES');
    expect(referenceHeader.nextElementSibling.textContent).toContain('provides exercise catalog information');
    expect(referenceHeader.nextElementSibling.textContent).not.toMatch(/illustration by|Licensed under/);
  });
  it('uses the same asset resolver for alias/import details and provenance, without a fake fallback',()=>{
    expect(exerciseIllustrationProvenance({importedName:'Bench Press'}).provenanceType).toBe('rook_ai_generated');
    expect(exerciseArt({importedName:'Bench Press'})).toContain('wg-bench-press.svg');
    expect(exerciseIllustrationProvenance({exerciseId:'missing',artId:'rook-unknown'}).provenanceType).toBe('unknown');
    expect(exerciseArt({exerciseId:'missing',artId:'rook-unknown'})).toBeNull();
  });
});
