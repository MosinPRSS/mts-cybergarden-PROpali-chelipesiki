import type { Incident } from "../incidents/types.ts";
import type { Team } from "./types.ts";
import { isIncidentActive } from "../incidents/groups.ts";

export interface TeamMatchResult {
  team: Team;
  score: number;
  reason: string;
}

export interface IncidentMatchResult {
  incident: Incident;
  score: number;
  reason: string;
}

/**
 * Calculates a match score (0-100) between an incident and a team based on:
 * - Product name / Service name
 * - Header and description keywords
 * - Team competencies and domain tags
 */
export function matchIncidentToTeam(incident: Incident, team: Team): { score: number; reason: string } {
  // If incident is already assigned to this team
  if (incident.team === team.name) {
    return { score: 100, reason: "Инцидент уже назначен на эту команду" };
  }

  // Do not proactively recommend coordinator dispatch team for execution
  if (team.id === "coordinators") {
    return { score: 10, reason: "Группа первичной диспетчеризации координаторов" };
  }

  let score = 0;
  const reasons: string[] = [];

  const textToSearch = [
    incident.service,
    incident.productName,
    incident.sourceService,
    incident.area,
    incident.summary,
    incident.description,
    ...(incident.tags || []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  // 1. Direct service / product match (Strong signal: +60)
  for (const s of team.services) {
    const sLower = s.toLowerCase();
    if (incident.service && incident.service.toLowerCase().includes(sLower)) {
      score += 65;
      reasons.push(`Сервис «${incident.service}» входит в зону ответственности`);
      break;
    } else if (incident.productName && incident.productName.toLowerCase().includes(sLower)) {
      score += 60;
      reasons.push(`Продукт «${incident.productName}» обслуживается командой`);
      break;
    } else if (textToSearch.includes(sLower)) {
      score += 35;
      reasons.push(`Упоминание компонента «${s}» в инциденте`);
      break;
    }
  }

  // 2. Tag / Tech competencies match (Signal: +15-25)
  for (const tag of team.tags) {
    const tLower = tag.toLowerCase();
    if (textToSearch.includes(tLower)) {
      score += 15;
      reasons.push(`Компетенция [${tag}]`);
      if (score >= 95) break;
    }
  }

  // 3. Keyword / Domain heuristics
  const domainLower = team.domain.toLowerCase();
  if (
    (domainLower.includes("банк") && (textToSearch.includes("банк") || textToSearch.includes("счет") || textToSearch.includes("дбо"))) ||
    (domainLower.includes("безопасн") && (textToSearch.includes("ddos") || textToSearch.includes("уязвим") || textToSearch.includes("парол") || textToSearch.includes("auth"))) ||
    (domainLower.includes("инфраструктур") && (textToSearch.includes("сервер") || textToSearch.includes("cpu") || textToSearch.includes("диск") || textToSearch.includes("памят"))) ||
    (domainLower.includes("платёж") && (textToSearch.includes("плат") || textToSearch.includes("сбп") || textToSearch.includes("транзак"))) ||
    (domainLower.includes("коммуникац") && (textToSearch.includes("видео") || textToSearch.includes("звон") || textToSearch.includes("конференц")))
  ) {
    score += 20;
    reasons.push(`Соответствие домену «${team.domain}»`);
  }

  const finalScore = Math.min(score, 98);
  const primaryReason =
    reasons.length > 0
      ? reasons.join(" · ")
      : `Рекомендация по профилю сервиса ${incident.service || "инцидента"}`;

  return { score: finalScore, reason: primaryReason };
}

/**
 * Returns ranked list of teams recommended for a specific incident
 */
export function getRecommendedTeamsForIncident(
  incident: Incident,
  teams: Team[]
): TeamMatchResult[] {
  return teams
    .map((team) => {
      const { score, reason } = matchIncidentToTeam(incident, team);
      return { team, score, reason };
    })
    .filter((res) => res.score >= 25 && res.team.id !== "coordinators")
    .sort((a, b) => b.score - a.score);
}

/**
 * Returns active incidents that are recommended to be assigned to this team
 * (especially those currently sitting in coordinator dispatch or needing re-assignment)
 */
export function getRecommendedIncidentsForTeam(
  team: Team,
  incidents: Incident[]
): IncidentMatchResult[] {
  if (team.id === "coordinators") {
    return [];
  }

  return incidents
    .filter((inc) => (isIncidentActive(inc) || inc.status === "Research") && inc.team !== team.name)
    .map((incident) => {
      const { score, reason } = matchIncidentToTeam(incident, team);
      return { incident, score, reason };
    })
    .filter((res) => res.score >= 40)
    .sort((a, b) => b.score - a.score);
}
