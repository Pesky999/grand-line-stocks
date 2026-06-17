import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { TerminalShell } from "@/components/TerminalShell";
import { toast } from "sonner";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Reset Password — Berry Street" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [hasRecovery, setHasRecovery] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // supabase-js parses the URL hash and emits PASSWORD_RECOVERY on load.
    let recovered = false;
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        recovered = true;
        setHasRecovery(true);
        setReady(true);
      }
    });
    // Fallback: if there's already a session (e.g. user reloaded), allow setting password.
    supabase.auth.getSession().then(({ data }) => {
      if (recovered) return;
      setHasRecovery(!!data.session);
      setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) return toast.error("Password must be at least 6 characters.");
    if (password !== confirm) return toast.error("Passwords do not match.");
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("Password updated. You're signed in.");
      navigate({ to: "/portfolio" });
    } catch (err: any) {
      toast.error(err?.message ?? "Could not update password");
    } finally {
      setBusy(false);
    }
  }

  return (
    <TerminalShell>
      <div className="mx-auto max-w-md p-6">
        <div className="terminal-panel">
          <div className="terminal-header">Reset Password</div>
          <div className="p-5 text-sm">
            {!ready ? (
              <p className="text-muted-foreground">Verifying link…</p>
            ) : !hasRecovery ? (
              <div className="space-y-3">
                <p className="text-bear">This reset link is invalid or has expired.</p>
                <p className="text-muted-foreground text-xs">
                  Request a new link from the sign-in page.
                </p>
                <Link
                  to="/auth"
                  className="inline-block border border-border px-3 py-2 text-xs uppercase tracking-widest hover:border-primary hover:text-primary"
                >
                  Back to sign in
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-3">
                <label className="block">
                  <span className="mb-1 block text-[10px] uppercase tracking-widest text-muted-foreground">
                    New password
                  </span>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full border border-border bg-input px-3 py-2 tabular outline-none focus:border-primary"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[10px] uppercase tracking-widest text-muted-foreground">
                    Confirm password
                  </span>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    className="w-full border border-border bg-input px-3 py-2 tabular outline-none focus:border-primary"
                  />
                </label>
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full bg-primary px-4 py-2 text-xs font-bold uppercase tracking-widest text-primary-foreground disabled:opacity-40"
                >
                  {busy ? "…" : "Update Password ▶"}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </TerminalShell>
  );
}
