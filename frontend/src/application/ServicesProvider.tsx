import type { ReactNode } from "react";
import type { AppServices } from "./ports.ts";

import { ServicesContext } from "./servicesContext.ts";

export function ServicesProvider({ services, children }: { services: AppServices; children: ReactNode }) {
  return <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>;
}

