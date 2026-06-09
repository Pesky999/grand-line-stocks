type T = { slug: string; name: string; current_price: number; previous_price: number };

export function Ticker({ items }: { items: T[] }) {
  const doubled = [...items, ...items];
  return (
    <div className="overflow-hidden border-y border-border bg-card/70">
      <div className="flex w-max animate-marquee gap-8 whitespace-nowrap py-1.5 text-xs">
        {doubled.map((c, i) => {
          const diff = c.current_price - c.previous_price;
          const pct = (diff / c.previous_price) * 100;
          const up = diff >= 0;
          return (
            <span key={i} className="tabular flex items-center gap-1.5">
              <span className="font-bold text-foreground">{c.slug.toUpperCase().slice(0, 4)}</span>
              <span className="text-muted-foreground">{c.current_price.toFixed(2)}</span>
              <span className={up ? "text-bull" : "text-bear"}>
                {up ? "▲" : "▼"} {Math.abs(pct).toFixed(2)}%
              </span>
              <span className="text-border">|</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
