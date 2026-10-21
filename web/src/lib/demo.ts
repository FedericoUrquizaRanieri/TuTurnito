/** One-click demo accounts only exist after `npm run seed`, so they're a dev-only convenience. */
export const SHOW_DEMO = import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEMO === 'true';
