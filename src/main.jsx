import React from 'react';
import { createRoot } from 'react-dom/client';
import { RookRoot } from './App.jsx';
import { recoverInterruptedRestore } from './restoreTransaction.js';
import { StartupRecovery } from './StartupBoundary.jsx';
import { bindNavigationFocus } from './navigationFocus.js';
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

const releaseNavigationFocus = bindNavigationFocus();
if (import.meta.hot) import.meta.hot.dispose(releaseNavigationFocus);

if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));

const root = createRoot(document.getElementById('root'));
async function bootRook() {
  root.render(<StartupRecovery loading/>);
  try {
    await recoverInterruptedRestore();
    root.render(<React.StrictMode><RookRoot /></React.StrictMode>);
  } catch {
    root.render(<StartupRecovery restoreError onRetry={bootRook}/>);
  }
}

bootRook();
