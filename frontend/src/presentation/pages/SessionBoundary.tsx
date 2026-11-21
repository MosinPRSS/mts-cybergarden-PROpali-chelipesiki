import { useSession } from "../../application/auth/useSession.ts";
import { AuthScreen } from "../components/auth/AuthScreen.tsx";
import { DashboardPage } from "./DashboardPage.tsx";

export function SessionBoundary() {
  const session = useSession();
  if (session.loading) {
    return <div className="auth-loading" role="status"><img src="/image.png" alt="МТС" /><span>Проверяем сессию…</span></div>;
  }
  if (!session.user) {
    return <AuthScreen initialError={session.error} onLogin={session.login} onAuthenticated={session.authenticated} />;
  }
  return <>
    <DashboardPage key={session.user.id} user={session.user} onLogout={session.signOut} signingOut={session.signingOut} />
    {session.error && <div className="session-error" role="alert">{session.error}<button onClick={session.clearError} aria-label="Закрыть сообщение">×</button></div>}
  </>;
}
