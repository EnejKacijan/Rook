import React, { useLayoutEffect, useReducer, useRef } from 'react';

export function SearchInput({ value, onClear, onChange, onCompositionStart, onCompositionEnd,
  resultsTarget, resultsRoot = '.exercise-search-sheet', resultsSelector = '[data-exercise-search-scroll]', searchScope = 'default', ...props }) {
  const inputRef = useRef(null);
  const pending = useRef(null), composing = useRef(false), compositionStartValue = useRef(null);
  const [, compositionAccepted] = useReducer(count => count + 1, 0);
  const accept = next => {
    if (next !== value) pending.current = { value: next, scope: searchScope };
  };
  // Run after React has projected the accepted query into the results. Only a
  // user edit owns this reset; viewport/layout changes and scope returns do not.
  useLayoutEffect(() => {
    const edit = pending.current;
    if (!edit || composing.current) return;
    if (edit.scope !== searchScope) { pending.current = null; return; }
    if (edit.value !== value) return;
    pending.current = null;
    const target = resultsTarget?.() || inputRef.current?.closest(resultsRoot)?.querySelector(resultsSelector);
    if (target) target.scrollTop = 0;
  });
  return <span className="rook-search-field">
    <input {...props} ref={inputRef} type="search" value={value}
      onChange={event => { accept(event.target.value); onChange?.(event); }}
      onCompositionStart={event => { composing.current = true; compositionStartValue.current = value; onCompositionStart?.(event); }}
      onCompositionEnd={event => {
        composing.current = false;
        if (event.currentTarget.value === compositionStartValue.current) pending.current = null;
        // Some engines already delivered the final onChange during composition.
        // Re-emit the accepted value so the layout effect also runs in that case.
        if (pending.current) { pending.current.value = event.currentTarget.value; onChange?.(event); }
        compositionAccepted();
        onCompositionEnd?.(event);
      }} />
    {Boolean(value) && <button type="button" className="rook-search-clear" aria-label="Clear search"
      onMouseDown={event => event.preventDefault()}
      onClick={() => { accept(''); onClear(); inputRef.current?.focus(); }}>×</button>}
  </span>;
}
