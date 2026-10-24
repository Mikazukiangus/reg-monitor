import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { browserLogger } from '../shared/logging';
import { ErrorBoundary } from './components/ErrorBoundary';
import { reportUncaughtErrors } from './lib/errorReporting';

// Errors are reported to the server's error tracking (src/lib/errorReporting.ts)
reportUncaughtErrors();
createRoot(document.getElementById('root')!).render(<ErrorBoundary><App /></ErrorBoundary>);

// Install to home screen and offline use (public/sw.js). Not registered in
// development, where Vite serves unhashed files that must not be cached.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(err => browserLogger.warn('[RegSonar] Service worker not registered:', err));
  });
}
