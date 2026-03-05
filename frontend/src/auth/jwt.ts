import { jwtDecode } from "jwt-decode";
import type { AuthUser, Role } from "./types";

type JwtPayload = {
  sub: string;
  role?: Role;
  exp?: number;
};

export function decodeUser(token: string): AuthUser | null {
  try {
    const p = jwtDecode<JwtPayload>(token);
    if (!p?.sub) return null;
    return {
      username: p.sub,
      role: (p.role ?? "user") as Role,
      exp: p.exp,
    };
  } catch {
    return null;
  }
}

export function isTokenExpired(exp?: number): boolean {
  if (!exp) return false;
  const now = Math.floor(Date.now() / 1000);
  return exp <= now;
}