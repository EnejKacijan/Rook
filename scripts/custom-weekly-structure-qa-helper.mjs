import { customWorkoutDraft, customWorkoutText, customWorkoutMuscles } from '../src/customWeeklyWorkouts.js';
import { CUSTOM_FOCUSES } from '../src/customTrainingStructure.js';

// Exercise the same multi-select controls as a production user.
export async function fillCustomWorkoutBlocks(page, value) {
  const blocks = page.locator('.custom-workout-block');
  const frequency = await blocks.count();
  const rows = Array.isArray(value)
    ? Array.from({ length: frequency }, (_, i) => ({ focus: value[i] || '', weekday: null }))
    : customWorkoutDraft(value, frequency).slice(0, frequency);
  for (let index = 0; index < frequency; index++) {
    const block = blocks.nth(index), toggle = block.locator('.custom-workout-toggle');
    const keys = customWorkoutMuscles(rows[index].focus);
    if (!keys) throw new Error(`QA sample must list explicit muscle groups: ${rows[index].focus}`);
    if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
    const legacySwitch = block.locator('.custom-switch-focus');
    if (await legacySwitch.count()) await legacySwitch.click();
    const musclesSelected = block.locator('.custom-workout-picker > .custom-muscle-choices button[aria-pressed="true"]');
    while (await musclesSelected.count()) await musclesSelected.first().click();
    for (const key of keys) {
      await block.locator(`button[data-focus="${key}"]`).click();
    }
    rows[index].focus = keys.map(key => CUSTOM_FOCUSES[key].label).join(' & ');
  }
  return customWorkoutText(rows, frequency);
}

export async function readCustomWorkoutBlocks(page) {
  return page.locator('.custom-workout-copy > span').evaluateAll(nodes => nodes.map(node =>
    node.textContent === 'Choose muscle groups' ? '' : node.textContent.split(' · ').join(' & ')));
}
