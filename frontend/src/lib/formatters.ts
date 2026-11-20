export function formatSla(value: number): string {
  if (value <= 0) return "SLA соблюден";
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const seconds = value % 60;
  return hours
    ? `${hours}ч ${String(minutes).padStart(2, "0")}м`
    : `${minutes}м ${String(seconds).padStart(2, "0")}с`;
}
