import { registerSW } from 'virtual:pwa-register';
import { useGame } from '../store/game';

const JUST_UPDATED = 'app-just-updated';
let registration: ServiceWorkerRegistration | undefined;
let pending = false;

/** Reloading is safe when nothing is running and the game can be saved first. */
function safeToReload(): boolean {
  const { world, speed, eventOpen } = useGame.getState();
  if (!world) return true; // title screen: a new-game flow in progress is kept in local storage
  return speed === 0 && !eventOpen;
}

async function reload() {
  try {
    sessionStorage.setItem(JUST_UPDATED, '1');
  } catch {
    // Private mode: reload without the note.
  }
  // Save first so nothing since the last autosave is lost. Never let a slow save block the update.
  await Promise.race([useGame.getState().saveNow(), new Promise((r) => setTimeout(r, 2000))]).catch(() => undefined);
  window.location.reload();
}

/** Reload now if safe, otherwise as soon as it becomes safe. */
function reloadWhenSafe() {
  if (pending) return;
  pending = true;
  if (safeToReload()) return void reload();
  const timer = setInterval(() => {
    if (!safeToReload()) return;
    clearInterval(timer);
    void reload();
  }, 3000);
}

/** Ask the server for a new build. Returns true if one was found. */
export async function checkForUpdate(): Promise<boolean> {
  if (!registration) return false;
  try {
    await registration.update();
  } catch {
    return false; // offline
  }
  return !!(registration.installing || registration.waiting) || pending;
}

export function startUpdateChecks(onUpdated?: (version: string) => void) {
  if (import.meta.env.DEV || !('serviceWorker' in navigator)) return;
  let justUpdated = false;
  try {
    justUpdated = sessionStorage.getItem(JUST_UPDATED) === '1';
    sessionStorage.removeItem(JUST_UPDATED);
  } catch {
    // Storage blocked.
  }
  if (justUpdated) onUpdated?.(__APP_VERSION__);

  registerSW({
    immediate: true,
    onNeedReload: reloadWhenSafe,
    onRegisteredSW(_url, reg) {
      registration = reg;
      if (!reg) return;
      const check = () => void checkForUpdate();
      check(); // at start-up
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check(); // when the tab comes back
      });
    },
  });
}

export const appVersion = __APP_VERSION__;
