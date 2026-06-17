import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

/**
 * Ordered sign-out teardown:
 *  1) cancel in-flight queries (avoids 401 flashes from queries racing the signOut)
 *  2) clear the cache (so Back doesn't restore a shell hydrated from protected data)
 *  3) sign out (clears session + localStorage)
 *  4) navigate to a safe public page with history REPLACE (Back must not restore the protected route)
 */
export function useSignOut() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  return async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/", replace: true });
  };
}
