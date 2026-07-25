export const ACCOUNT_DELETION_CONFIRMATION_PHRASE = "DELETE MY ACCOUNT";
export const ACCOUNT_DELETION_RECENT_AUTH_MS = 10 * 60 * 1000;
export const ACCOUNT_DELETION_INTENT_KEY = "berry-street:account-deletion:intent";
export const ACCOUNT_DELETION_SUCCESS_KEY = "berry-street:account-deletion:success";

export const ACCOUNT_DELETION_REASON_CODES = [
  "REAUTHENTICATION_REQUIRED",
  "LAST_ADMIN_ACCOUNT",
  "ACCOUNT_STORAGE_BLOCKED",
  "ACCOUNT_CONFIRMATION_MISMATCH",
  "ACCOUNT_PROFILE_NOT_FOUND",
  "ACCOUNT_DELETION_FAILED",
] as const;

export type AccountDeletionReasonCode = (typeof ACCOUNT_DELETION_REASON_CODES)[number];
export type AccountDeletionProviderCategory = "password" | "oauth" | "unknown";

type JwtClaims = {
  amr?: unknown;
  app_metadata?: unknown;
};

type ClaimMetadata = {
  provider?: unknown;
  providers?: unknown;
};

type AmrRecord = {
  method?: unknown;
  provider?: unknown;
  timestamp?: unknown;
};

export type AccountDeletionReauthenticationState = {
  providerCategory: AccountDeletionProviderCategory;
  requiresReauthentication: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function providerCategoryFromName(value: unknown): AccountDeletionProviderCategory {
  if (typeof value !== "string") return "unknown";
  const normalized = value.toLowerCase();
  if (normalized === "password" || normalized === "email" || normalized === "email_password") {
    return "password";
  }
  if (
    normalized === "oauth" ||
    normalized === "google" ||
    normalized === "apple" ||
    normalized === "microsoft" ||
    normalized === "sso"
  ) {
    return "oauth";
  }
  return "unknown";
}

function providerCategoryFromClaims(claims: JwtClaims): AccountDeletionProviderCategory {
  if (!isRecord(claims.app_metadata)) return "unknown";
  const metadata = claims.app_metadata as ClaimMetadata;
  const direct = providerCategoryFromName(metadata.provider);
  if (direct !== "unknown") return direct;
  if (!Array.isArray(metadata.providers)) return "unknown";

  for (const provider of metadata.providers) {
    const category = providerCategoryFromName(provider);
    if (category !== "unknown") return category;
  }

  return "unknown";
}

function timestampToMilliseconds(value: unknown): number | null {
  const timestamp =
    typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(timestamp) || timestamp < 0) return null;
  return timestamp > 10_000_000_000 ? timestamp : timestamp * 1000;
}

function categoryFromAmrRecord(record: AmrRecord): AccountDeletionProviderCategory {
  const methodCategory = providerCategoryFromName(record.method);
  if (methodCategory !== "unknown") return methodCategory;
  return providerCategoryFromName(record.provider);
}

function primaryAuthenticationCategoryFromAmrMethod(
  method: unknown,
): AccountDeletionProviderCategory {
  if (method === "password") return "password";
  if (method === "oauth") return "oauth";
  return "unknown";
}

export function getAccountDeletionReauthenticationState(
  claims: unknown,
  nowMs = Date.now(),
): AccountDeletionReauthenticationState {
  const parsedClaims: JwtClaims = isRecord(claims) ? claims : {};
  let providerCategory = providerCategoryFromClaims(parsedClaims);
  let hasFreshAuthentication = false;

  if (Array.isArray(parsedClaims.amr)) {
    for (const entry of parsedClaims.amr) {
      if (!isRecord(entry)) continue;
      const record = entry as AmrRecord;
      const entryCategory = categoryFromAmrRecord(record);
      if (entryCategory !== "unknown") providerCategory = entryCategory;
      const primaryAuthenticationCategory = primaryAuthenticationCategoryFromAmrMethod(
        record.method,
      );
      if (primaryAuthenticationCategory === "unknown") continue;
      const timestampMs = timestampToMilliseconds(record.timestamp);
      if (timestampMs === null) continue;
      const ageMs = nowMs - timestampMs;
      const futureToleranceMs = 60_000;
      if (ageMs >= -futureToleranceMs && ageMs <= ACCOUNT_DELETION_RECENT_AUTH_MS) {
        hasFreshAuthentication = true;
      }
    }
  }

  return {
    providerCategory,
    requiresReauthentication: !hasFreshAuthentication,
  };
}

export function isExactAccountDeletionConfirmation(
  currentUsername: string,
  usernameInput: string,
  confirmationPhrase: string,
) {
  return (
    usernameInput === currentUsername && confirmationPhrase === ACCOUNT_DELETION_CONFIRMATION_PHRASE
  );
}

export function extractAccountDeletionReasonCode(error: unknown): AccountDeletionReasonCode | null {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return ACCOUNT_DELETION_REASON_CODES.find((code) => message.includes(code)) ?? null;
}

export function accountDeletionMessageForCode(code: AccountDeletionReasonCode | null) {
  switch (code) {
    case "REAUTHENTICATION_REQUIRED":
      return "Reauthenticate your account before deleting it.";
    case "LAST_ADMIN_ACCOUNT":
      return "This is the final administrator account. Assign another administrator before deleting it.";
    case "ACCOUNT_STORAGE_BLOCKED":
      return "This account owns uploaded files that must be removed before deletion. Contact an administrator.";
    case "ACCOUNT_CONFIRMATION_MISMATCH":
      return "Enter your exact username and type DELETE MY ACCOUNT exactly.";
    case "ACCOUNT_PROFILE_NOT_FOUND":
      return "Could not confirm this account profile. Please refresh and try again.";
    case "ACCOUNT_DELETION_FAILED":
      return "Could not delete the account. Please try again or contact an administrator.";
    default:
      return "Could not delete the account. Please try again or contact an administrator.";
  }
}
