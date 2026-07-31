import React, { useEffect, useRef, useState } from "react";
import {
  View, Text, ScrollView, Pressable, ActivityIndicator, Alert, Linking, Image, TextInput,
  KeyboardAvoidingView, Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { PurchasesPackage, PACKAGE_TYPE } from "react-native-purchases";
import {
  getOfferings,
  purchasePackage,
  restorePurchases,
  isEntitlementActive,
} from "../lib/purchases";
import { useAuthStore } from "../store/authStore";
import { supabase } from "../lib/supabase";
import {
  COLORS, GRADIENTS, SERIF,
  PRIVACY_POLICY_URL, TERMS_OF_SERVICE_URL,
} from "../lib/constants";

type PlanId = "annual" | "monthly" | "lifetime";

const FALLBACK: Record<PlanId, { price: string; sub: string }> = {
  annual:   { price: "$59.99/yr", sub: "Just $5/mo" },
  monthly:  { price: "$7.99/mo",  sub: "Billed monthly" },
  lifetime: { price: "$79.99",    sub: "One-time purchase" },
};

const FEATURES = [
  "AI Pump Coach insights",
  "Smart output analysis",
  "Personalized guidance",
  "Full session history",
  "Snapshot sharing with your IBCLC",
  "Pump optimization guidance",
  "Flange fit diagnostic",
];

export default function PaywallScreen() {
  const router = useRouter();
  const { updateFromCustomerInfo, refreshSubscription } = useAuthStore();

  const [selected,   setSelected]   = useState<PlanId>("annual");
  const [pkgs, setPkgs] = useState<Record<PlanId, PurchasesPackage | null>>({
    annual: null, monthly: null, lifetime: null,
  });
  const [loadingOffers,   setLoadingOffers]   = useState(true);
  const [purchasing,      setPurchasing]      = useState(false);
  const [restoring,       setRestoring]       = useState(false);
  const [showRefCode,     setShowRefCode]     = useState(false);
  const [refCode,         setRefCode]         = useState("");
  const [refCodeResult,   setRefCodeResult]   = useState<"idle" | "success" | "invalid">("idle");
  const [refCodeApplying, setRefCodeApplying] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const codeInputRef = useRef<View>(null);

  // Fetch RevenueCat offerings on mount
  useEffect(() => {
    (async () => {
      try {
        const offering = await getOfferings();
        if (offering) {
          setPkgs({
            annual:   offering.availablePackages.find(p => p.packageType === PACKAGE_TYPE.ANNUAL)   ?? null,
            monthly:  offering.availablePackages.find(p => p.packageType === PACKAGE_TYPE.MONTHLY)  ?? null,
            lifetime: offering.availablePackages.find(p => p.packageType === PACKAGE_TYPE.LIFETIME) ?? null,
          });
        }
      } catch (e) {
        console.warn("PaywallScreen: offerings fetch failed", e);
      } finally {
        setLoadingOffers(false);
      }
    })();
  }, []);

  const priceLabel = (plan: PlanId): { price: string; sub: string } => {
    const pkg = pkgs[plan];
    if (!pkg) return FALLBACK[plan];
    const p = pkg.product.priceString;
    if (plan === "annual") {
      const monthlyNum = pkg.product.price / 12;
      const sub = monthlyNum > 0
        ? `Just $${Math.round(monthlyNum)}/mo`
        : "Best value";
      return { price: `${p}/yr`, sub };
    }
    if (plan === "monthly")  return { price: `${p}/mo`, sub: "Billed monthly" };
    return { price: p, sub: "One-time purchase" };
  };

  const hasTrial = (plan: PlanId) => plan === "annual" || plan === "monthly";

  const ctaLabel = () => {
    if (selected === "lifetime") return "Buy Now";
    return "Start 7-Day Free Trial";
  };

  const handlePurchase = async () => {
    const pkg = pkgs[selected];
    if (!pkg) {
      Alert.alert("Unavailable", "This option is not available right now. Please try again.");
      return;
    }
    setPurchasing(true);
    try {
      const { customerInfo, cancelled } = await purchasePackage(pkg);
      if (!cancelled) {
        updateFromCustomerInfo(customerInfo);
        await refreshSubscription();
        router.back();
        setTimeout(() => {
          Alert.alert("Welcome to Premium!", "Your access is now active. Enjoy Pump Coach.");
        }, 400);
      }
    } catch {
      Alert.alert("Something went wrong", "Your purchase could not be completed. Please try again.");
    } finally {
      setPurchasing(false);
    }
  };

  const handleRestore = async () => {
    setRestoring(true);
    try {
      const info = await restorePurchases();
      if (isEntitlementActive(info)) {
        updateFromCustomerInfo(info);
        await refreshSubscription();
        router.back();
        setTimeout(() => {
          Alert.alert("Purchase Restored", "Your premium access has been restored.");
        }, 400);
      } else {
        Alert.alert(
          "No Purchase Found",
          "We could not find a previous purchase on this account. If you think this is wrong, please contact support."
        );
      }
    } catch {
      Alert.alert("Restore Failed", "Something went wrong. Please try again.");
    } finally {
      setRestoring(false);
    }
  };

  const busy = purchasing || restoring;

  const applyReferralCode = async () => {
    const trimmed = refCode.trim().toUpperCase();
    if (!trimmed) return;
    setRefCodeApplying(true);
    setRefCodeResult("idle");
    try {
      const { data } = await supabase.functions.invoke("redeem-referral", {
        body: { code: trimmed },
      });
      if (data?.trial_days) {
        setRefCodeResult("success");
      } else {
        setRefCodeResult("invalid");
      }
    } catch {
      setRefCodeResult("invalid");
    } finally {
      setRefCodeApplying(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.cream }} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
      <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false} bounces>

        {/* ── Header gradient ─────────────────────────── */}
        <LinearGradient
          colors={GRADIENTS.slateDeep}
          style={{ paddingBottom: 32, paddingHorizontal: 24 }}
        >
          {/* Dismiss row */}
          <Pressable
            onPress={() => router.back()}
            hitSlop={16}
            accessibilityRole="button"
            accessibilityLabel="Dismiss"
            style={{
              alignSelf: "flex-start", marginTop: 16, marginBottom: 24,
              width: 32, height: 32, borderRadius: 16,
              backgroundColor: "rgba(255,255,255,0.15)",
              alignItems: "center", justifyContent: "center",
            }}
          >
            <Text style={{ color: "#fff", fontSize: 15, lineHeight: 32, textAlign: "center" }}>✕</Text>
          </Pressable>

          {/* Icon + wordmark */}
          <View style={{ alignItems: "center" }}>
            <View style={{
              width: 56, height: 56, borderRadius: 28,
              backgroundColor: "rgba(255,255,255,0.15)",
              alignItems: "center", justifyContent: "center",
              marginBottom: 14,
            }}>
              <Text style={{ fontSize: 24 }}>✦</Text>
            </View>
            <Text style={{
              fontSize: 10, color: "rgba(255,255,255,0.5)",
              letterSpacing: 2, textTransform: "uppercase",
              fontFamily: "Nunito_600SemiBold", fontWeight: "600",
              marginBottom: 8,
            }}>
              Pump Coach Premium
            </Text>
            <Text style={{
              fontFamily: SERIF, fontSize: 26, color: "#fff",
              textAlign: "center", lineHeight: 33, marginBottom: 10,
            }}>
              Your complete pumping companion
            </Text>
            <Text style={{
              fontSize: 14, color: "rgba(255,255,255,0.65)",
              textAlign: "center", lineHeight: 21,
            }}>
              Everything you need for a confident, informed pumping journey
            </Text>
          </View>
        </LinearGradient>

        <View style={{ paddingHorizontal: 20, paddingTop: 24, gap: 20 }}>

          {/* ── Features list ───────────────────────────── */}
          <View style={{
            backgroundColor: "#fff", borderRadius: 20, padding: 20,
            borderWidth: 1, borderColor: COLORS.border,
          }}>
            {FEATURES.map((f, i) => (
              <View
                key={f}
                style={{
                  flexDirection: "row", alignItems: "center", gap: 12,
                  marginBottom: i < FEATURES.length - 1 ? 12 : 0,
                }}
              >
                <View style={{
                  width: 22, height: 22, borderRadius: 11,
                  backgroundColor: COLORS.primaryMist,
                  alignItems: "center", justifyContent: "center", flexShrink: 0,
                }}>
                  <Text style={{
                    fontSize: 11, color: COLORS.primary,
                    fontFamily: "Nunito_800ExtraBold", fontWeight: "800",
                  }}>
                    ✓
                  </Text>
                </View>
                <Text style={{ fontSize: 14, color: COLORS.ink, flex: 1, lineHeight: 20 }}>{f}</Text>
              </View>
            ))}
          </View>

          {/* ── IBCLC trust signal ───────────────────────── */}
          <Text style={{
            fontSize: 12, color: COLORS.ink3, textAlign: "center",
            lineHeight: 18, fontStyle: "italic",
          }}>
            Every insight in Pump Coach is grounded in IBCLC clinical experience.
          </Text>

          {/* ── Pricing options ──────────────────────────── */}
          <View>
            <Text style={{
              fontSize: 11, color: COLORS.ink3, textTransform: "uppercase",
              letterSpacing: 1.5, fontFamily: "Nunito_700Bold", fontWeight: "700",
              marginBottom: 12, textAlign: "center",
            }}>
              Choose your plan
            </Text>

            {loadingOffers ? (
              <ActivityIndicator color={COLORS.primary} style={{ paddingVertical: 24 }} />
            ) : (
              <View style={{ gap: 10 }}>
                {(["annual", "monthly", "lifetime"] as PlanId[]).map((plan) => {
                  const isSelected = selected === plan;
                  const { price, sub } = priceLabel(plan);
                  const trial = hasTrial(plan);

                  return (
                    <Pressable
                      key={plan}
                      onPress={() => setSelected(plan)}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: isSelected }}
                      accessibilityLabel={`${plan} plan, ${priceLabel(plan).price}${hasTrial(plan) ? ", 7-day free trial included" : ""}${plan === "annual" ? ", best value" : ""}`}
                      style={{
                        borderRadius: 18, borderWidth: 2,
                        borderColor: isSelected ? COLORS.primary : COLORS.border,
                        backgroundColor: isSelected ? COLORS.primaryMist : "#fff",
                        padding: 16,
                      }}
                    >
                      {/* Best Value badge (annual only) */}
                      {plan === "annual" && (
                        <View style={{
                          position: "absolute", top: 14, right: 14,
                          backgroundColor: COLORS.primary, borderRadius: 8,
                          paddingHorizontal: 8, paddingVertical: 3,
                        }}>
                          <Text style={{
                            fontSize: 10, color: "#fff",
                            fontFamily: "Nunito_700Bold", fontWeight: "700",
                          }}>
                            Best Value
                          </Text>
                        </View>
                      )}

                      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginRight: plan === "annual" ? 90 : 0 }}>
                        {/* Radio dot */}
                        <View style={{
                          width: 22, height: 22, borderRadius: 11, borderWidth: 2,
                          borderColor: isSelected ? COLORS.primary : COLORS.border,
                          backgroundColor: isSelected ? COLORS.primary : "transparent",
                          alignItems: "center", justifyContent: "center", flexShrink: 0,
                        }}>
                          {isSelected && (
                            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#fff" }} />
                          )}
                        </View>

                        <View>
                          <Text style={{
                            fontSize: 15, fontFamily: "Nunito_700Bold", fontWeight: "700",
                            color: COLORS.ink, textTransform: "capitalize",
                          }}>
                            {plan}
                          </Text>
                          <Text style={{ fontSize: 13, color: COLORS.ink2, marginTop: 1 }}>
                            {price}{plan === "annual" ? "  ·  " + sub : ""}
                          </Text>
                        </View>
                      </View>

                      {/* Trial / sub label below radio row */}
                      {trial ? (
                        <Text style={{
                          fontSize: 12, color: COLORS.primary,
                          fontFamily: "Nunito_600SemiBold", fontWeight: "600",
                          marginTop: 8, marginLeft: 34,
                        }}>
                          7-day free trial included
                        </Text>
                      ) : (
                        <Text style={{
                          fontSize: 12, color: COLORS.ink3,
                          marginTop: 8, marginLeft: 34,
                        }}>
                          {sub}
                        </Text>
                      )}
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>

          {/* ── CTA button ───────────────────────────────── */}
          <Pressable
            onPress={handlePurchase}
            disabled={busy || loadingOffers}
            style={({ pressed }) => ({
              backgroundColor: COLORS.primary,
              borderRadius: 18, paddingVertical: 18,
              alignItems: "center",
              opacity: pressed || busy ? 0.8 : 1,
              shadowColor: COLORS.primary,
              shadowOpacity: 0.25, shadowRadius: 10, elevation: 4,
            })}
          >
            {purchasing ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={{
                fontSize: 16, fontFamily: "Nunito_700Bold", fontWeight: "700", color: "#fff",
              }}>
                {ctaLabel()}
              </Text>
            )}
          </Pressable>

          {hasTrial(selected) && (
            <Text style={{
              fontSize: 11, color: COLORS.ink3, textAlign: "center", marginTop: -8,
            }}>
              Free for 7 days, then auto-renews. Cancel anytime in Settings.
            </Text>
          )}

          {/* ── Referral / promo code ───────────────────── */}
          {!showRefCode ? (
            <Pressable
              onPress={() => {
                setShowRefCode(true);
                // Give the input time to render, then scroll to it
                setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 150);
              }}
              style={{ alignItems: "center", paddingVertical: 4 }}
            >
              <Text style={{ fontSize: 13, color: COLORS.ink3 }}>
                Have a promo or referral code? Tap to enter it.
              </Text>
            </Pressable>
          ) : (
            <View ref={codeInputRef} style={{ gap: 10 }}>
              <TextInput
                value={refCode}
                onChangeText={(t) => { setRefCode(t.toUpperCase()); setRefCodeResult("idle"); }}
                placeholder="Enter your code"
                placeholderTextColor={COLORS.ink3}
                autoCapitalize="characters"
                autoCorrect={false}
                autoFocus
                onFocus={() => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 300)}
                style={{
                  backgroundColor: "#fff", borderRadius: 12,
                  borderWidth: 1.5,
                  borderColor: refCodeResult === "success" ? "#4CAF82" : refCodeResult === "invalid" ? COLORS.error : COLORS.border,
                  paddingHorizontal: 16, paddingVertical: 12,
                  fontSize: 15, color: COLORS.ink, textAlign: "center", letterSpacing: 1,
                }}
              />
              {refCodeResult === "success" && (
                <Text style={{ fontSize: 13, color: "#4CAF82", textAlign: "center", fontFamily: "Nunito_600SemiBold", fontWeight: "600" }}>
                  Code applied. Enjoy your extended trial.
                </Text>
              )}
              {refCodeResult === "invalid" && (
                <Text style={{ fontSize: 13, color: COLORS.error, textAlign: "center" }}>
                  That code does not look right. Check with whoever shared it.
                </Text>
              )}
              {refCodeResult !== "success" && (
                <Pressable
                  onPress={applyReferralCode}
                  disabled={!refCode.trim() || refCodeApplying}
                  style={{
                    backgroundColor: refCode.trim() ? COLORS.primary : COLORS.muted,
                    borderRadius: 12, paddingVertical: 12, alignItems: "center",
                    opacity: refCodeApplying ? 0.7 : 1,
                    borderWidth: refCode.trim() ? 0 : 1,
                    borderColor: COLORS.border,
                  }}
                >
                  {refCodeApplying
                    ? <ActivityIndicator color={refCode.trim() ? "#fff" : COLORS.ink3} size="small" />
                    : <Text style={{
                        color: refCode.trim() ? "#fff" : COLORS.ink3,
                        fontFamily: "Nunito_700Bold", fontWeight: "700", fontSize: 14,
                      }}>Apply Code</Text>
                  }
                </Pressable>
              )}
            </View>
          )}

          {/* ── Restore ──────────────────────────────────── */}
          <Pressable
            onPress={handleRestore}
            disabled={busy}
            style={{ alignItems: "center", paddingVertical: 4 }}
          >
            {restoring ? (
              <ActivityIndicator color={COLORS.ink3} size="small" />
            ) : (
              <Text style={{ fontSize: 13, color: COLORS.ink3, textDecorationLine: "underline" }}>
                Restore Purchases
              </Text>
            )}
          </Pressable>

          {/* ── Builder attribution ──────────────────────── */}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 }}>
            <Image
              source={require("../assets/katie-clark.jpg")}
              style={{ width: 28, height: 28, borderRadius: 14 }}
            />
            <Text style={{ fontSize: 11, color: COLORS.ink3, lineHeight: 16 }}>
              Built by Katie Clark, IBCLC · The Breastfeeding Mama
            </Text>
          </View>

          {/* ── Legal links ───────────────────────────────── */}
          <View style={{
            flexDirection: "row", justifyContent: "center",
            alignItems: "center", gap: 8, paddingBottom: 12,
          }}>
            <Pressable onPress={() => Linking.openURL(PRIVACY_POLICY_URL)}>
              <Text style={{ fontSize: 11, color: COLORS.ink3 }}>Privacy Policy</Text>
            </Pressable>
            <Text style={{ fontSize: 11, color: COLORS.ink3 }}>·</Text>
            <Pressable onPress={() => Linking.openURL(TERMS_OF_SERVICE_URL)}>
              <Text style={{ fontSize: 11, color: COLORS.ink3 }}>Terms of Service</Text>
            </Pressable>
          </View>

        </View>
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
