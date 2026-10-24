import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// Desktop binaries bundle the shell; their persistent profile stores the queue independently.
if (
  import.meta.env.PROD &&
  ['http:', 'https:'].includes(location.protocol) &&
  'serviceWorker' in navigator
) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => {
      console.warn(
        'Offline shell could not be prepared. Keep the app open until connectivity returns.',
      );
    });
  });
}
