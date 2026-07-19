export type PublicIdentityField = "username" | "display_name";

export type PublicIdentityTermKind = "blocked" | "reserved" | "allow";

export type PublicIdentityMatchMode = "exact" | "word" | "substring" | "compact_substring";

export type PublicIdentitySeverity = number;

export type PublicIdentityTermRule = {
  id?: string;
  term: string;
  normalizedTerm: string;
  kind: PublicIdentityTermKind;
  category: string;
  matchMode: PublicIdentityMatchMode;
  severity: PublicIdentitySeverity;
  isCore?: boolean;
  active?: boolean;
};

export type PublicIdentityNormalizedForms = {
  original: string;
  nfkc: string;
  stripped: string;
  lower: string;
  trimmed: string;
  leetNormalized: string;
  separatorNormalized: string;
  compact: string;
  reduced: string;
  reducedCompact: string;
};

export type PublicIdentityValidationResult =
  { ok: true; value: string } | { ok: false; code: PublicIdentityViolationCode; message: string };

export type PublicIdentityEvaluation =
  | {
      allowed: true;
      normalized: PublicIdentityNormalizedForms;
      matchedRule?: PublicIdentityTermRule;
    }
  | {
      allowed: false;
      code: PublicIdentityViolationCode;
      message: string;
      category?: string;
      matchedRule?: PublicIdentityTermRule;
      normalized: PublicIdentityNormalizedForms;
    };

export type PublicIdentityViolationCode =
  | "empty"
  | "too_short"
  | "too_long"
  | "invalid_format"
  | "reserved"
  | "blocked"
  | "contact_info"
  | "unavailable";

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 20;
export const DISPLAY_NAME_MAX_LENGTH = 40;

// eslint-disable-next-line no-control-regex
const zeroWidthAndControl = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\ufeff]/g;
const usernamePattern = /^[a-z0-9](?:[a-z0-9_]{1,18}[a-z0-9])$/;
const displayNameAllowedPattern =
  /^[\p{L}\p{N}\p{M}][\p{L}\p{N}\p{M}\p{Zs} .,'\u2019_!?&()[\]-]*$/u;
const urlPattern = /\b(?:https?:\/\/|www\.)\S+/i;
const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const phonePattern = /(?:\+?\d[\s().-]*){7,}/;
const extremeRepeatedCharacterPattern = /(.)\1{9,}/u;

const confusableCharacters: Record<string, string> = {
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
  "8": "b",
  "@": "a",
  $: "s",
  "!": "i",
  "\u03b1": "a",
  "\u0430": "a",
  "\u03bf": "o",
  "\u043e": "o",
  "\u0441": "c",
  "\u0440": "p",
  "\u0435": "e",
  "\u0445": "x",
  "\u0443": "y",
  "\u0456": "i",
};

function replaceConfusables(value: string) {
  return Array.from(value, (character) => confusableCharacters[character] ?? character).join("");
}

function collapseRuns(value: string) {
  return value.replace(/(.)\1{2,}/gu, "$1$1");
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function toWords(value: string) {
  return normalizeWhitespace(value.replace(/[^\p{L}\p{N}]+/gu, " "));
}

function toCompact(value: string) {
  return value.replace(/[^\p{L}\p{N}]+/gu, "");
}

export function normalizeIdentityForms(value: string): PublicIdentityNormalizedForms {
  const original = String(value ?? "");
  const nfkc = original.normalize("NFKC");
  const stripped = nfkc.replace(zeroWidthAndControl, "");
  const lower = replaceConfusables(stripped.toLowerCase());
  const trimmed = lower.trim();
  const leetNormalized = replaceConfusables(trimmed);
  const separatorNormalized = toWords(leetNormalized);
  const compact = toCompact(leetNormalized);
  const reduced = collapseRuns(separatorNormalized);
  const reducedCompact = toCompact(reduced);

  return {
    original,
    nfkc,
    stripped,
    lower,
    trimmed,
    leetNormalized,
    separatorNormalized,
    compact,
    reduced,
    reducedCompact,
  };
}

export function validateUsernameFormat(value: string): PublicIdentityValidationResult {
  const normalized = normalizeIdentityForms(value);
  const username = normalized.trimmed;

  if (!username) {
    return { ok: false, code: "empty", message: "Choose a username." };
  }

  if (username.length < USERNAME_MIN_LENGTH) {
    return {
      ok: false,
      code: "too_short",
      message: `Username must be at least ${USERNAME_MIN_LENGTH} characters.`,
    };
  }

  if (username.length > USERNAME_MAX_LENGTH) {
    return {
      ok: false,
      code: "too_long",
      message: `Username must be ${USERNAME_MAX_LENGTH} characters or fewer.`,
    };
  }

  if (
    username !== value.trim() ||
    username.includes("__") ||
    !usernamePattern.test(username) ||
    extremeRepeatedCharacterPattern.test(username)
  ) {
    return {
      ok: false,
      code: "invalid_format",
      message: "Use lowercase letters, numbers, and single underscores only.",
    };
  }

  return { ok: true, value: username };
}

export function validateDisplayNameFormat(value: string): PublicIdentityValidationResult {
  const stripped = normalizeIdentityForms(value).stripped;
  const displayName = stripped.trim();

  if (!displayName) {
    return { ok: false, code: "empty", message: "Choose a display name." };
  }

  if (displayName.length > DISPLAY_NAME_MAX_LENGTH) {
    return {
      ok: false,
      code: "too_long",
      message: `Display name must be ${DISPLAY_NAME_MAX_LENGTH} characters or fewer.`,
    };
  }

  if (extremeRepeatedCharacterPattern.test(displayName)) {
    return {
      ok: false,
      code: "invalid_format",
      message: "Display name has too many repeated characters.",
    };
  }

  if (!displayNameAllowedPattern.test(displayName)) {
    return {
      ok: false,
      code: "invalid_format",
      message: "Display name uses unsupported characters.",
    };
  }

  return { ok: true, value: displayName };
}

export function formatIdentityViolation(
  code: PublicIdentityViolationCode,
  field: PublicIdentityField,
) {
  if (code === "reserved") return "That public identity is reserved. Choose another.";
  if (code === "blocked") return "That public identity is not allowed. Choose another.";
  if (code === "contact_info") return "Public identities cannot include contact information.";
  if (code === "unavailable") return "That username is unavailable. Choose another.";
  return field === "username"
    ? "Use lowercase letters, numbers, and single underscores only."
    : "Choose another display name.";
}

function normalizeRule(rule: PublicIdentityTermRule): PublicIdentityTermRule {
  const normalizedTerm = rule.normalizedTerm || normalizeIdentityForms(rule.term).compact;
  return { ...rule, normalizedTerm };
}

function identityContainsContactInfo(value: string) {
  const contactValue = String(value ?? "").normalize("NFKC");
  return (
    urlPattern.test(contactValue) ||
    emailPattern.test(contactValue) ||
    phonePattern.test(contactValue)
  );
}

function matchesWord(source: string, term: string) {
  return source.split(" ").some((word) => word === term);
}

function matchesRule(forms: PublicIdentityNormalizedForms, ruleInput: PublicIdentityTermRule) {
  const rule = normalizeRule(ruleInput);
  const term = rule.normalizedTerm;
  if (!term) return false;

  switch (rule.matchMode) {
    case "exact":
      return forms.trimmed === term || forms.separatorNormalized === term || forms.compact === term;
    case "word":
      return matchesWord(forms.separatorNormalized, term) || matchesWord(forms.reduced, term);
    case "substring":
      return (
        forms.trimmed.includes(term) ||
        forms.separatorNormalized.includes(term) ||
        forms.leetNormalized.includes(term) ||
        forms.reduced.includes(term)
      );
    case "compact_substring":
      return forms.compact.includes(term) || forms.reducedCompact.includes(term);
  }
}

function allowsCompleteIdentity(
  forms: PublicIdentityNormalizedForms,
  ruleInput: PublicIdentityTermRule,
) {
  const rule = normalizeRule(ruleInput);
  return (
    rule.kind === "allow" &&
    (forms.trimmed === rule.normalizedTerm ||
      forms.separatorNormalized === rule.normalizedTerm ||
      forms.compact === rule.normalizedTerm)
  );
}

export function evaluatePublicIdentity(
  value: string,
  field: PublicIdentityField,
  rules: readonly PublicIdentityTermRule[],
): PublicIdentityEvaluation {
  const normalized = normalizeIdentityForms(value);
  if (identityContainsContactInfo(value)) {
    return {
      allowed: false,
      code: "contact_info",
      message: formatIdentityViolation("contact_info", field),
      category: "contact_info",
      normalized,
    };
  }

  const validation =
    field === "username" ? validateUsernameFormat(value) : validateDisplayNameFormat(value);

  if (!validation.ok) {
    return { ...validation, allowed: false, normalized };
  }

  const activeRules = rules.filter((rule) => rule.active !== false);
  const allowRule = activeRules.find((rule) => allowsCompleteIdentity(normalized, rule));
  if (allowRule) return { allowed: true, normalized, matchedRule: allowRule };

  const matchedRule = activeRules.find(
    (rule) => rule.kind !== "allow" && matchesRule(normalized, rule),
  );

  if (matchedRule) {
    const code = matchedRule.kind === "reserved" ? "reserved" : "blocked";
    return {
      allowed: false,
      code,
      message: formatIdentityViolation(code, field),
      category: matchedRule.category,
      matchedRule,
      normalized,
    };
  }

  return { allowed: true, normalized };
}
