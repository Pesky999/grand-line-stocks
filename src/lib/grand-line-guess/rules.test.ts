/// <reference types="node" />

import assert from "node:assert/strict";
import test from "node:test";
import { compareGuessBounty, normalizeGuessBounty, rewardForAttempt, rewardForWrongGuesses, type BountyComparable } from "./rules.ts";

function bounty(input: Partial<BountyComparable>): BountyComparable {
  return {
    bounty_display: null,
    bounty_numeric: null,
    bounty_unknown: false,
    bounty_is_minimum: false,
    ...input,
  };
}

test("numeric bounty feedback points up when the correct bounty is higher", () => {
  assert.deepEqual(
    compareGuessBounty(bounty({ bounty_display: "100", bounty_numeric: 100 }), bounty({ bounty_display: "500", bounty_numeric: 500 })),
    { value: "100", result: "higher" },
  );
});

test("numeric bounty feedback points down when the correct bounty is lower", () => {
  assert.deepEqual(
    compareGuessBounty(bounty({ bounty_display: "500", bounty_numeric: 500 }), bounty({ bounty_display: "100", bounty_numeric: 100 })),
    { value: "500", result: "lower" },
  );
});

test("equal bounties produce the exact indicator", () => {
  assert.deepEqual(
    compareGuessBounty(bounty({ bounty_display: "300", bounty_numeric: 300 }), bounty({ bounty_display: "300", bounty_numeric: 300 })),
    { value: "300", result: "exact" },
  );
});

test("minimum bounties are treated as real numeric values", () => {
  assert.deepEqual(
    compareGuessBounty(
      bounty({ bounty_display: "At least 80", bounty_numeric: 80, bounty_is_minimum: true }),
      bounty({ bounty_display: "At least 80", bounty_numeric: 80, bounty_is_minimum: true }),
    ),
    { value: "At least 80", result: "exact" },
  );
});

test("null bounty normalizes to display and numeric value 0", () => {
  assert.deepEqual(normalizeGuessBounty(bounty({ bounty_display: null, bounty_numeric: null })), { value: 0, display: "0" });
});

test("blank, N/A, and unknown bounties normalize to 0", () => {
  for (const value of ["", " ", "N/A", "NA", "Unknown", "unknown", "—", "-"]) {
    assert.deepEqual(
      normalizeGuessBounty(bounty({ bounty_display: value, bounty_numeric: null, bounty_unknown: true })),
      { value: 0, display: "0" },
      `${value} should normalize to zero`,
    );
  }
});

test("guessed no bounty versus correct numeric bounty displays 0 with an up arrow result", () => {
  assert.deepEqual(
    compareGuessBounty(bounty({ bounty_display: "N/A", bounty_numeric: null, bounty_unknown: true }), bounty({ bounty_display: "150", bounty_numeric: 150 })),
    { value: "0", result: "higher" },
  );
});

test("correct character with no bounty compares against 0", () => {
  assert.deepEqual(
    compareGuessBounty(bounty({ bounty_display: "90", bounty_numeric: 90 }), bounty({ bounty_display: null, bounty_numeric: null, bounty_unknown: true })),
    { value: "90", result: "lower" },
  );
});

test("reward formula decreases by wrong guesses and bottoms out at 0", () => {
  assert.equal(rewardForWrongGuesses(0), 1000);
  assert.equal(rewardForWrongGuesses(1), 900);
  assert.equal(rewardForWrongGuesses(2), 800);
  assert.equal(rewardForWrongGuesses(9), 100);
  assert.equal(rewardForWrongGuesses(10), 0);
  assert.equal(rewardForWrongGuesses(11), 0);
});

test("attempt-based rewards match the authoritative wrong-guess formula", () => {
  assert.equal(rewardForAttempt(1), 1000);
  assert.equal(rewardForAttempt(2), 900);
  assert.equal(rewardForAttempt(3), 800);
  assert.equal(rewardForAttempt(10), 100);
  assert.equal(rewardForAttempt(11), 0);
  assert.equal(rewardForAttempt(12), 0);
});
