import type { AlertBannerState } from "../../models.ts";

interface AlertBannerProps {
  banner: AlertBannerState | null;
  onClose: () => void;
}

export function AlertBanner({ banner, onClose }: AlertBannerProps) {
  if (!banner) return null;

  return (
    <div className={`alert-banner ${banner.type}`}>
      <span>{banner.text}</span>
      <button onClick={onClose} aria-label="Закрыть уведомление">
        ✕
      </button>
    </div>
  );
}
