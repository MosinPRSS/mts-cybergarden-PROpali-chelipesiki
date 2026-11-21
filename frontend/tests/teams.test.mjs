import test from "node:test";
import assert from "node:assert/strict";

import { TEAMS_DATA } from "../src/data/teams.ts";
import {
  matchIncidentToTeam,
  getRecommendedTeamsForIncident,
  getRecommendedIncidentsForTeam,
} from "../src/domain/teams/matching.ts";

test("TEAMS_DATA contains required teams with valid schema", () => {
  assert.ok(TEAMS_DATA.length >= 8, "Expected at least 8 predefined teams");
  for (const team of TEAMS_DATA) {
    assert.ok(team.id, "Team must have an id");
    assert.ok(team.name, "Team must have a name");
    assert.ok(team.domain, "Team must have a domain");
    assert.ok(team.lead.name, "Team must have a lead name");
    assert.ok(Array.isArray(team.services), "Team must have a services array");
    assert.ok(["on_duty", "busy", "standby"].includes(team.status), "Valid status");
  }
});

test("matchIncidentToTeam gives high score for matching service name", () => {
  const bankTeam = TEAMS_DATA.find((t) => t.id === "bank-systems");
  assert.ok(bankTeam, "Bank systems team exists");

  const bankIncident = {
    id: "INC0001",
    service: "МТС Банк",
    productName: "МТС Банк",
    area: "Платежи",
    summary: "Сбой шлюза эквайринга",
    team: "КЦ ИТ Координаторы Массовых Инцидентов",
    is_active: true,
  };

  const match = matchIncidentToTeam(bankIncident, bankTeam);
  assert.ok(match.score >= 60, `Expected score >= 60, got ${match.score}`);
  assert.ok(match.reason.includes("МТС Банк") || match.reason.includes("зону ответственности"));
});

test("getRecommendedTeamsForIncident prioritizes the most relevant team", () => {
  const infraIncident = {
    id: "INC0002",
    service: "База данных",
    productName: "МТС Облако",
    area: "PostgreSQL Cluster",
    summary: "Высокая утилизация дискового пространства и CPU на сервере",
    team: "КЦ ИТ Координаторы Массовых Инцидентов",
    is_active: true,
  };

  const recommendations = getRecommendedTeamsForIncident(infraIncident, TEAMS_DATA);
  assert.ok(recommendations.length > 0, "Expected recommendations");
  assert.equal(recommendations[0].team.id, "infra");
});

test("getRecommendedIncidentsForTeam finds active incidents matching team domain", () => {
  const bankTeam = TEAMS_DATA.find((t) => t.id === "bank-systems");
  const incidents = [
    {
      id: "INC0010",
      service: "МТС Банк",
      summary: "Ошибки в ДБО для юридических лиц",
      team: "КЦ ИТ Координаторы Массовых Инцидентов",
      is_active: true,
    },
    {
      id: "INC0011",
      service: "Видеостриминг",
      summary: "Задержки в трансляциях",
      team: "КЦ ИТ Координаторы Массовых Инцидентов",
      is_active: true,
    },
  ];

  const recs = getRecommendedIncidentsForTeam(bankTeam, incidents);
  assert.equal(recs.length, 1);
  assert.equal(recs[0].incident.id, "INC0010");
});
