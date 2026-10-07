/**
 * API calls always go to /api on the page's own origin. In production Vercel
 * proxies /api/* to the Render backend (vercel.json), which keeps the session
 * cookie first-party. Pointing the frontend straight at the backend's URL
 * (e.g. via a VITE_API_URL build variable) makes the browser drop the cookie,
 * so every request after login would be rejected — don't.
 */
export const API_URL = ''
