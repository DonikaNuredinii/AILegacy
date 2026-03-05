import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { http } from "../api/http";
import type { AuthUser, LoginResponse } from "./types";
import { decodeUser, isTokenExpired } from "./jwt";

type AuthState = {
  token: string | null;
  user: AuthUser | null;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthState | null>(null);

const TOKEN_KEY = "ailegacy_token";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    const t = localStorage.getItem(TOKEN_KEY);
    if (!t) return;

    const u = decodeUser(t);
    if (!u || isTokenExpired(u.exp)) {
      localStorage.removeItem(TOKEN_KEY);
      return;
    }

    setToken(t);
    setUser(u);
  }, []);

  async function login(username: string, password: string) {
    const resp = await http.post<LoginResponse>("/auth/login", { username, password });
    const t = resp.data.access_token;
    const u = decodeUser(t);

    if (!u) throw new Error("Invalid token received");

    localStorage.setItem(TOKEN_KEY, t);
    setToken(t);
    setUser(u);
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
  }

  const value = useMemo(
    () => ({
      token,
      user,
      isAuthenticated: !!token && !!user,
      login,
      logout,
    }),
    [token, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}