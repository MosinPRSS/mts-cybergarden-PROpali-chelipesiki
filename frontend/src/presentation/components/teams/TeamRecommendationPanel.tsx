import type { Incident } from "../../../domain/incidents/types.ts";
import type { TeamCandidate } from "../../../domain/teams/types.ts";
import { useTeamRecommendation } from "../../../application/analysis/useTeamRecommendation.ts";
import { TEAMS_DATA } from "../../../data/teams.ts";
import { Icon } from "../common/Icon.tsx";

const candidates: TeamCandidate[] = TEAMS_DATA.filter((team) => team.id !== "coordinators")
  .map(({ id, name, domain, description, services, tags }) => ({ id, name, domain, description, services, skills: tags }));

export function TeamRecommendationPanel({ incident, saving, onAssign }: {
  incident: Incident;
  saving?: boolean;
  onAssign: (id: string, team: string, selectedWithAi?: boolean) => void;
}) {
  const { result, loading, error, recommend } = useTeamRecommendation(incident, candidates);
  const selected = result?.team;
  return <div className="drawer-ai-rec-box" aria-label="ИИ-подбор команды" aria-busy={loading}>
    <div className="ai-rec-title"><Icon name="spark" size={14} /><span>ИИ-подбор команды</span></div>
    <div className="ai-rec-body">
      {result && <>
        {selected && <div className="team-fit-result">
          <strong>{selected.name}</strong>
          <b title="Оценка соответствия компетенциям, не вероятность решения">{result.match_percent}%</b>
        </div>}
        <p>{result.reason}</p>
        {selected && <details className="team-fit-criteria">
          <summary>Критерии</summary>
          <div>Продукт/сервис: {result.criteria.product_service}% <small>· вес 40%</small></div>
          <div>Компетенции: {result.criteria.technical_skills}% <small>· вес 40%</small></div>
          <div>Ответственность: {result.criteria.responsibility}% <small>· вес 20%</small></div>
        </details>}
        {selected && <button className="ai-rec-assign-btn" disabled={saving} onClick={() => onAssign(incident.id, selected.name, true)}>
          <Icon name="check" size={13} />{selected.name === incident.team ? "Подтвердить выбор ИИ" : "Назначить команду"}
        </button>}
      </>}
      {error && <p role="alert">{error}</p>}
      <button className="secondary-button team-fit-request" disabled={loading || saving} onClick={recommend}>
        {loading ? "Подбираем…" : result ? "Повторить подбор" : "Подобрать команду"}
      </button>
    </div>
  </div>;
}
