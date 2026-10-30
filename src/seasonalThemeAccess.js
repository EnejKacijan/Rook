import {availableSeasonalThemes,seasonalThemeInWindow,SHOW_ALL_SEASONS} from './seasonalThemes.js';

// Capability input comes from the subscription owner, never from a theme
// preference, a device-clock expiry guess or a locally stored Pro boolean.
// The current free web release does not supply it and keeps its old behavior.
export function seasonalAccessPolicy(value) {
  return {enabled:value?.enabled===true,status:['active','free'].includes(value?.status)?value.status:'unknown'};
}
export function seasonalThemeReleased(season,date=new Date()) {
  if(!Number.isInteger(season?.releaseYear))return true;
  const day=`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  return day>=`${season.releaseYear}-${season.window.start}`;
}
export function seasonalThemeAvailability(season,{access,date=new Date(),showAll=SHOW_ALL_SEASONS}={}) {
  const policy=seasonalAccessPolicy(access);
  if(season&&showAll&&!policy.enabled)return 'free';
  if(!season||!seasonalThemeReleased(season,date))return 'unavailable';
  if(seasonalThemeInWindow(season,date))return 'free';
  if(!policy.enabled)return showAll?'free':'season-ended';
  if(policy.status==='active')return 'pro';
  return policy.status==='free'?'pro-required':'unknown';
}
export const seasonalThemeCanApply=availability=>availability==='free'||availability==='pro';
export function seasonalThemeChoices(currentPalette,date,seasons,access,showAll=SHOW_ALL_SEASONS) {
  const policy=seasonalAccessPolicy(access);
  if(!policy.enabled)return {current:availableSeasonalThemes(currentPalette,date,seasons,showAll),yearRound:[]};
  const released=seasons.filter(season=>seasonalThemeReleased(season,date));
  return {current:released.filter(season=>seasonalThemeInWindow(season,date)),
    yearRound:released.filter(season=>!seasonalThemeInWindow(season,date))};
}
