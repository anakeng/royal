import { ANON_KEY, SUPABASE_URL } from './remote.js';

const STORAGE_KEY = 'royal-admin-session-v1';
let session = null;

function saveSession(value) {
  session = value;
  try {
    if (value) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch { /* The current tab can still use its in-memory session. */ }
}

function readSession() {
  if (session) return session;
  try {
    const value = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || 'null');
    if (typeof value?.access_token === 'string' && typeof value?.refresh_token === 'string'
      && Number.isFinite(value.expires_at)) {
      session = value;
      return value;
    }
  } catch { /* A corrupt session is treated as signed out. */ }
  saveSession(null);
  return null;
}

async function responseJson(response) {
  const body = await response.json().catch(() => ({}));
  if (response.ok) return body;
  const code = body?.error || body?.message || body?.msg || body?.code;
  if (response.status === 401 || response.status === 403) {
    throw new Error(code === 'ADMIN_REQUIRED'
      ? 'Accès administrateur requis.'
      : 'Session expirée ou accès refusé. Reconnecte-toi.');
  }
  if (code === 'INVALID_FIELDS') throw new Error('Vérifie l’e-mail, le mot de passe et les jours.');
  if (code === 'ACCOUNT_CREATION_FAILED') throw new Error('Cet e-mail existe déjà ou le mot de passe a été refusé.');
  if (code === 'ACCOUNT_BLOCKED_ACTIVATION_FAILED') {
    throw new Error('Compte créé mais non activé. Actualise la liste.');
  }
  if (code === 'ACTIVATION_FAILED') throw new Error('Activation impossible. La création a été annulée.');
  throw new Error(typeof code === 'string' && /^[A-Z_]+$/.test(code)
    ? `Opération refusée : ${code}.` : 'Opération non confirmée. Actualise et réessaie.');
}

function toSession(body) {
  if (typeof body?.access_token !== 'string' || typeof body?.refresh_token !== 'string'
    || !Number.isFinite(body.expires_in)) throw new Error('Session invalide.');
  return {
    access_token: body.access_token,
    refresh_token: body.refresh_token,
    expires_at: Date.now() + body.expires_in * 1000,
  };
}

async function token() {
  const current = readSession();
  if (!current) throw new Error('Connecte-toi à l’administration.');
  if (current.expires_at > Date.now() + 60000) return current.access_token;
  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: current.refresh_token }),
    });
    const refreshed = toSession(await responseJson(response));
    saveSession(refreshed);
    return refreshed.access_token;
  } catch {
    saveSession(null);
    throw new Error('Session expirée. Reconnecte-toi.');
  }
}

async function api(path, options = {}) {
  const accessToken = await token();
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    ...options,
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });
  return { response, data: await responseJson(response) };
}

export async function signInAdmin(email, password) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email.trim(), password }),
  });
  if (!response.ok) throw new Error('E-mail ou mot de passe incorrect.');
  saveSession(toSession(await responseJson(response)));
  try { await requireAdmin(); }
  catch (error) { saveSession(null); throw error; }
}

export async function requireAdmin() {
  const { data } = await api('/rest/v1/rpc/get_my_access', { method: 'POST', body: '{}' });
  if (data?.role !== 'admin' || data?.allowed !== true) {
    saveSession(null);
    throw new Error('Accès administrateur requis.');
  }
  return data;
}

export function hasAdminSession() { return Boolean(readSession()); }

export async function signOutAdmin() {
  const current = readSession();
  saveSession(null);
  if (!current) return;
  await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${current.access_token}` },
  }).catch(() => {});
}

export async function listUsers(page) {
  const offset = page * 50;
  const query = new URLSearchParams({
    select: 'id,email,role,is_blocked,access_expires_at,created_at,device_limit',
    order: 'created_at.desc,id.asc', limit: '50', offset: String(offset),
  });
  const { response, data } = await api(`/rest/v1/profiles?${query}`, {
    headers: { Prefer: 'count=exact' },
  });
  const total = Number(response.headers.get('content-range')?.split('/')[1]);
  return { users: data, total: Number.isFinite(total) ? total : data.length };
}

export async function createUser(email, password, days) {
  await api('/functions/v1/admin-create-user', {
    method: 'POST', body: JSON.stringify({ email: email.trim(), password, days }),
  });
}

export async function setUserAccess(userId, days = null, blocked = null) {
  await api('/rest/v1/rpc/admin_set_user_access', {
    method: 'POST', body: JSON.stringify({ p_user_id: userId, p_days: days, p_blocked: blocked }),
  });
}

export async function listDevices(userId) {
  const query = new URLSearchParams({
    select: 'id,user_id,name,revoked,created_at,last_seen_at',
    user_id: `eq.${userId}`, order: 'last_seen_at.desc',
  });
  return (await api(`/rest/v1/user_devices?${query}`)).data;
}

export async function setDeviceLimit(userId, limit) {
  await api('/rest/v1/rpc/admin_set_device_limit', {
    method: 'POST', body: JSON.stringify({ p_user_id: userId, p_limit: limit }),
  });
}

export async function revokeDevice(deviceId) {
  await api('/rest/v1/rpc/admin_revoke_device', {
    method: 'POST', body: JSON.stringify({ p_device_id: deviceId }),
  });
}
