import test from 'node:test';
import assert from 'node:assert/strict';
import { ANON_KEY } from '../../remote.js';
import { createUser, hasAdminSession, signInAdmin, signOutAdmin } from './adminClient.js';

function storage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

test('a regular account cannot enter Royal administration', async () => {
  globalThis.sessionStorage = storage();
  globalThis.fetch = async (url) => {
    if (url.includes('/auth/v1/token')) return Response.json({
      access_token: 'ordinary-user-token', refresh_token: 'refresh-token', expires_in: 3600,
    });
    if (url.endsWith('/rest/v1/rpc/get_my_access')) return Response.json({ role: 'user', allowed: true });
    throw new Error(`Unexpected request: ${url}`);
  };
  await assert.rejects(signInAdmin('joueur@example.com', 'password123456'), /administrateur/);
  assert.equal(hasAdminSession(), false);
});

test('account creation uses the signed-in admin JWT, never a service key', async () => {
  globalThis.sessionStorage = storage();
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    if (url.includes('/auth/v1/token')) return Response.json({
      access_token: 'admin-user-token', refresh_token: 'refresh-token', expires_in: 3600,
    });
    if (url.endsWith('/rest/v1/rpc/get_my_access')) return Response.json({ role: 'admin', allowed: true });
    if (url.endsWith('/functions/v1/admin-create-user')) return Response.json({ user: { id: 'new-user-id' } }, { status: 201 });
    if (url.endsWith('/auth/v1/logout')) return Response.json({});
    throw new Error(`Unexpected request: ${url}`);
  };
  await signInAdmin('admin@example.com', 'password123456');
  await createUser('joueur@example.com', 'a-strong-password', 30);
  const request = calls.find(({ url }) => url.endsWith('/functions/v1/admin-create-user'));
  assert.equal(request.options.headers.Authorization, 'Bearer admin-user-token');
  assert.equal(request.options.headers.apikey, ANON_KEY);
  assert.deepEqual(JSON.parse(request.options.body), {
    email: 'joueur@example.com', password: 'a-strong-password', days: 30,
  });
  await signOutAdmin();
  assert.equal(hasAdminSession(), false);
});
