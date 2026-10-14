// Ajoute ou modifie les codes promo dans ce fichier.
const affiliateLink = 'https://reffpa.com/L?tag=d_6040870m_1599c_&site=6040870&ad=1599';

const PROMOS = {
  'enj55-a1b2c3d4-e5f6-7890-abcd-ef1234567890': {
    code: 'ENJ55', type: 'bot', affiliateLink, theme: 'blue',
    colors: { primary: '#168fff', primaryDark: '#0874db', accent: '#35a7ff', glow1: '#148cff', glow2: '#00d084', success: '#00d084' },
  },
  'vert-b2c3d4e5-f6a7-8901-bcde-f12345678901': {
    code: '8A30', type: 'bot', affiliateLink, theme: 'green',
    colors: { primary: '#10b981', primaryDark: '#059669', accent: '#34d399', glow1: '#10b981', glow2: '#3b82f6', success: '#10b981' },
  },
  'violet-c3d4e5f6-a7b8-9012-cdef-123456789012': {
    code: 'BZX10', type: 'bot', affiliateLink, theme: 'purple',
    colors: { primary: '#8b5cf6', primaryDark: '#7c3aed', accent: '#a78bfa', glow1: '#8b5cf6', glow2: '#ec4899', success: '#a78bfa' },
  },
  'orange-d4e5f6a7-b8c9-0123-defa-234567890123': {
    code: 'IAPRONO', type: 'bot', affiliateLink, theme: 'orange',
    colors: { primary: '#f59e0b', primaryDark: '#d97706', accent: '#fbbf24', glow1: '#f59e0b', glow2: '#ef4444', success: '#fbbf24' },
  },
  'violet-a7b8c9d0-e1f2-3456-abcd-56789012345': {
    code: 'GLORIA4', type: 'bot', affiliateLink, theme: 'purple',
    colors: { primary: '#8b5cf6', primaryDark: '#7c3aed', accent: '#a78bfa', glow1: '#8b5cf6', glow2: '#ec4899', success: '#a78bfa' },
  },
  'rouge-e5f6a7b8-c9d0-1234-efab-345678901234': {
    code: 'MCD20', type: 'bot', affiliateLink, theme: 'red',
    colors: { primary: '#ef4444', primaryDark: '#dc2626', accent: '#f87171', glow1: '#ef4444', glow2: '#f59e0b', success: '#f87171' },
  },
  'cyan-f6a7b8c9-d0e1-2345-bcde-4567890123': {
    code: 'AGBE228', type: 'bot', affiliateLink, theme: 'cyan',
    colors: { primary: '#06b6d4', primaryDark: '#0891b2', accent: '#22d3ee', glow1: '#06b6d4', glow2: '#8b5cf6', success: '#22d3ee' },
  },
  'rose-a7b8c9d0-e1f2-3456-cdef-567890123456': {
    code: 'RIZ79', type: 'bot', affiliateLink, theme: 'rose',
    colors: { primary: '#f43f5e', primaryDark: '#e11d48', accent: '#fb7185', glow1: '#f43f5e', glow2: '#f59e0b', success: '#fb7185' },
  },
  'teal-b8c9d0e1-f2a3-4567-defa-678901234567': {
    code: '77WEL', type: 'bot', affiliateLink, theme: 'teal',
    colors: { primary: '#14b8a6', primaryDark: '#0d9488', accent: '#2dd4bf', glow1: '#14b8a6', glow2: '#6366f1', success: '#2dd4bf' },
  },
};

const DEFAULT_PROMO_ID = 'orange-d4e5f6a7-b8c9-0123-defa-234567890123';

function getPromoFromSearch(search) {
  const params = new URLSearchParams(search);
  const value = (params.get('promo') || '').trim();
  const id = Object.hasOwn(PROMOS, value) ? value : DEFAULT_PROMO_ID;
  return { id, promo: PROMOS[id] };
}

export { PROMOS, DEFAULT_PROMO_ID, getPromoFromSearch };
