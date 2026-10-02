type CloudSession = {
  access_token: string;
  refresh_token?: string;
  user: { id: string; email?: string };
};

const URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, '');
const KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
const SESSION_KEY = 'berrex-cloud-session';

export const cloudConfigured = Boolean(URL && KEY);

function headers(token?: string) {
  return {
    apikey: KEY || '',
    Authorization: token ? 'Bearer ' + token : 'Bearer ' + (KEY || ''),
    'Content-Type': 'application/json',
  };
}

async function authRequest(path: string, body: Record<string, unknown>) {
  if (!URL || !KEY) throw new Error('Cloud sync is not configured.');
  const response = await fetch(URL + '/auth/v1/' + path, { method: 'POST', headers: headers(), body: JSON.stringify(body) });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error_description || data.msg || 'Authentication failed.');
  }
  return await response.json() as CloudSession;
}

export function getCloudSession(): CloudSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) as CloudSession : null;
  } catch {
    return null;
  }
}

function storeSession(session: CloudSession | null) {
  if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  else localStorage.removeItem(SESSION_KEY);
}

export async function signIn(email: string, password: string) {
  const session = await authRequest('token?grant_type=password', { email, password });
  storeSession(session);
  return session;
}

export async function signUp(email: string, password: string) {
  const session = await authRequest('signup', { email, password });
  if (session.access_token) storeSession(session);
  return session;
}

export function signOut() {
  const session = getCloudSession();
  if (URL && KEY && session?.access_token) {
    void fetch(URL + '/auth/v1/logout', { method: 'POST', headers: headers(session.access_token) }).catch(() => undefined);
  }
  storeSession(null);
}

async function rest(path: string, method: string, body?: unknown, token?: string) {
  if (!URL || !KEY) throw new Error('Cloud sync is not configured.');
  const response = await fetch(URL + '/rest/v1/' + path, {
    method,
    headers: { ...headers(token), Prefer: 'resolution=merge-duplicates,return=representation' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || data.error || 'Cloud request failed.');
  }
  return response.status === 204 ? null : await response.json();
}

export async function loadWorkspace() {
  const session = getCloudSession();
  if (!session) return null;
  const rows = await rest('berrex_workspaces?select=user_id,workspace_name,payload,updated_at&user_id=eq.' + encodeURIComponent(session.user.id) + '&limit=1', 'GET', undefined, session.access_token) as Array<{ workspace_name: string; payload: unknown }>;
  return rows[0] || null;
}

export async function saveWorkspace(workspaceName: string, payload: unknown) {
  const session = getCloudSession();
  if (!session) throw new Error('Sign in before syncing.');
  const rows = await rest('berrex_workspaces', 'POST', [{ user_id: session.user.id, workspace_name: workspaceName, payload, updated_at: new Date().toISOString() }], session.access_token) as unknown[];
  return rows?.[0] ?? null;
}

export async function loadCommunityIdeas() {
  const session = getCloudSession();
  if (!session) return [];
  return await rest('berrex_ideas?select=id,user_id,symbol,title,bias,note,created_at&order=created_at.desc&limit=50', 'GET', undefined, session.access_token) as Array<{ id: string; user_id: string; symbol: string; title: string; bias: string; note: string; created_at: string }>;
}

export async function publishCommunityIdea(input: { symbol: string; title: string; bias: string; note: string }) {
  const session = getCloudSession();
  if (!session) throw new Error('Sign in before publishing.');
  return await rest('berrex_ideas', 'POST', [{ user_id: session.user.id, ...input }], session.access_token);
}
