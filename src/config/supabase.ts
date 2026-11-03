// Public client configuration. Privileged keys exist only in the Edge Function.
export const SUPABASE_URL = 'https://itenbxivivbffsjvhduh.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_C1p3ocSO1iy-Wy37yvE69w_c3zb00TB';
export const SUPABASE_FUNCTION_URL = SUPABASE_URL + '/functions/v1/foc-support';
export const SUPABASE_DASHBOARD_URL = 'https://supabase.com/dashboard/project/itenbxivivbffsjvhduh';
export function isSupabaseBackend(endpoint: string) { return endpoint === SUPABASE_FUNCTION_URL; }
export function isBackendEndpoint(endpoint: string) { return isSupabaseBackend(endpoint) || /^https:\/\/script\.google\.com\/macros\/s\/[^/?#]+\/exec$/.test(endpoint); }
export function backendMessage(message:string,endpoint:string) {return isSupabaseBackend(endpoint)?message.replace(/Google Sheets?|\bSheets?\b/g,'Supabase'):message;}
