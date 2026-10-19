import { expect, it } from 'vitest';
import { availableThemeReleases, readSeenThemeReleases, saveSeenThemeReleases, THEME_DISCOVERY_KEY } from './themeDiscovery.js';

const date = value => new Date(`${value}T12:00:00`);
const palette = [{id:'forest'}, {id:'ocean'}];
const halloween = {id:'halloween',releaseYear:2026,window:{start:'10-01',end:'11-02'}};
const newYear = {id:'new-year',releaseYear:2026,window:{start:'12-28',end:'01-07'}};

it('announces unseen curated palettes indefinitely, and only the registered current seasons', () => {
  expect(availableThemeReleases(date('2026-10-19'), palette, [halloween])).toEqual([
    {id:'palette:forest:v1',paletteIds:['forest']}, {id:'palette:ocean:v1',paletteIds:['ocean']},
    {id:'season:halloween:v1:2026',paletteIds:['halloween'],returning:false},
  ]);
  expect(availableThemeReleases(date('2026-10-19'), palette, []).map(item=>item.id)).toEqual(['palette:forest:v1','palette:ocean:v1']);
  expect(availableThemeReleases(date('2026-10-18'), palette, [halloween]).map(item=>item.id)).toEqual(['season:halloween:v1:2026']);
  expect(availableThemeReleases(date('2026-11-02'), palette, [halloween])).toHaveLength(3);
  expect(availableThemeReleases(date('2026-11-03'), palette, [halloween]).map(item=>item.id)).toEqual(['palette:forest:v1','palette:ocean:v1']);
  expect(availableThemeReleases(date('2026-10-19'), [], [])).toEqual([]);
});
it('uses one occurrence across December–January, with a fresh ID next year', () => {
  const december=availableThemeReleases(date('2026-12-28'),palette,[newYear]);
  expect(december.at(-1)).toEqual({id:'season:new-year:v1:2026',paletteIds:['new-year'],returning:false});
  expect(availableThemeReleases(date('2027-01-07'),palette,[newYear])).toEqual(december);
  expect(availableThemeReleases(date('2027-01-08'),[],[newYear])).toEqual([]);
  expect(availableThemeReleases(date('2027-12-28'),palette,[newYear]).at(-1)).toMatchObject({id:'season:new-year:v1:2027',returning:true});
  expect(availableThemeReleases(date('2027-10-19'),palette,[halloween]).at(-1).id).toBe('season:halloween:v1:2027');
});
it('stores only bounded release IDs in a separate local preference', () => {
  localStorage.setItem('rook.local-review.personal-theme.v1','unchanged');
  saveSeenThemeReleases(new Set(['palette:ocean:v1','season:halloween:v1:2026']));
  expect([...readSeenThemeReleases()]).toEqual(['palette:ocean:v1','season:halloween:v1:2026']);
  expect(localStorage.getItem('rook.local-review.personal-theme.v1')).toBe('unchanged');
  localStorage.setItem(THEME_DISCOVERY_KEY,JSON.stringify([{},null,4,'valid']));
  expect([...readSeenThemeReleases()]).toEqual(['valid']);
  localStorage.setItem(THEME_DISCOVERY_KEY,'broken');expect(readSeenThemeReleases().size).toBe(0);
});
it('never blocks themes when discovery storage is unavailable', () => {
  const storage={getItem(){throw Error('blocked');},setItem(){throw Error('full');}};
  expect(readSeenThemeReleases(storage).size).toBe(0);
  expect(()=>saveSeenThemeReleases(new Set(['a']),storage)).not.toThrow();
});
