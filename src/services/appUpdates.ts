export const APP_VERSION = '2026.11.10.10';

let registration: ServiceWorkerRegistration | undefined;
let updateReady = false;
const listeners = new Set<() => void>();

export function isAppUpdateReady() { return updateReady; }
export function subscribeToAppUpdates(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function announceAppUpdate() {
  updateReady = true;
  listeners.forEach(listener => listener());
}

export async function checkForAppUpdate() {
  const current = registration || (await navigator.serviceWorker?.getRegistration());
  if (current) await current.update();
}

export function startAppUpdateChecks(current: ServiceWorkerRegistration) {
  registration = current;
  let checking = false;
  const check = async () => {
    if (document.visibilityState === 'hidden' || checking) return;
    checking = true;
    try { await checkForAppUpdate(); }
    catch (error) { console.warn('Could not check for app updates:', error); }
    finally { checking = false; }
  };
  void check();
  window.addEventListener('focus', check);
  document.addEventListener('visibilitychange', check);
  const timer = window.setInterval(check, 60_000);
  return () => {
    window.clearInterval(timer);
    window.removeEventListener('focus', check);
    document.removeEventListener('visibilitychange', check);
  };
}
