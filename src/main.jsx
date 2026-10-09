import React from 'react';
import { createRoot } from 'react-dom/client';
import { RookRoot } from './App.jsx';
import { bindNavigationFocus } from './navigationFocus.js';
import { bindPressFeedback } from './pressFeedback.js';
import { observeVisibleViewport } from './sheetVisibleViewport.js';
import { bindStandalonePageZoom } from './standalonePageZoom.js';
import { bindNativeShell } from './nativeShell.js';
import { registerWebServiceWorker } from './webServiceWorker.js';
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
import './standalonePageZoom.css';
import './pressFeedback.css';

// Set the installed-PWA policy before the first interactive app render.
const releasePageZoom = bindStandalonePageZoom();
if (import.meta.hot) import.meta.hot.dispose(releasePageZoom);

const releaseNavigationFocus = bindNavigationFocus();
if (import.meta.hot) import.meta.hot.dispose(releaseNavigationFocus);
const releasePressFeedback = bindPressFeedback();
if (import.meta.hot) import.meta.hot.dispose(releasePressFeedback);
// Observe before inputs can open a keyboard; retain geometry across sheets.
const releaseVisibleViewport = observeVisibleViewport();
if (import.meta.hot) import.meta.hot.dispose(releaseVisibleViewport);

const releaseNativeShell = bindNativeShell();
if (import.meta.hot) import.meta.hot.dispose(releaseNativeShell);
const releaseWebServiceWorker = registerWebServiceWorker();
if (import.meta.hot) import.meta.hot.dispose(releaseWebServiceWorker);

const root = createRoot(document.getElementById('root'));
// StartupBoundary owns journal recovery and hydration, including its retry and
// backup-import UI. The domain app cannot mount before that boundary is ready.
root.render(<React.StrictMode><RookRoot /></React.StrictMode>);
