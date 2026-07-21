import { create } from "zustand";
import { Session, User } from "@supabase/supabase-js";
import { CustomerInfo } from "react-native-purchases";
import { Profile } from "../types";
import { supabase } from "../lib/supabase";
import {
  isEntitlementActive,
  loginPurchases,
  logoutPurchases,
  PREMIUM_ENTITLEMENT,
} from "../lib/purchases";
import { signOutGoogle } from "../lib/googleAuth";

interface AuthState {
  session:        Session | null;
  user:           User | null;
  profile:        Profile | null;
  isLoading:      boolean;
  isPremium:      boolean;
  trialEndsAt:    Date | null;
  viewingOwnerId: string | null;  // non-null when currently viewing someone else's data
  knownOwnerId:   string | null;  // non-null when user has a viewer relationship (persists through mode switches)

  setSession:             (session: Session | null) => void;
  setProfile:             (profile: Profile | null) => void;
  setIsPremium:           (isPremium: boolean) => void;
  updateFromCustomerInfo: (info: CustomerInfo) => void;
  loadProfile:            () => Promise<void>;
  signOut:                () => Promise<void>;
  refreshSubscription:    () => Promise<void>;
  loadViewerStatus:       () => Promise<string | null>;
  setViewingMode:         (ownerId: string | null) => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session:        null,
  user:           null,
  profile:        null,
  isLoading:      true,
  isPremium:      false,
  trialEndsAt:    null,
  viewingOwnerId: null,
  knownOwnerId:   null,

  setSession: (session) =>
    set({ session, user: session?.user ?? null, isLoading: false }),

  setProfile: (profile) => set({ profile }),

  setIsPremium: (isPremium) => set({ isPremium }),

  // Single source of truth for subscription state — call this whenever
  // CustomerInfo arrives (listener, refresh, post-purchase, post-restore).
  updateFromCustomerInfo: (info) => {
    const premium    = isEntitlementActive(info);
    const entitlement = info.entitlements.active[PREMIUM_ENTITLEMENT];
    const trialEndsAt =
      entitlement?.periodType === "TRIAL" && entitlement.expirationDate
        ? new Date(entitlement.expirationDate)
        : null;
    set({ isPremium: premium, trialEndsAt });
  },

  loadProfile: async () => {
    const { user } = get();
    if (!user) return;
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();
    if (!error && data) set({ profile: data as Profile });
  },

  refreshSubscription: async () => {
    const { user, updateFromCustomerInfo } = get();
    if (!user) return;
    try {
      const info    = await loginPurchases(user.id);
      updateFromCustomerInfo(info);
      const tier = isEntitlementActive(info) ? "premium" : "free";
      await supabase
        .from("profiles")
        .update({ subscription_tier: tier })
        .eq("id", user.id);
    } catch (e) {
      console.warn("refreshSubscription error:", e);
    }
  },

  loadViewerStatus: async () => {
    const { user } = get();
    if (!user) return null;
    const { data } = await supabase
      .from("viewer_accounts")
      .select("owner_id")
      .eq("viewer_id", user.id)
      .maybeSingle();
    const ownerId = data?.owner_id ?? null;
    set({ knownOwnerId: ownerId, viewingOwnerId: ownerId });
    return ownerId;
  },

  setViewingMode: (ownerId) => {
    set({ viewingOwnerId: ownerId });
  },

  signOut: async () => {
    // Clear Google session on device (fire-and-forget — never blocks sign-out)
    signOutGoogle().catch(() => {});
    await logoutPurchases();
    await supabase.auth.signOut();
    set({ session: null, user: null, profile: null, isPremium: false, trialEndsAt: null, viewingOwnerId: null, knownOwnerId: null });
  },
}));
