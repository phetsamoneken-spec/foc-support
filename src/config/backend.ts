import {SUPABASE_FUNCTION_URL} from './supabase';
// Public web-app address, never a password or session credential.
export const DEPLOYED_BACKEND_URL = SUPABASE_FUNCTION_URL;
export const RETIRED_BACKENDS = ['https://script.google.com/macros/s/AKfycbzIogPuTdX44MPAxY2c2pP5eGWGuMwu7o-v-hvVL0YeNH-Vgmaxbvjfq-JVU76KfWEs/exec', 'https://script.google.com/macros/s/AKfycbzoEwQj59hMC33GrT7KTnX-5XM-TJDtdqSyU8W9d4PiVXf3JNG4gUrYaJu7_7ZsWtrD/exec', 'https://script.google.com/macros/s/AKfycbzytVQ8C11wxP7zi96XnJ1ce5nHBEDWvgtGeb7Dw5ahLSFng8skz287_TmcAFKEc6jC/exec', 'https://script.google.com/macros/s/AKfycbzPsHp8cblSRE8UYQXzGjSKFJgl85TqCn5Tj6kpl25-UmB-4p5zaazKXmEmV4n_WQYn/exec', 'https://script.google.com/macros/s/AKfycbwKHxLNnsWbxilUKk_JOes6pFfaqeKDEfn-fDqvIlkQmWy75Va1trTLa6F4ZEP_PmI4/exec', 'https://script.google.com/macros/s/AKfycbzqRrcFZcabexZCXH7okCcWOqTuJOc2CsBq4sKz7m9sLjBdz_bEYWslfsgl4-HWY-gT/exec', 'https://script.google.com/macros/s/AKfycbxt7FMAsx19pzuuMUB8xheP4aJtsZvjD_3W1qW5fjyZmvrgfIHCt7-TtC-QFwrCmiDu/exec'];
export function isRetiredBackend(value:unknown):boolean { return typeof value==='string' && RETIRED_BACKENDS.includes(value.trim()); }

const buildDefault = import.meta.env?.PROD ? DEPLOYED_BACKEND_URL : '';

// Production always uses one deployment-owned backend on every device.
// Explicit local endpoints remain available only for development/demo use.
export function resolveBackendUrl(saved: unknown, fallback = buildDefault): string {
  if(fallback)return fallback;
  return typeof saved === 'string' && saved.trim() && !isRetiredBackend(saved) ? saved.trim() : fallback;
}
