import { Link } from "@tanstack/react-router";
import { ReactNode, useEffect, useState } from "react";
import { useWallet, formatBerries } from "@/lib/wallet";

function Clock() {
  const [t, setT] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setT(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return <span className="tabular">{t.toUTCString().slice(17, 25)} UTC</span>;
}

export function TerminalShell({ children }: { children: ReactNode }) {
  const { state } = useWallet();
  return (
    <div className="relative z-10 min-h-screen">
      <header className="border-b border-border bg-card/80 backdrop-blur">
        <div className="flex items-center justify-between gap-4 px-4 py-2 text-xs">
          <div className="flex items-center gap-6">
            <Link to="/" className="flex items-center gap-2 font-bold text-primary glow-green">
              <span className="text-base">◆</span>
              <span className="tracking-[0.2em]">BERRY&nbsp;STREET</span>
              <span className="text-muted-foreground">/ ONE PIECE MKT</span>
            </Link>
            <nav className="hidden gap-4 md:flex">
              <Link to="/" className="text-muted-foreground hover:text-primary" activeProps={{ className: "text-primary" }}>[F1] MARKET</Link>
              <Link to="/portfolio" className="text-muted-foreground hover:text-primary" activeProps={{ className: "text-primary" }}>[F2] PORTFOLIO</Link>
              <Link to="/news" className="text-muted-foreground hover:text-primary" activeProps={{ className: "text-primary" }}>[F3] NEWS</Link>
              <Link to="/games" className="text-muted-foreground hover:text-primary" activeProps={{ className: "text-primary" }}>[F4] GAMES</Link>
              <Link to="/admin" className="text-muted-foreground hover:text-accent" activeProps={{ className: "text-accent" }}>[F9] ADMIN</Link>
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-muted-foreground">BAL</span>
            <span className="text-accent tabular glow-green">฿{formatBerries(state.berries)}</span>
            <span className="text-muted-foreground hidden sm:inline"><Clock /></span>
            <span className="flex items-center gap-1 text-bull">
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
