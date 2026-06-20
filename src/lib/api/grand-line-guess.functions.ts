import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

type CharRow = {
  id: string;
  name: string;
  slug: string;
  gender: string | null;
  affiliation: string | null;
  affiliation_category: string | null;
  devil_fruit_display: string | null;
  devil_fruit_name: string | null;
  has_devil_fruit: boolean;
  haki_raw: string | null;
  has_armament: boolean;
  has_observation: boolean;
  has_conquerors: boolean;
  bounty_display: string | null;
  bounty_numeric: number | null;
  bounty_unknown: boolean;
  bounty_is_minimum: boolean;
  height_cm: number | null;
  height_unknown: boolean;
  first_arc: string | null;
  first_arc_order: number | null;
};

type Cell = {
  value: string;
  result: "exact" | "partial" | "wrong" | "unknown" | "higher" | "lower" | "earlier" | "later";
  label?: string;
};
type Feedback = {
  character: Cell;
  gender: Cell;
  affiliation: Cell;
  devil_fruit: Cell;
  haki: Cell & { armament?: boolean; observation?: boolean; conquerors?: boolean };
  bounty: Cell;
  height: Cell;
  first_arc: Cell;
};

function computeFeedback(guess: CharRow, target: CharRow): Feedback {
  const fb: Feedback = {
    character: { value: guess.name, result: guess.id === target.id ? "exact" : "wrong" },
    gender: {
      value: guess.gender ?? "Unknown",
      result:
        !guess.gender || !target.gender
          ? "unknown"
          : guess.gender === target.gender
            ? "exact"
            : "wrong",
    },
    affiliation: (() => {
      if (!guess.affiliation || !target.affiliation)
        return { value: guess.affiliation ?? "Unknown", result: "unknown" as const };
      if (guess.affiliation === target.affiliation)
        return { value: guess.affiliation, result: "exact" as const };
      if (
        guess.affiliation_category &&
        target.affiliation_category &&
        guess.affiliation_category === target.affiliation_category
      )
        return { value: guess.affiliation, result: "partial" as const };
      return { value: guess.affiliation, result: "wrong" as const };
    })(),
    devil_fruit: (() => {
      const gd = guess.devil_fruit_display ?? "No Known Devil Fruit";
      if (guess.has_devil_fruit && target.has_devil_fruit) {
        if (
          guess.devil_fruit_name &&
          target.devil_fruit_name &&
          guess.devil_fruit_name === target.devil_fruit_name
        )
          return { value: gd, result: "exact" as const };
        return { value: gd, result: "partial" as const };
      }
      if (!guess.has_devil_fruit && !target.has_devil_fruit)
        return { value: gd, result: "exact" as const };
      return { value: gd, result: "wrong" as const };
    })(),
    haki: (() => {
      const g = [guess.has_armament, guess.has_observation, guess.has_conquerors];
      const t = [target.has_armament, target.has_observation, target.has_conquerors];
      const overlap = g.some((v, i) => v && t[i]);
      const equal = g.every((v, i) => v === t[i]);
      const noneEither = g.every((v) => !v) && t.every((v) => !v);
      const chips = [g[0] && "ARM", g[1] && "OBS", g[2] && "COC"].filter(Boolean).join(" ");
      const value = chips || "—";
      let result: Cell["result"] = "wrong";
      if (noneEither) result = "unknown";
      else if (equal) result = "exact";
      else if (overlap) result = "partial";
      return { value, result, armament: g[0], observation: g[1], conquerors: g[2] };
    })(),
    bounty: (() => {
      const gd = guess.bounty_display ?? "Unknown";
      if (
        guess.bounty_unknown ||
        target.bounty_unknown ||
        guess.bounty_numeric == null ||
        target.bounty_numeric == null
      ) {
        return { value: gd, result: "unknown" as const };
      }
      if (
        guess.bounty_numeric === target.bounty_numeric &&
        !guess.bounty_is_minimum &&
        !target.bounty_is_minimum
      )
        return { value: gd, result: "exact" as const };
      if (target.bounty_numeric > guess.bounty_numeric)
        return { value: gd, result: "higher" as const };
      if (target.bounty_numeric < guess.bounty_numeric)
        return { value: gd, result: "lower" as const };
      return { value: gd, result: "partial" as const };
    })(),
    height: (() => {
      const gd = guess.height_cm != null ? `${guess.height_cm} cm` : "Unknown";
      if (
        guess.height_unknown ||
        target.height_unknown ||
        guess.height_cm == null ||
        target.height_cm == null
      )
        return { value: gd, result: "unknown" as const };
      if (guess.height_cm === target.height_cm) return { value: gd, result: "exact" as const };
      return {
        value: gd,
        result: target.height_cm > guess.height_cm ? ("higher" as const) : ("lower" as const),
      };
    })(),
    first_arc: (() => {
      const gd = guess.first_arc ?? "Unknown";
      if (guess.first_arc_order == null || target.first_arc_order == null)
        return { value: gd, result: "unknown" as const };
      if (guess.first_arc_order === target.first_arc_order)
        return { value: gd, result: "exact" as const };
      return {
        value: gd,
        result:
          target.first_arc_order > guess.first_arc_order
            ? ("later" as const)
            : ("earlier" as const),
      };
    })(),
  };
  return fb;
}

const REWARDS = [750, 600, 500, 400, 300, 200, 100];
function rewardForAttempt(n: number) {
  return n <= 0 ? 0 : REWARDS[Math.min(n, REWARDS.length) - 1];
}

function utcDate(): string {
  return new Date().toISOString().slice(0, 10);
}

// PUBLIC: safe autocomplete
export const getGrandLineGuessAutocomplete = createServerFn({ method: "GET" }).handler(async () => {
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
    .select("*")
    .single();
  if (ins.error) {
    // race: re-fetch
    const r = await db
      .from("grand_line_guess_daily_puzzles")
      .select("*")
      .eq("user_id", userId)
      .eq("puzzle_date", today)
      .single();
    if (r.error) throw r.error;
    return r.data;
  }
  // ensure result row exists
  await db
    .from("grand_line_guess_results")
    .insert({
      puzzle_id: ins.data.id,
      user_id: userId,
    })
    .select()
    .maybeSingle()
    .then(
      () => {},
      () => {},
    );
  return ins.data;
}

async function loadState(userId: string) {
  const db = await admin();
  const puzzle = await ensurePuzzle(userId);
  const [attemptsR, resultR] = await Promise.all([
    db
      .from("grand_line_guess_attempts")
      .select("*")
      .eq("puzzle_id", puzzle.id)
      .eq("user_id", userId)
      .order("attempt_number"),
    db
      .from("grand_line_guess_results")
      .select("*")
      .eq("puzzle_id", puzzle.id)
      .eq("user_id", userId)
      .maybeSingle(),
  ]);
  let answer: { name: string; slug: string } | null = null;
  if (puzzle.status === "solved" || puzzle.status === "expired") {
    const targetR = await db
      .from("grand_line_guess_characters")
      .select("name,slug")
      .eq("id", puzzle.character_id)
      .single();
    if (targetR.data) answer = { name: targetR.data.name, slug: targetR.data.slug };
  }
  const attempts = attemptsR.data ?? [];
  const result = resultR.data;
  const nextAttempt = attempts.length + 1;
  const potentialReward = rewardForAttempt(nextAttempt);
  return {
    puzzle_id: puzzle.id,
    puzzle_date: puzzle.puzzle_date,
    status: puzzle.status,
    attempts,
    attempts_used: attempts.length,
    solved: result?.solved ?? false,
    reward_paid: result?.reward_paid ?? false,
    reward_amount: result?.reward_amount ?? 0,
    potential_next_reward: potentialReward,
    answer,
  };
}

export const getTodayGrandLineGuessState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => loadState(context.userId));

async function awardReward(
  db: Awaited<ReturnType<typeof admin>>,
  puzzleId: string,
  userId: string,
  attemptNumber: number,
  reward: number,
) {
  type AwardRewardRpc = (
    fn: "award_grand_line_guess_reward",
    args: {
      _puzzle_id: string;
      _user_id: string;
      _attempt_number: number;
      _reward_amount: number;
    },
  ) => Promise<{ data: boolean | null; error: { message: string } | null }>;

  const rpc = db.rpc as unknown as AwardRewardRpc;
  const { data, error } = await rpc("award_grand_line_guess_reward", {
    _puzzle_id: puzzleId,
    _user_id: userId,
    _attempt_number: attemptNumber,
    _reward_amount: reward,
  });
  if (error) throw new Error(error.message);
  return data === true;
}

export const submitGrandLineGuess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ guessed_character_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await admin();
    const userId = context.userId;
    const puzzle = await ensurePuzzle(userId);
    if (puzzle.status !== "active") throw new Error("Puzzle is no longer active.");

    const targetR = await db
      .from("grand_line_guess_characters")
      .select("*")
      .eq("id", puzzle.character_id)
      .single();
    if (targetR.error || !targetR.data) throw new Error("Puzzle target missing.");
    const target = targetR.data as CharRow;

    const guessR = await db
      .from("grand_line_guess_characters")
      .select("*")
      .eq("id", data.guessed_character_id)
      .eq("active", true)
      .maybeSingle();
    if (!guessR.data) throw new Error("That character is not available.");
    const guess = guessR.data as CharRow;

    // count existing attempts to compute attempt_number
    const existing = await db
      .from("grand_line_guess_attempts")
      .select("id,guessed_character_id")
      .eq("puzzle_id", puzzle.id)
      .eq("user_id", userId);
    if (existing.data?.some((a) => a.guessed_character_id === guess.id))
      throw new Error("You already guessed that character.");
    const attemptNumber = (existing.data?.length ?? 0) + 1;

    const feedback = computeFeedback(guess, target);
    const isCorrect = feedback.character.result === "exact";

    const ins = await db
      .from("grand_line_guess_attempts")
      .insert({
        puzzle_id: puzzle.id,
        user_id: userId,
        guessed_character_id: guess.id,
        attempt_number: attemptNumber,
        feedback,
        is_correct: isCorrect,
      })
      .select()
      .single();
    if (ins.error) {
      if (ins.error.code === "23505") {
        const detail = `${ins.error.message ?? ""} ${ins.error.details ?? ""}`;
        if (detail.includes("guessed_character_id")) {
          throw new Error("You already guessed that character.");
        }
        throw new Error("Another guess was recorded at the same time. Refresh and try again.");
      }
      throw new Error("Could not record guess. Please try again.");
    }

    if (isCorrect) {
      const reward = rewardForAttempt(attemptNumber);
      await awardReward(db, puzzle.id, userId, attemptNumber, reward);
    } else {
      await db.from("grand_line_guess_results").upsert(
        {
          puzzle_id: puzzle.id,
          user_id: userId,
          attempts_used: attemptNumber,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "puzzle_id,user_id" },
      );
    }

    return loadState(userId);
  });

export const getGrandLineGuessStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await admin();
    const r = await db
      .from("grand_line_guess_stats")
      .select("*")
      .eq("user_id", context.userId)
      .maybeSingle();
    return r.data;
  });
