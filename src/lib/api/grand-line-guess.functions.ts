import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { compareGuessBounty, rewardForAttempt } from "@/lib/grand-line-guess/rules";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

type CharRow = {
  id: string; name: string; slug: string; gender: string | null;
  affiliation: string | null; affiliation_category: string | null;
  devil_fruit_display: string | null; devil_fruit_name: string | null; has_devil_fruit: boolean;
  haki_raw: string | null; has_armament: boolean; has_observation: boolean; has_conquerors: boolean;
  bounty_display: string | null; bounty_numeric: number | null; bounty_unknown: boolean; bounty_is_minimum: boolean;
  height_cm: number | null; height_unknown: boolean;
  first_arc: string | null; first_arc_order: number | null;
};

type Cell = { value: string; result: "exact" | "partial" | "wrong" | "unknown" | "higher" | "lower" | "earlier" | "later"; label?: string };
type Feedback = {
  character: Cell; gender: Cell; affiliation: Cell; devil_fruit: Cell;
  haki: Cell & { armament?: boolean; observation?: boolean; conquerors?: boolean };
  bounty: Cell; height: Cell; first_arc: Cell;
};

// Classify a character's Devil Fruit into its type per the source spreadsheet.
// Returns one of: "Paramecia" | "Logia" | "Zoan" | "Paramecia/Logia" | "N/A".
function devilFruitType(c: CharRow): string {
  if (!c.has_devil_fruit) return "N/A";
  const name = (c.devil_fruit_name ?? "").trim();
  // Blackbeard — explicit dual type per source document.
  if (/Yami Yami no Mi\s*\/\s*Gura Gura no Mi/i.test(name)) return "Paramecia/Logia";
  // Logia fruits (canonical set present in the source document).
  const LOGIA = new Set([
    "Mera Mera no Mi", "Hie Hie no Mi", "Pika Pika no Mi", "Magu Magu no Mi",
    "Goro Goro no Mi", "Suna Suna no Mi", "Moku Moku no Mi", "Gasu Gasu no Mi",
    "Mori Mori no Mi", "Yami Yami no Mi", "Yuki Yuki no Mi", "Numa Numa no Mi",
  ]);
  if (LOGIA.has(name)) return "Logia";
  // Zoan: natural (Hito/Ryu/Neko/Ushi/Uo/Tori/Kumo/Hebi/Zou/Inu/Sara/Mushi/Kame),
  // mythical/ancient via Model:, artificial SMILE fruits, and Artificial Zoan prefixes.
  if (/\bSMILE\b/i.test(name)) return "Zoan";
  if (/^Artificial\s+/i.test(name)) return "Zoan";
  if (/^(Hito Hito|Ryu Ryu|Neko Neko|Ushi Ushi|Uo Uo|Tori Tori|Kumo Kumo|Hebi Hebi|Zou Zou|Inu Inu|Sara Sara|Mushi Mushi|Kame Kame)\b/i.test(name)) {
    return "Zoan";
  }
  // Everything else categorised as Paramecia (covers Mochi Mochi/Special Paramecia
  // and any unmapped fruit name in the source document).
  return "Paramecia";
}

function computeFeedback(guess: CharRow, target: CharRow): Feedback {
  const fb: Feedback = {
    character: { value: guess.name, result: guess.id === target.id ? "exact" : "wrong" },
    gender: { value: guess.gender ?? "Unknown", result: !guess.gender || !target.gender ? "unknown" : guess.gender === target.gender ? "exact" : "wrong" },
    affiliation: (() => {
      if (!guess.affiliation || !target.affiliation) return { value: guess.affiliation ?? "Unknown", result: "unknown" as const };
      if (guess.affiliation === target.affiliation) return { value: guess.affiliation, result: "exact" as const };
      if (guess.affiliation_category && target.affiliation_category && guess.affiliation_category === target.affiliation_category) return { value: guess.affiliation, result: "partial" as const };
      return { value: guess.affiliation, result: "wrong" as const };
    })(),
    devil_fruit: (() => {
      // Display & comparison are based on Devil Fruit TYPE only — never the fruit name.
      const guessType = devilFruitType(guess);
      const targetType = devilFruitType(target);
      const result = guessType === targetType ? ("exact" as const) : ("wrong" as const);
      return { value: guessType, result };
    })(),
    haki: (() => {
      const g = [guess.has_armament, guess.has_observation, guess.has_conquerors];
      const t = [target.has_armament, target.has_observation, target.has_conquerors];
      const overlap = g.some((v, i) => v && t[i]);
      const equal = g.every((v, i) => v === t[i]);
      const noneEither = g.every(v => !v) && t.every(v => !v);
      const chips = [g[0] && "ARM", g[1] && "OBS", g[2] && "COC"].filter(Boolean).join(" ");
      const value = chips || "—";
      let result: Cell["result"] = "wrong";
      if (noneEither) result = "unknown";
      else if (equal) result = "exact";
      else if (overlap) result = "partial";
      return { value, result, armament: g[0], observation: g[1], conquerors: g[2] };
    })(),
    bounty: (() => {
      return compareGuessBounty(guess, target);
    })(),
    height: (() => {
      const gd = guess.height_cm != null ? `${guess.height_cm} cm` : "Unknown";
      if (guess.height_unknown || target.height_unknown || guess.height_cm == null || target.height_cm == null) return { value: gd, result: "unknown" as const };
      if (guess.height_cm === target.height_cm) return { value: gd, result: "exact" as const };
      return { value: gd, result: target.height_cm > guess.height_cm ? "higher" as const : "lower" as const };
    })(),
    first_arc: (() => {
      const gd = guess.first_arc ?? "Unknown";
      if (guess.first_arc_order == null || target.first_arc_order == null) return { value: gd, result: "unknown" as const };
      if (guess.first_arc_order === target.first_arc_order) return { value: gd, result: "exact" as const };
      return { value: gd, result: target.first_arc_order > guess.first_arc_order ? "later" as const : "earlier" as const };
    })(),
  };
  return fb;
}

type GuessAdminClient = Awaited<ReturnType<typeof admin>>;

const REWARD_PAYOUT_ERROR_MESSAGE = "Could not award Grand Line Guess reward. Please refresh and try again.";

function logGrandLineGuessSupabaseError(
  message: string,
  error: { code?: string; message?: string; details?: string; hint?: string },
) {
  console.error(message, {
    code: error.code,
    message: error.message,
    details: error.details,
    hint: error.hint,
  });
}

async function ensureGrandLineGuessRewardWallet(db: GuessAdminClient, userId: string) {
  const existing = await db
    .from("user_wallets")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (existing.error) {
    logGrandLineGuessSupabaseError("Grand Line Guess wallet precondition check failed", existing.error);
    throw new Error(REWARD_PAYOUT_ERROR_MESSAGE);
  }

  if (existing.data) return;

  const created = await db
    .from("user_wallets")
    .insert({ user_id: userId })
    .select("user_id")
    .maybeSingle();

  if (!created.error) return;

  if (created.error.code === "23505") {
    const raced = await db
      .from("user_wallets")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (!raced.error && raced.data) return;

    if (raced.error) {
      logGrandLineGuessSupabaseError("Grand Line Guess wallet precondition race recheck failed", raced.error);
    }
  }

  logGrandLineGuessSupabaseError("Grand Line Guess wallet precondition insert failed", created.error);
  throw new Error(REWARD_PAYOUT_ERROR_MESSAGE);
}

async function awardGrandLineGuessReward(
  db: GuessAdminClient,
  args: { puzzleId: string; userId: string; attemptNumber: number; rewardAmount: number },
) {
  const { error } = await db.rpc("award_grand_line_guess_reward", {
    _puzzle_id: args.puzzleId,
    _user_id: args.userId,
    _attempt_number: args.attemptNumber,
    _reward_amount: args.rewardAmount,
  });
  if (error) {
    logGrandLineGuessSupabaseError("Grand Line Guess reward RPC failed", error);
    throw new Error(REWARD_PAYOUT_ERROR_MESSAGE);
  }
}

async function awardGrandLineGuessRewardSafely(
  db: GuessAdminClient,
  args: { puzzleId: string; userId: string; attemptNumber: number; rewardAmount: number },
): Promise<string | null> {
  try {
    await ensureGrandLineGuessRewardWallet(db, args.userId);
    await awardGrandLineGuessReward(db, args);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : REWARD_PAYOUT_ERROR_MESSAGE;
  }
}

function utcDate(): string {
  return new Date().toISOString().slice(0, 10);
}

// PUBLIC: safe autocomplete
export const getGrandLineGuessAutocomplete = createServerFn({ method: "GET" })
  .handler(async () => {
    const db = await admin();
    const { data, error } = await db
      .from("grand_line_guess_characters")
      .select("id,slug,name")
      .eq("active", true)
      .order("name");
    if (error) throw error;
    return data ?? [];
  });

async function ensurePuzzle(userId: string) {
  const db = await admin();
  const today = utcDate();
  const existing = await db
    .from("grand_line_guess_daily_puzzles")
    .select("*")
    .eq("user_id", userId)
    .eq("puzzle_date", today)
    .maybeSingle();
  if (existing.data) return existing.data;
  // pick random daily-eligible character
  const { data: chars, error } = await db
    .from("grand_line_guess_characters")
    .select("id")
    .eq("active", true)
    .eq("daily_eligible", true);
  if (error) throw error;
  if (!chars || chars.length === 0) throw new Error("No eligible characters");
  const pick = chars[Math.floor(Math.random() * chars.length)];
  const ins = await db
    .from("grand_line_guess_daily_puzzles")
    .insert({ user_id: userId, puzzle_date: today, character_id: pick.id, status: "active" })
    .select("*").single();
  if (ins.error) {
    // race: re-fetch
    const r = await db.from("grand_line_guess_daily_puzzles").select("*").eq("user_id", userId).eq("puzzle_date", today).single();
    if (r.error) throw r.error;
    return r.data;
  }
  // ensure result row exists
  await db.from("grand_line_guess_results").insert({
    puzzle_id: ins.data.id, user_id: userId,
  }).select().maybeSingle().then(()=>{}, ()=>{});
  return ins.data;
}

const HINT_TIERS: { tier: number; unlock_at: number; label: string }[] = [
  { tier: 1, unlock_at: 3, label: "Gender" },
  { tier: 2, unlock_at: 5, label: "Affiliation" },
  { tier: 3, unlock_at: 7, label: "Devil Fruit" },
];

function computeHintText(tier: number, target: CharRow): string {
  if (tier === 1) return `Gender: ${target.gender?.trim() ? target.gender : "Unknown"}`;
  if (tier === 2) return `Affiliation: ${target.affiliation?.trim() ? target.affiliation : "Unknown"}`;
  if (tier === 3) return target.has_devil_fruit
    ? "The mystery character HAS a Devil Fruit."
    : "The mystery character does NOT have a Devil Fruit.";
  return "Unknown";
}

async function loadState(userId: string) {
  const db = await admin();
  const puzzle = await ensurePuzzle(userId);
  const [attemptsR, resultR, targetR] = await Promise.all([
    db.from("grand_line_guess_attempts").select("*").eq("puzzle_id", puzzle.id).eq("user_id", userId).order("attempt_number"),
    db.from("grand_line_guess_results").select("*").eq("puzzle_id", puzzle.id).eq("user_id", userId).maybeSingle(),
    db.from("grand_line_guess_characters").select("*").eq("id", puzzle.character_id).single(),
  ]);
  const attempts = attemptsR.data ?? [];
  const result = resultR.data;
  const correctAttempt = attempts.find((attempt: { is_correct: boolean }) => attempt.is_correct) ?? null;
  const effectivelySolved = Boolean(result?.solved || correctAttempt);
  const rewardPaid = result?.reward_paid ?? false;
  const rewardPayoutPending = Boolean((result?.solved && !rewardPaid) || (correctAttempt && !rewardPaid));
  const correctAttemptNumber = correctAttempt?.attempt_number ?? (result?.solved ? result.attempts_used : null);
  const pendingRewardAmount = rewardPayoutPending && correctAttemptNumber != null
    ? rewardForAttempt(correctAttemptNumber)
    : null;
  let answer: { name: string; slug: string } | null = null;
  if (effectivelySolved || puzzle.status === "expired") {
    if (targetR.data) answer = { name: targetR.data.name, slug: targetR.data.slug };
  }
  const wrongCount = attempts.filter((attempt: { is_correct: boolean }) => !attempt.is_correct).length;
  const hintsUsed = result?.hints_used ?? 0;
  const target = targetR.data as CharRow | null;
  const hints = HINT_TIERS.map((t) => {
    const revealed = hintsUsed >= t.tier;
    return {
      tier: t.tier,
      label: t.label,
      unlock_at_wrong: t.unlock_at,
      unlocked: wrongCount >= t.unlock_at,
      wrong_needed: Math.max(0, t.unlock_at - wrongCount),
      revealed,
      text: revealed && target ? computeHintText(t.tier, target) : null,
    };
  });
  const nextAttempt = attempts.length + 1;
  const potentialReward = rewardForAttempt(nextAttempt);
  return {
    puzzle_id: puzzle.id,
    puzzle_date: puzzle.puzzle_date,
    status: puzzle.status,
    attempts,
    attempts_used: attempts.length,
    wrong_count: wrongCount,
    hints_used: hintsUsed,
    hints,
    solved: effectivelySolved,
    reward_paid: rewardPaid,
    reward_amount: rewardPaid ? (result?.reward_amount ?? 0) : (pendingRewardAmount ?? result?.reward_amount ?? 0),
    reward_payout_pending: rewardPayoutPending,
    can_retry_payout: Boolean(rewardPayoutPending && correctAttempt),
    pending_reward_amount: pendingRewardAmount,
    potential_next_reward: potentialReward,
    answer,
    reward_error: null as string | null,
  };
}

export const getTodayGrandLineGuessState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => loadState(context.userId));

export const retryGrandLineGuessReward = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await admin();
    const userId = context.userId;
    const puzzle = await ensurePuzzle(userId);

    const correctAttemptR = await db
      .from("grand_line_guess_attempts")
      .select("id,attempt_number,is_correct")
      .eq("puzzle_id", puzzle.id)
      .eq("user_id", userId)
      .eq("is_correct", true)
      .order("attempt_number", { ascending: true })
      .limit(1);

    if (correctAttemptR.error) {
      const state = await loadState(userId);
      return { ...state, reward_error: REWARD_PAYOUT_ERROR_MESSAGE };
    }

    const correctAttempt = correctAttemptR.data?.[0] ?? null;
    if (!correctAttempt) {
      const state = await loadState(userId);
      return { ...state, reward_error: "No unpaid Grand Line Guess reward is available to retry." };
    }

    const resultR = await db
      .from("grand_line_guess_results")
      .select("reward_paid")
      .eq("puzzle_id", puzzle.id)
      .eq("user_id", userId)
      .maybeSingle();

    if (resultR.error) {
      const state = await loadState(userId);
      return { ...state, reward_error: REWARD_PAYOUT_ERROR_MESSAGE };
    }

    if (resultR.data?.reward_paid) {
      return loadState(userId);
    }

    const rewardError = await awardGrandLineGuessRewardSafely(db, {
      puzzleId: puzzle.id,
      userId,
      attemptNumber: correctAttempt.attempt_number,
      rewardAmount: rewardForAttempt(correctAttempt.attempt_number),
    });

    const state = await loadState(userId);
    return rewardError ? { ...state, reward_error: rewardError } : state;
  });

export const submitGrandLineGuess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ guessed_character_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await admin();
    const userId = context.userId;
    const puzzle = await ensurePuzzle(userId);
    if (puzzle.status !== "active") throw new Error("Puzzle is no longer active.");

    const targetR = await db.from("grand_line_guess_characters").select("*").eq("id", puzzle.character_id).single();
    if (targetR.error || !targetR.data) throw new Error("Puzzle target missing.");
    const target = targetR.data as CharRow;

    const guessR = await db.from("grand_line_guess_characters").select("*").eq("id", data.guessed_character_id).eq("active", true).maybeSingle();
    if (!guessR.data) throw new Error("That character is not available.");
    const guess = guessR.data as CharRow;

    // count existing attempts to compute attempt_number
    const existing = await db
      .from("grand_line_guess_attempts")
      .select("id,guessed_character_id,attempt_number,is_correct")
      .eq("puzzle_id", puzzle.id)
      .eq("user_id", userId);
    const duplicateAttempt = existing.data?.find(a => a.guessed_character_id === guess.id);
    if (duplicateAttempt) {
      if (guess.id === target.id && duplicateAttempt.is_correct) {
        const rewardError = await awardGrandLineGuessRewardSafely(db, {
          puzzleId: puzzle.id,
          userId,
          attemptNumber: duplicateAttempt.attempt_number,
          rewardAmount: rewardForAttempt(duplicateAttempt.attempt_number),
        });
        const state = await loadState(userId);
        return rewardError ? { ...state, reward_error: rewardError } : state;
      }
      throw new Error("You already guessed that character.");
    }
    const attemptNumber = (existing.data?.length ?? 0) + 1;

    const feedback = computeFeedback(guess, target);
    const isCorrect = feedback.character.result === "exact";

    const ins = await db.from("grand_line_guess_attempts").insert({
      puzzle_id: puzzle.id, user_id: userId, guessed_character_id: guess.id,
      attempt_number: attemptNumber, feedback, is_correct: isCorrect,
    }).select().single();
    if (ins.error) {
      if (ins.error.code === "23505") {
        const retry = await db
          .from("grand_line_guess_attempts")
          .select("id,guessed_character_id,attempt_number,is_correct")
          .eq("puzzle_id", puzzle.id)
          .eq("user_id", userId)
          .eq("guessed_character_id", guess.id)
          .maybeSingle();
        if (retry.data) {
          if (guess.id === target.id && retry.data.is_correct) {
            const rewardError = await awardGrandLineGuessRewardSafely(db, {
              puzzleId: puzzle.id,
              userId,
              attemptNumber: retry.data.attempt_number,
              rewardAmount: rewardForAttempt(retry.data.attempt_number),
            });
            const state = await loadState(userId);
            return rewardError ? { ...state, reward_error: rewardError } : state;
          }
          throw new Error("You already guessed that character.");
        }
      }
      throw new Error("Could not record guess. Please try again.");
    }

    if (isCorrect) {
      const reward = rewardForAttempt(attemptNumber);
      const rewardError = await awardGrandLineGuessRewardSafely(db, {
        puzzleId: puzzle.id,
        userId,
        attemptNumber,
        rewardAmount: reward,
      });
      if (rewardError) {
        const state = await loadState(userId);
        return { ...state, reward_error: rewardError };
      }
    } else {
      // ensure result row
      const existingResult = await db.from("grand_line_guess_results").select("hints_used").eq("puzzle_id", puzzle.id).eq("user_id", userId).maybeSingle();
      const hintsUsed = existingResult.data?.hints_used ?? 0;
      await db.from("grand_line_guess_results").upsert({
        puzzle_id: puzzle.id, user_id: userId,
        attempts_used: attemptNumber, hints_used: hintsUsed,
        updated_at: new Date().toISOString(),
      }, { onConflict: "puzzle_id,user_id" });
    }

    return loadState(userId);
  });




export const getGrandLineGuessStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await admin();
    const r = await db.from("grand_line_guess_stats").select("*").eq("user_id", context.userId).maybeSingle();
    return r.data;
  });
