import { z } from "zod";
import {
  evaluatePublicIdentity,
  normalizeIdentityForms,
  validateUsernameFormat,
  type PublicIdentityEvaluation,
  type PublicIdentityField,
  type PublicIdentityTermRule,
} from "./public-identity";

const termRowSchema = z
  .object({
    id: z.string().uuid(),
    term: z.string(),
    normalized_term: z.string(),
    kind: z.enum(["blocked", "reserved", "allow"]),
    category: z.string(),
    match_mode: z.enum(["exact", "word", "substring", "compact_substring"]),
    severity: z.coerce.number().int().min(1).max(4),
    is_core: z.boolean(),
    active: z.boolean(),
  })
  .strict();

let cachedRules: { expiresAt: number; rules: PublicIdentityTermRule[] } | null = null;
const RULE_CACHE_MS = 60_000;

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

function mapRule(row: z.infer<typeof termRowSchema>): PublicIdentityTermRule {
  return {
    id: row.id,
    term: row.term,
    normalizedTerm: row.normalized_term,
    kind: row.kind,
    category: row.category,
    matchMode: row.match_mode,
    severity: row.severity,
    isCore: row.is_core,
    active: row.active,
  };
}

export function clearIdentityModerationRuleCache() {
  cachedRules = null;
}

export async function loadIdentityModerationRules(options: { force?: boolean } = {}) {
  const now = Date.now();
  if (!options.force && cachedRules && cachedRules.expiresAt > now) return cachedRules.rules;

  const db = await admin();
  const { data, error } = await db
    .from("identity_moderation_terms")
    .select("id,term,normalized_term,kind,category,match_mode,severity,is_core,active")
    .eq("active", true)
    .order("severity", { ascending: false })
    .order("term", { ascending: true });

  if (error) throw new Error("Could not load identity moderation policy.");

  const rules = z
    .array(termRowSchema)
    .parse(data ?? [])
    .map(mapRule);
  cachedRules = { expiresAt: now + RULE_CACHE_MS, rules };
  return rules;
}

export async function evaluatePublicIdentityOnServer(
  value: string,
  field: PublicIdentityField,
): Promise<PublicIdentityEvaluation> {
  const rules = await loadIdentityModerationRules();
  return evaluatePublicIdentity(value, field, rules);
}

export async function evaluateUsernameOnServer(username: string) {
  return evaluatePublicIdentityOnServer(username, "username");
}

export async function evaluateDisplayNameOnServer(displayName: string) {
  return evaluatePublicIdentityOnServer(displayName, "display_name");
}

export async function checkUsernamePolicyAndAvailability(username: string) {
  const format = validateUsernameFormat(username);
  if (!format.ok) {
    return {
      available: false,
      normalizedUsername: normalizeIdentityForms(username).trimmed,
      code: format.code,
      message: format.message,
    } as const;
  }

  const evaluation = await evaluateUsernameOnServer(format.value);
  if (!evaluation.allowed) {
    return {
      available: false,
      normalizedUsername: format.value,
      code: evaluation.code,
      message: evaluation.message,
    } as const;
  }

  const db = await admin();
  const { data, error } = await db
    .from("profiles")
    .select("id")
    .eq("username", format.value)
    .maybeSingle();

  if (error) throw new Error("Could not check username availability.");

  return {
    available: !data,
    normalizedUsername: format.value,
    code: data ? "unavailable" : undefined,
    message: data ? "That username is unavailable. Choose another." : "Username is available.",
  } as const;
}
