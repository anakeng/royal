import { createClient } from 'npm:@supabase/supabase-js@2.116.0'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
})

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response(null, { headers: cors })
  if (request.method !== 'POST') return reply(405, { error: 'METHOD_NOT_ALLOWED' })
  const authorization = request.headers.get('Authorization') || ''
  if (!/^Bearer \S+$/.test(authorization)) return reply(401, { error: 'AUTH_REQUIRED' })
  const url = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  try {
    const { data: identity, error: authError } = await service.auth.getUser(authorization.slice(7))
    if (authError || !identity.user) return reply(401, { error: 'AUTH_REQUIRED' })
    const { data: admin, error: profileError } = await service.from('profiles')
      .select('role, is_blocked').eq('id', identity.user.id).single()
    if (profileError || admin?.role !== 'admin' || admin.is_blocked) return reply(403, { error: 'ADMIN_REQUIRED' })

    // Bound body size without trusting Content-Length.
    const reader = request.body?.getReader()
    if (!reader) return reply(400, { error: 'INVALID_BODY' })
    const chunks: Uint8Array[] = []
    let length = 0
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      length += value.length
      if (length > 8192) { await reader.cancel(); return reply(413, { error: 'BODY_TOO_LARGE' }) }
      chunks.push(value)
    }
    let body
    try { body = JSON.parse(await new Blob(chunks).text()) }
    catch { return reply(400, { error: 'INVALID_JSON' }) }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return reply(400, { error: 'INVALID_BODY' })
    const { email, password, days = 30 } = body
    if (Object.keys(body).some(key => !['email', 'password', 'days'].includes(key)) ||
      typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      typeof password !== 'string' || password.length < 12 || password.length > 128 ||
      !Number.isInteger(days) || days < 1 || days > 3650) return reply(400, { error: 'INVALID_FIELDS' })

    // New accounts are blocked by the database trigger until activation succeeds.
    const { data, error } = await service.auth.admin.createUser({
      email: email.trim().toLowerCase(), password, email_confirm: true,
    })
    if (error || !data.user) return reply(400, { error: 'ACCOUNT_CREATION_FAILED' })
    const caller = createClient(url, serviceKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    // Rechecks the caller's current administrator status, and writes the audit.
    const { data: profile, error: activationError } = await caller.rpc('admin_set_user_access', {
      p_user_id: data.user.id, p_days: days, p_blocked: false,
    })
    if (activationError) {
      const { error: cleanupError } = await service.auth.admin.deleteUser(data.user.id)
      return reply(500, { error: cleanupError ? 'ACCOUNT_BLOCKED_ACTIVATION_FAILED' : 'ACTIVATION_FAILED' })
    }
    return reply(201, { user: profile })
  } catch {
    return reply(500, { error: 'SERVER_ERROR' })
  }
})
