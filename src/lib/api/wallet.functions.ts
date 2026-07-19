import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import {
  TRADE_HISTORY_DEFAULT_PAGE_SIZE,
  TRADE_HISTORY_MAX_PAGE_SIZE,
  buildTradeHistoryPage,
  getTradeHistoryCursorFilter,
  type TradeHistoryItem,
} from "@/lib/trade-history/pagination";
import { isValidShareQuantity } from "@/lib/trading/fractional-shares";

export const TRADE_HISTORY_QUERY_KEY = ["trade-history"] as const;

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

const tradeHistoryCursorSchema = z
  .object({
    createdAt: z.string().datetime({ offset: true }),
    id: z.string().uuid(),
  })
  .strict();

const tradeHistoryInputSchema = z
  .object({
    pageSize: z
      .number()
      .int()
      .min(1)
      .max(TRADE_HISTORY_MAX_PAGE_SIZE)
      .default(TRADE_HISTORY_DEFAULT_PAGE_SIZE),
    cursor: tradeHistoryCursorSchema.nullable().optional(),
  })
  .strict();

const tradeInputSchema = z
  .object({
    slug: z.string().min(1),
    shares: z
      .number()
      .finite()
      .min(0.01)
      .max(10_000)
      .refine(isValidShareQuantity, "Shares must use at most two decimal places"),
    requestId: z.string().uuid(),
  })
  .strict();

const tradeHistoryRowSchema = z
  .object({
    id: z.string().uuid(),
    side: z.enum(["buy", "sell"]),
    shares: z.coerce.number(),
    price: z.coerce.number(),
    total: z.coerce.number(),
    balance_after: z.coerce.number(),
    cost_basis: z.coerce.number().nullable(),
    realized_pnl: z.coerce.number().nullable(),
    holding_shares_before: z.coerce.number(),
    holding_shares_after: z.coerce.number(),
    holding_cost_basis_before: z.coerce.number(),
    holding_cost_basis_after: z.coerce.number(),
    holding_avg_cost_before: z.coerce.number(),
    holding_avg_cost_after: z.coerce.number(),
    created_at: z.string(),
    characters: z
      .object({
        name: z.string(),
        slug: z.string(),
      })
      .strict(),
  })
  .strict();

type AuthenticatedTradeResult =
  Database["public"]["Functions"]["execute_trade_authenticated"]["Returns"];
type AuthClaimsWithEmail = { email?: unknown };
type UserHoldingWithCharacter = {
  shares: number;
  avg_cost: number;
  total_cost_basis: number;
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

async function identityPolicy() {
  return await import("@/lib/moderation/public-identity.server");
}

export const getMe = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!context.userId) return null;
    const db = context.supabase;
    const [{ data: profile }, { data: wallet }, { data: holdings }, { data: stats }] =
      await Promise.all([
        db
          .from("profiles")
          .select("id,username,display_name,created_at")
          .eq("id", context.userId)
          .maybeSingle(),
        db
          .from("user_wallets")
          .select("berries,updated_at")
          .eq("user_id", context.userId)
          .maybeSingle(),
        db
          .from("user_holdings")
          .select(
            "shares,avg_cost,total_cost_basis,character_id,characters(slug,name,current_price)",
          )
          .eq("user_id", context.userId),
        db
          .from("user_stats")
          .select("realized_pnl,wins,losses,total_sells")
          .eq("user_id", context.userId)
          .maybeSingle(),
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
        totalCostBasis: Number(h.total_cost_basis),
        currentPrice: Number(h.characters.current_price),
      })),
      realizedPnl: Number(stats?.realized_pnl ?? 0),
      wins: Number(stats?.wins ?? 0),
      losses: Number(stats?.losses ?? 0),
      totalSells: Number(stats?.total_sells ?? 0),
    };
  });

export const updateProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ display_name: z.string().min(1).max(80) }).parse(d))
  .handler(async ({ data, context }) => {
    const displayName = data.display_name.trim();
    const { evaluateDisplayNameOnServer } = await identityPolicy();
    const evaluation = await evaluateDisplayNameOnServer(displayName);
    if (!evaluation.allowed) {
      throw new Error("That display name is not allowed.");
    }

    const db = await admin();
    const { error } = await db
      .from("profiles")
      .update({ display_name: displayName })
      .eq("id", context.userId);
    if (error) throw new Error("That display name is not allowed.");
    return { ok: true };
  });

async function executeTrade(
  db: SupabaseClient<Database>,
  slug: string,
  side: "buy" | "sell",
  shares: number,
  requestId: string,
): Promise<AuthenticatedTradeResult> {
  const { data, error } = await db.rpc("execute_trade_authenticated", {
    _slug: slug,
    _side: side,
    _shares: shares,
    _request_id: requestId,
  });
  if (error) throw new Error(error.message);
  return data as AuthenticatedTradeResult;
}

export const buyShares = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => tradeInputSchema.parse(d))
  .handler(async ({ data, context }) => {
    const tx = await executeTrade(context.supabase, data.slug, "buy", data.shares, data.requestId);
    return {
      ok: true,
      price: Number(tx.price),
      cost: Number(tx.total),
      balance: Number(tx.balance_after),
      holdingSharesAfter: Number(tx.holding_shares_after),
      holdingCostBasisAfter: Number(tx.holding_cost_basis_after),
      holdingAvgCostAfter: Number(tx.holding_avg_cost_after),
    };
  });

export const sellShares = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => tradeInputSchema.parse(d))
  .handler(async ({ data, context }) => {
    const tx = await executeTrade(context.supabase, data.slug, "sell", data.shares, data.requestId);
    if (tx.cost_basis === null || tx.realized_pnl === null) {
      throw new Error("Sell transaction accounting was not returned.");
    }

    return {
      ok: true,
      price: Number(tx.price),
      proceeds: Number(tx.total),
      balance: Number(tx.balance_after),
      costBasis: Number(tx.cost_basis),
      realizedPnl: Number(tx.realized_pnl),
      holdingSharesAfter: Number(tx.holding_shares_after),
      holdingCostBasisAfter: Number(tx.holding_cost_basis_after),
      holdingAvgCostAfter: Number(tx.holding_avg_cost_after),
    };
  });

export const listMyTransactions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => tradeHistoryInputSchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const db = context.supabase;
    let query = db
      .from("transactions")
      .select(
        "id,side,shares,price,total,balance_after,cost_basis,realized_pnl,holding_shares_before,holding_shares_after,holding_cost_basis_before,holding_cost_basis_after,holding_avg_cost_before,holding_avg_cost_after,created_at,characters(name,slug)",
      )
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(data.pageSize + 1);

    if (data.cursor) {
      query = query.or(getTradeHistoryCursorFilter(data.cursor));
    }

    const { data: rows, error } = await query;
    if (error) throw error;

    const parsedRows = z.array(tradeHistoryRowSchema).parse(rows ?? []);
    const items: TradeHistoryItem[] = parsedRows.map((row) => ({
      id: row.id,
      side: row.side,
      shares: row.shares,
      price: row.price,
      total: row.total,
      balance_after: row.balance_after,
      cost_basis: row.cost_basis,
      realized_pnl: row.realized_pnl,
      holding_shares_before: row.holding_shares_before,
      holding_shares_after: row.holding_shares_after,
      holding_cost_basis_before: row.holding_cost_basis_before,
      holding_cost_basis_after: row.holding_cost_basis_after,
      holding_avg_cost_before: row.holding_avg_cost_before,
      holding_avg_cost_after: row.holding_avg_cost_after,
      created_at: row.created_at,
      characterName: row.characters.name,
      characterSlug: row.characters.slug,
    }));

    return buildTradeHistoryPage(items, data.pageSize);
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
