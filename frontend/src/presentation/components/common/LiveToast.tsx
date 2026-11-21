import type { LiveStatusState } from "../../models.ts";

interface LiveToastProps {
  status: LiveStatusState | null;
}

export function LiveToast({ status }: LiveToastProps) {
  if (!status) return null;

  return (
    <div className={`live-toast ${status.ok ? "ok" : "err"}`}>
      <i />
      <span>{status.text}</span>
    </div>
  );
}
