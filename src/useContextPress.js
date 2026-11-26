import { useEffect, useRef } from 'react';

const holdMs = 480;
const movementLimit = 9;
const isUnavailable = element => !element.isConnected ||
  element.closest('[inert],[hidden],[aria-hidden="true"],:disabled');

export function useContextPress(onOpen) {
  const latest = useRef(onOpen);
  const contact = useRef(null);
  const keyboardAt = useRef(-Infinity);
  latest.current = onOpen;
  useEffect(() => () => contact.current?.(), []);

  if (!onOpen) return {};
  return {
    'aria-keyshortcuts': 'Shift+F10 ContextMenu',
    onPointerDown(event) {
      if (event.button !== 0 || !['touch','pen'].includes(event.pointerType) || event.isPrimary === false) return;
      contact.current?.();
      const { currentTarget: target, pointerId, clientX, clientY } = event;
      let opened = false, releaseTimer;
      const timer = setTimeout(() => {
        if (!latest.current || isUnavailable(target)) { clear(); return; }
        opened = true;
        latest.current(target);
      }, holdMs);
      const move = next => {
        if (next.pointerId === pointerId && !opened &&
            Math.hypot(next.clientX - clientX, next.clientY - clientY) > movementLimit) clear();
      };
      const end = next => {
        if (next.pointerId !== pointerId) return;
        // A release can generate a second click on either the trigger or the
        // newly opened sheet. A fresh contact always starts its own action.
        if (opened) releaseTimer = setTimeout(clear, 450);
        else clear();
      };
      const newContact = () => clear();
      const scroll = () => { if (!opened) clear(); };
      const blur = next => { if (next.target === window) clear(); };
      const click = next => {
        if (!opened || next.detail === 0) return;
        next.preventDefault();
        next.stopImmediatePropagation();
        clear();
      };
      const listeners = [
        [window,'pointermove',move], [window,'pointerup',end], [window,'pointercancel',end],
        [window,'pointerdown',newContact], [window,'click',click], [window,'blur',blur],
        [document,'scroll',scroll], [document,'visibilitychange',clear],
      ];
      function clear() {
        clearTimeout(timer);
        clearTimeout(releaseTimer);
        for (const [node, name, handler] of listeners) node.removeEventListener(name, handler, true);
        if (contact.current === clear) contact.current = null;
      }
      contact.current = clear;
      for (const [node, name, handler] of listeners) node.addEventListener(name, handler, true);
    },
    onContextMenu(event) {
      event.preventDefault();
      event.stopPropagation();
      const native = event.nativeEvent;
      if (contact.current || native.pointerType === 'touch' || native.pointerType === 'pen' ||
          native.sourceCapabilities?.firesTouchEvents || performance.now() - keyboardAt.current < 250) return;
      if (!isUnavailable(event.currentTarget)) onOpen(event.currentTarget);
    },
    onKeyDown(event) {
      if (event.key !== 'ContextMenu' && !(event.key === 'F10' && event.shiftKey)) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.repeat || isUnavailable(event.currentTarget)) return;
      keyboardAt.current = performance.now();
      onOpen(event.currentTarget);
    },
  };
}
