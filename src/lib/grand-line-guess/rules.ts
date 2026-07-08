export type BountyComparable = {
  bounty_display: string | null;
  bounty_numeric: number | null;
  bounty_unknown: boolean;
  bounty_is_minimum?: boolean;
};

export type BountyFeedback = {
  value: string;
  result: "exact" | "higher" | "lower";
};

const UNKNOWN_BOUNTY_PATTERN = /^(?:n\/?a|unknown|none|null|—|-)?$/i;

export function normalizeGuessBounty(character: BountyComparable): { value: number; display: string } {
  const rawDisplay = character.bounty_display?.trim() ?? "";
  const numeric = Number(character.bounty_numeric);
  const hasNumericBounty = Number.isFinite(numeric) && numeric >= 0 && !character.bounty_unknown;

  if (hasNumericBounty) {
    return {
      value: numeric,
      display: UNKNOWN_BOUNTY_PATTERN.test(rawDisplay) ? String(numeric) : rawDisplay,
    };
  }

  return { value: 0, display: "0" };
}

export function compareGuessBounty(guess: BountyComparable, target: BountyComparable): BountyFeedback {
  const guessedBounty = normalizeGuessBounty(guess);
  const targetBounty = normalizeGuessBounty(target);

  if (guessedBounty.value === targetBounty.value) {
    return { value: guessedBounty.display, result: "exact" };
  }

  return {
    value: guessedBounty.display,
    result: targetBounty.value > guessedBounty.value ? "higher" : "lower",
  };
}

export function rewardForWrongGuesses(wrongGuesses: number): number {
  return Math.max(0, 1000 - 100 * Math.max(0, Math.trunc(wrongGuesses)));
}

export function rewardForAttempt(attemptNumber: number): number {
  return rewardForWrongGuesses(Math.max(0, Math.trunc(attemptNumber) - 1));
}
