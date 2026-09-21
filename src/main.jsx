import React from 'react';
import { createRoot } from 'react-dom/client';
import { RookRoot } from './App.jsx';
import { bindNavigationFocus } from './navigationFocus.js';
import { observeVisibleViewport } from './sheetVisibleViewport.js';
import './styles.css';
import './overrides.css';
import './overlay.css';
import './calendar.css';
import './workout-controls.css';
import './onboarding-controls.css';
import './import-plan.css';
import './coach.css';
import './landing.css';
import './theme.css';
import './navigationFocus.css';
import './activeLoggerTouch.css';

const releaseNavigationFocus = bindNavigationFocus();
if (import.meta.hot) import.meta.hot.dispose(releaseNavigationFocus);
// Observe before inputs can open a keyboard; retain geometry across sheets.
const releaseVisibleViewport = observeVisibleViewport();
if (import.meta.hot) import.meta.hot.dispose(releaseVisibleViewport);

if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));

const root = createRoot(document.getElementById('root'));
// StartupBoundary owns journal recovery and hydration, including its retry and
// backup-import UI. The domain app cannot mount before that boundary is ready.
root.render(<React.StrictMode><RookRoot /></React.StrictMode>);
