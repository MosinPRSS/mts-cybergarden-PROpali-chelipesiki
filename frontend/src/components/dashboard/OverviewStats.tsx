import { Icon } from "../common/Icon";

interface OverviewStatsProps {
  criticalCount: number;
  riskCount: number;
  nearestRiskSla: string;
  workloadCount: number;
}

export function OverviewStats({
  criticalCount,
  riskCount,
  nearestRiskSla,
  workloadCount,
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
        <em>+{criticalCount > 0 ? "1" : "0"} за час</em>
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
        <em>{Math.min(100, Math.round((workloadCount / 6) * 100))}% загрузки</em>
      </div>

      <div className="overview-item quality">
        <div className="sla-ring">
          94<small>%</small>
        </div>
        <div>
          <small>SLA сегодня</small>
          <strong>47 / 50</strong>
        </div>
        <em>+2.4% к вчера</em>
      </div>
    </div>
  );
}
