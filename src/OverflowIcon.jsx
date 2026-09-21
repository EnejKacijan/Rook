import React from 'react';
import './overflowIcon.css';

/** Decorative glyph only; the existing button owns its name, target and action. */
export function OverflowIcon() {
  return <svg className="rook-overflow-icon" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
    <circle cx="6" cy="12" r="1.8"/>
    <circle cx="12" cy="12" r="1.8"/>
    <circle cx="18" cy="12" r="1.8"/>
  </svg>;
}
