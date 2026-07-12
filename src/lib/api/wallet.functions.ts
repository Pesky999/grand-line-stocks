import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

const walletLedgerEntrySchema = z
  .object({
    id: z.string().uuid(),
    entry_type: z.enum(["reward", "bonus", "grant", "adjustment"]),
    amount: z.number(),
    balance_after: z.number(),
    source_type: z.enum([
      "daily_crew_builder",
      "grand_line_guess",
      "trivia",
      "admin_bonus",
      "launch_grant",
      "reset_grant",
    ]),
    source_id: z.string().uuid().nullable(),
    description: z.string(),
    created_at: z.string(),
  })
  .strict();

export type WalletLedgerEntry = z.infer<typeof walletLedgerEntrySchema>;

type AuthenticatedTradeResult = Database["public"]["Functions"]["execute_trade_authenticated"]["Returns"];
type AuthClaimsWithEmail = { email?: unknown };
type UserHoldingWithCharacter = {
  shares: number;
  avg_cost: number;
  character_id: string;
  characters: {
    slug: string;
    name: string;
    current_price: number;
  };
};

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export const getMe = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!context.userId) return null;
    const db = context.supabase;
    const [{ data: profile }, { data: wallet }, { data: holdings }] = await Promise.all([
      db.from("profiles").select("id,username,display_name,created_at").eq("id", context.userId).maybeSingle(),
      db.from("user_wallets").select("berries,updated_at").eq("user_id", context.userId).maybeSingle(),
      db
        .from("user_holdings")
        .select("shares,avg_cost,character_id,characters(slug,name,current_price)")
        .eq("user_id", context.userId),
    ]);
    const claimsEmail = (context.claims as AuthClaimsWithEmail).email;
    return {
      userId: context.userId,
      email: typeof claimsEmail === "string" ? claimsEmail : null,
      profile,
      berries: Number(wallet?.berries ?? 0),
      holdings: ((holdings ?? []) as UserHoldingWithCharacter[]).map((h) => ({
        slug: h.characters.slug,
        name: h.characters.name,
        shares: Number(h.shares),
        avgCost: Number(h.avg_cost),
        currentPrice: Number(h.characters.current_price),
      })),
    };
  });

export const updateProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ display_name: z.string().min(1).max(40) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = await admin();
    const { error } = await db
      .from("profiles")
      .update({ display_name: data.display_name })
      .eq("id", context.userId);
    if (error) throw error;
    return { ok: true };
  });

async function executeTrade(
  db: SupabaseClient<Database>,
  slug: string,
  side: "buy" | "sell",
  shares: number,
): Promise<AuthenticatedTradeResult> {
  const { data, error } = await db.rpc("execute_trade_authenticated", {
    _slug: slug,
    _side: side,
    _shares: shares,
  });
  if (error) throw new Error(error.message);
  return data as AuthenticatedTradeResult;
}

export const buyShares = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ slug: z.string(), shares: z.number().int().positive().max(10000) }).parse(d))
  .handler(async ({ data, context }) => {
    const tx = await executeTrade(context.supabase, data.slug, "buy", data.shares);
    return { ok: true, price: Number(tx.price), cost: Number(tx.total), balance: Number(tx.balance_after) };
  });

export const sellShares = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ slug: z.string(), shares: z.number().int().positive().max(10000) }).parse(d))
  .handler(async ({ data, context }) => {
    const tx = await executeTrade(context.supabase, data.slug, "sell", data.shares);
    return { ok: true, price: Number(tx.price), proceeds: Number(tx.total), balance: Number(tx.balance_after) };
  });

export const listMyTransactions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = context.supabase;
    const { data, error } = await db
      .from("transactions")
      .select("id,side,shares,price,total,balance_after,created_at,characters(name,slug)")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return data ?? [];
  });

export const listMyWalletLedgerEntries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = context.supabase;
    const { data, error } = await db
      .from("wallet_ledger_entries")
      .select("id,entry_type,amount,balance_after,source_type,source_id,description,created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(25);

    if (error) throw error;

    return z.array(walletLedgerEntrySchema).parse(data ?? []);
  });

// NOTE: A self-serve account reset previously lived here, but it could not safely
// clear derived state (user_stats, net_worth_snapshots, leaderboard_cache,
// achievements, legacy_records, transactions history) without leaving the public
// leaderboards and reputation system inconsistent. Removed for MVP. If users
// need a fresh start, they can create a new account.

