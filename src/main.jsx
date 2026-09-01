import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
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
createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>);
