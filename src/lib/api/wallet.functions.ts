import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export const getMe = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await admin();
    const [{ data: profile }, { data: wallet }, { data: holdings }] = await Promise.all([
      db.from("profiles").select("id,username,display_name,created_at").eq("id", context.userId).maybeSingle(),
      db.from("user_wallets").select("berries,updated_at").eq("user_id", context.userId).maybeSingle(),
      db
        .from("user_holdings")
        .select("shares,avg_cost,character_id,characters(slug,name,current_price)")
        .eq("user_id", context.userId),
    ]);
    return {
      userId: context.userId,
      email: (context.claims as any).email ?? null,
      profile,
      berries: Number(wallet?.berries ?? 0),
      holdings: (holdings ?? []).map((h: any) => ({
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

async function executeTrade(userId: string, slug: string, side: "buy" | "sell", shares: number) {
  const db = await admin();
  const { data, error } = await db.rpc("execute_trade", {
    _user_id: userId,
    _slug: slug,
    _side: side,
    _shares: shares,
  });
  if (error) throw new Error(error.message);
  return data as any;
}

export const buyShares = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ slug: z.string(), shares: z.number().int().positive().max(10000) }).parse(d))
  .handler(async ({ data, context }) => {
    const tx = await executeTrade(context.userId, data.slug, "buy", data.shares);
    return { ok: true, price: Number(tx.price), cost: Number(tx.total), balance: Number(tx.balance_after) };
  });

export const sellShares = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ slug: z.string(), shares: z.number().int().positive().max(10000) }).parse(d))
  .handler(async ({ data, context }) => {
    const tx = await executeTrade(context.userId, data.slug, "sell", data.shares);
    return { ok: true, price: Number(tx.price), proceeds: Number(tx.total), balance: Number(tx.balance_after) };
  });

export const listMyTransactions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await admin();
    const { data, error } = await db
      .from("transactions")
      .select("id,side,shares,price,total,balance_after,created_at,characters(name,slug)")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return data ?? [];
  });

export const submitTriviaAnswer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ questionId: z.string().uuid(), choiceIndex: z.number().int().min(0).max(10) }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await admin();
    const { data: q, error } = await db
      .from("trivia_questions")
      .select("id,answer_index,reward")
      .eq("id", data.questionId)
      .maybeSingle();
    if (error || !q) throw new Error("Question not found");
    const correct = q.answer_index === data.choiceIndex;

    // already attempted?
    const { data: prior } = await db
      .from("trivia_attempts")
      .select("id")
      .eq("user_id", context.userId)
      .eq("question_id", q.id)
      .maybeSingle();
    if (prior) return { correct, reward: 0, alreadyAnswered: true };

    const reward = correct ? Number(q.reward) : 0;
    await db.from("trivia_attempts").insert({
      user_id: context.userId,
      question_id: q.id,
      correct,
      reward,
    });
    if (reward > 0) {
      const { data: w } = await db.from("user_wallets").select("berries").eq("user_id", context.userId).maybeSingle();
      await db.from("user_wallets").update({ berries: Number(w?.berries ?? 0) + reward }).eq("user_id", context.userId);
    }
    return { correct, reward, alreadyAnswered: false };
  });

export const resetMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await admin();
    await db.from("user_holdings").delete().eq("user_id", context.userId);
    await db.from("trivia_attempts").delete().eq("user_id", context.userId);
    await db.from("user_wallets").update({ berries: 10000 }).eq("user_id", context.userId);
    return { ok: true };
  });
