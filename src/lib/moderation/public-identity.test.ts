import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluatePublicIdentity,
  normalizeIdentityForms,
  validateDisplayNameFormat,
  validateUsernameFormat,
  type PublicIdentityTermRule,
} from "./public-identity.ts";

const rules: PublicIdentityTermRule[] = [
  {
    term: "staff",
    normalizedTerm: "staff",
    kind: "reserved",
    category: "reserved",
    matchMode: "exact",
    severity: 2,
  },
  {
    term: "badword",
    normalizedTerm: "badword",
    kind: "blocked",
    category: "common_profanity",
    matchMode: "word",
    severity: 2,
  },
  {
    term: "spoiler",
    normalizedTerm: "spoiler",
    kind: "blocked",
    category: "harassment",
    matchMode: "compact_substring",
    severity: 3,
  },
  {
    term: "classic",
    normalizedTerm: "classic",
    kind: "allow",
    category: "allow",
    matchMode: "exact",
    severity: 1,
  },
];

test("normalizes case, separators, leet characters, zero-width characters, and repeats", () => {
  const forms = normalizeIdentityForms("B\u200b4AAD---Wooord!!");

  assert.equal(forms.trimmed, "b4aad---wooord!!");
  assert.equal(forms.canonicalUsername, "b4aad---wooord!!");
  assert.equal(forms.leetNormalized, "baaad---wooordii");
  assert.equal(forms.separatorNormalized, "baaad wooordii");
  assert.equal(forms.compact, "baaadwooordii");
  assert.equal(forms.reduced, "baad woordii");
  assert.equal(forms.reducedCompact, "baadwoordii");
});

test("normalizes fullwidth input before contact-info detection", () => {
  const forms = normalizeIdentityForms("\uff57\uff57\uff57.example.com");
  const result = evaluatePublicIdentity("\uff57\uff57\uff57.example.com", "display_name", rules);

  assert.equal(forms.nfkc, "www.example.com");
  assert.equal(result.allowed, false);
  if (!result.allowed) assert.equal(result.code, "contact_info");
});

test("username format rejects uppercase, punctuation, spaces, doubled underscores, edge underscores, and excessive repeats", () => {
  for (const value of ["Abc", "ab", "abc-", "ab c", "_abc", "abc_", "ab__cd", "aaaaaaaaaa"]) {
    assert.equal(validateUsernameFormat(value).ok, false, `${value} should fail`);
  }

  assert.deepEqual(validateUsernameFormat("luffy_d"), { ok: true, value: "luffy_d" });
  assert.equal(validateUsernameFormat("ｌｕｆｆｙ").ok, false);
});

test("username canonical formatting preserves legitimate digits", () => {
  for (const value of [
    "wesley123",
    "player1",
    "zoro4life",
    "pirate_007",
    "gear5luffy",
    "ace2026",
  ]) {
    assert.deepEqual(validateUsernameFormat(value), { ok: true, value });
  }
});

test("username moderation matching still catches digit obfuscation without changing canonical output", () => {
  const protectedRules: PublicIdentityTermRule[] = [
    {
      term: "reef",
      normalizedTerm: "reef",
      kind: "blocked",
      category: "synthetic",
      matchMode: "compact_substring",
      severity: 3,
      active: true,
    },
  ];

  const result = evaluatePublicIdentity("r33f_runner", "username", protectedRules);

  assert.equal(validateUsernameFormat("r33f_runner").ok, true);
  assert.equal(normalizeIdentityForms("r33f_runner").canonicalUsername, "r33f_runner");
  assert.equal(result.allowed, false);
  if (!result.allowed) assert.equal(result.category, "synthetic");
});

test("display name format accepts ordinary Unicode letters, combining marks, and typographic apostrophes", () => {
  assert.deepEqual(validateDisplayNameFormat("Cafe\u0301 Captain"), {
    ok: true,
    value: "Caf\u00e9 Captain",
  });
  assert.deepEqual(validateDisplayNameFormat("O\u2019Hara Scholar"), {
    ok: true,
    value: "O\u2019Hara Scholar",
  });
  assert.deepEqual(validateDisplayNameFormat("Nami (Navigator)"), {
    ok: true,
    value: "Nami (Navigator)",
  });
  assert.deepEqual(validateDisplayNameFormat("Franky - Shipwright"), {
    ok: true,
    value: "Franky - Shipwright",
  });
});

test("display name format removes unsafe invisible characters and rejects extreme repeats and unsupported symbols", () => {
  assert.deepEqual(validateDisplayNameFormat("  Nami\u200b  "), { ok: true, value: "Nami" });
  assert.equal(validateDisplayNameFormat("aaaaaaaaaa").ok, false);
  assert.equal(validateDisplayNameFormat("Nami 🚀").ok, false);
  assert.equal(validateDisplayNameFormat("Nami [Navigator]").ok, false);
});

test("reserved usernames are blocked by exact normalized identity", () => {
  const result = evaluatePublicIdentity("staff", "username", rules);

  assert.equal(result.allowed, false);
  if (!result.allowed) {
    assert.equal(result.code, "reserved");
    assert.equal(result.category, "reserved");
  }
});

test("word rules block separated terms without overmatching inside unrelated words", () => {
  const blocked = evaluatePublicIdentity("good badword user", "display_name", rules);
  const allowed = evaluatePublicIdentity("embadworded", "display_name", rules);

  assert.equal(blocked.allowed, false);
  assert.equal(allowed.allowed, true);
});

test("compact substring rules catch separator and leet evasions only when configured", () => {
  const result = evaluatePublicIdentity("sp0-il-er", "display_name", rules);

  assert.equal(result.allowed, false);
  if (!result.allowed) assert.equal(result.category, "harassment");
});

test("compact substring rules catch limited homoglyph substitutions", () => {
  const result = evaluatePublicIdentity("sp\u03bfi-ler", "display_name", rules);

  assert.equal(result.allowed, false);
  if (!result.allowed) assert.equal(result.category, "harassment");
});

test("allow rules apply only to complete normalized identities", () => {
  assert.equal(evaluatePublicIdentity("classic", "display_name", rules).allowed, true);
  assert.equal(evaluatePublicIdentity("classic spoiler", "display_name", rules).allowed, false);
});

test("protected core rules can be evaluated before supplemental allowlist creation", () => {
  const protectedRules: PublicIdentityTermRule[] = [
    {
      term: "dock",
      normalizedTerm: "dock",
      kind: "reserved",
      category: "reserved",
      matchMode: "exact",
      severity: 2,
      isCore: true,
      active: true,
    },
    {
      term: "reef",
      normalizedTerm: "reef",
      kind: "blocked",
      category: "synthetic",
      matchMode: "word",
      severity: 2,
      isCore: true,
      active: true,
    },
    {
      term: "ember",
      normalizedTerm: "ember",
      kind: "blocked",
      category: "synthetic",
      matchMode: "substring",
      severity: 2,
      isCore: true,
      active: true,
    },
    {
      term: "cipher",
      normalizedTerm: "cipher",
      kind: "blocked",
      category: "synthetic",
      matchMode: "compact_substring",
      severity: 3,
      isCore: true,
      active: true,
    },
  ];

  for (const value of ["dock", "quiet reef captain", "emberly", "c1-ph-er"]) {
    const result = evaluatePublicIdentity(value, "display_name", protectedRules);
    assert.equal(result.allowed, false, `${value} should conflict with a protected rule`);
    if (!result.allowed) assert.ok(result.matchedRule);
  }

  assert.equal(
    evaluatePublicIdentity("harbor friend", "display_name", protectedRules).allowed,
    true,
  );
});

test("public identity rejects contact information with a generic reason", () => {
  for (const value of ["captain@example.com", "www.example.com", "+1 (555) 123-4567"]) {
    const result = evaluatePublicIdentity(value, "display_name", rules);
    assert.equal(result.allowed, false, `${value} should fail`);
    if (!result.allowed) assert.equal(result.code, "contact_info");
  }
});
