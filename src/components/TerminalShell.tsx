import { Link } from "@tanstack/react-router";
import { ReactNode, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useMe } from "@/hooks/useMe";
import { useSignOut } from "@/hooks/useSignOut";
import { formatBerries } from "@/lib/wallet";
import { amIAdmin } from "@/lib/api/market.functions";
import { Sheet, SheetContent, SheetTrigger, SheetClose, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Menu, LogOut } from "lucide-react";

function Clock() {
  const [t, setT] = useState<string>("");
  useEffect(() => {
    const update = () => setT(new Date().toUTCString().slice(17, 25));
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, []);
  if (!t) return null;
  return <span className="tabular">{t} UTC</span>;
}

type NavItem = { to: string; label: string; chip?: string; tone?: "accent"; adminOnly?: boolean };
const NAV: NavItem[] = [
  { to: "/", label: "Market", chip: "F1" },
  { to: "/portfolio", label: "Portfolio", chip: "F2" },
  { to: "/market-bulletin", label: "Market Bulletin", chip: "F3" },
  { to: "/leaderboards", label: "Ranks", chip: "F6" },
  { to: "/games", label: "Games", chip: "F7" },
  { to: "/admin", label: "Admin", chip: "F9", tone: "accent", adminOnly: true },
];

export function TerminalShell({ children }: { children: ReactNode }) {
  const { data, user } = useMe();
  const signOut = useSignOut();
  const [open, setOpen] = useState(false);
  const { data: adminInfo } = useQuery({
    queryKey: ["am-i-admin"],
    queryFn: () => amIAdmin(),
    enabled: !!user,
    staleTime: 5 * 60_000,
  });
  const isAdmin = !!adminInfo?.isAdmin;
  const nav = NAV.filter((i) => !i.adminOnly || isAdmin);

  return (
    <div className="relative z-10 min-h-screen">
      <header className="border-b border-border bg-card/80 backdrop-blur">
        <div className="flex items-center justify-between gap-3 px-3 py-2 text-xs sm:px-4">
          <div className="flex items-center gap-3 md:gap-6 min-w-0">
            {/* Mobile menu trigger */}
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <button
                  type="button"
                  aria-label="Open navigation"
                  className="md:hidden -ml-1 inline-flex h-10 w-10 items-center justify-center border border-border text-foreground hover:border-primary hover:text-primary"
                >
                  <Menu className="h-5 w-5" />
                </button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 bg-card p-0">
                <SheetHeader className="border-b border-border px-4 py-3">
                  <SheetTitle className="text-left tracking-[0.2em] text-primary">BERRY STREET</SheetTitle>
                </SheetHeader>
                {user && data && (
                  <div className="border-b border-border px-4 py-3 text-xs">
                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Balance</div>
                    <div className="mt-0.5 text-base font-bold text-accent tabular">฿{formatBerries(data.berries)}</div>
                    <div className="mt-1 text-muted-foreground">@{data.profile?.username ?? "trader"}</div>
                  </div>
                )}
                <nav className="flex flex-col">
                  {nav.map((item) => (
                    <SheetClose asChild key={item.to}>
                      <Link
                        to={item.to}
                        className={`flex items-center justify-between px-4 py-4 text-sm uppercase tracking-widest border-b border-border/60 ${
                          item.tone === "accent"
                            ? "text-muted-foreground hover:text-accent hover:bg-secondary"
                            : "text-foreground hover:text-primary hover:bg-secondary"
                        }`}
                        activeProps={{ className: "text-primary bg-secondary" }}
                      >
                        <span>{item.label}</span>
                        {item.chip && (
                          <span className="text-[10px] text-muted-foreground tabular">[{item.chip}]</span>
                        )}
                      </Link>
                    </SheetClose>
                  ))}
                  {user ? (
                    <SheetClose asChild>
                      <Link
                        to="/profile"
                        className="flex items-center justify-between px-4 py-4 text-sm uppercase tracking-widest border-b border-border/60 text-foreground hover:text-primary hover:bg-secondary"
                        activeProps={{ className: "text-primary bg-secondary" }}
                      >
                        <span>Profile</span>
                      </Link>
                    </SheetClose>
                  ) : (
                    <SheetClose asChild>
                      <Link
                        to="/auth"
                        className="flex items-center justify-between px-4 py-4 text-sm uppercase tracking-widest border-b border-border/60 text-primary hover:bg-secondary"
                      >
                        <span>Sign in</span>
                      </Link>
                    </SheetClose>
                  )}
                </nav>
                {user && (
                  <div className="p-3">
                    <button
                      type="button"
                      onClick={async () => {
                        setOpen(false);
                        await signOut();
                      }}
                      className="flex w-full items-center justify-center gap-2 border border-border px-4 py-3 text-xs uppercase tracking-widest text-bear hover:bg-bear hover:text-destructive-foreground"
                    >
                      <LogOut className="h-3.5 w-3.5" />
                      Sign out
                    </button>
                  </div>
                )}
              </SheetContent>
            </Sheet>

            <Link to="/" className="flex items-center gap-2 font-bold text-primary glow-green min-w-0">
              <span className="text-base">◆</span>
              <span className="tracking-[0.2em] truncate">BERRY&nbsp;STREET</span>
              <span className="text-muted-foreground hidden lg:inline">/ ONE PIECE MKT</span>
            </Link>
            <nav className="hidden gap-4 md:flex">
              {nav.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`hover:text-primary ${item.tone === "accent" ? "text-muted-foreground hover:text-accent" : "text-muted-foreground"}`}
                  activeProps={{ className: item.tone === "accent" ? "text-accent" : "text-primary" }}
                >
                  [{item.chip}] {item.label.toUpperCase()}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3 sm:gap-4">
            {user && data ? (
              <>
                <span className="text-muted-foreground hidden sm:inline">BAL</span>
                <span className="text-accent tabular glow-green">฿{formatBerries(data.berries)}</span>
                <Link to="/profile" className="text-muted-foreground hover:text-primary hidden sm:inline">
                  @{data.profile?.username ?? "trader"}
                </Link>
                <button
                  type="button"
                  onClick={signOut}
                  aria-label="Sign out"
                  className="hidden md:inline-flex items-center justify-center border border-border px-2 py-1 text-muted-foreground hover:border-bear hover:text-bear"
                  title="Sign out"
                >
                  <LogOut className="h-3.5 w-3.5" />
                </button>
              </>
            ) : user ? (
              <span className="text-muted-foreground">…</span>
            ) : (
              <Link to="/auth" className="border border-border px-2 py-1 uppercase tracking-widest text-foreground hover:border-primary hover:text-primary">
                Sign in
              </Link>
            )}
            <span className="text-muted-foreground hidden lg:inline"><Clock /></span>
            <span className="hidden lg:flex items-center gap-1 text-bull">
              <span className="size-1.5 rounded-full bg-bull blink" />
              LIVE
            </span>
          </div>
        </div>
      </header>
      <main>{children}</main>
      <footer className="border-t border-border px-4 py-3 text-[10px] uppercase tracking-widest text-muted-foreground">
        Berry Street &copy; — Fictional securities. No real money. Prices set by editorial. Not affiliated with Eiichiro Oda or Shueisha.
      </footer>
    </div>
  );
}
