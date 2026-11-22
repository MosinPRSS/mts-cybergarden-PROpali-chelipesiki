import { useEffect, useRef } from "react";
import type { Incident } from "../../domain/incidents/types.ts";
import type { SummaryWindow } from "../../domain/analysis.ts";
import { summaryCandidates } from "../../domain/incidents/summary.ts";
import { useServices } from "../servicesContext.ts";

// Track the three displayed entries independently of navigation and AI refreshes.
export function useFocusAlerts(incidents: Incident[], now: number, minutes: SummaryWindow, initialized: boolean) {
  const { sound } = useServices();
  const previous = useRef<{ minutes: SummaryWindow; ids: Set<string> } | null>(null);
  const ids = summaryCandidates(incidents, "upcoming", now, minutes).slice(0, 3).map((item) => item.id);
  const revision = JSON.stringify(ids);
  useEffect(() => {
    if (!initialized) { previous.current = null; return; }
    const ids: string[] = JSON.parse(revision);
    const before = previous.current;
    previous.current = { minutes, ids: new Set(ids) };
    // Initial loading and changing the period establish a silent baseline.
    if (before?.minutes === minutes && ids.some((id) => !before.ids.has(id))) sound.play("focus");
  }, [revision, minutes, initialized, sound]);
}
