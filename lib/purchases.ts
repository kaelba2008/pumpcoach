import Purchases, {
  CustomerInfo,
  PurchasesOffering,
  PurchasesPackage,
  LOG_LEVEL,
} from "react-native-purchases";
import { Platform } from "react-native";

const IOS_KEY     = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY     ?? "";
const ANDROID_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY ?? "";

export const PREMIUM_ENTITLEMENT = "premium";

// Call once on app start, before any user session loads
export function configurePurchases(): void {
  const apiKey = Platform.OS === "ios" ? IOS_KEY : ANDROID_KEY;
  if (!apiKey) { console.warn("RevenueCat API key not set for this platform"); return; }
  if (__DEV__) Purchases.setLogLevel(LOG_LEVEL.DEBUG);
  Purchases.configure({ apiKey });
}

// Call after Supabase sign-in — links RevenueCat identity to your user
export async function loginPurchases(userId: string): Promise<CustomerInfo> {
  // Purchases.configure() (called once at app start in _layout.tsx) returns
  // void, not a Promise — there is no way to await native SDK init directly.
  // On Android in particular, the native module has been observed to not be
  // ready yet by the time this fires right after a cold-start configure()
  // call, throwing "no singleton instance" even though configure() was
  // already invoked. Retry with increasing backoff rather than letting that
  // transient race permanently fail the entitlement check — generous budget
  // (~3s worst case) since this only ever fires in the narrow cold-start
  // window and should be invisible the rest of the time.
  const BACKOFF_MS = [300, 600, 900, 1200];
  let lastError: unknown;
  for (let attempt = 0; attempt <= BACKOFF_MS.length; attempt++) {
    try {
      const { customerInfo } = await Purchases.logIn(userId);
      return customerInfo;
    } catch (e) {
      lastError = e;
      if (attempt < BACKOFF_MS.length) {
        await new Promise((resolve) => setTimeout(resolve, BACKOFF_MS[attempt]));
      }
    }
  }
  throw lastError;
}

// Call on sign-out
export async function logoutPurchases(): Promise<void> {
  try { await Purchases.logOut(); } catch {}
}

export function isEntitlementActive(info: CustomerInfo): boolean {
  return PREMIUM_ENTITLEMENT in info.entitlements.active;
}

export async function getCustomerInfo(): Promise<CustomerInfo> {
  return Purchases.getCustomerInfo();
}

// Call before refreshing subscription state whenever entitlements were
// granted server-side (e.g. a promo/referral code), since the SDK's local
// cache has no way to know about a grant it didn't originate.
export async function invalidateCustomerInfoCache(): Promise<void> {
  await Purchases.invalidateCustomerInfoCache();
}

export async function getOfferings(): Promise<PurchasesOffering | null> {
  const offerings = await Purchases.getOfferings();
  return offerings.current;
}

export async function purchasePackage(
  pkg: PurchasesPackage
): Promise<{ customerInfo: CustomerInfo; cancelled: boolean }> {
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    return { customerInfo, cancelled: false };
  } catch (e: any) {
    if (e.userCancelled) {
      return { customerInfo: await Purchases.getCustomerInfo(), cancelled: true };
    }
    throw e;
  }
}

export async function restorePurchases(): Promise<CustomerInfo> {
  return Purchases.restorePurchases();
}

// Returns a cleanup function — call it in useEffect cleanup
export function addCustomerInfoListener(
  callback: (info: CustomerInfo) => void
): () => void {
  Purchases.addCustomerInfoUpdateListener(callback);
  return () => Purchases.removeCustomerInfoUpdateListener(callback);
}
