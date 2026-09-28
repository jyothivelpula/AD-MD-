// In local dev this falls back to localhost:4001. In production (Vercel), set
// NEXT_PUBLIC_API_URL to the deployed Railway API's public URL (e.g.
// https://your-api.up.railway.app) in the Vercel project's Environment Variables.
export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4001';

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('token');
}

export async function apiFetch(path: string, options: RequestInit = {}) {
  const token = getToken();
  // When uploading a file, the body is a FormData — the browser must set its own
  // multipart Content-Type (with boundary), so we must NOT force application/json.
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const headers: Record<string, string> = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { ...options, headers });
  } catch {
    throw new Error(`Cannot reach API at ${API_URL}. Is the backend running on port 4001?`);
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({} as { message?: string | string[] }));
    const message = Array.isArray(body.message) ? body.message.join(', ') : body.message;
    throw new Error(message || `Request failed: ${res.status}`);
  }

  if (res.status === 204) return null;
  return res.json();
}
