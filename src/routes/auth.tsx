import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { TerminalShell } from "@/components/TerminalShell";
import { checkPublicUsernameAvailability } from "@/lib/api/identity-moderation.functions";
import { validateUsernameFormat } from "@/lib/moderation/public-identity";
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

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">("signin");
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
        const normalizedUsername = username.trim();
        const usernameFormat = validateUsernameFormat(normalizedUsername);
        if (!usernameFormat.ok) {
          toast.error(usernameFormat.message);
          return;
        }

        const usernameCheck = await checkPublicUsernameAvailability({
          data: { username: usernameFormat.value },
        });
        if (!usernameCheck.available) {
          toast.error("That username is unavailable. Choose another.");
          return;
        }

        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { username: usernameFormat.value },
          },
        });
        if (error) throw error;
        if (data.session) {
          toast.success("Account created. Welcome aboard.");
          navigate({ to: "/portfolio" });
        } else {
          toast.success("Check your email to confirm your account before signing in.");
          setMode("signin");
          setPassword("");
        }
      } else if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        toast.success("If that email exists, a reset link is on the way.");
        setMode("signin");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Welcome back, pirate.");
        navigate({ to: "/portfolio" });
      }
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, "Auth failed"));
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogle() {
    setBusy(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if ("error" in result && result.error) throw result.error;
      if (!("redirected" in result && result.redirected)) navigate({ to: "/portfolio" });
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, "Google sign-in failed"));
      setBusy(false);
    }
  }

  return (
    <TerminalShell>
      <div className="mx-auto max-w-md p-6">
        <div className="terminal-panel">
          <div className="terminal-header flex items-center justify-between">
            <span>
              {mode === "signin"
                ? "Sign In · Terminal"
                : mode === "signup"
                  ? "Open Account"
                  : "Reset Password"}
            </span>
            {mode !== "forgot" && (
              <button
                type="button"
                onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
                className="text-[10px] uppercase tracking-widest text-muted-foreground hover:text-primary"
              >
                {mode === "signin" ? "[new account]" : "[have account]"}
              </button>
            )}
          </div>
          <form onSubmit={handleSubmit} className="space-y-3 p-5 text-sm">
            {mode === "signup" && (
              <Field label="Username">
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="luffy_d"
                  required
                  minLength={3}
                  maxLength={20}
                  pattern="[a-z0-9](?:[a-z0-9_]{1,18}[a-z0-9])"
                  className="w-full border border-border bg-input px-3 py-2 tabular outline-none focus:border-primary"
                />
                <span className="mt-1 block text-[10px] leading-relaxed text-muted-foreground">
                  3-20 lowercase letters, numbers, and single underscores. Usernames cannot be
                  changed after signup.
                </span>
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
            {mode !== "forgot" && (
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
            )}
            <button
              type="submit"
              disabled={busy}
              className="w-full bg-primary px-4 py-2 text-xs font-bold uppercase tracking-widest text-primary-foreground disabled:opacity-40"
            >
              {busy
                ? "…"
                : mode === "signin"
                  ? "Sign In ▶"
                  : mode === "signup"
                    ? "Create Account ▶"
                    : "Send Reset Link ▶"}
            </button>

            {mode === "signin" && (
              <button
                type="button"
                onClick={() => setMode("forgot")}
                className="block w-full text-center text-[10px] uppercase tracking-widest text-muted-foreground hover:text-primary"
              >
                Forgot password?
              </button>
            )}
            {mode === "forgot" && (
              <button
                type="button"
                onClick={() => setMode("signin")}
                className="block w-full text-center text-[10px] uppercase tracking-widest text-muted-foreground hover:text-primary"
              >
                ← Back to sign in
              </button>
            )}

            {mode !== "forgot" && (
              <>
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
              </>
            )}
          </form>
        </div>
        <p className="mt-3 text-center text-[10px] uppercase tracking-widest text-muted-foreground">
          <Link to="/" className="hover:text-primary">
            ← Back to market
          </Link>
        </p>
      </div>
    </TerminalShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}
