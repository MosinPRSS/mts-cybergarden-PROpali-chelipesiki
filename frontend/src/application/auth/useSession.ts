import { useCallback, useEffect, useState } from "react";
import { AuthError } from "../../domain/auth.ts";
import type { AuthUser } from "../../domain/auth.ts";
import { useServices } from "../servicesContext.ts";

export function useSession() {
  const { session, lifecycle } = useServices();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let active = true;
    session.current()
      .then((current) => { if (active) setUser(current); })
      .catch((err) => { if (active && (!(err instanceof AuthError) || err.status !== 401)) setError(err.message); })
      .finally(() => { if (active) setLoading(false); });
    const unsubscribe = session.onExpired((message) => {
      setUser(null);
      setError(message ?? "Сессия завершена. Войдите снова.");
    });
    return () => { active = false; unsubscribe(); };
  }, [session]);

  const userId = user?.id;
  useEffect(() => {
    if (userId == null) return;
    let active = true;
    let revision = 0;
    const check = () => {
      const request = ++revision;
      session.current().then((current) => {
        if (!active || request !== revision) return;
        setUser((previous) => previous?.id === current.id && previous.login === current.login
          && previous.full_name === current.full_name && previous.role === current.role ? previous : current);
      }).catch((err) => {
        if (active && request === revision && err instanceof AuthError && (err.status === 401 || err.status === 403)) {
          setUser(null);
          setError(err.status === 403 ? err.message : "Сессия завершена. Войдите снова.");
        }
      });
    };
    const timer = setInterval(check, 60000);
    const unsubscribe = lifecycle.onVisible(check);
    return () => { active = false; clearInterval(timer); unsubscribe(); };
  }, [userId, session, lifecycle]);

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    try { await session.logout(); setUser(null); setError(""); }
    catch (err) { setError(err instanceof Error ? err.message : "Не удалось выйти. Попробуйте ещё раз."); }
    finally { setSigningOut(false); }
  }

  const authenticated = useCallback((current: AuthUser) => { setError(""); setUser(current); }, []);
  const clearError = useCallback(() => setError(""), []);
  return { user, loading, error, signingOut, signOut, authenticated, clearError, login: session.login };
}
