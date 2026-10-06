import { createApp } from '../server.js';

// Vercel function serving every /api/* route (see the rewrite in vercel.json).
// The frontend is built by `vite build` and served as static files.
export default createApp();
