// Shared explicit navigation for the current Profile hub and Today overflow.
export async function openProfileArea(page, area) {
 const titles={program:'Program',training:'Training setup',preferences:'Preferences',data:'Data & backup'};
 const current=page.locator('.profile-subpage-header').getByText(titles[area],{exact:true});
 if(await current.isVisible())return;
 const entry=page.locator(`[data-profile-area="${area}"]`);
 if(!await entry.isVisible()){
  const back=page.getByRole('button',{name:'Back to Profile',exact:true});
  if(await back.isVisible())await back.click();
  else {
   const profileTab=page.getByRole('button',{name:'PROFILE',exact:true});
   if(await profileTab.isVisible())await profileTab.click();
  }
  await entry.waitFor();
 }
 await entry.click();
}
export async function startFreestyle(page) {
 const entry=page.locator('.freestyle-entry').getByRole('button',{name:'Start freestyle workout',exact:true});
 if(!await entry.isVisible()){
  await page.getByRole('button',{name:'Today options',exact:true}).click();
  await page.locator('.today-actions-sheet').getByRole('button',{name:'Start freestyle workout',exact:true}).click();
 }
 await entry.click();
}
export async function openAdjustWeek(page) {
 await page.getByRole('button',{name:'Today options',exact:true}).click();
 await page.getByRole('button',{name:'Adjust week',exact:true}).click();
}
