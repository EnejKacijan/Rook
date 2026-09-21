// Shared explicit navigation for the current Profile hub and Today overflow.
export async function openFirstRunLanding(page) {
 // A saved unfinished profile now resumes the questionnaire. Theme-seeded QA
 // fixtures are saved profiles too; use its real Back path before testing the
 // Landing choices rather than making startup discard a valid draft.
 await page.locator('.first-run-page:not([hidden])').waitFor();
 const resumed=page.locator('.first-run-page:not([hidden]) .onboarding-personal');
 if(await resumed.isVisible())await resumed.getByRole('button',{name:'Back to plan options',exact:true}).click();
 await page.locator('.first-run-page:not([hidden]) .entry-screen').waitFor();
}

// Auto-advancing answers paint their acknowledgement before changing steps.
// The same two choices suppress a trailing double tap for 350ms across steps.
export async function waitForOnboardingStep(page, step) {
 await page.getByText(`STEP ${step}/8`,{exact:true}).waitFor();
 await page.locator('.first-run-step-motion > .onboarding').evaluate(async node=>{
  await Promise.all(node.getAnimations({subtree:true}).map(animation=>animation.finished.catch(()=>{})));
 });
}
export async function chooseOnboardingAnswer(page, name, nextStep) {
 await page.getByRole('button',{name,exact:typeof name==='string'}).click();
 const start=await page.evaluate(()=>performance.now());
 await waitForOnboardingStep(page,nextStep);
 await page.waitForFunction(start=>performance.now()-start>=350,start);
}

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
  await page.locator('.today-actions-sheet').getByRole('button',{name:/^Start (another )?freestyle workout$/}).click();
 }
 await entry.click();
}
export async function openAdjustWeek(page) {
 await page.getByRole('button',{name:'Today options',exact:true}).click();
 await page.getByRole('button',{name:'Adjust week',exact:true}).click();
}
