const env = import.meta.env ?? process.env;

export const SUPABASE_URL = env.VITE_SUPABASE_URL;
export const ANON_KEY = env.VITE_SUPABASE_PUBLISHABLE_KEY;

export async function callRoyalRpc(name, signal) {
  let response;
  try {
    response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
      method: 'POST',
      mode: 'cors',
      redirect: 'error',
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
      signal,
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new Error('Connexion au plateau Royal indisponible. Réessaie dans un instant.');
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    if (payload?.code === 'PGRST202') throw new Error('Le plateau Royal partagé attend sa migration Supabase.');
    throw new Error('Le service Royal est indisponible. Réessaie dans un instant.');
  }
  return payload;
}
