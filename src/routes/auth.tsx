import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { TerminalShell } from "@/components/TerminalShell";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign In — Berry Street" },
      { name: "description", content: "Sign in or create a Berry Street trading account." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/portfolio" });
    });
  }, [navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { username: username || email.split("@")[0] },
          },
        });
        if (error) throw error;
        // If email confirmation is required, Supabase returns a user but no session.
        if (data.session) {
          toast.success("Account created. Welcome aboard.");
          navigate({ to: "/portfolio" });
        } else {
          toast.success("Check your email to confirm your account before signing in.");
          setMode("signin");
          setPassword("");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Welcome back, pirate.");
        navigate({ to: "/portfolio" });
      }
    } catch (err: any) {
      toast.error(err.message ?? "Auth failed");
    } finally {
      setBusy(false);
    }
  }


  async function handleGoogle() {
    setBusy(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
      if ((result as any).error) throw (result as any).error;
      if (!(result as any).redirected) navigate({ to: "/portfolio" });
    } catch (err: any) {
      toast.error(err.message ?? "Google sign-in failed");
      setBusy(false);
    }
  }

  return (
    <TerminalShell>
      <div className="mx-auto max-w-md p-6">
        <div className="terminal-panel">
          <div className="terminal-header flex items-center justify-between">
            <span>{mode === "signin" ? "Sign In · Terminal" : "Open Account"}</span>
            <button
              type="button"
              onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
              className="text-[10px] uppercase tracking-widest text-muted-foreground hover:text-primary"
            >
              {mode === "signin" ? "[new account]" : "[have account]"}
            </button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-3 p-5 text-sm">
            {mode === "signup" && (
              <Field label="Username">
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                  placeholder="luffy_d"
                  className="w-full border border-border bg-input px-3 py-2 tabular outline-none focus:border-primary"
                />
              </Field>
            )}
            <Field label="Email">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border border-border bg-input px-3 py-2 tabular outline-none focus:border-primary"
              />
            </Field>
            <Field label="Password">
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border border-border bg-input px-3 py-2 tabular outline-none focus:border-primary"
              />
            </Field>
            <button
              type="submit"
              disabled={busy}
              className="w-full bg-primary px-4 py-2 text-xs font-bold uppercase tracking-widest text-primary-foreground disabled:opacity-40"
            >
              {busy ? "…" : mode === "signin" ? "Sign In ▶" : "Create Account ▶"}
            </button>

            <div className="relative my-3 text-center text-[10px] uppercase tracking-widest text-muted-foreground">
              <span className="bg-card px-2">or</span>
              <span className="absolute inset-x-0 top-1/2 -z-10 border-t border-border" />
            </div>

            <button
              type="button"
              onClick={handleGoogle}
              disabled={busy}
              className="w-full border border-border px-4 py-2 text-xs font-bold uppercase tracking-widest text-foreground hover:border-primary hover:text-primary disabled:opacity-40"
            >
              Continue with Google
            </button>
          </form>
        </div>
        <p className="mt-3 text-center text-[10px] uppercase tracking-widest text-muted-foreground">
          <Link to="/" className="hover:text-primary">← Back to market</Link>
        </p>
      </div>
    </TerminalShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] uppercase tracking-widest text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
