import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { LEGACY_LOG_QUERY_KEY, recordMyDailyActivity } from "@/lib/api/legendary.functions";
import { meQueryKey } from "@/hooks/useMe";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const queryClient = useQueryClient();

  useEffect(() => {
    let cancelled = false;

    recordMyDailyActivity()
      .then(async () => {
        if (cancelled) return;
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: meQueryKey }),
          queryClient.invalidateQueries({ queryKey: ["public-profile"] }),
          queryClient.invalidateQueries({ queryKey: LEGACY_LOG_QUERY_KEY }),
        ]);
      })
      .catch(() => {
        // Activity is best-effort; navigation should never be blocked by it.
      });

    return () => {
      cancelled = true;
    };
  }, [queryClient]);

  return <Outlet />;
}
