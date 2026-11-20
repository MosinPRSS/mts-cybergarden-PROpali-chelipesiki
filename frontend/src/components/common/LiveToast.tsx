import { LiveStatusState } from "../../types";

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
