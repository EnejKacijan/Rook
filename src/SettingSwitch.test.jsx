import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { SettingSwitch } from './SettingSwitch.jsx';
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let host, root;
afterEach(() => { act(() => root?.unmount()); host?.remove(); });
function render(props) { host = document.createElement('div'); document.body.append(host); root = createRoot(host); act(() => root.render(<SettingSwitch {...props} />)); }
it('keeps the help separate from the switch name and associates it as a description', () => {
  const change = vi.fn(); render({ label: 'Allow page zoom', help: 'Pinch to enlarge text.', checked: false, onChange: change });
  const input = host.querySelector('input'), copy = host.querySelector('.setting-switch-copy');
  expect(copy.querySelector('strong').textContent).toBe('Allow page zoom');
  expect(copy.querySelector('small').id).toBe(input.getAttribute('aria-describedby'));
  expect(input.getAttribute('aria-label')).toBe('Allow page zoom');
  act(() => copy.closest('label').click()); expect(change).toHaveBeenCalledExactlyOnceWith(true);
});
it('keeps accessory help independently clickable and a unique label connection for each consumer', () => {
  const change = vi.fn(); render({ label: 'Track RIR', accessory: <button>What is RIR?</button>, checked: false, onChange: change });
  act(() => host.querySelector('button').click()); expect(change).not.toHaveBeenCalled();
  const input = host.querySelector('input'); expect(host.querySelector('.setting-switch-text').htmlFor).toBe(input.id);
  act(() => host.querySelector('.setting-switch-text').click()); expect(change).toHaveBeenCalledExactlyOnceWith(true);
});
