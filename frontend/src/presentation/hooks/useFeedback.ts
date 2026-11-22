import { useCallback, useEffect, useState } from "react";
import type { NotificationItem } from "../../domain/notifications/types.ts";
import type { Incident } from "../../domain/incidents/types.ts";
import type { AlertBannerState, LiveStatusState } from "../models.ts";
import type { ConnectionStatus } from "../../application/incidents/useIncidents.ts";
import type { IncidentActionFailure } from "../../application/incidents/useIncidentActions.ts";
import { useServices } from "../../application/servicesContext.ts";

const connectionMessages: Record<ConnectionStatus, LiveStatusState> = {
  connected: { text: "Live-поток активен", ok: true },
  disconnected: { text: "Нет связи. Переподключаемся…", ok: false },
  "load-error": { text: "Не удалось загрузить инциденты. Повторяем подключение…", ok: false },
  "invalid-message": { text: "Не удалось прочитать обновление. Загружаем актуальные данные…", ok: false },
};

export function useFeedback() {
  const { sound } = useServices();
  const [alertBanner, setAlertBanner] = useState<AlertBannerState | null>(null);
  const [liveStatus, setLiveStatus] = useState<LiveStatusState | null>(null);

  useEffect(() => {
    if (!alertBanner || alertBanner.type === "critical") return;
    const timer = setTimeout(() => setAlertBanner(null), 10000);
    return () => clearTimeout(timer);
  }, [alertBanner]);
  useEffect(() => {
    if (!liveStatus?.ok) return;
    const timer = setTimeout(() => setLiveStatus(null), 3500);
    return () => clearTimeout(timer);
  }, [liveStatus]);

  const announce = useCallback((events: NotificationItem[]) => {
    const first = events.find((item) => item.type === "critical") || events[0];
    sound.play(first.type === "critical" ? "critical" : "assigned");
    setAlertBanner({ type: first.type as AlertBannerState["type"],
      text: first.message + (events.length > 1 ? ` Ещё событий: ${events.length - 1}. Все — в уведомлениях.` : "") });
  }, [sound]);
  const connectionChanged = useCallback((status: ConnectionStatus) => setLiveStatus({ ...connectionMessages[status] }), []);
  const actionFailed = useCallback(({ action, id }: IncidentActionFailure) => {
    setAlertBanner({ type: "critical", text: action === "close" ? `Не удалось закрыть ${id}. Данные могли измениться; повторите после обновления.` : action === "undo" ? `Не удалось отменить завершение ${id}: инцидент изменён или уже закрыт. Обновите данные.` : action === "resolve"
      ? `Не удалось отметить ${id} решённым. Повторите попытку.`
      : `Не удалось назначить команду на ${id}. Изменение не подтверждено сервером.` });
  }, []);
  const assigned = useCallback((saved: Incident) => {
    setLiveStatus({ text: `Команда «${saved.team}» назначена на ${saved.id}`, ok: true });
  }, []);
  const dismissAlert = useCallback(() => setAlertBanner(null), []);

  return { alertBanner, liveStatus, announce, connectionChanged, actionFailed, assigned, dismissAlert };
}
