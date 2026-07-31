/**
 * Google Sign-In helper
 *
 * Uses @react-native-google-signin/google-signin (v16) to produce a Supabase
 * session via ID-token exchange.
 *
 * Credentials:
 *   Web Client ID  : 1076848134286-utscj7qepurp9nd4bituamok51ng3gh4.apps.googleusercontent.com
 *   iOS Client ID  : 1076848134286-3snb3nrggk2qr6dharasvsuq3c9gg84r.apps.googleusercontent.com
 *   iOS URL scheme : com.googleusercontent.apps.1076848134286-3snb3nrggk2qr6dharasvsuq3c9gg84r
 *   (set in app.json plugin config — no secrets in this file)
 *
 * The Web Client Secret lives only in Supabase Auth → Providers → Google.
 */

import { GoogleSignin, statusCodes } from "@react-native-google-signin/google-signin";
import { supabase } from "./supabase";

// ── Configuration ─────────────────────────────────────────────────────────────

const WEB_CLIENT_ID =
  "1076848134286-utscj7qepurp9nd4bituamok51ng3gh4.apps.googleusercontent.com";

const IOS_CLIENT_ID =
  "1076848134286-3snb3nrggk2qr6dharasvsuq3c9gg84r.apps.googleusercontent.com";

let configured = false;

/**
 * Call once at app startup (inside AuthGate useEffect in _layout.tsx).
 * Safe to call multiple times — will no-op after first call.
 */
export function configureGoogleSignIn(): void {
  if (configured) return;
  configured = true;
  GoogleSignin.configure({
    webClientId:   WEB_CLIENT_ID,
    iosClientId:   IOS_CLIENT_ID,
    scopes:        ["profile", "email"],
    offlineAccess: false,
  });
}

// ── Sign-in result type ───────────────────────────────────────────────────────

export type GoogleSignInResult =
  | { success: true }
  | { success: false; cancelled: boolean; error?: string };

// ── Main sign-in flow ─────────────────────────────────────────────────────────

/**
 * Open the native Google picker, exchange the ID token for a Supabase session,
 * and ensure a profile row exists for new users.
 *
 * Routing after success is handled by onAuthStateChange in _layout.tsx
 * (new user → onboarding, returning user → home).
 */
export async function signInWithGoogle(): Promise<GoogleSignInResult> {
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

    const response = await GoogleSignin.signIn();

    // v13+ SDK returns { type, data } shape
    if (response.type === "cancelled") {
      return { success: false, cancelled: true };
    }

    // Handle "noSavedCredentialFound" (Android Credential Manager path)
    if ((response as any).type === "noSavedCredentialFound") {
      return { success: false, cancelled: true };
    }

    const data      = (response as any).data ?? response;
    const idToken   = data?.idToken as string | null | undefined;
    const googleUser = data?.user as {
      name:       string | null;
      email:      string | null;
      photo:      string | null;
      givenName:  string | null;
    } | undefined;

    // Edge case: Google returned no email
    if (!googleUser?.email) {
      return {
        success:   false,
        cancelled: false,
        error:
          "We could not get your email from Google. Please sign in with email instead.",
      };
    }

    if (!idToken) {
      return {
        success:   false,
        cancelled: false,
        // TEMP diagnostic: surfacing raw failure detail to find root cause quickly.
        error:
          `Something went wrong with Google Sign-In. Please try again or use email instead. [debug: no idToken in response — keys: ${Object.keys(data ?? {}).join(",")}]`,
      };
    }

    // Exchange ID token for a Supabase session
    const { data: authData, error: authError } =
      await supabase.auth.signInWithIdToken({
        provider: "google",
        token:    idToken,
      });

    if (authError) {
      console.error("[GoogleAuth] Supabase signInWithIdToken error:", authError.message, authError.status);
      return {
        success:   false,
        cancelled: false,
        // TEMP diagnostic: surfacing raw failure detail to find root cause quickly.
        error:
          `Something went wrong with Google Sign-In. Please try again or use email instead. [debug: ${authError.status ?? "?"} ${authError.message}]`,
      };
    }

    // Ensure a profile row exists — create one for new users
    if (authData?.user) {
      await ensureProfile(authData.user.id, googleUser);
    }

    return { success: true };
  } catch (e: any) {
    // User cancelled the picker
    if (
      e.code === statusCodes.SIGN_IN_CANCELLED ||
      e.code === statusCodes.IN_PROGRESS
    ) {
      return { success: false, cancelled: true };
    }

    // Google Play Services missing / outdated (Android only)
    if (e.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
      return {
        success:   false,
        cancelled: false,
        error:     "Google Play Services are not available on this device.",
      };
    }

    // Any other unexpected error
    console.error("[GoogleAuth] Unexpected error:", e?.code, e?.message, e);
    return {
      success:   false,
      cancelled: false,
      // TEMP diagnostic: surfacing raw failure detail to find root cause quickly.
      error:
        `Something went wrong with Google Sign-In. Please try again or use email instead. [debug: ${e?.code ?? "no-code"}: ${String(e?.message ?? e).slice(0, 200)}]`,
    };
  }
}

// ── Profile creation ──────────────────────────────────────────────────────────

/**
 * Insert a profile row for brand-new Google users.
 * Existing users already have a profile — the upsert will no-op on conflict.
 *
 * display_name: pulled from Google's name field
 * avatar_url:   pulled from Google's photo field
 * onboarded_at: left null → _layout.tsx will route them through onboarding
 */
async function ensureProfile(
  userId: string,
  googleUser: {
    name:      string | null;
    givenName: string | null;
    photo:     string | null;
  },
): Promise<void> {
  try {
    // Check whether a profile already exists
    const { data: existing } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", userId)
      .maybeSingle();

    if (existing) return; // already exists — nothing to do

    const displayName =
      googleUser.name ?? googleUser.givenName ?? null;

    await supabase.from("profiles").insert({
      id:           userId,
      display_name: displayName,
      avatar_url:   googleUser.photo ?? null,
      onboarded_at: null, // will be set at end of onboarding flow
    });
  } catch {
    // Profile creation failure is non-fatal — onboarding will surface
    // any missing fields and the profile upsert there will fix it.
  }
}

// ── Sign-out ──────────────────────────────────────────────────────────────────

/**
 * Clear the Google session on the device.
 * Call this alongside supabase.auth.signOut() in authStore.signOut().
 * Fire-and-forget — Google sign-out failure should never block app sign-out.
 */
export async function signOutGoogle(): Promise<void> {
  try {
    await GoogleSignin.signOut();
  } catch {
    // Ignore — user may not have signed in with Google this session
  }
}
