import { useState } from "react";
import type { FormEvent } from "react";
import type { AuthUser } from "../../types";
import { login } from "../../lib/auth";
import "./auth.css";

interface AuthScreenProps {
  onAuthenticated: (user: AuthUser) => void;
  initialError?: string;
}

export function AuthScreen({ onAuthenticated, initialError = "" }: AuthScreenProps) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [serverNotice, setServerNotice] = useState(initialError);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    const password = String(values.get("password"));
    setBusy(true);
    setError("");
    setServerNotice("");
    const credentials = { login: String(values.get("login")).trim(), password };
    try {
      const user = await login(credentials);
      onAuthenticated(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось войти. Попробуйте ещё раз.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <aside className="auth-story" aria-label="МТС Incident Command">
        <div className="auth-brand">
          <img src="/image.png" alt="МТС" width="56" height="56" />
          <span>Incident<br />Command</span>
        </div>
        <div className="auth-story-copy">
          <p className="auth-eyebrow">ОПЕРАТИВНЫЙ ЦЕНТР МТС</p>
          <h1>Держите<br />ситуацию<br />под контролем<span>.</span></h1>
          <p className="auth-story-description">От первого сигнала до решения.<br />Инциденты, команды и приоритеты —<br />в одном рабочем пространстве.</p>
        </div>
        <div className="auth-story-footer"><span aria-hidden="true" />На связи. В фокусе. Под контролем.</div>
        <div className="auth-orbit auth-orbit-one" aria-hidden="true" />
        <div className="auth-orbit auth-orbit-two" aria-hidden="true" />
      </aside>

      <section className="auth-panel" aria-label="Авторизация пользователя">
        <div className="auth-mobile-brand"><img src="/image.png" alt="МТС" width="40" height="40" /><span>Incident Command</span></div>
        <div className="auth-form-wrap">
          <p className="auth-form-eyebrow">ВАШ РАБОЧИЙ КОНТУР</p>
          <h2>С возвращением</h2>
          <p className="auth-intro">Войдите, чтобы перейти к управлению инцидентами.</p>
          {(error || serverNotice) && <div className="auth-error" role="alert">{error || serverNotice}</div>}

          <form onSubmit={handleSubmit} className="auth-form" aria-busy={busy}>
            <fieldset disabled={busy}>
              <label htmlFor="auth-login">Логин
                <input id="auth-login" name="login" autoComplete="username" placeholder="ivan.ivanov" minLength={3} maxLength={100} pattern="[a-zA-Z0-9_.@+\-]+" title="От 3 до 100 символов: латиница, цифры, точка, @, +, дефис и подчёркивание" autoCapitalize="none" spellCheck={false} required />
              </label>
              <label htmlFor="auth-password">Пароль
                <span className="auth-password-field">
                  <input id="auth-password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" placeholder="Введите пароль" minLength={1} maxLength={128} required />
                  <button type="button" aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"} aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)}>{showPassword ? "Скрыть" : "Показать"}</button>
                </span>
              </label>
              <button className="auth-submit" type="submit" disabled={busy}>
                <span>{busy ? "Входим…" : "Войти в систему"}</span>
                {!busy && <span aria-hidden="true">↗</span>}
              </button>
            </fieldset>
          </form>
          <p className="auth-access-hint">Доступ к сервису разрешён только координаторам.</p>
        </div>
        <footer className="auth-panel-footer"><span>МТС · Incident Command</span><span>Единая команда. Единая система.</span></footer>
      </section>
    </div>
  );
}
