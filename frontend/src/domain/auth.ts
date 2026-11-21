export interface AuthUser {
  id: number;
  login: string;
  full_name: string;
  role: "coordinator";
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

