import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import {
  ACCOUNT_DELETION_CONFIRMATION_PHRASE,
  accountDeletionMessageForCode,
  getAccountDeletionReauthenticationState,
  type AccountDeletionProviderCategory,
  type AccountDeletionReasonCode,
} from "@/lib/account-deletion/security";

type AccountDeletionReadiness = {
  canDelete: boolean;
  requiresReauthentication: boolean;
  providerCategory: AccountDeletionProviderCategory;
  isAdmin: boolean;
  isLastAdmin: boolean;
  storageBlocked: boolean;
  storageCheckFailed: boolean;
  reasonCode: AccountDeletionReasonCode | null;
};

type SupabaseErrorLike = {
  code?: string;
  message?: string;
};

type StorageOwnershipCheck =
  | { status: "checked"; ownsObjects: boolean }
  | { status: "failed"; error: SupabaseErrorLike | null };

type AccountStorageOwnershipRpcClient = {
  rpc(functionName: "my_account_owns_storage_objects"): Promise<{
    data: boolean | null;
    error: SupabaseErrorLike | null;
  }>;
};

const deleteMyAccountInputSchema = z
  .object({
    username: z.string().min(1),
    confirmationPhrase: z.string().min(1),
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

async function checkAccountStorageOwnership(
  db: SupabaseClient<Database>,
): Promise<StorageOwnershipCheck> {
  const { data, error } = await (db as unknown as AccountStorageOwnershipRpcClient).rpc(
    "my_account_owns_storage_objects",
  );

  if (error || typeof data !== "boolean") {
    return { status: "failed", error };
  }

  return { status: "checked", ownsObjects: data === true };
}

async function getReadinessForUser(
  db: SupabaseClient<Database>,
  authenticatedDb: SupabaseClient<Database>,
  userId: string,
  claims: unknown,
): Promise<AccountDeletionReadiness> {
  const reauth = getAccountDeletionReauthenticationState(claims);
  const adminState = await getAdminDeletionState(db, userId);
  let storageBlocked = false;
  let storageCheckFailed = false;

  const storageCheck = await checkAccountStorageOwnership(authenticatedDb);
  if (storageCheck.status === "failed") storageCheckFailed = true;
  if (storageCheck.status === "checked") storageBlocked = storageCheck.ownsObjects;

  const reasonCode: AccountDeletionReasonCode | null = adminState.isLastAdmin
    ? "LAST_ADMIN_ACCOUNT"
    : storageCheckFailed
      ? "ACCOUNT_STORAGE_CHECK_FAILED"
      : storageBlocked
        ? "ACCOUNT_STORAGE_BLOCKED"
        : reauth.requiresReauthentication
          ? "REAUTHENTICATION_REQUIRED"
          : null;

  return {
    canDelete: reasonCode === null,
    requiresReauthentication: reauth.requiresReauthentication,
    providerCategory: reauth.providerCategory,
    isAdmin: adminState.isAdmin,
    isLastAdmin: adminState.isLastAdmin,
    storageBlocked,
    storageCheckFailed,
    reasonCode,
  };
}

export const getMyAccountDeletionReadiness = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await admin();
    return getReadinessForUser(db, context.supabase, context.userId, context.claims);
  });

export const deleteMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => deleteMyAccountInputSchema.parse(data))
  .handler(async ({ data, context }) => {
    const db = await admin();
    const currentUsername = await readCurrentProfileUsername(db, context.userId);

    if (
      data.username !== currentUsername ||
      data.confirmationPhrase !== ACCOUNT_DELETION_CONFIRMATION_PHRASE
    ) {
      throw new AccountDeletionError("ACCOUNT_CONFIRMATION_MISMATCH");
    }

    const reauth = getAccountDeletionReauthenticationState(context.claims);
    if (reauth.requiresReauthentication) {
      throw new AccountDeletionError("REAUTHENTICATION_REQUIRED");
    }

    const adminState = await getAdminDeletionState(db, context.userId);
    if (adminState.isLastAdmin) {
      throw new AccountDeletionError("LAST_ADMIN_ACCOUNT");
    }

    const storageCheck = await checkAccountStorageOwnership(context.supabase);
    if (storageCheck.status === "failed") {
      throw new AccountDeletionError("ACCOUNT_STORAGE_CHECK_FAILED");
    }
    if (storageCheck.ownsObjects) {
      throw new AccountDeletionError("ACCOUNT_STORAGE_BLOCKED");
    }

    const { error } = await db.auth.admin.deleteUser(context.userId, false);
    if (error) {
      logAccountDeletionFailure("auth_delete", "ACCOUNT_DELETION_FAILED");
      throw new AccountDeletionError("ACCOUNT_DELETION_FAILED");
    }

    return { deleted: true } as const;
  });
