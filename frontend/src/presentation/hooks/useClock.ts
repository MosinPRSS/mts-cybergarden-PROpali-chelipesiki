import { useCallback, useEffect, useState } from "react";

export function useClock() {
  const [secondsPassed, setSecondsPassed] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => { setSecondsPassed((value) => value + 1); setNow(Date.now()); }, 1000);
    return () => clearInterval(timer);
  }, []);
  const reset = useCallback(() => setSecondsPassed(0), []);
  return { secondsPassed, now, reset };
}
