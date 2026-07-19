import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import {
  evaluatePublicIdentity,
  normalizeIdentityForms,
  type PublicIdentityMatchMode,
  type PublicIdentityTermRule,
  type PublicIdentityTermKind,
} from "@/lib/moderation/public-identity";

type IdentityModerationTermRow = Database["public"]["Tables"]["identity_moderation_terms"]["Row"];
type IdentityModerationFlagRow =
  Database["public"]["Tables"]["identity_moderation_flags"]["Row"] & {
    profiles?: {
      username: string;
      display_name: string | null;
    } | null;
  };
type IdentityModerationActionRow =
  Database["public"]["Tables"]["identity_moderation_actions"]["Row"] & {
    profiles?: {
      username: string;
      display_name: string | null;
    } | null;
  };
type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

const usernameInputSchema = z.object({ username: z.string().max(80) }).strict();

const searchInputSchema = z
  .object({
    query: z.string().max(80).optional().default(""),
  })
  .strict();

const flagListInputSchema = z
  .object({
    status: z.enum(["open", "reviewed", "resolved", "dismissed", "all"]).optional().default("open"),
    limit: z.number().int().min(1).max(100).optional().default(50),
  })
  .strict();

const flagReviewInputSchema = z
  .object({
    flagId: z.string().uuid(),
    status: z.enum(["reviewed", "resolved", "dismissed"]),
    note: z.string().max(500).optional().nullable(),
  })
  .strict();

const resetInputSchema = z
  .object({
    profileId: z.string().uuid(),
    resetUsername: z.boolean().default(true),
    resetDisplayName: z.boolean().default(true),
    reason: z.string().max(500).optional().nullable(),
  })
  .strict();

const addTermInputSchema = z
  .object({
    term: z.string().min(1).max(120),
    kind: z.enum(["blocked", "reserved", "allow"]),
    category: z.string().min(1).max(80),
    matchMode: z.enum(["exact", "word", "substring", "compact_substring"]),
    severity: z.number().int().min(1).max(4),
    notes: z.string().max(500).optional().nullable(),
  })
  .strict();

const termActiveInputSchema = z
  .object({
    termId: z.string().uuid(),
    active: z.boolean(),
  })
  .strict();

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function identityPolicy() {
  return await import("@/lib/moderation/public-identity.server");
}

async function requireAdmin(userId: string, db: Pick<SupabaseClient<Database>, "rpc">) {
  const { data, error } = await db.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (error) throw new Error("Could not verify admin access.");
  if (!data) throw new Error("Forbidden: admin role required");
}

function normalizeTermForMatchMode(term: string, matchMode: PublicIdentityMatchMode) {
  const forms = normalizeIdentityForms(term);
  switch (matchMode) {
    case "compact_substring":
      return forms.compact;
    case "word":
    case "substring":
      return forms.separatorNormalized || forms.compact;
    case "exact":
      return forms.trimmed;
  }
}

function mapIdentityModerationRule(row: IdentityModerationTermRow): PublicIdentityTermRule {
  return {
    id: row.id,
    term: row.term,
    normalizedTerm: row.normalized_term,
    kind: row.kind as PublicIdentityTermKind,
    category: row.category,
    matchMode: row.match_mode as PublicIdentityMatchMode,
    severity: row.severity,
    isCore: row.is_core,
    active: row.active,
  };
}

export const checkPublicUsernameAvailability = createServerFn({ method: "POST" })
  .inputValidator((d) => usernameInputSchema.parse(d))
  .handler(async ({ data }) => {
    try {
      const { checkUsernamePolicyAndAvailability } = await identityPolicy();
      const result = await checkUsernamePolicyAndAvailability(data.username);
      return { available: result.available } as const;
    } catch {
      return { available: false } as const;
    }
  });

export const getIdentityModerationOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId, context.supabase);
    const db = await admin();
    const [
      { count: openFlags, error: openFlagError },
      { count: reviewedFlags, error: reviewedFlagError },
      { count: resolvedFlags, error: resolvedFlagError },
      { count: activeRules, error: ruleError },
      { count: supplementalBlockedTerms, error: blockedRuleError },
      { count: reservedTerms, error: reservedRuleError },
      { count: allowlistTerms, error: allowRuleError },
      { count: recentActions, error: actionError },
    ] = await Promise.all([
      db
        .from("identity_moderation_flags")
        .select("id", { count: "exact", head: true })
        .eq("status", "open"),
      db
        .from("identity_moderation_flags")
        .select("id", { count: "exact", head: true })
        .eq("status", "reviewed"),
      db
        .from("identity_moderation_flags")
        .select("id", { count: "exact", head: true })
        .eq("status", "resolved"),
      db
        .from("identity_moderation_terms")
        .select("id", { count: "exact", head: true })
        .eq("active", true),
      db
        .from("identity_moderation_terms")
        .select("id", { count: "exact", head: true })
        .eq("kind", "blocked")
        .eq("is_core", false),
      db
        .from("identity_moderation_terms")
        .select("id", { count: "exact", head: true })
        .eq("kind", "reserved"),
      db
        .from("identity_moderation_terms")
        .select("id", { count: "exact", head: true })
        .eq("kind", "allow"),
      db.from("identity_moderation_actions").select("id", { count: "exact", head: true }),
    ]);

    if (
      openFlagError ||
      reviewedFlagError ||
      resolvedFlagError ||
      ruleError ||
      blockedRuleError ||
      reservedRuleError ||
      allowRuleError ||
      actionError
    ) {
      throw new Error("Could not load identity moderation overview.");
    }

    return {
      openFlags: openFlags ?? 0,
      reviewedFlags: reviewedFlags ?? 0,
      resolvedFlags: resolvedFlags ?? 0,
      activeRules: activeRules ?? 0,
      supplementalBlockedTerms: supplementalBlockedTerms ?? 0,
      reservedTerms: reservedTerms ?? 0,
      allowlistTerms: allowlistTerms ?? 0,
      recentActions: recentActions ?? 0,
    };
  });

export const searchIdentityModerationProfiles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => searchInputSchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.userId, context.supabase);
    const db = await admin();
    const query = data.query.trim();
    const select = "id,username,display_name,created_at,updated_at";
    const profileId = z.string().uuid().safeParse(query);

    if (profileId.success) {
      const { data: profiles, error } = await db
        .from("profiles")
        .select(select)
        .eq("id", profileId.data)
        .limit(1);

      if (error) throw new Error("Could not search identity moderation profiles.");
      return (profiles ?? []) as ProfileRow[];
    }

    const request = db
      .from("profiles")
      .select(select)
      .order("created_at", { ascending: false })
      .limit(25);

    if (query) {
      const escaped = `%${query.replace(/[%_]/g, "\\$&")}%`;
      const [{ data: usernameMatches, error: usernameError }, { data: displayMatches, error }] =
        await Promise.all([
          db
            .from("profiles")
            .select(select)
            .ilike("username", escaped)
            .order("created_at", { ascending: false })
            .limit(25),
          db
            .from("profiles")
            .select(select)
            .ilike("display_name", escaped)
            .order("created_at", { ascending: false })
            .limit(25),
        ]);

      if (usernameError || error) throw new Error("Could not search identity moderation profiles.");

      const profiles = [...(usernameMatches ?? []), ...(displayMatches ?? [])];
      const byId = new Map<string, (typeof profiles)[number]>();
      for (const profile of profiles) byId.set(profile.id, profile);
      return [...byId.values()]
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, 25) as ProfileRow[];
    }

    const { data: profiles, error } = await request;
    if (error) throw new Error("Could not search identity moderation profiles.");
    return (profiles ?? []) as ProfileRow[];
  });

export const listIdentityModerationFlags = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => flagListInputSchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.userId, context.supabase);
    const db = await admin();
    let request = db
      .from("identity_moderation_flags")
      .select(
        "id,profile_id,field,observed_value,normalized_value,violation_code,category,status,created_at,profiles(username,display_name)",
      )
      .order("created_at", { ascending: false })
      .limit(data.limit);

    if (data.status !== "all") request = request.eq("status", data.status);

    const { data: flags, error } = await request;
    if (error) throw new Error("Could not load identity moderation flags.");
    return (flags ?? []) as IdentityModerationFlagRow[];
  });

export const listIdentityModerationRules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId, context.supabase);
    const db = await admin();
    const { data, error } = await db
      .from("identity_moderation_terms")
      .select(
        "id,term,normalized_term,kind,category,match_mode,severity,notes,is_core,active,created_at,updated_at",
      )
      .or("is_core.eq.false,kind.neq.blocked")
      .order("active", { ascending: false })
      .order("category", { ascending: true })
      .order("term", { ascending: true });

    if (error) throw new Error("Could not load identity moderation rules.");
    return (data ?? []) as IdentityModerationTermRow[];
  });

export const listIdentityModerationActions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId, context.supabase);
    const db = await admin();
    const { data, error } = await db
      .from("identity_moderation_actions")
      .select(
        "id,profile_id,actor_user_id,action_type,field,previous_value,new_value,reason,created_at,profiles(username,display_name)",
      )
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) throw new Error("Could not load identity moderation actions.");
    return (data ?? []) as IdentityModerationActionRow[];
  });

export const markIdentityModerationFlagReviewed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => flagReviewInputSchema.parse(d))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.userId, context.supabase);
    const db = await admin();
    const { data: flag, error: flagError } = await db
      .from("identity_moderation_flags")
      .select("profile_id")
      .eq("id", data.flagId)
      .maybeSingle();

    if (flagError) throw new Error("Could not update moderation flag.");
    if (!flag) throw new Error("Moderation flag not found.");

    const { error } = await db
      .from("identity_moderation_flags")
      .update({
        status: data.status,
        reviewed_by: context.userId,
        reviewed_at: new Date().toISOString(),
        resolution_note: data.note ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.flagId);

    if (error) throw new Error("Could not update moderation flag.");

    const { error: actionError } = await db.from("identity_moderation_actions").insert({
      profile_id: flag.profile_id,
      actor_user_id: context.userId,
      action_type: "flag_review",
      reason: data.note ?? `Flag ${data.flagId} marked ${data.status}.`,
    });
    if (actionError) throw new Error("Could not update moderation flag.");

    return { ok: true };
  });

export const adminResetProfileIdentity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => resetInputSchema.parse(d))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.userId, context.supabase);
    const { data: result, error } = await context.supabase.rpc("admin_reset_profile_identity", {
      _target_profile_id: data.profileId,
      _reset_username: data.resetUsername,
      _reset_display_name: data.resetDisplayName,
      _reason: data.reason ?? null,
    });

    if (error) throw new Error("Could not reset public identity.");
    return result;
  });

export const addIdentityModerationRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => addTermInputSchema.parse(d))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.userId, context.supabase);
    const normalized = normalizeTermForMatchMode(data.term, data.matchMode);
    if (!normalized) throw new Error("Moderation rule term must contain letters or numbers.");
    const db = await admin();
    if (data.kind === "allow") {
      const { data: protectedRules, error: protectedRuleError } = await db
        .from("identity_moderation_terms")
        .select("id,term,normalized_term,kind,category,match_mode,severity,is_core,active")
        .eq("active", true)
        .eq("is_core", true)
        .in("kind", ["blocked", "reserved"])
        .returns<IdentityModerationTermRow[]>();

      if (protectedRuleError) throw new Error("Could not validate moderation rule.");
      const protectedConflict = evaluatePublicIdentity(
        data.term,
        "display_name",
        (protectedRules ?? []).map(mapIdentityModerationRule),
      );
      if (!protectedConflict.allowed && protectedConflict.matchedRule) {
        throw new Error("Allowlist entry conflicts with a protected core rule.");
      }
    }

    const { data: inserted, error } = await db
      .from("identity_moderation_terms")
      .insert({
        term: data.term.trim(),
        normalized_term: normalized,
        kind: data.kind,
        category: data.category.trim(),
        match_mode: data.matchMode,
        severity: data.severity,
        notes: data.notes ?? null,
        is_core: false,
        active: true,
        created_by: context.userId,
      })
      .select("id")
      .single();

    if (error) throw new Error("Could not add moderation rule.");
    const { error: actionError } = await db.from("identity_moderation_actions").insert({
      actor_user_id: context.userId,
      action_type: "rule_create",
      reason: "Supplemental moderation rule created.",
      term_id: inserted.id,
    });
    if (actionError) throw new Error("Could not add moderation rule.");
    const { clearIdentityModerationRuleCache } = await identityPolicy();
    clearIdentityModerationRuleCache();
    return { ok: true };
  });

export const setIdentityModerationRuleActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => termActiveInputSchema.parse(d))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.userId, context.supabase);
    const db = await admin();
    const { data: rule, error: ruleError } = await db
      .from("identity_moderation_terms")
      .select("id,is_core")
      .eq("id", data.termId)
      .maybeSingle();

    if (ruleError) throw new Error("Could not update moderation rule.");
    if (!rule) throw new Error("Moderation rule not found.");
    if (rule.is_core) throw new Error("Core moderation rules cannot be changed here.");

    const { error } = await db
      .from("identity_moderation_terms")
      .update({ active: data.active, updated_at: new Date().toISOString() })
      .eq("id", data.termId);

    if (error) throw new Error("Could not update moderation rule.");
    const { error: actionError } = await db.from("identity_moderation_actions").insert({
      actor_user_id: context.userId,
      action_type: "rule_update",
      reason: data.active ? "Rule reactivated." : "Rule deactivated.",
      term_id: data.termId,
    });
    if (actionError) throw new Error("Could not update moderation rule.");
    const { clearIdentityModerationRuleCache } = await identityPolicy();
    clearIdentityModerationRuleCache();
    return { ok: true };
  });

export const rescanIdentityModerationProfiles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId, context.supabase);
    const db = await admin();
    const { evaluateDisplayNameOnServer, evaluateUsernameOnServer, loadIdentityModerationRules } =
      await identityPolicy();
    const rules = await loadIdentityModerationRules({ force: true });
    const { data: profiles, error } = await db
      .from("profiles")
      .select("id,username,display_name")
      .order("created_at", { ascending: true })
      .limit(1000);

    if (error) throw new Error("Could not rescan identity moderation profiles.");

    let flagged = 0;
    for (const profile of profiles ?? []) {
      for (const field of ["username", "display_name"] as const) {
        const value = field === "username" ? profile.username : profile.display_name;
        if (!value) continue;
        const result =
          field === "username"
            ? await evaluateUsernameOnServer(value)
            : await evaluateDisplayNameOnServer(value);
        if (result.allowed) continue;

        let duplicateRequest = db
          .from("identity_moderation_flags")
          .select("id")
          .eq("profile_id", profile.id)
          .eq("field", field)
          .eq("violation_code", result.code)
          .in("status", ["open", "reviewed"])
          .limit(1);

        if (result.matchedRule?.id) {
          duplicateRequest = duplicateRequest.eq("term_id", result.matchedRule.id);
        } else {
          duplicateRequest = duplicateRequest.is("term_id", null);
        }

        const { data: existingFlags, error: duplicateError } = await duplicateRequest;
        if (duplicateError) throw new Error("Could not rescan identity moderation profiles.");
        if ((existingFlags ?? []).length > 0) continue;

        const { error: insertError } = await db.from("identity_moderation_flags").insert({
          profile_id: profile.id,
          field,
          observed_value: value,
          normalized_value: result.normalized.compact,
          term_id: result.matchedRule?.id ?? null,
          violation_code: result.code,
          category: result.category ?? "format",
          status: "open",
        });

        if (insertError) throw new Error("Could not rescan identity moderation profiles.");
        flagged += 1;
      }
    }

    return { scanned: profiles?.length ?? 0, flagged, activeRules: rules.length };
  });
