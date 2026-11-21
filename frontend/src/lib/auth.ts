import type { AuthUser } from "../types";

export const SESSION_EXPIRED_EVENT = "mts:session-expired";
export const COORDINATOR_ACCESS_MESSAGE = "Доступ к сервису разрешён только координаторам";

export class AuthError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function authRequest<T>(path: string, body?: object): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/auth/${path}`, {
      method: body ? "POST" : "GET",
      credentials: "same-origin",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new AuthError("Не удалось связаться с сервером. Проверьте подключение и попробуйте ещё раз.", 0);
  }
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    const message = typeof data.detail === "string" ? data.detail
      : response.status === 422 ? "Проверьте логин и пароль. Логин должен содержать от 3 до 100 символов."
      : "Сервис временно недоступен. Попробуйте ещё раз.";
    throw new AuthError(message, response.status);
  }
  return response.status === 204 ? undefined as T : response.json();
}

function requireCoordinator(user: AuthUser): AuthUser {
  if (user.role !== "coordinator") throw new AuthError(COORDINATOR_ACCESS_MESSAGE, 403);
  return user;
}

export const fetchCurrentUser = async () => requireCoordinator(await authRequest<AuthUser>("me"));
export const logout = () => authRequest<void>("logout", {});
export const login = async (data: { login: string; password: string }) => requireCoordinator(await authRequest<AuthUser>("login", data));

export function notifySessionExpired(message = "Сессия завершена. Войдите снова.") {
  window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT, { detail: message }));
}
