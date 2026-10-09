import { afterEach, expect, it, vi } from 'vitest';
import { PERSONAL_THEME_PREFERENCE, readPersonalThemePreference, savePersonalThemePreference } from './personalThemePreference.js';
import { normalizePersonalTheme, selectPersonalThemePalette, updatePersonalTheme, resetPersonalThemePalette } from './personalThemes.js';
afterEach(() => { vi.restoreAllMocks(); localStorage.removeItem(PERSONAL_THEME_PREFERENCE); });
it('Apply/reload persists every family and only bounded theme metadata', () => {
  let theme=updatePersonalTheme({basePalette:'ocean',appearance:'system'},{accent:'ocean-teal',base:'cool'});
  theme=updatePersonalTheme(selectPersonalThemePalette(theme,'plum'),{accent:'plum-mauve',base:'warm'});
  savePersonalThemePreference({...theme,profile:'excluded'});expect(readPersonalThemePreference()).toEqual(theme);
  const stored=JSON.parse(localStorage.getItem(PERSONAL_THEME_PREFERENCE));
  expect(Object.keys(stored)).toEqual(['schemaVersion','basePalette','appearance','paletteCustomizations']);
  expect(Object.keys(stored.paletteCustomizations)).toHaveLength(6);expect(stored.schemaVersion).toBe(2);
  expect(selectPersonalThemePalette(readPersonalThemePreference(),'ocean')).toMatchObject({accent:'ocean-teal',base:'cool'});
  savePersonalThemePreference(null);expect(readPersonalThemePreference()).toBeNull();
});
it.each([{basePalette:'ocean',overrides:{accent:'champagne',base:'warm'},appearance:'dark'},{basePalette:'ocean',accent:'champagne',base:'warm',appearance:'dark'}])('legacy Ocean + Gold keeps Ocean and migrates its default shade without a write: %j',value=>{
  const raw=JSON.stringify(value);localStorage.setItem(PERSONAL_THEME_PREFERENCE,raw);
  const write=vi.spyOn(Storage.prototype,'setItem'),theme=readPersonalThemePreference();
  expect(theme).toEqual(normalizePersonalTheme({basePalette:'ocean',accent:'ocean',base:'warm',appearance:'dark'}));
  expect(write).not.toHaveBeenCalled();expect(localStorage.getItem(PERSONAL_THEME_PREFERENCE)).toBe(raw);
  savePersonalThemePreference(theme);expect(JSON.parse(localStorage.getItem(PERSONAL_THEME_PREFERENCE)).schemaVersion).toBe(2);
});
it('identity-less old mixed pairs use registered accent as family evidence, preserving tone and appearance',()=>{
  localStorage.setItem(PERSONAL_THEME_PREFERENCE,JSON.stringify({basePalette:null,overrides:{accent:'plum',base:'warm'},appearance:'dark'}));
  expect(readPersonalThemePreference()).toEqual(normalizePersonalTheme({basePalette:'plum',base:'warm',appearance:'dark'}));
});
it('reset persists only the active family reset while another customized family survives',()=>{
  let theme=updatePersonalTheme({basePalette:'plum',appearance:'dark'},{accent:'plum-mauve',base:'warm'});
  theme=updatePersonalTheme(selectPersonalThemePalette(theme,'ocean'),{accent:'ocean-teal',base:'warm'});
  savePersonalThemePreference(resetPersonalThemePalette(theme));const saved=readPersonalThemePreference();
  expect(saved).toMatchObject({basePalette:'ocean',accent:'ocean',base:'cool'});expect(selectPersonalThemePalette(saved,'plum')).toMatchObject({accent:'plum-mauve',base:'warm'});
});
it.each([
  {basePalette:'unknown',overrides:{},appearance:'dark'},
  {basePalette:'plum',overrides:{accent:'url(invalid)'},appearance:'dark'},
  {basePalette:'plum',overrides:{base:'invalid'},appearance:'dark'},
  {basePalette:'plum',overrides:[],appearance:'dark'},
  {basePalette:'plum',overrides:{history:{}},appearance:'dark'},
  {basePalette:null,overrides:{},appearance:'dark'},
  {schemaVersion:99,basePalette:'plum',appearance:'dark',paletteCustomizations:{}},
  {schemaVersion:2,basePalette:'plum',appearance:'dark',paletteCustomizations:{plum:{accent:'url(invalid)'}}},
  {schemaVersion:2,basePalette:'plum',appearance:'dark',paletteCustomizations:{unknown:{accent:'plum'}}},
])('ignores damaged or unsupported metadata %j',value=>{localStorage.setItem(PERSONAL_THEME_PREFERENCE,JSON.stringify(value));expect(readPersonalThemePreference()).toBeNull();});
it.each(['bad json','null','[]','{"accent":"url(invalid)","base":"warm","appearance":"dark"}'])('ignores damaged stored input %s',raw=>{localStorage.setItem(PERSONAL_THEME_PREFERENCE,raw);expect(readPersonalThemePreference()).toBeNull();});
it('can read unavailable storage but propagates write failure to the sheet',()=>{
  const storage={getItem(){throw Error('blocked');},setItem(){throw Error('full');}};
  expect(readPersonalThemePreference(storage)).toBeNull();expect(()=>savePersonalThemePreference({basePalette:'forest'},storage)).toThrow('full');
});
