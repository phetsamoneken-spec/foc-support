// Deployment-owned switch. Browser storage and query parameters cannot select a backend.
export const dataBackend = import.meta.env?.VITE_DATA_BACKEND === 'supabase' ? 'supabase' : 'gas';
export const supabaseConfig = {
  url: import.meta.env?.VITE_SUPABASE_URL || 'https://itenbxivivbffsjvhduh.supabase.co',
  // Publishable client key. Authorization is enforced by Auth, RLS and checked RPCs.
  key: import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_C1p3ocSO1iy-Wy37yvE69w_c3zb00TB',
};
