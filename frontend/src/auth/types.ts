export type Role = "admin" | "user";

export type AuthUser = {
  username: string;
  role: Role;
  exp?: number;
};

export type LoginResponse = {
  access_token: string;
  token_type: string;
};