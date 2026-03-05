import { useQuery } from "@tanstack/react-query";
import { http } from "./http";

export type GatewayHealth = { status: string };
export type LegacyHealth = { status: string; service?: string };
export type AiHealth = {
  status: string;
  service?: string;
  fail_mode?: boolean;
  mode?: string;
  ml_ready?: boolean;
};

async function getJson<T>(url: string): Promise<T> {
  const r = await http.get<T>(url);
  return r.data;
}

export function useGatewayHealth() {
  return useQuery({
    queryKey: ["health", "gateway"],
    queryFn: () => getJson<GatewayHealth>("/health"),
    refetchInterval: 8000,
  });
}
export function useLegacyHealth() {
  return useQuery({
    queryKey: ["health", "legacy"],
    queryFn: () => getJson<LegacyHealth>("/health/legacy"),
    refetchInterval: 8000,
  });
}

export function useAiHealth() {
  return useQuery({
    queryKey: ["health", "ai"],
    queryFn: () => getJson<AiHealth>("/health/ai"),
    refetchInterval: 8000,
  });
}