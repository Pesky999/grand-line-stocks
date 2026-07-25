import { ONBOARDING_SESSION_BYPASS_KEY } from "@/lib/onboarding/progress";

export function hasOnboardingSessionBypass() {
  try {
    return window.sessionStorage.getItem(ONBOARDING_SESSION_BYPASS_KEY) === "1";
  } catch {
    return false;
  }
}

export function clearOnboardingSessionBypass() {
  try {
    window.sessionStorage.removeItem(ONBOARDING_SESSION_BYPASS_KEY);
  } catch {
    // Onboarding is optional. Storage failures should never block navigation.
  }
}

export function setOnboardingSessionBypass() {
  try {
    window.sessionStorage.setItem(ONBOARDING_SESSION_BYPASS_KEY, "1");
  } catch {
    // Onboarding is optional. Storage failures should never block navigation.
  }
}
