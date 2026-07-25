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
  reasonCode: AccountDeletionReasonCode | null;
};

type SupabaseErrorLike = {
  code?: string;
  message?: string;
};

type StorageObjectsQuery = {
  eq(
    column: string,
    value: string,
  ): Promise<{
    count: number | null;
    error: SupabaseErrorLike | null;
  }>;
};

type StorageObjectsTable = {
  select(columns: "id", options: { head: true; count: "exact" }): StorageObjectsQuery;
};

type StorageSchemaClient = {
  schema(schema: "storage"): {
    from(table: "objects"): StorageObjectsTable;
  };
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

async function accountOwnsStorageObjects(db: SupabaseClient<Database>, userId: string) {
  const storageDb = (db as unknown as StorageSchemaClient).schema("storage");
  const ownerIdCheck = await storageDb
    .from("objects")
    .select("id", { head: true, count: "exact" })
    .eq("owner_id", userId);

  if (!ownerIdCheck.error) return Number(ownerIdCheck.count ?? 0) > 0;
  if (ownerIdCheck.error.code !== "42703")
    throw new AccountDeletionError("ACCOUNT_STORAGE_BLOCKED");

  const ownerCheck = await storageDb
    .from("objects")
    .select("id", { head: true, count: "exact" })
    .eq("owner", userId);

  if (ownerCheck.error) throw new AccountDeletionError("ACCOUNT_STORAGE_BLOCKED");
  return Number(ownerCheck.count ?? 0) > 0;
}

async function getReadinessForUser(
  db: SupabaseClient<Database>,
  userId: string,
  claims: unknown,
): Promise<AccountDeletionReadiness> {
  const reauth = getAccountDeletionReauthenticationState(claims);
  const adminState = await getAdminDeletionState(db, userId);
  let storageBlocked = false;

  try {
    storageBlocked = await accountOwnsStorageObjects(db, userId);
  } catch (error) {
    if (error instanceof AccountDeletionError && error.code === "ACCOUNT_STORAGE_BLOCKED") {
      storageBlocked = true;
    } else {
      throw error;
    }
  }

  const reasonCode: AccountDeletionReasonCode | null = adminState.isLastAdmin
    ? "LAST_ADMIN_ACCOUNT"
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
    reasonCode,
  };
}

export const getMyAccountDeletionReadiness = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await admin();
    return getReadinessForUser(db, context.userId, context.claims);
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

    if (await accountOwnsStorageObjects(db, context.userId)) {
      throw new AccountDeletionError("ACCOUNT_STORAGE_BLOCKED");
    }

    const { error } = await db.auth.admin.deleteUser(context.userId, false);
    if (error) {
      logAccountDeletionFailure("auth_delete", "ACCOUNT_DELETION_FAILED");
      throw new AccountDeletionError("ACCOUNT_DELETION_FAILED");
    }

    return { deleted: true } as const;
  });
