import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluatePublicIdentity,
  evaluatePublicIdentityModerationOnly,
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
    term: "reef",
    normalizedTerm: "reef",
    kind: "blocked",
    category: "common_profanity",
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

test("normalizes fullwidth input without contact-info rejection", () => {
  const forms = normalizeIdentityForms("\uff57\uff57\uff57.example.com");
  const result = evaluatePublicIdentity("\uff57\uff57\uff57.example.com", "display_name", rules);

  assert.equal(forms.nfkc, "www.example.com");
  assert.equal(result.allowed, true);
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
      category: "common_profanity",
      matchMode: "compact_substring",
      severity: 3,
      active: true,
    },
  ];

  const result = evaluatePublicIdentity("r33f_runner", "username", protectedRules);

  assert.equal(validateUsernameFormat("r33f_runner").ok, true);
  assert.equal(normalizeIdentityForms("r33f_runner").canonicalUsername, "r33f_runner");
  assert.equal(result.allowed, false);
  if (!result.allowed) assert.equal(result.category, "common_profanity");
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

test("reserved-looking usernames are no longer blocked by moderation", () => {
  const result = evaluatePublicIdentity("staff", "username", rules);

  assert.equal(result.allowed, true);
  for (const value of [
    "admin",
    "administrator",
    "moderator",
    "support",
    "official",
    "system",
    "developer",
    "owner",
    "oda",
    "berrystreet",
  ]) {
    assert.equal(evaluatePublicIdentity(value, "username", rules).allowed, true, value);
  }
});

test("word rules block separated terms without overmatching inside unrelated words", () => {
  const blocked = evaluatePublicIdentity("good badword user", "display_name", rules);
  const allowed = evaluatePublicIdentity("embadworded", "display_name", rules);

  assert.equal(blocked.allowed, false);
  assert.equal(allowed.allowed, true);
});

test("compact substring rules catch separator and leet evasions only when configured", () => {
  const result = evaluatePublicIdentity("r33f runner", "display_name", rules);

  assert.equal(result.allowed, false);
  if (!result.allowed) assert.equal(result.category, "common_profanity");
});

test("compact substring rules catch limited homoglyph substitutions for active categories", () => {
  const result = evaluatePublicIdentity("r\u0435\u0435f runner", "display_name", rules);

  assert.equal(result.allowed, false);
  if (!result.allowed) assert.equal(result.category, "common_profanity");
});

test("allow rules apply only to complete normalized identities", () => {
  assert.equal(evaluatePublicIdentity("classic", "display_name", rules).allowed, true);
  assert.equal(evaluatePublicIdentity("classic badword", "display_name", rules).allowed, false);
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
      category: "common_profanity",
      matchMode: "word",
      severity: 2,
      isCore: true,
      active: true,
    },
    {
      term: "ember",
      normalizedTerm: "ember",
      kind: "blocked",
      category: "threat",
      matchMode: "substring",
      severity: 2,
      isCore: true,
      active: true,
    },
    {
      term: "cipher",
      normalizedTerm: "cipher",
      kind: "blocked",
      category: "privacy_abuse",
      matchMode: "compact_substring",
      severity: 3,
      isCore: true,
      active: true,
    },
  ];

  assert.equal(evaluatePublicIdentity("dock", "display_name", protectedRules).allowed, true);
  assert.equal(evaluatePublicIdentity("emberly", "display_name", protectedRules).allowed, true);
  assert.equal(evaluatePublicIdentity("c1-ph-er", "display_name", protectedRules).allowed, true);

  const result = evaluatePublicIdentity("quiet reef captain", "display_name", protectedRules);
  assert.equal(result.allowed, false, "approved profanity/slur categories should still block");
  if (!result.allowed) assert.equal(result.category, "common_profanity");

  assert.equal(
    evaluatePublicIdentity("harbor friend", "display_name", protectedRules).allowed,
    true,
  );
});

test("contact-looking display names are not rejected by identity moderation alone", () => {
  for (const value of ["www.example.com", "555 123-4567"]) {
    const result = evaluatePublicIdentity(value, "display_name", rules);
    assert.equal(result.allowed, true, `${value} should be allowed by the narrowed policy`);
  }
});

test("non-approved broad categories do not block unless independently approved", () => {
  for (const category of [
    "contact_info",
    "threat",
    "hate_group",
    "harassment",
    "privacy_abuse",
    "sexual_profanity",
  ]) {
    const result = evaluatePublicIdentity("broadterm", "display_name", [
      {
        term: "broadterm",
        normalizedTerm: "broadterm",
        kind: "blocked",
        category,
        matchMode: "exact",
        severity: 3,
        active: true,
      },
    ]);
    assert.equal(result.allowed, true, `${category} should not be enforced`);
  }
});

test("approved profanity and slur categories remain enforceable", () => {
  for (const category of [
    "common_profanity",
    "severe_profanity",
    "racial_ethnic_slur",
    "religious_slur",
    "nationality_slur",
    "sex_gender_slur",
    "sexual_orientation_slur",
    "disability_slur",
  ]) {
    const result = evaluatePublicIdentity("blockedterm", "display_name", [
      {
        term: "blockedterm",
        normalizedTerm: "blockedterm",
        kind: "blocked",
        category,
        matchMode: "exact",
        severity: 3,
        active: true,
      },
    ]);
    assert.equal(result.allowed, false, `${category} should remain enforceable`);
    if (!result.allowed) assert.equal(result.category, category);
  }
});

test("moderation-only evaluation flags active terms without applying new-identity formatting", () => {
  const historicalUsername = "aa";
  const allowed = evaluatePublicIdentityModerationOnly(historicalUsername, "username", rules);
  const blocked = evaluatePublicIdentityModerationOnly("badword", "username", rules);

  assert.equal(validateUsernameFormat(historicalUsername).ok, false);
  assert.equal(allowed.allowed, true);
  assert.equal(blocked.allowed, false);
  if (!blocked.allowed) {
    assert.equal(blocked.code, "blocked");
    assert.equal(blocked.category, "common_profanity");
  }
});
