import { useSyncExternalStore } from "react";
import { useServices } from "./servicesContext.ts";
import type { PwaState } from "./ports.ts";

const unsupported: PwaState = { online: true, installAvailable: false, iosInstallHint: false,
  installed: false, updateAvailable: false, updating: false, error: "" };
const getUnsupported = () => unsupported;
const subscribeUnsupported = () => () => {};

export function usePwa() {
  const { pwa } = useServices();
  const state = useSyncExternalStore(pwa?.subscribe ?? subscribeUnsupported, pwa?.getSnapshot ?? getUnsupported, getUnsupported);
  return { ...state, install: pwa?.install, update: pwa?.update };
}
