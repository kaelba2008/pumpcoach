import "../global.css";
import React, { useEffect } from "react";
import { Linking } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import {
  useFonts,
  Fraunces_500Medium,
} from "@expo-google-fonts/fraunces";
import {
  Nunito_400Regular,
  Nunito_600SemiBold,
  Nunito_700Bold,
  Nunito_800ExtraBold,
} from "@expo-google-fonts/nunito";
import { supabase } from "../lib/supabase";
import { useAuthStore } from "../store/authStore";
import {
  configurePurchases,
  addCustomerInfoListener,
} from "../lib/purchases";
import { setupNotificationChannel } from "../lib/notifications";
import { setupEncouragementChannel, onAppForeground } from "../lib/encouragementScheduler";
import { AppState } from "react-native";
import * as Updates from "expo-updates";
import { babyAgeWeeks } from "../lib/formatters";
import { primaryBaby } from "../lib/babies";

// Set Nunito as the default font for all Text components
(Text as any).defaultProps = (Text as any).defaultProps ?? {};
(Text as any).defaultProps.style = { fontFamily: "Nunito_400Regular" };

// Parse a deep link URL and hand the tokens to Supabase so auth state fires correctly.
// Handles magic links, password reset, and email confirmation callbacks.
async function handleDeepLink(url: string, router: ReturnType<typeof useRouter>) {
  if (!url) return;

  // Fragment-based tokens: pumpcoach://#access_token=...&refresh_token=...&type=recovery
  if (url.includes("access_token")) {
    const fragment = url.includes("#") ? url.split("#")[1] : url.split("?")[1];
    if (!fragment) return;
    const params       = new URLSearchParams(fragment);
    const accessToken  = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    const type         = params.get("type");
    if (accessToken && refreshToken) {
      // Flip this BEFORE setSession() resolves — the session-change effect
      // elsewhere in this file reacts to the new session and can win the
      // race to redirect into the main app before our own navigation below
      // takes effect. This flag is what makes that effect stand down.
      if (type === "recovery") useAuthStore.getState().setPasswordRecovery(true);
      await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
      if (type === "recovery") {
        router.replace("/(auth)/reset-password" as any);
      }
    }
  }

  // Token-hash-based links (Supabase PKCE / newer email templates)
  if (url.includes("token_hash")) {
    const query      = url.includes("?") ? url.split("?")[1] : "";
    const params     = new URLSearchParams(query);
    const tokenHash  = params.get("token_hash");
    const type       = params.get("type") as any;
    if (tokenHash && type) {
      if (type === "recovery") useAuthStore.getState().setPasswordRecovery(true);
      await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
      if (type === "recovery") {
        router.replace("/(auth)/reset-password" as any);
      }
    }
  }
}

function AuthGate({ children }: { children: React.ReactNode }) {
  const router   = useRouter();
  const segments = useSegments();
  const { session, setSession, loadProfile, refreshSubscription, updateFromCustomerInfo, isLoading, loadViewerStatus, isPasswordRecovery } = useAuthStore();

  useEffect(() => {
    // Configure RevenueCat before anything else so it's ready when we restore the session
    configurePurchases();

    // Set up Android notification channels (no-op on iOS)
    setupNotificationChannel();
    setupEncouragementChannel();

    // Restore existing session and immediately refresh subscription on cold launch
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        loadProfile();
        refreshSubscription();
      }
    });

    // Watch for auth state changes — including PASSWORD_RECOVERY
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      if (event === "PASSWORD_RECOVERY") {
        // Route to the password reset screen — don't let normal routing take over
        router.push("/(auth)/reset-password" as any);
      }
    });

    // Update subscription state in real time when RevenueCat fires
    const removeRCListener = addCustomerInfoListener((info) => {
      useAuthStore.getState().updateFromCustomerInfo(info);
    });

    // Handle deep links that arrive while the app is already open
    const linkSub = Linking.addEventListener("url", ({ url }) => {
      if (url.includes("viewer-invite")) {
        const query = url.includes("?") ? url.split("?")[1] : "";
        const token = new URLSearchParams(query).get("token");
        if (token) router.push(`/viewer-invite?token=${token}` as any);
      } else {
        handleDeepLink(url, router);
      }
    });

    // Handle deep links that cold-launched the app
    Linking.getInitialURL().then((url) => {
      if (!url) return;
      if (url.includes("viewer-invite")) {
        const query = url.includes("?") ? url.split("?")[1] : "";
        const token = new URLSearchParams(query).get("token");
        if (token) router.push(`/viewer-invite?token=${token}` as any);
      } else {
        handleDeepLink(url, router);
      }
    });

    // Cancel today's encouraging notification when app comes to foreground
    // and schedule the next one
    const appStateSub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        const { profile, babies } = useAuthStore.getState();
        if (profile?.id) {
          const weeks = babyAgeWeeks(primaryBaby(babies)?.dob ?? null) ?? 0;
          onAppForeground(profile.id, weeks).catch(() => {});
        }

        // Previously only checked for a new OTA update on a true cold
        // launch (checkAutomatically: "ON_LOAD" in app.json), which can sit
        // unfetched for a long time if someone keeps the app backgrounded
        // rather than fully closing it. Checking on every foreground too
        // means a fix is ready to apply on whatever launch comes next,
        // sooner. Fetch only — never force-reload here, since that would
        // interrupt anyone with a pump session actively timing.
        if (Updates.isEnabled) {
          Updates.checkForUpdateAsync()
            .then((result) => (result.isAvailable ? Updates.fetchUpdateAsync() : null))
            .catch(() => {});
        }
      }
    });

    return () => {
      listener.subscription.unsubscribe();
      removeRCListener();
      linkSub.remove();
      appStateSub.remove();
    };
  }, []);

  useEffect(() => {
    if (isLoading) return;
    // A recovery deep link is being handled — segments alone aren't a
    // reliable enough signal here since this effect can re-run on the new
    // session before our own navigation to reset-password has landed.
    if (isPasswordRecovery) return;

    const seg0 = segments[0] as string;
    const seg1 = segments[1] as string | undefined;
    const inAuth          = seg0 === "(auth)";
    const inWelcome       = seg0 === "welcome";
    const inOnboarding    = inAuth && seg1 === "onboarding";
    const inResetPassword = inAuth && seg1 === "reset-password";
    // Owns its own post-signup routing (see app/(auth)/professional-sign-up.tsx) —
    // must be excluded here or this effect can race that screen's own
    // profile upsert and hijack into mom onboarding before it commits.
    const inProfessionalSignUp = inAuth && seg1 === "professional-sign-up";
    const inViewer        = seg0 === "(viewer)";
    const inViewerInvite  = seg0 === "viewer-invite";

    if (session) {
      // Don't reroute users mid-flow
      if (inResetPassword || inViewerInvite || inProfessionalSignUp) return;

      if ((inAuth && !inOnboarding) || inWelcome) {
        (async () => {
          await loadProfile();
          refreshSubscription();
          const { profile } = useAuthStore.getState();
          if (!profile?.onboarded_at) {
            router.replace("/(auth)/onboarding");
            return;
          }
          // Check if this account is a viewer of someone else's data
          const ownerIds = await loadViewerStatus();
          // A professional (provider-only) account should never land on
          // /(tabs) — the mom UI — regardless of owner count or a stale
          // "own" mode preference left over from some earlier state.
          const isProfessional = profile.account_type === "professional";
          if (ownerIds.length > 0) {
            const modePref = await AsyncStorage.getItem("viewer_mode_pref");
            if (modePref === "own" && !isProfessional) {
              useAuthStore.getState().setViewingMode(null);
              router.replace("/(tabs)" as any);
            } else if (ownerIds.length === 1) {
              useAuthStore.getState().setViewingMode(ownerIds[0]);
              router.replace("/(viewer)/dashboard" as any);
            } else {
              router.replace("/(viewer)" as any);
            }
          } else if (isProfessional) {
            router.replace("/(viewer)" as any);
          } else {
            router.replace("/(tabs)" as any);
          }
        })();
      } else if (!inViewer && !inViewerInvite) {
        // Already inside the app — no redirect needed
      }
    } else if (!inAuth && !inWelcome && !inViewerInvite) {
      router.replace("/welcome");
    }
  }, [session, segments, isLoading, isPasswordRecovery]);

  return <>{children}</>;
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Fraunces_500Medium,
    Nunito_400Regular,
    Nunito_600SemiBold,
    Nunito_700Bold,
    Nunito_800ExtraBold,
  });

  if (!fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: "#FDF6EE" }} />;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="dark" />
      <AuthGate>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="welcome"          options={{ animation: "fade" }} />
          <Stack.Screen name="(auth)"           options={{ animation: "none" }} />
          <Stack.Screen name="(tabs)"           options={{ animation: "none" }} />
          <Stack.Screen name="(viewer)"         options={{ animation: "none" }} />
          <Stack.Screen name="viewer-invite"    options={{ animation: "slide_from_bottom" }} />
          <Stack.Screen name="session/active"   options={{ presentation: "modal", animation: "slide_from_bottom" }} />
          <Stack.Screen name="session/log"      options={{ presentation: "modal", animation: "slide_from_bottom" }} />
          <Stack.Screen name="tools/flange"     options={{ presentation: "modal", animation: "slide_from_bottom" }} />
          <Stack.Screen name="paywall"          options={{ presentation: "modal", animation: "slide_from_bottom", headerShown: false }} />
          <Stack.Screen name="reminders"        options={{ animation: "slide_from_right", headerShown: false }} />
          <Stack.Screen name="pump-history"     options={{ animation: "slide_from_right", headerShown: false }} />
        </Stack>
      </AuthGate>
    </GestureHandlerRootView>
  );
}
