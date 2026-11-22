import type { PwaGateway, PwaState } from "../../application/ports.ts";

interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export interface PwaRegistrationOptions {
  onNeedRefresh(): void;
  onNeedReload(): void;
  onRegisteredSW(url: string, registration?: ServiceWorkerRegistration): void;
}

// Registration is injected so lifecycle behavior can be tested without a worker or virtual imports.
export function createBrowserPwa(register: (options: PwaRegistrationOptions) => () => Promise<void>): PwaGateway {
  const display = window.matchMedia("(display-mode: standalone)");
  const installed = () => display.matches || !!(navigator as Navigator & { standalone?: boolean }).standalone;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const safari = /Safari/.test(navigator.userAgent) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(navigator.userAgent);
  let state: PwaState = { online: navigator.onLine, installAvailable: false, installed: installed(),
    iosInstallHint: ios && safari && !installed(), updateAvailable: false, updating: false, error: "" };
  const listeners = new Set<() => void>();
  const change = (patch: Partial<PwaState>) => {
    if (!Object.entries(patch).some(([key, value]) => state[key as keyof PwaState] !== value)) return;
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener());
  };
  let prompt: InstallPrompt | undefined;
  let requestedUpdate = false;
  let activatedElsewhere = false;
  let registration: ServiceWorkerRegistration | undefined;
  let checking = false;
  const checkForUpdate = () => {
    if (!registration || !navigator.onLine || checking) return;
    checking = true;
    void registration.update().catch(() => {}).finally(() => { checking = false; });
  };
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    prompt = event as InstallPrompt;
    if (!installed()) change({ installAvailable: true });
  });
  const markInstalled = () => {
    prompt = undefined;
    change({ installed: true, installAvailable: false, iosInstallHint: false, error: "" });
  };
  window.addEventListener("appinstalled", markInstalled);
  display.addEventListener("change", () => {
    if (installed()) markInstalled();
    else change({ installed: false, iosInstallHint: ios && safari });
  });
  window.addEventListener("online", () => { change({ online: true }); checkForUpdate(); });
  window.addEventListener("offline", () => change({ online: false }));
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") checkForUpdate(); });
  // This adapter lives for the lifetime of the application, including the login screen.
  const activate = register({
    onNeedRefresh: () => change({ updateAvailable: true }),
    onNeedReload: () => {
      // Another tab may activate a worker. Never reload this tab without its own explicit click.
      activatedElsewhere = true;
      change({ updateAvailable: true });
      if (requestedUpdate) window.location.reload();
    },
    onRegisteredSW: (_url, value) => { registration = value; },
  });
  window.setInterval(checkForUpdate, 60 * 60 * 1000);

  return {
    getSnapshot: () => state,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    async install() {
      if (!prompt || state.installed) return;
      const current = prompt;
      prompt = undefined;
      change({ installAvailable: false, error: "" });
      try {
        await current.prompt();
        await current.userChoice;
      } catch {
        change({ error: "Не удалось открыть установку. Попробуйте установить приложение через меню браузера." });
      }
    },
    async update() {
      if (!state.online || !state.updateAvailable || state.updating) return;
      requestedUpdate = true;
      change({ updating: true, error: "" });
      const timeout = window.setTimeout(() => {
        requestedUpdate = false;
        change({ updating: false, error: "Обновление не завершилось. Попробуйте ещё раз." });
      }, 15000);
      try {
        if (activatedElsewhere) window.location.reload();
        else await activate();
      } catch {
        window.clearTimeout(timeout);
        requestedUpdate = false;
        change({ updating: false, error: "Не удалось обновить приложение. Попробуйте ещё раз." });
      }
    },
  };
}
