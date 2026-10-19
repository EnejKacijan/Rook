import React from 'react';
import './themeDiscovery.css';

export function ThemeNewBadge({ id, returning = false }) {
  return <span id={id} className="theme-new-badge">{returning ? 'Back' : 'New'}<span className="visually-hidden">{returning ? ' theme available again' : ' themes available'}</span></span>;
}
