import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getMe } from "@/lib/api/wallet.functions";
import { useAuth } from "@/hooks/useAuth";

export const meQueryKey = ["me"] as const;

export function useMe() {
  const { user, loading } = useAuth();
  const q = useQuery({
    queryKey: meQueryKey,
    queryFn: () => getMe(),
    enabled: !!user,
    staleTime: 10_000,
  });
  return { ...q, user, authLoading: loading };
}

export function useInvalidateMe() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: meQueryKey });
}
