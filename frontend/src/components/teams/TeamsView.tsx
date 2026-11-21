import { useMemo, useState } from "react";
import type { Incident, Team } from "../../types";
import { TEAMS_DATA } from "../../data/teams";
import { TeamCard } from "./TeamCard";
import { AssignIncidentModal } from "./AssignIncidentModal";
import { Icon } from "../common/Icon";
import { isIncidentActive, getIncidentGroups } from "../../lib";
import { getRecommendedIncidentsForTeam } from "../../lib/teams";

interface TeamsViewProps {
  incidents: Incident[];
  onAssignTeam?: (incidentId: string, teamName: string) => void;
  onSelectIncident: (incident: Incident) => void;
}

export function TeamsView({
  incidents,
  onAssignTeam,
  onSelectIncident,
}: TeamsViewProps) {
  const [search, setSearch] = useState("");
  const [filterMode, setFilterMode] = useState<"all" | "duty" | "active_incidents" | "has_recommendations">("all");
  const [selectedTeamForAssign, setSelectedTeamForAssign] = useState<Team | null>(null);

  // Unassigned / Coordinator incidents count
  const coordinatorIncidents = useMemo(
    () => incidents.filter((i) => isIncidentActive(i) && getIncidentGroups(i).includes("На координаторах")),
    [incidents]
  );

  // Total active incidents across teams
  const totalActiveIncidents = useMemo(
    () => incidents.filter(isIncidentActive).length,
    [incidents]
  );

  // Teams with recommendations
  const teamsWithRecommendations = useMemo(() => {
    const set = new Set<string>();
    TEAMS_DATA.forEach((team) => {
      const recs = getRecommendedIncidentsForTeam(team, incidents);
      if (recs.length > 0) set.add(team.id);
    });
    return set;
  }, [incidents]);

  // Teams with active incidents
  const teamsWithActiveIncidents = useMemo(() => {
    const set = new Set<string>();
    incidents.filter(isIncidentActive).forEach((inc) => {
      set.add(inc.team);
    });
    return set;
  }, [incidents]);

  // Filtered teams list
  const filteredTeams = useMemo(() => {
    return TEAMS_DATA.filter((team) => {
      // 1. Text Search
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchesName = team.name.toLowerCase().includes(q);
        const matchesDomain = team.domain.toLowerCase().includes(q);
        const matchesLead = team.lead.name.toLowerCase().includes(q);
        const matchesServices = team.services.some((s) => s.toLowerCase().includes(q));
        const matchesTags = team.tags.some((t) => t.toLowerCase().includes(q));
        if (!matchesName && !matchesDomain && !matchesLead && !matchesServices && !matchesTags) {
          return false;
        }
      }

      // 2. Filter mode
      if (filterMode === "duty" && team.status !== "on_duty") {
        return false;
      }
      if (filterMode === "active_incidents" && !teamsWithActiveIncidents.has(team.name)) {
        return false;
      }
      if (filterMode === "has_recommendations" && !teamsWithRecommendations.has(team.id)) {
        return false;
      }

      return true;
    });
  }, [search, filterMode, teamsWithActiveIncidents, teamsWithRecommendations]);

  return (
    <div className="teams-view">
      {/* PAGE HEADER */}
      <div className="teams-header-row">
        <div>
          <div className="breadcrumb-line">
            <span>Оперативный центр</span>
            <span>/</span>
            <span>Маршрутизация</span>
          </div>
          <h1>Команды реагирования</h1>
          <p className="page-desc">
            Реестр дежурных инженерных смен и сервисных команд. Роль координатора позволяет привязывать инциденты и маршрутизировать задачи с помощью ИИ-ассистента.
          </p>
        </div>
      </div>

      {/* KPI METRICS OVERVIEW */}
      <div className="teams-stats-grid">
        <div className="stat-card">
          <div className="stat-card-title">
            <Icon name="users" size={17} />
            <span>Всего команд</span>
          </div>
          <div className="stat-card-value">{TEAMS_DATA.length}</div>
          <div className="stat-card-sub">Инженерные центры МТС</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-title">
            <span className="dot-green" />
            <span>На дежурстве 24/7</span>
          </div>
          <div className="stat-card-value">
            {TEAMS_DATA.filter((t) => t.status === "on_duty").length}
          </div>
          <div className="stat-card-sub">Готовы к приёму задач</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-title">
            <Icon name="activity" size={17} />
            <span>Инцидентов в работе</span>
          </div>
          <div className="stat-card-value">{totalActiveIncidents}</div>
          <div className="stat-card-sub">Активные на всех линиях</div>
        </div>

        <div className="stat-card highlight-coord">
          <div className="stat-card-title">
            <Icon name="spark" size={17} />
            <span>На координаторах</span>
          </div>
          <div className="stat-card-value">{coordinatorIncidents.length}</div>
          <div className="stat-card-sub">Ожидают маршрутизации</div>
        </div>
      </div>

      {/* AI ASSISTANT DISPATCH ADVISOR BANNER */}
      {coordinatorIncidents.length > 0 && (
        <div className="coordinator-ai-dispatch-banner">
          <div className="banner-icon-col">
            <Icon name="spark" size={24} />
          </div>
          <div className="banner-content-col">
            <h3>ИИ-Ассистент координатора готов к маршрутизации</h3>
            <p>
              В группе «На координаторах» находится <b>{coordinatorIncidents.length}</b> активных инцидента.
              Ассистент сопоставил сервисы, ключевые слова ошибок и теги ответственности с профилями команд.
              Нажмите «Привязать инцидент» в карточке соответствующей команды для мгновенного назначения.
            </p>
          </div>
        </div>
      )}

      {/* TOOLBAR CONTROLS */}
      <div className="teams-toolbar">
        <div className="teams-search-box">
          <Icon name="search" size={16} />
          <input
            type="text"
            placeholder="Поиск по команде, домену, сервису, дежурному или тегу..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button className="clear-search-btn" onClick={() => setSearch("")}>
              <Icon name="close" size={14} />
            </button>
          )}
        </div>

        <div className="teams-filter-pills">
          <button
            className={`pill-btn ${filterMode === "all" ? "active" : ""}`}
            onClick={() => setFilterMode("all")}
          >
            Все команды <span>{TEAMS_DATA.length}</span>
          </button>
          <button
            className={`pill-btn ${filterMode === "duty" ? "active" : ""}`}
            onClick={() => setFilterMode("duty")}
          >
            На дежурстве <span>{TEAMS_DATA.filter((t) => t.status === "on_duty").length}</span>
          </button>
          <button
            className={`pill-btn ${filterMode === "active_incidents" ? "active" : ""}`}
            onClick={() => setFilterMode("active_incidents")}
          >
            С инцидентами в работе <span>{teamsWithActiveIncidents.size}</span>
          </button>
          <button
            className={`pill-btn ${filterMode === "has_recommendations" ? "active" : ""}`}
            onClick={() => setFilterMode("has_recommendations")}
          >
            <Icon name="spark" size={13} />
            Есть рекомендации ИИ <span>{teamsWithRecommendations.size}</span>
          </button>
        </div>
      </div>

      {/* TEAMS GRID */}
      <div className="teams-cards-grid">
        {filteredTeams.map((team) => (
          <TeamCard
            key={team.id}
            team={team}
            incidents={incidents}
            onOpenAssignModal={onAssignTeam ? setSelectedTeamForAssign : undefined}
            onSelectIncident={onSelectIncident}
          />
        ))}
      </div>

      {/* ASSIGN INCIDENT MODAL */}
      {selectedTeamForAssign && onAssignTeam && (
        <AssignIncidentModal
          team={selectedTeamForAssign}
          incidents={incidents}
          onClose={() => setSelectedTeamForAssign(null)}
          onAssign={onAssignTeam}
          onSelectIncident={onSelectIncident}
        />
      )}
    </div>
  );
}
