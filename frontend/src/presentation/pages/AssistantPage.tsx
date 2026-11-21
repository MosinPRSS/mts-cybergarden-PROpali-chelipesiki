import type { Incident } from "../../domain/incidents/types.ts";
import { AiOverview } from "../components/dashboard/AiOverview.tsx";

export function AssistantPage({ incidents, now, onSelectIncident }: {
  incidents: Incident[];
  now: number;
  onSelectIncident: (incident: Incident) => void;
}) {
  return <>
    <div className="page-heading"><div>
      <h1>Просроченные инциденты</h1>
    </div></div>
    <AiOverview incidents={incidents} now={now} mode="overdue" onSelectIncident={onSelectIncident} />
  </>;
}
