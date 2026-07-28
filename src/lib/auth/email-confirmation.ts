export const EMAIL_CONFIRMATION_RESEND_COOLDOWN_MS = 60_000;

type SignupConfirmationResendInput = {
  type: "signup";
  email: string;
};

type SignupConfirmationResend = (
  input: SignupConfirmationResendInput,
) => Promise<{ error: unknown | null }>;

export type SignupConfirmationResendResult = {
  status: "sent" | "missing_email" | "rate_limited" | "failed";
  cooldownUntil: number | null;
};

function errorProperty(error: unknown, property: string) {
  if (!error || typeof error !== "object" || !(property in error)) return null;
  return Reflect.get(error, property);
}

function errorString(error: unknown, property: string) {
  const value = errorProperty(error, property);
  return typeof value === "string" ? value : null;
}

export function isEmailNotConfirmedError(error: unknown) {
  const code = errorString(error, "code");
  const message = errorString(error, "message")?.trim().toLowerCase();
  return code === "email_not_confirmed" || message?.includes("email not confirmed") === true;
}

function isEmailResendRateLimitError(error: unknown) {
  const code = errorString(error, "code");
  const status = errorProperty(error, "status");
  const message = errorString(error, "message")?.toLowerCase() ?? "";

  return (
    code === "over_email_send_rate_limit" ||
    status === 429 ||
    message.includes("rate limit") ||
    message.includes("security purposes")
  );
}

export function getEmailConfirmationCooldownSeconds(
  cooldownUntil: number | null,
  now = Date.now(),
) {
  if (cooldownUntil === null) return 0;
  return Math.max(0, Math.ceil((cooldownUntil - now) / 1000));
}

export function canRequestEmailConfirmationResend({
  busy,
  cooldownUntil,
  now = Date.now(),
}: {
  busy: boolean;
  cooldownUntil: number | null;
  now?: number;
}) {
  return !busy && getEmailConfirmationCooldownSeconds(cooldownUntil, now) === 0;
}

export async function requestSignupConfirmationEmail({
  email,
  resend,
  now = Date.now(),
}: {
  email: string;
  resend: SignupConfirmationResend;
  now?: number;
}): Promise<SignupConfirmationResendResult> {
  const normalizedEmail = email.trim();
  if (!normalizedEmail) {
    return { status: "missing_email", cooldownUntil: null };
  }

  const cooldownUntil = now + EMAIL_CONFIRMATION_RESEND_COOLDOWN_MS;

  try {
    const { error } = await resend({ type: "signup", email: normalizedEmail });
    if (!error) return { status: "sent", cooldownUntil };

    return {
      status: isEmailResendRateLimitError(error) ? "rate_limited" : "failed",
      cooldownUntil,
    };
  } catch {
    return { status: "failed", cooldownUntil };
  }
}
