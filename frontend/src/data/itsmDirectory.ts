import type { Team, TeamMember } from "../domain/teams/types.ts";

export type ItsmTeamProfile = Omit<Team, "source" | "members" | "lead"> & {
  lead: Omit<TeamMember, "externalId" | "availability">;
};

const names = ["Алексей", "Мария", "Иван", "Анна", "Дмитрий", "Елена", "Сергей", "Ольга"];
const surnames = ["Коваленко", "Бондаренко", "Шевченко", "Петренко", "Ткаченко", "Романенко", "Савченко", "Мельниченко"];
const positions = ["Инженер сопровождения", "Инженер второй линии", "Специалист по сервису", "Дежурный инженер"];

/** Mock of ITSM's output contract. ITSM itself remains an opaque external system. */
export function mockItsmTeam(profile: ItsmTeamProfile, teamIndex: number): Team {
  const lead: TeamMember = {
    ...profile.lead,
    externalId: `itsm:${profile.id}:lead`,
    availability: profile.status === "standby" ? "on_call" : "on_duty",
  };
  const members: TeamMember[] = [lead, ...Array.from({ length: Math.max(0, profile.membersCount - 1) }, (_, index) => ({
    externalId: `itsm:${profile.id}:member:${index + 1}`,
    name: `${names[(index + teamIndex) % names.length]} ${surnames[Math.floor(index / names.length) % surnames.length]}`,
    login: `itsm.${profile.id}.${index + 1}`,
    role: positions[index % positions.length],
    availability: (index % 3 === 0 ? "on_duty" : index % 3 === 1 ? "on_call" : "off_duty") as TeamMember["availability"],
    phone: `+7 (999) ${String(100 + teamIndex).padStart(3, "0")}-${String(index + 1).padStart(2, "0")}-00`,
  }))];
  return { ...profile, source: "itsm", lead, members, membersCount: members.length };
}
