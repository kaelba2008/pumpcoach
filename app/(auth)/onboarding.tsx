import React, { useState } from "react";
import {
  View, Text, ScrollView, Pressable, Alert, KeyboardAvoidingView, Platform, Image,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { format } from "date-fns";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { DatePickerField } from "../../components/ui/DatePickerField";
import { supabase } from "../../lib/supabase";
import { useAuthStore } from "../../store/authStore";
import { requestNotificationPermission } from "../../lib/notifications";
import { COLORS, FLANGE_SIZES_MM, SERIF } from "../../lib/constants";
import { PumpingContext } from "../../types";

const STEPS = ["privacy", "baby", "context", "lc", "meet", "pump", "goals", "referral"] as const;
type Step = typeof STEPS[number];

const PUMPING_CONTEXT_OPTIONS: { value: PumpingContext; label: string }[] = [
  { value: "exclusive_pumping",     label: "Exclusively pumping" },
  { value: "equal_pumping_nursing", label: "Pumping and nursing about equally" },
  { value: "work_pumping",          label: "Pumping at work, nursing otherwise" },
  { value: "mostly_nursing",        label: "Mostly nursing, pumping occasionally" },
  { value: "supply_building",       label: "Building supply (nursing + adding pumps)" },
  { value: "triple_feeding",        label: "Triple feeding" },
  { value: "weaning",               label: "Weaning or reducing" },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const { user, loadProfile } = useAuthStore();

  const [step, setStep] = useState<Step>("privacy");

  const [babies,   setBabies]   = useState<{ name: string; dob: Date | null }[]>([]);
  const [draftName, setDraftName] = useState("");
  const [draftDob,  setDraftDob]  = useState<Date | null>(null);
  const [pumpingContext, setPumpingContext]  = useState<PumpingContext | null>(null);
  const [hasLc,          setHasLc]          = useState<boolean | null>(null);
  const [lcSelection,    setLcSelection]    = useState<"yes" | "no" | "not_sure" | null>(null);
  const [pumpBrand,      setPumpBrand]      = useState("");
  const [pumpModel,      setPumpModel]      = useState("");
  const [flangeSize,     setFlangeSize]     = useState<number | null>(null);
  const [dailyGoal,      setDailyGoal]      = useState("");
  const [referralCode,   setReferralCode]   = useState("");

  const [saving, setSaving] = useState(false);

  const finish = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").upsert({
      id:                       user.id,
      pumping_context:          pumpingContext ?? "unspecified",
      has_lactation_consultant: hasLc,
      pump_brand:               pumpBrand.trim() || null,
      pump_model:               pumpModel.trim() || null,
      flange_size_mm:           flangeSize,
      daily_goal_oz:            parseFloat(dailyGoal) || null,
      onboarded_at:             new Date().toISOString(),
    });
    if (error) { setSaving(false); Alert.alert("Error saving profile", error.message); return; }

    if (babies.length > 0) {
      const { error: babiesError } = await supabase.from("babies").insert(
        babies.map((b) => ({
          user_id: user.id,
          name:    b.name,
          dob:     b.dob ? format(b.dob, "yyyy-MM-dd") : null,
        }))
      );
      if (babiesError) {
        Alert.alert("Couldn't save your babies", "You can add them later from your profile.");
      }
    }

    setSaving(false);
    await loadProfile();

    // Redeem referral code if entered — show confirmation if successful
    const trimmedCode = referralCode.trim().toUpperCase();
    if (trimmedCode) {
      try {
        const { data: redeemData } = await supabase.functions.invoke("redeem-referral", {
          body: { code: trimmedCode },
        });
        if (redeemData?.trial_days) {
          Alert.alert(
            "Code applied",
            `Code applied. You will get ${redeemData.trial_days} days of Pump Coach Premium free instead of the standard trial. Enjoy.`,
          );
        }
      } catch {
        // silent — invalid codes don't block onboarding
      }
    }

    // Ask for notification permission at the end of onboarding — best time to ask
    await requestNotificationPermission();
    router.replace("/(tabs)" as any);
  };

  const stepIndex = STEPS.indexOf(step);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.cream }} edges={["top"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        {/* Header with progress */}
        <LinearGradient
          colors={["#2E3F40", "#4A5E60"]}
          style={{ paddingTop: 24, paddingBottom: 28, paddingHorizontal: 24 }}
        >
          <Text style={{ fontFamily: SERIF, fontSize: 22, color: "#fff", marginBottom: 16 }}>
            {step === "privacy" ? "Before we begin" : "Let's get you set up"}
          </Text>
          <View style={{ flexDirection: "row", gap: 6 }}>
            {STEPS.map((s, i) => (
              <View
                key={s}
                style={{
                  height: 4, borderRadius: 2, flex: 1,
                  backgroundColor: i <= stepIndex ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.2)",
                }}
              />
            ))}
          </View>
          <Text style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 8 }}>
            Step {stepIndex + 1} of {STEPS.length}
          </Text>
        </LinearGradient>

        <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
          <View style={{ flex: 1, paddingHorizontal: 24, paddingTop: 28, paddingBottom: 32, gap: 24 }}>

            {/* ── STEP: Privacy ── */}
            {step === "privacy" && (
              <>
                <View style={{ alignItems: "center", marginBottom: 8 }}>
                  <Text style={{ fontSize: 48, marginBottom: 12 }}>🔒</Text>
                  <Text style={{ fontFamily: SERIF, fontSize: 26, color: COLORS.ink, textAlign: "center", marginBottom: 8 }}>
                    Your data, your control
                  </Text>
                  <Text style={{ fontSize: 15, color: COLORS.ink2, textAlign: "center", lineHeight: 22 }}>
                    Pump Coach is a private, secure space for your pumping journey. Here's how we handle your information.
                  </Text>
                </View>

                <View style={{ gap: 14 }}>
                  {[
                    {
                      icon: "🏠",
                      title: "Stays with you",
                      body: "Your data is stored securely in your account and is never sold, shared with advertisers, or used to train AI models.",
                    },
                    {
                      icon: "✏️",
                      title: "Only what you choose",
                      body: "Everything we ask for (baby name, birth date, pump details) is optional. You decide what to share.",
                    },
                    {
                      icon: "🗑️",
                      title: "Delete anytime",
                      body: "You can permanently delete your account and all your data from Settings at any time, with one tap.",
                    },
                    {
                      icon: "💬",
                      title: "Pump Coach conversations are private",
                      body: "Messages with Pump Coach are stored in your account only. We minimize what's shared with the AI: no exact birth dates or full names.",
                    },
                  ].map(({ icon, title, body }) => (
                    <View
                      key={title}
                      style={{
                        flexDirection: "row", gap: 14,
                        backgroundColor: COLORS.surface, borderRadius: 16, padding: 14,
                        borderWidth: 1, borderColor: COLORS.border,
                      }}
                    >
                      <Text style={{ fontSize: 22, flexShrink: 0, marginTop: 1 }}>{icon}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 14, fontFamily: "Nunito_700Bold", fontWeight: "700", color: COLORS.ink, marginBottom: 3 }}>{title}</Text>
                        <Text style={{ fontSize: 13, color: COLORS.ink2, lineHeight: 19 }}>{body}</Text>
                      </View>
                    </View>
                  ))}
                </View>

                <View style={{
                  backgroundColor: COLORS.muted, borderRadius: 14, padding: 14,
                  borderWidth: 1, borderColor: COLORS.border,
                }}>
                  <Text style={{ fontSize: 12, color: COLORS.ink2, textAlign: "center", lineHeight: 18 }}>
                    Pump Coach provides educational support and is not a substitute for medical advice or care.
                  </Text>
                </View>

                <Button label="Got it, let's get started" onPress={() => setStep("baby")} fullWidth size="lg" />
              </>
            )}

            {/* ── STEP: Baby ── */}
            {step === "baby" && (
              <>
                <View style={{ gap: 4 }}>
                  <Text style={{ fontFamily: SERIF, fontSize: 24, color: COLORS.ink }}>
                    Tell us about your baby 👶
                  </Text>
                  <Text style={{ fontSize: 14, color: COLORS.ink2, marginTop: 4 }}>
                    This helps personalize your experience. Add more than one for twins, triplets, or an older sibling still nursing.
                  </Text>
                </View>

                {babies.length > 0 && (
                  <View style={{ backgroundColor: "#fff", borderRadius: 16, overflow: "hidden", borderWidth: 1, borderColor: COLORS.border }}>
                    {babies.map((b, idx) => (
                      <React.Fragment key={idx}>
                        {idx > 0 && <View style={{ height: 1, backgroundColor: COLORS.border, marginLeft: 16 }} />}
                        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 14 }}>
                          <View>
                            <Text style={{ fontSize: 15, fontFamily: "Nunito_600SemiBold", fontWeight: "600", color: COLORS.ink }}>
                              {b.name}
                            </Text>
                            {b.dob && (
                              <Text style={{ fontSize: 12, color: COLORS.ink3, marginTop: 1 }}>
                                {format(b.dob, "MMM d, yyyy")}
                              </Text>
                            )}
                          </View>
                          <Pressable onPress={() => setBabies((prev) => prev.filter((_, i) => i !== idx))} hitSlop={12}>
                            <Text style={{ fontSize: 18, color: COLORS.ink3 }}>🗑</Text>
                          </Pressable>
                        </View>
                      </React.Fragment>
                    ))}
                  </View>
                )}

                <View style={{ gap: 16, backgroundColor: "#fff", borderRadius: 16, padding: 16, borderWidth: 1, borderColor: COLORS.border }}>
                  <Input
                    label="Baby's name"
                    value={draftName}
                    onChangeText={setDraftName}
                    placeholder="Mila"
                    autoCapitalize="words"
                  />
                  <DatePickerField
                    label="Baby's date of birth (optional)"
                    value={draftDob}
                    onChange={setDraftDob}
                    mode="date"
                    optional
                    maximumDate={new Date()}
                  />
                  <Button
                    label="Add baby"
                    variant="secondary"
                    disabled={!draftName.trim() || babies.length >= 6}
                    onPress={() => {
                      setBabies((prev) => [...prev, { name: draftName.trim(), dob: draftDob }]);
                      setDraftName("");
                      setDraftDob(null);
                    }}
                    fullWidth
                  />
                </View>

                <Button label="Continue" onPress={() => setStep("context")} fullWidth size="lg" />
                <Pressable onPress={() => setStep("context")} style={{ alignItems: "center" }}>
                  <Text style={{ fontSize: 13, color: COLORS.ink3 }}>Skip for now</Text>
                </Pressable>
              </>
            )}

            {/* ── STEP: Context ── */}
            {step === "context" && (
              <>
                <View style={{ gap: 4 }}>
                  <Text style={{ fontFamily: SERIF, fontSize: 24, color: COLORS.ink }}>
                    Help Pump Coach understand your situation
                  </Text>
                  <Text style={{ fontSize: 14, color: COLORS.ink2, marginTop: 4, lineHeight: 21 }}>
                    Your insights will be way more personalized if I know how you're feeding right now. This takes 5 seconds.
                  </Text>
                </View>

                <View style={{ gap: 10 }}>
                  {PUMPING_CONTEXT_OPTIONS.map(({ value, label }) => {
                    const selected = pumpingContext === value;
                    return (
                      <Pressable
                        key={value}
                        onPress={() => setPumpingContext(selected ? null : value)}
                        style={{
                          flexDirection: "row", alignItems: "center", gap: 14,
                          padding: 14, borderRadius: 16, borderWidth: 1.5,
                          borderColor: selected ? COLORS.primary : COLORS.border,
                          backgroundColor: selected ? "rgba(124,92,252,0.05)" : "#fff",
                        }}
                      >
                        <View style={{
                          width: 20, height: 20, borderRadius: 10, borderWidth: 2,
                          alignItems: "center", justifyContent: "center", flexShrink: 0,
                          borderColor: selected ? COLORS.primary : COLORS.border,
                          backgroundColor: selected ? COLORS.primary : "transparent",
                        }}>
                          {selected && (
                            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#fff" }} />
                          )}
                        </View>
                        <Text style={{
                          fontSize: 14, flex: 1, lineHeight: 20,
                          fontFamily: selected ? "Nunito_700Bold" : "Nunito_400Regular",
                          fontWeight: selected ? "700" : "400",
                          color: selected ? COLORS.ink : COLORS.ink2,
                        }}>
                          {label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <Text style={{ fontSize: 12, color: COLORS.ink3, textAlign: "center" }}>
                  You can update this anytime in Settings.
                </Text>

                <View style={{ gap: 12 }}>
                  <Button
                    label="Continue"
                    onPress={() => setStep("lc")}
                    fullWidth
                    size="lg"
                    disabled={!pumpingContext}
                  />
                  <Pressable onPress={() => setStep("lc")} style={{ alignItems: "center" }}>
                    <Text style={{ fontSize: 13, color: COLORS.ink3 }}>Skip for now</Text>
                  </Pressable>
                </View>
              </>
            )}

            {/* ── STEP: Lactation consultant ── */}
            {step === "lc" && (
              <>
                <View style={{ gap: 4 }}>
                  <Text style={{ fontFamily: SERIF, fontSize: 24, color: COLORS.ink }}>
                    Are you currently working with a lactation consultant?
                  </Text>
                  <Text style={{ fontSize: 14, color: COLORS.ink2, marginTop: 4, lineHeight: 21 }}>
                    This helps personalize the support you see in the app.
                  </Text>
                </View>

                <View style={{ gap: 10 }}>
                  {[
                    { label: "Yes, I have one I work with", value: true as boolean | null },
                    { label: "No, not right now",           value: false as boolean | null },
                    { label: "I'm not sure",                value: null as boolean | null },
                  ].map(({ label, value }) => {
                    const selected = label === "Yes, I have one I work with"
                      ? hasLc === true
                      : label === "No, not right now"
                        ? hasLc === false && lcSelection === "no"
                        : hasLc === null && lcSelection === "not_sure";
                    return (
                      <Pressable
                        key={label}
                        onPress={() => {
                          setHasLc(value);
                          setLcSelection(
                            label === "Yes, I have one I work with" ? "yes"
                            : label === "No, not right now" ? "no"
                            : "not_sure"
                          );
                        }}
                        style={{
                          flexDirection: "row", alignItems: "center", gap: 14,
                          padding: 14, borderRadius: 16, borderWidth: 1.5,
                          borderColor: selected ? COLORS.primary : COLORS.border,
                          backgroundColor: selected ? "rgba(74,94,96,0.05)" : "#fff",
                        }}
                      >
                        <View style={{
                          width: 20, height: 20, borderRadius: 10, borderWidth: 2,
                          alignItems: "center", justifyContent: "center", flexShrink: 0,
                          borderColor: selected ? COLORS.primary : COLORS.border,
                          backgroundColor: selected ? COLORS.primary : "transparent",
                        }}>
                          {selected && (
                            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#fff" }} />
                          )}
                        </View>
                        <Text style={{
                          fontSize: 14, flex: 1, lineHeight: 20,
                          fontFamily: selected ? "Nunito_700Bold" : "Nunito_400Regular",
                          fontWeight: selected ? "700" : "400",
                          color: selected ? COLORS.ink : COLORS.ink2,
                        }}>
                          {label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <View style={{ gap: 12 }}>
                  <Button
                    label="Continue"
                    onPress={() => setStep("meet")}
                    fullWidth
                    size="lg"
                    disabled={hasLc === null && lcSelection === null}
                  />
                  <Pressable onPress={() => { setHasLc(null); setLcSelection(null); setStep("meet"); }} style={{ alignItems: "center" }}>
                    <Text style={{ fontSize: 13, color: COLORS.ink3 }}>Skip for now</Text>
                  </Pressable>
                </View>
              </>
            )}

            {/* ── STEP: Meet your coach ── */}
            {step === "meet" && (
              <>
                <View style={{ alignItems: "center", gap: 16, paddingTop: 8 }}>
                  <Image
                    source={require("../../assets/katie-clark.jpg")}
                    style={{ width: 140, height: 140, borderRadius: 70 }}
                  />
                  <View style={{ alignItems: "center", gap: 4 }}>
                    <Text style={{ fontFamily: SERIF, fontSize: 22, color: COLORS.ink }}>
                      Katie Clark
                    </Text>
                    <Text style={{ fontSize: 11, fontFamily: "Nunito_600SemiBold", fontWeight: "600", color: COLORS.ink3, letterSpacing: 1.5, textTransform: "uppercase" }}>
                      IBCLC
                    </Text>
                  </View>
                </View>

                <View style={{
                  backgroundColor: "#fff", borderRadius: 20, padding: 22,
                  borderWidth: 1, borderColor: COLORS.border,
                }}>
                  <Text style={{ fontSize: 16, color: COLORS.ink, lineHeight: 26, fontFamily: "Nunito_400Regular" }}>
                    Hi, I'm Katie. I'm a mom of four boys and an IBCLC who specializes in pumping and milk supply. I built Pump Coach for my own clients and realized every mom deserved it. You deserve more than a timer and a number. Every insight, tip, and coaching prompt in this app comes from real clinical experience working with real moms. I'm a real person, a real mom, and I'm so glad you're here.
                  </Text>
                </View>

                <Button label="Let's get started" onPress={() => setStep("pump")} fullWidth size="lg" />
              </>
            )}

            {/* ── STEP: Pump ── */}
            {step === "pump" && (
              <>
                <View style={{ gap: 4 }}>
                  <Text style={{ fontFamily: SERIF, fontSize: 24, color: COLORS.ink }}>
                    Your pump 🔌
                  </Text>
                  <Text style={{ fontSize: 14, color: COLORS.ink2, marginTop: 4 }}>
                    Helps us give smarter recommendations.
                  </Text>
                </View>
                <View style={{ gap: 16 }}>
                  <Input
                    label="Pump brand"
                    value={pumpBrand}
                    onChangeText={setPumpBrand}
                    placeholder="Spectra, Medela, Elvie..."
                    autoCapitalize="words"
                    autoCorrect={false}
                  />
                  <Input
                    label="Pump model (optional)"
                    value={pumpModel}
                    onChangeText={setPumpModel}
                    placeholder="S1, Pump In Style..."
                    autoCapitalize="words"
                    autoCorrect={false}
                  />
                  <View style={{ gap: 8 }}>
                    <Text style={{ fontSize: 13, fontWeight: "500", color: COLORS.ink2 }}>
                      Current flange size (optional)
                    </Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      <View style={{ flexDirection: "row", gap: 8 }}>
                        {FLANGE_SIZES_MM.map((mm) => (
                          <Pressable
                            key={mm}
                            onPress={() => setFlangeSize(flangeSize === mm ? null : mm)}
                            style={{
                              paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12,
                              borderWidth: 1.5,
                              backgroundColor: flangeSize === mm ? COLORS.primary : COLORS.muted,
                              borderColor: flangeSize === mm ? COLORS.primary : COLORS.border,
                            }}
                          >
                            <Text style={{
                              fontSize: 13, fontFamily: "Nunito_600SemiBold", fontWeight: "600",
                              color: flangeSize === mm ? "#fff" : COLORS.ink,
                            }}>
                              {mm}mm
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    </ScrollView>
                    <Text style={{ fontSize: 12, color: COLORS.ink3 }}>
                      Not sure? Our Flange Fit Analyzer can help after setup.
                    </Text>
                  </View>
                </View>
                <View style={{ gap: 12 }}>
                  <Button label="Continue" onPress={() => setStep("goals")} fullWidth size="lg" />
                  <Pressable onPress={() => setStep("goals")} style={{ alignItems: "center" }}>
                    <Text style={{ fontSize: 13, color: COLORS.ink3 }}>Skip for now</Text>
                  </Pressable>
                </View>
              </>
            )}

            {/* ── STEP: Goals ── */}
            {step === "goals" && (
              <>
                <View style={{ gap: 4 }}>
                  <Text style={{ fontFamily: SERIF, fontSize: 24, color: COLORS.ink }}>
                    Set your goal 🎯
                  </Text>
                  <Text style={{ fontSize: 14, color: COLORS.ink2, marginTop: 4 }}>
                    You can change this anytime.
                  </Text>
                </View>
                <View style={{ gap: 12 }}>
                  <Input
                    label="Daily output goal (oz)"
                    value={dailyGoal}
                    onChangeText={setDailyGoal}
                    placeholder="e.g. 24"
                    keyboardType="decimal-pad"
                    autoCapitalize="none"
                  />
                  <Text style={{ fontSize: 12, color: COLORS.ink3, lineHeight: 18 }}>
                    Not sure what your goal should be? The AI Coach can help you figure out the right target based on your baby's needs.
                  </Text>
                </View>
                <View style={{ gap: 12 }}>
                  <Button label="Continue" onPress={() => setStep("referral")} fullWidth size="lg" />
                  <Pressable onPress={() => setStep("referral")} style={{ alignItems: "center" }}>
                    <Text style={{ fontSize: 13, color: COLORS.ink3 }}>Skip for now</Text>
                  </Pressable>
                </View>
              </>
            )}

            {/* ── STEP: Referral code ── */}
            {step === "referral" && (
              <>
                <View style={{ gap: 4 }}>
                  <Text style={{ fontFamily: SERIF, fontSize: 24, color: COLORS.ink }}>
                    Do you have a referral code?
                  </Text>
                  <Text style={{ fontSize: 14, color: COLORS.ink2, lineHeight: 22, marginTop: 8 }}>
                    Some lactation consultants, postpartum educators, and pumping specialists share referral codes that give you an extended free trial. If someone shared a code with you, enter it here.
                  </Text>
                </View>
                <View style={{ gap: 12 }}>
                  <Input
                    label="Enter code"
                    value={referralCode}
                    onChangeText={(t) => setReferralCode(t.toUpperCase())}
                    placeholder="e.g. KATIE-X4F2"
                    autoCapitalize="characters"
                    autoCorrect={false}
                  />
                  <Text style={{ fontSize: 12, color: COLORS.ink3 }}>
                    Codes are not case-sensitive.
                  </Text>
                </View>
                <View style={{ gap: 12 }}>
                  <Button
                    label="Apply code"
                    onPress={finish}
                    loading={saving}
                    fullWidth
                    size="lg"
                    disabled={!referralCode.trim()}
                  />
                  <Pressable onPress={finish} style={{ alignItems: "center" }}>
                    <Text style={{ fontSize: 13, color: COLORS.ink3 }}>I do not have a code</Text>
                  </Pressable>
                </View>
              </>
            )}

          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
