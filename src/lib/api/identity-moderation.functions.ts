import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

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

const mutationResultSchema = z
  .object({
    ok: z.boolean(),
    code: z.string().optional(),
  })
  .passthrough();

async function publicSupabase() {
  const { getPublicSupabaseClient } = await import("@/integrations/supabase/public.server");
  return getPublicSupabaseClient();
}

export const checkPublicUsernameAvailability = createServerFn({ method: "POST" })
  .inputValidator((d) => usernameInputSchema.parse(d))
  .handler(async ({ data }) => {
    try {
      const db = await publicSupabase();
      const { data: available, error } = await db.rpc(
        "check_public_username_policy_and_availability",
        { _username: data.username },
      );
      return { available: !error && available === true } as const;
    } catch {
      return { available: false } as const;
    }
  });

export const getIdentityModerationOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("admin_get_identity_moderation_overview");
    if (error) throw new Error("Could not load identity moderation overview.");
    return data as {
      openFlags: number;
      reviewedFlags: number;
      resolvedFlags: number;
      activeRules: number;
      supplementalBlockedTerms: number;
      reservedTerms: number;
      allowlistTerms: number;
      recentActions: number;
    };
  });

export const searchIdentityModerationProfiles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => searchInputSchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { data: profiles, error } = await context.supabase.rpc(
      "admin_search_identity_moderation_profiles",
      { _query: data.query },
    );
    if (error) throw new Error("Could not search identity moderation profiles.");
    return (profiles ?? []) as unknown as ProfileRow[];
  });

export const listIdentityModerationFlags = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => flagListInputSchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { data: flags, error } = await context.supabase.rpc(
      "admin_list_identity_moderation_flags",
      { _status: data.status, _limit: data.limit },
    );
    if (error) throw new Error("Could not load identity moderation flags.");
    return (flags ?? []) as unknown as IdentityModerationFlagRow[];
  });

export const listIdentityModerationRules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("admin_list_identity_moderation_rules");
    if (error) throw new Error("Could not load identity moderation rules.");
    return (data ?? []) as unknown as IdentityModerationTermRow[];
  });

export const listIdentityModerationActions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("admin_list_identity_moderation_actions");
    if (error) throw new Error("Could not load identity moderation actions.");
    return (data ?? []) as unknown as IdentityModerationActionRow[];
  });

export const markIdentityModerationFlagReviewed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => flagReviewInputSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: rawResult, error } = await context.supabase.rpc(
      "admin_mark_identity_moderation_flag_reviewed",
      { _flag_id: data.flagId, _status: data.status, _note: data.note ?? null },
    );
    if (error) throw new Error("Could not update moderation flag.");
    const parsed = mutationResultSchema.safeParse(rawResult);
    if (!parsed.success) throw new Error("Could not update moderation flag.");
    const result = parsed.data;
    if (!result.ok && result.code === "not_found") throw new Error("Moderation flag not found.");
    if (!result.ok) throw new Error("Could not update moderation flag.");
    return { ok: true };
  });

export const adminResetProfileIdentity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => resetInputSchema.parse(d))
  .handler(async ({ data, context }) => {
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
    const { data: rawResult, error } = await context.supabase.rpc(
      "admin_add_identity_moderation_rule",
      {
        _term: data.term,
        _kind: data.kind,
        _category: data.category,
        _match_mode: data.matchMode,
        _severity: data.severity,
        _notes: data.notes ?? null,
      },
    );
    if (error) throw new Error("Could not add moderation rule.");
    const parsed = mutationResultSchema.safeParse(rawResult);
    if (!parsed.success) throw new Error("Could not add moderation rule.");
    const result = parsed.data;
    if (!result.ok && result.code === "empty") {
      throw new Error("Moderation rule term must contain letters or numbers.");
    }
    if (!result.ok && result.code === "protected_conflict") {
      throw new Error("Allowlist entry conflicts with a protected core rule.");
    }
    if (!result.ok && result.code === "category") {
      throw new Error("Only profanity and slur categories can be enforced.");
    }
    if (!result.ok) throw new Error("Could not add moderation rule.");
    return { ok: true };
  });

export const setIdentityModerationRuleActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => termActiveInputSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: rawResult, error } = await context.supabase.rpc(
      "admin_set_identity_moderation_rule_active",
      { _term_id: data.termId, _active: data.active },
    );
    if (error) throw new Error("Could not update moderation rule.");
    const parsed = mutationResultSchema.safeParse(rawResult);
    if (!parsed.success) throw new Error("Could not update moderation rule.");
    const result = parsed.data;
    if (!result.ok && result.code === "not_found") throw new Error("Moderation rule not found.");
    if (!result.ok && result.code === "core") {
      throw new Error("Core moderation rules cannot be changed here.");
    }
    if (!result.ok && result.code === "category") {
      throw new Error("Only profanity and slur categories can be enforced.");
    }
    if (!result.ok) throw new Error("Could not update moderation rule.");
    return { ok: true };
  });

export const rescanIdentityModerationProfiles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("admin_rescan_identity_moderation_profiles");
    if (error) throw new Error("Could not rescan identity moderation profiles.");
    return data as { scanned: number; flagged: number; activeRules: number };
  });
