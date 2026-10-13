import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
vi.mock('./aiService.js', async original => ({
  ...await original(),
  AIService: { status: vi.fn(), reviewPhysique: vi.fn() },
  preparePhysiquePhoto: vi.fn(async () => 'data:image/jpeg;base64,synthetic'),
}));
import { PhysiqueReview } from './App.jsx';
import { AIService, preparePhysiquePhoto } from './aiService.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root, host, onUse, onClose;
const profile = { goal: 'Build muscle', experience: 'Intermediate' };
const success = {
  status: 'success', summary: 'Possible priorities.',
  suggestions: [
    { priorityId: 'chest', label: 'Chest', priorityLevel: 'moderate', reason: 'Optional focus.' },
    { priorityId: 'quads', label: 'Quads', priorityLevel: 'moderate', reason: 'Optional focus.' },
  ],
};
const button = name => [...host.querySelectorAll('button')].find(control => control.textContent.trim() === name);
const click = name => act(async () => button(name).click());
async function mount() {
  await act(async () => root.render(<PhysiqueReview profile={profile} onUse={onUse} onClose={onClose} />));
}
async function addPhoto() {
  const input = host.querySelector('input[type="file"]');
  Object.defineProperty(input, 'files', { configurable: true, value: [new File(['synthetic'], 'front.jpg', { type: 'image/jpeg' })] });
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
}
async function reachUpload() { await mount(); await click('CONTINUE'); await addPhoto(); }
beforeEach(() => {
  AIService.status.mockReset().mockResolvedValue({ available: true });
  AIService.reviewPhysique.mockReset().mockResolvedValue(success);
  preparePhysiquePhoto.mockClear(); onUse = vi.fn(); onClose = vi.fn();
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); });

it('checks availability before asking for photos; disabled AI never uploads or analyzes', async () => {
  AIService.status.mockResolvedValue({ available: false, reason: 'config_missing' });
  await mount();
  expect(host.textContent).toContain('Photo review is not available for this app yet.');
  expect(host.textContent).not.toContain("couldn't get a useful physique review");
  expect(host.querySelector('input[type="file"]')).toBeNull();
  expect(button('CONTINUE')).toBeUndefined();
  await click('CHECK AGAIN');
  expect(AIService.status).toHaveBeenCalledTimes(2);
  expect(AIService.reviewPhysique).not.toHaveBeenCalled();
  expect(preparePhysiquePhoto).not.toHaveBeenCalled();
  await click('SKIP'); expect(onClose).toHaveBeenCalledOnce(); expect(onUse).not.toHaveBeenCalled();
});
it('rechecks configuration, then requires explicit Continue and Review Photos to send', async () => {
  AIService.status.mockResolvedValueOnce({ available: false, reason: 'config_missing' });
  await mount(); await click('CHECK AGAIN');
  expect(button('CONTINUE')).toBeDefined(); expect(AIService.reviewPhysique).not.toHaveBeenCalled();
  await click('CONTINUE'); await addPhoto();
  expect(host.textContent).toContain('front.jpg · ready');
  expect(AIService.reviewPhysique).not.toHaveBeenCalled();
  await click('REVIEW PHOTOS'); expect(AIService.reviewPhysique).toHaveBeenCalledOnce();
  expect(onUse).not.toHaveBeenCalled();
  await click('USE THESE PRIORITIES');
  expect(onUse).toHaveBeenCalledWith({ suggested: success.suggestions, confirmed: success.suggestions });
});
it.each([
  [{ code: 'timeout' }, 'Photo review took too long.'],
  [new TypeError('private connection detail'), 'Photo review could not connect.'],
  [{ status: 502, code: 'ai-failed' }, 'Photo review is temporarily unavailable.'],
  [{ code: 'invalid-physique-review' }, 'Photo review is temporarily unavailable.'],
  [{ code: 'sign-in-required' }, 'Sign in to use photo review.'],
  [{ status: 429, code: 'rate-limit' }, 'Photo review’s usage limit was reached.'],
])('technical failure %j never blames photo quality; explicit retry uses the same photos', async (failure, title) => {
  await reachUpload();
  AIService.reviewPhysique.mockRejectedValueOnce(failure instanceof Error ? failure : Object.assign(new Error('PRIVATE provider diagnostic'), failure));
  await click('REVIEW PHOTOS');
  expect(host.querySelector('h1').textContent).toBe(title);
  expect(host.textContent).not.toContain("couldn't get a useful physique review");
  expect(host.textContent).not.toContain('PRIVATE');
  expect(button('TRY DIFFERENT PHOTOS')).toBeUndefined();
  expect(onUse).not.toHaveBeenCalled(); expect(onClose).not.toHaveBeenCalled();
  const firstPhotos = AIService.reviewPhysique.mock.calls[0][1];
  await click('TRY AGAIN');
  expect(AIService.reviewPhysique).toHaveBeenCalledTimes(2);
  expect(AIService.reviewPhysique.mock.calls[1]).toEqual([profile, firstPhotos]);
  expect(preparePhysiquePhoto).toHaveBeenCalledOnce();
  expect(host.querySelector('h1').textContent).toBe('Possible areas to emphasize');
});
it('configuration becomes unavailable after upload: rechecking does not send photos or lose them', async () => {
  await reachUpload();
  AIService.reviewPhysique.mockRejectedValueOnce({ code: 'config_missing' });
  await click('REVIEW PHOTOS');
  expect(host.querySelector('h1').textContent).toBe('Photo review is not available for this app yet.');
  await click('CHECK AGAIN');
  expect(host.textContent).toContain('front.jpg · ready');
  expect(AIService.reviewPhysique).toHaveBeenCalledOnce();
  await click('REVIEW PHOTOS'); expect(AIService.reviewPhysique).toHaveBeenCalledTimes(2);
});
it('only a genuine insufficient result asks for clearer photos, preserving temporary selections', async () => {
  await reachUpload();
  AIService.reviewPhysique.mockResolvedValueOnce({ status: 'insufficient', suggestions: [], retryMessage: 'Try clearer framing.' });
  await click('REVIEW PHOTOS');
  expect(host.querySelector('h1').textContent).toBe("We couldn't get a useful physique review from these photos.");
  expect(host.textContent).toContain('Try clearer framing.');
  await click('TRY DIFFERENT PHOTOS');
  expect(host.textContent).toContain('front.jpg · ready');
  expect(AIService.reviewPhysique).toHaveBeenCalledOnce(); expect(onUse).not.toHaveBeenCalled();
});
it('oversize requests offer change photos, not a quality judgment or automatic resubmission', async () => {
  await reachUpload(); AIService.reviewPhysique.mockRejectedValueOnce({ status: 413 });
  await click('REVIEW PHOTOS'); expect(host.textContent).toContain('too large to review together');
  await click('CHANGE PHOTOS'); expect(host.textContent).toContain('front.jpg · ready');
  expect(AIService.reviewPhysique).toHaveBeenCalledOnce();
});
it('rapid Review Photos taps start one request, and choosing priorities never applies an AI result', async () => {
  await reachUpload(); let reject;
  AIService.reviewPhysique.mockImplementationOnce(() => new Promise((resolve, fail) => { reject = fail; }));
  await act(async () => { const review = button('REVIEW PHOTOS'); review.click(); review.click(); });
  expect(AIService.reviewPhysique).toHaveBeenCalledOnce();
  await act(async () => reject({ code: 'timeout' }));
  await click('CHOOSE PRIORITIES MYSELF');
  expect(onClose).toHaveBeenCalledOnce(); expect(onUse).not.toHaveBeenCalled();
});
it('a failed initial status check does not claim any photos were selected or analyzed', async () => {
  AIService.status.mockResolvedValue({ available: false, reason: 'timeout' });
  await mount(); expect(host.textContent).toContain('Photo review took too long.');
  expect(host.querySelector('.offline-banner').textContent).not.toContain('selected photos');
  expect(AIService.reviewPhysique).not.toHaveBeenCalled();
});
