// In dev, this stays empty and requests to "/api/..." go through Vite's
// proxy (see vite.config.ts) to localhost:8787. In production, the frontend
// and backend are deployed separately (Vercel + Render) — set
// VITE_API_BASE_URL to the deployed backend's URL so requests go there
// instead of trying to hit the frontend's own domain.
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

export function apiUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}
