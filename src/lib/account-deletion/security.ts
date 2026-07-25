export const ACCOUNT_DELETION_SUCCESS_KEY = "berry-street:account-deletion:success";

export const ACCOUNT_DELETION_REASON_CODES = [
  "LAST_ADMIN_ACCOUNT",
  "ACCOUNT_STORAGE_BLOCKED",
  "ACCOUNT_CONFIRMATION_MISMATCH",
  "ACCOUNT_PROFILE_NOT_FOUND",
  "ACCOUNT_DELETION_FAILED",
] as const;

export type AccountDeletionReasonCode = (typeof ACCOUNT_DELETION_REASON_CODES)[number];

export function isExactAccountDeletionConfirmation(
  currentUsername: string,
  usernameInput: string,
  confirmationUsernameInput: string,
) {
  return (
    usernameInput === currentUsername &&
    confirmationUsernameInput === currentUsername &&
    usernameInput === confirmationUsernameInput
  );
}

export function extractAccountDeletionReasonCode(error: unknown): AccountDeletionReasonCode | null {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return ACCOUNT_DELETION_REASON_CODES.find((code) => message.includes(code)) ?? null;
}

export function accountDeletionMessageForCode(code: AccountDeletionReasonCode | null) {
  switch (code) {
    case "LAST_ADMIN_ACCOUNT":
      return "This is the final administrator account. Assign another administrator before deleting it.";
    case "ACCOUNT_STORAGE_BLOCKED":
      return "This account owns uploaded files that must be removed before deletion. Contact an administrator.";
    case "ACCOUNT_CONFIRMATION_MISMATCH":
      return "Enter your exact username in both confirmation fields.";
    case "ACCOUNT_PROFILE_NOT_FOUND":
      return "Could not confirm this account profile. Please refresh and try again.";
    case "ACCOUNT_DELETION_FAILED":
      return "Could not delete the account. Please try again or contact an administrator.";
    default:
      return "Could not delete the account. Please try again or contact an administrator.";
  }
}
