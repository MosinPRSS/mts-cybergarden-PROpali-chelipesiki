import { Icon } from "../common/Icon";

interface OverviewStatsProps {
  criticalCount: number;
  riskCount: number;
  nearestRiskSla: string;
  workloadCount: number;
  resolvedMetCount: number;
  resolvedWithDeadlineCount: number;
}

export function OverviewStats({
  criticalCount,
  riskCount,
  nearestRiskSla,
  workloadCount,
  resolvedMetCount,
  resolvedWithDeadlineCount,
}: OverviewStatsProps) {
  return (
    <div className="overview">
      <div className="overview-item critical">
        <span className="overview-icon">
          <Icon name="activity" />
        </span>
        <div>
          <small>Критические</small>
          <strong>{criticalCount}</strong>
        </div>
        <em>Активные инциденты</em>
      </div>

      <div className="overview-item risk">
        <span className="overview-icon">
          <Icon name="clock" />
        </span>
        <div>
          <small>Риск SLA</small>
          <strong>{riskCount}</strong>
        </div>
        <em>Следующий: {nearestRiskSla}</em>
      </div>

      <div className="overview-item workload">
        <span className="overview-icon">
          <Icon name="users" />
        </span>
        <div>
          <small>В работе</small>
          <strong>{workloadCount}</strong>
        </div>
        <em>Требуют решения</em>
      </div>

      <div className="overview-item quality">
        <div className="sla-ring">
          {resolvedWithDeadlineCount ? Math.round(resolvedMetCount / resolvedWithDeadlineCount * 100) : "—"}<small>%</small>
        </div>
        <div>
          <small>Решено в срок</small>
          <strong>{resolvedMetCount} / {resolvedWithDeadlineCount}</strong>
        </div>
        <em>Среди инцидентов с известным сроком</em>
      </div>
    </div>
  );
}
