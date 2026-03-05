import axios from "axios";

export const TOKEN_KEY = "ailegacy_token";

export const http = axios.create({
  baseURL: "/",
  timeout: 15000,
});

http.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    config.headers = config.headers ?? {};
    (config.headers as any).Authorization = `Bearer ${token}`;
  }
  return config;
});