import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { OperationsApp } from './operations/OperationsApp';

// The operations UI ships its own design system (see /DESIGN.md); the demo stylesheet is only
// loaded for the fictional local demo and desktop renderer builds.
if (import.meta.env.MODE === 'operations') document.title = 'Business Suite · Shared workspaces';
else await import('./styles.css');

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {import.meta.env.MODE === 'operations' ? <OperationsApp /> : <App />}
  </React.StrictMode>,
);

// Desktop binaries bundle the shell; their persistent profile stores the queue independently.
if (
  import.meta.env.PROD &&
  ['http:', 'https:'].includes(location.protocol) &&
  'serviceWorker' in navigator
) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js').catch(() => {
      console.warn(
        'Offline shell could not be prepared. Keep the app open until connectivity returns.',
      );
    });
  });
}
