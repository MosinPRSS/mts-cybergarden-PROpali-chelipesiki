export function onVisible(listener: () => void): () => void {
  const handleVisibility = () => { if (document.visibilityState === "visible") listener(); };
  document.addEventListener("visibilitychange", handleVisibility);
  return () => document.removeEventListener("visibilitychange", handleVisibility);
}
