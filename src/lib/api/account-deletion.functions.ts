import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import {
  accountDeletionMessageForCode,
  type AccountDeletionReasonCode,
} from "@/lib/account-deletion/security";

type AccountDeletionReadiness = {
  canDelete: boolean;
  isAdmin: boolean;
  isLastAdmin: boolean;
  reasonCode: AccountDeletionReasonCode | null;
};

type AuthDeletionErrorLike = {
  code?: unknown;
  message?: unknown;
  status?: unknown;
};

const deleteMyAccountInputSchema = z
  .object({
    username: z.string().min(1),
    confirmationUsername: z.string().min(1),
  })
  .strict();

class AccountDeletionError extends Error {
  constructor(
    readonly code: AccountDeletionReasonCode,
    message = accountDeletionMessageForCode(code),
  ) {
    super(`${code}: ${message}`);
    this.name = "AccountDeletionError";
  }
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function safeErrorField(value: unknown) {
  if (typeof value === "string") return value.toLowerCase();
  if (typeof value === "number") return String(value);
  return "";
}

function isStorageOwnershipDeletionError(error: unknown) {
  if (!isRecord(error)) return false;
  const candidate = error as AuthDeletionErrorLike;
  const haystack = [
    safeErrorField(candidate.code),
    safeErrorField(candidate.message),
    safeErrorField(candidate.status),
  ].join(" ");

  return (
    haystack.includes("storage") &&
    (haystack.includes("object") || haystack.includes("owner") || haystack.includes("ownership"))
  );
}

function logAccountDeletionFailure(stage: string, code: AccountDeletionReasonCode) {
  console.error("[Account deletion]", { stage, code });
}

async function readCurrentProfileUsername(db: SupabaseClient<Database>, userId: string) {
  const { data, error } = await db
    .from("profiles")
    .select("username")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw new AccountDeletionError("ACCOUNT_PROFILE_NOT_FOUND");
  if (!data?.username) throw new AccountDeletionError("ACCOUNT_PROFILE_NOT_FOUND");
  return data.username;
}

async function authUserExists(db: SupabaseClient<Database>, userId: string) {
  const { data, error } = await db.auth.admin.getUserById(userId);
  return !error && Boolean(data.user);
}

async function getAdminDeletionState(db: SupabaseClient<Database>, userId: string) {
  const { data: isAdmin, error: roleError } = await db.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });

  if (roleError) throw roleError;
  if (!isAdmin) return { isAdmin: false, isLastAdmin: false };

  const { data: adminRows, error: adminError } = await db
    .from("user_roles")
    .select("user_id")
    .eq("role", "admin");

  if (adminError) throw adminError;

  let activeAdminCount = 0;
  const seen = new Set<string>();
  for (const row of adminRows ?? []) {
    if (!row.user_id || seen.has(row.user_id)) continue;
    seen.add(row.user_id);
    if (await authUserExists(db, row.user_id)) activeAdminCount += 1;
  }

  return { isAdmin: true, isLastAdmin: activeAdminCount <= 1 };
}

async function getReadinessForUser(
  db: SupabaseClient<Database>,
  userId: string,
): Promise<AccountDeletionReadiness> {
  const adminState = await getAdminDeletionState(db, userId);
  const reasonCode: AccountDeletionReasonCode | null = adminState.isLastAdmin
    ? "LAST_ADMIN_ACCOUNT"
    : null;

  return {
    canDelete: reasonCode === null,
    isAdmin: adminState.isAdmin,
    isLastAdmin: adminState.isLastAdmin,
    reasonCode,
  };
}

export const getMyAccountDeletionReadiness = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await admin();
    return getReadinessForUser(db, context.userId);
  });

export const deleteMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => deleteMyAccountInputSchema.parse(data))
  .handler(async ({ data, context }) => {
    const db = await admin();
    const currentUsername = await readCurrentProfileUsername(db, context.userId);

    if (
      data.username !== currentUsername ||
      data.confirmationUsername !== currentUsername ||
      data.username !== data.confirmationUsername
    ) {
      throw new AccountDeletionError("ACCOUNT_CONFIRMATION_MISMATCH");
    }

    const adminState = await getAdminDeletionState(db, context.userId);
    if (adminState.isLastAdmin) {
      throw new AccountDeletionError("LAST_ADMIN_ACCOUNT");
    }

    const { error } = await db.auth.admin.deleteUser(context.userId, false);
    if (error) {
      const code: AccountDeletionReasonCode = isStorageOwnershipDeletionError(error)
        ? "ACCOUNT_STORAGE_BLOCKED"
        : "ACCOUNT_DELETION_FAILED";
      logAccountDeletionFailure("auth_delete", code);
      throw new AccountDeletionError(code);
    }

    return { deleted: true } as const;
  });
