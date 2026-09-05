import React from 'react';
import { createRoot } from 'react-dom/client';
import { RookRoot } from './App.jsx';
import { recoverInterruptedRestore } from './restoreTransaction.js';
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

if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));

async function bootRook() {
  const root = createRoot(document.getElementById('root'));
  try {
    await recoverInterruptedRestore();
    root.render(<React.StrictMode><RookRoot /></React.StrictMode>);
  } catch {
    root.render(
      <main className="fatal-error-screen" role="alert">
        <p className="eyebrow">ROOK</p>
        <h1>ROOK couldn’t safely reopen your data.</h1>
        <p>Keep this tab open and try reloading the app.</p>
        <button className="button primary" onClick={() => location.reload()}>
          RELOAD APP
        </button>
      </main>,
    );
  }
}

bootRook();
