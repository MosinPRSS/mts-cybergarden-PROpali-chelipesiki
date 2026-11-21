import { createContext, useContext } from "react";
import type { AppServices } from "./ports.ts";

export const ServicesContext = createContext<AppServices | null>(null);

export function useServices(): AppServices {
  const services = useContext(ServicesContext);
  if (!services) throw new Error("ServicesProvider is required");
  return services;
}
