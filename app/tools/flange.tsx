import React, { useState } from "react";
import {
  View, Text, ScrollView, Pressable, ActivityIndicator,
  KeyboardAvoidingView, Platform, Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { ConsultRecommendation } from "../../components/ConsultRecommendation";
import { supabase } from "../../lib/supabase";
import { useAuthStore } from "../../store/authStore";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { FLANGE_SIZES_MM, COLORS } from "../../lib/constants";
import {
  FlangeFitInput, FlangeFitResult, FlangeSide,
  ComfortScore, AlignmentScore, ReleaseScore, EmptyingScore,
} from "../../types";

type Step = "side" | "care_c" | "care_a" | "care_r" | "care_e" | "measurements" | "analyzing" | "result";

const PUMP_BRANDS = ["Spectra", "Medela", "Elvie", "Willow", "Baby Buddha", "Haakaa", "Momcozy", "Lansinoh", "Other"];

const SIDE_LABEL: Record<FlangeSide, string> = {
  both:  "Both sides",
  right: "Right side",
  left:  "Left side",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
// The assessment system prompt (CARE framework, sizing rules, response shape)
// now lives server-side in the ai-coach edge function's "flange_fit_check"
// mode — a client-supplied `system` string is never trusted or sent.
function buildContextText(input: FlangeFitInput): string {
  const sameBothSides =
    input.current_size_mm_right === input.current_size_mm_left &&
    input.nipple_diameter_mm_right === input.nipple_diameter_mm_left;

  return [
    input.side                        && `Side being assessed: ${SIDE_LABEL[input.side]}${input.side !== "both" ? " — tailor the CARE breakdown and explanation to this side specifically, it may differ from the other side" : ""}`,
    input.pump_brand                  && `Pump brand: ${input.pump_brand}`,
    input.flange_style                && `Flange type: ${input.flange_style === "insert" ? "Soft insert" : "Regular/rigid flange"}`,
    sameBothSides && input.current_size_mm_right
      ? `Current flange size (both sides): ${input.current_size_mm_right}mm`
      : [
          input.current_size_mm_right && `Current flange size, right side: ${input.current_size_mm_right}mm`,
          input.current_size_mm_left  && `Current flange size, left side: ${input.current_size_mm_left}mm`,
        ].filter(Boolean).join("\n"),
    sameBothSides && input.nipple_diameter_mm_right
      ? `Nipple tip diameter (both sides, measured): ${input.nipple_diameter_mm_right}mm`
      : [
          input.nipple_diameter_mm_right && `Nipple tip diameter, right side (measured): ${input.nipple_diameter_mm_right}mm`,
          input.nipple_diameter_mm_left  && `Nipple tip diameter, left side (measured): ${input.nipple_diameter_mm_left}mm`,
        ].filter(Boolean).join("\n"),
    input.comfort_scores.length       && `C — Comfort: ${input.comfort_scores.join(", ")}`,
    input.alignment_score             && `A — Alignment: ${input.alignment_score}`,
    input.release_score               && `R — Release: ${input.release_score}`,
    input.emptying_score              && `E — Emptying: ${input.emptying_score}`,
    input.session_duration_min        && `Session duration: ${input.session_duration_min} min`,
  ].filter(Boolean).join("\n");
}

async function analyzeWithText(input: FlangeFitInput): Promise<FlangeFitResult> {
  const { data, error } = await supabase.functions.invoke("ai-coach", {
    body: {
      mode:     "flange_fit_check",
      messages: [{ role: "user", content: `Please assess my flange fit using the CARE Check.\n\n${buildContextText(input)}` }],
    },
  });
  if (error) throw error;
  if (!data?.result) throw new Error(data?.error ?? "No assessment returned");
  return data.result as FlangeFitResult;
}

// ─── Choice row components ────────────────────────────────────────────────────
function ChoiceRow({ label, sub, selected, onPress }: {
  label: string; sub?: string; selected: boolean; onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 16,
        borderWidth: 1.5,
        borderColor: selected ? COLORS.primary : COLORS.border,
        backgroundColor: selected ? "rgba(124,92,252,0.05)" : "#fff",
      }}
    >
      <View style={{
        width: 20, height: 20, borderRadius: 10, borderWidth: 2, flexShrink: 0,
        alignItems: "center", justifyContent: "center",
        borderColor: selected ? COLORS.primary : COLORS.border,
        backgroundColor: selected ? COLORS.primary : "transparent",
      }}>
        {selected && <Text style={{ color: "#fff", fontSize: 11, fontFamily: "Nunito_700Bold", fontWeight: "700" }}>✓</Text>}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontFamily: "Nunito_600SemiBold", fontWeight: "600", color: COLORS.ink }}>{label}</Text>
        {sub && <Text style={{ fontSize: 12, color: COLORS.ink3, marginTop: 2 }}>{sub}</Text>}
      </View>
    </Pressable>
  );
}

function MultiChoiceRow({ label, sub, selected, onPress }: {
  label: string; sub?: string; selected: boolean; onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 16,
        borderWidth: 1.5,
        borderColor: selected ? COLORS.primary : COLORS.border,
        backgroundColor: selected ? "rgba(124,92,252,0.05)" : "#fff",
      }}
    >
      <View style={{
        width: 20, height: 20, borderRadius: 4, borderWidth: 2, flexShrink: 0,
        alignItems: "center", justifyContent: "center",
        borderColor: selected ? COLORS.primary : COLORS.border,
        backgroundColor: selected ? COLORS.primary : "transparent",
      }}>
        {selected && <Text style={{ color: "#fff", fontSize: 11, fontFamily: "Nunito_700Bold", fontWeight: "700" }}>✓</Text>}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontFamily: "Nunito_600SemiBold", fontWeight: "600", color: COLORS.ink }}>{label}</Text>
        {sub && <Text style={{ fontSize: 12, color: COLORS.ink3, marginTop: 2 }}>{sub}</Text>}
      </View>
    </Pressable>
  );
}

// ─── CARE step header ─────────────────────────────────────────────────────────
function StepHeader({ letter, title, description }: { letter: string; title: string; description: string }) {
  return (
    <View style={{ marginBottom: 4 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <View style={{
          width: 32, height: 32, borderRadius: 16, backgroundColor: COLORS.primary,
          alignItems: "center", justifyContent: "center",
        }}>
          <Text style={{ color: "#fff", fontFamily: "Nunito_800ExtraBold", fontWeight: "800", fontSize: 16 }}>{letter}</Text>
        </View>
        <Text style={{ fontSize: 22, fontFamily: "Nunito_800ExtraBold", fontWeight: "800", color: COLORS.ink }}>{title}</Text>
      </View>
      <Text style={{ fontSize: 14, color: COLORS.ink2, lineHeight: 21 }}>{description}</Text>
    </View>
  );
}

// ─── Result view ──────────────────────────────────────────────────────────────
function ResultView({ result, side, onRetake, onClose, hasLactationConsultant }: {
  result: FlangeFitResult;
  side: FlangeSide | null;
  onRetake: () => void;
  onClose: () => void;
  hasLactationConsultant: boolean | null;
}) {
  const cfg = {
    likely_too_small: { emoji: "📏", label: "Likely too small",      color: COLORS.error  },
    likely_too_large: { emoji: "📐", label: "Likely too large",      color: COLORS.amber   },
    likely_good_fit:  { emoji: "✅", label: "Looks like a good fit", color: COLORS.sage    },
    unclear:          { emoji: "🔍", label: "Hard to tell",          color: COLORS.primary },
  }[result.assessment];

  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 52 }}>
      {/* Overall assessment */}
      <View style={{ alignItems: "center", paddingVertical: 20, gap: 10, marginBottom: 8 }}>
        {side && side !== "both" && (
          <View style={{ backgroundColor: COLORS.muted, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6 }}>
            <Text style={{ fontSize: 12, fontFamily: "Nunito_700Bold", fontWeight: "700", color: COLORS.ink2 }}>
              {SIDE_LABEL[side]}
            </Text>
          </View>
        )}
        <Text style={{ fontSize: 56 }}>{cfg.emoji}</Text>
        <Text style={{ fontSize: 24, fontFamily: "Nunito_800ExtraBold", fontWeight: "800", color: COLORS.ink, textAlign: "center" }}>{cfg.label}</Text>
        {result.recommended_size_mm_right != null && result.recommended_size_mm_right === result.recommended_size_mm_left && (
          <View style={{
            backgroundColor: "rgba(124,92,252,0.08)", borderRadius: 16,
            paddingHorizontal: 24, paddingVertical: 12, alignItems: "center",
            borderWidth: 1, borderColor: "rgba(124,92,252,0.2)",
          }}>
            <Text style={{ fontSize: 11, color: COLORS.ink3, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>
              Suggested size
            </Text>
            <Text style={{ fontSize: 36, fontWeight: "900", color: COLORS.primary }}>
              {result.recommended_size_mm_right}mm
            </Text>
          </View>
        )}
        {result.recommended_size_mm_right != null && result.recommended_size_mm_left != null
          && result.recommended_size_mm_right !== result.recommended_size_mm_left && (
          <View style={{ flexDirection: "row", gap: 12 }}>
            {([
              { label: "Right", value: result.recommended_size_mm_right },
              { label: "Left",  value: result.recommended_size_mm_left },
            ]).map(({ label, value }) => (
              <View key={label} style={{
                backgroundColor: "rgba(124,92,252,0.08)", borderRadius: 16,
                paddingHorizontal: 20, paddingVertical: 12, alignItems: "center",
                borderWidth: 1, borderColor: "rgba(124,92,252,0.2)",
              }}>
                <Text style={{ fontSize: 11, color: COLORS.ink3, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>
                  Suggested — {label}
                </Text>
                <Text style={{ fontSize: 30, fontWeight: "900", color: COLORS.primary }}>
                  {value}mm
                </Text>
              </View>
            ))}
          </View>
        )}
        <Text style={{ fontSize: 12, color: COLORS.ink3, textTransform: "capitalize" }}>
          Confidence: {result.confidence}
        </Text>
      </View>

      {/* CARE + Summary + Tips — single grouped card */}
      <View style={{
        backgroundColor: "#fff", borderRadius: 20, marginBottom: 14,
        shadowColor: "#1A1A2E", shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
        overflow: "hidden",
      }}>
        {/* Summary paragraph */}
        <View style={{ padding: 18 }}>
          <Text style={{ fontSize: 14, color: COLORS.ink, lineHeight: 22 }}>{result.explanation}</Text>
        </View>

        <View style={{ height: 1, backgroundColor: COLORS.border }} />

        {/* CARE breakdown */}
        <View style={{ padding: 18 }}>
          <Text style={{ fontSize: 11, fontFamily: "Nunito_700Bold", fontWeight: "700", color: COLORS.ink3, textTransform: "uppercase", letterSpacing: 1, marginBottom: 14 }}>
            CARE Assessment
          </Text>
          {[
            { letter: "C", label: "Comfort",   value: result.care_c },
            { letter: "A", label: "Alignment", value: result.care_a },
            { letter: "R", label: "Release",   value: result.care_r },
            { letter: "E", label: "Emptying",  value: result.care_e },
          ].map(({ letter, label, value }, idx, arr) => (
            <View key={letter}>
              <View style={{ flexDirection: "row", gap: 12, paddingVertical: 10 }}>
                <View style={{
                  width: 28, height: 28, borderRadius: 14, backgroundColor: COLORS.primary,
                  alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2,
                }}>
                  <Text style={{ color: "#fff", fontSize: 12, fontFamily: "Nunito_800ExtraBold", fontWeight: "800" }}>{letter}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 11, fontFamily: "Nunito_700Bold", fontWeight: "700", color: COLORS.ink3, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 3 }}>
                    {label}
                  </Text>
                  <Text style={{ fontSize: 14, color: COLORS.ink, lineHeight: 20 }}>{value}</Text>
                </View>
              </View>
              {idx < arr.length - 1 && <View style={{ height: 1, backgroundColor: COLORS.border, marginLeft: 40 }} />}
            </View>
          ))}
        </View>

        {/* Tips */}
        {result.tips.length > 0 && (
          <>
            <View style={{ height: 1, backgroundColor: COLORS.border }} />
            <View style={{ padding: 18 }}>
              <Text style={{ fontSize: 11, fontFamily: "Nunito_700Bold", fontWeight: "700", color: COLORS.ink3, textTransform: "uppercase", letterSpacing: 1, marginBottom: 14 }}>
                What to try next
              </Text>
              <View style={{ gap: 12 }}>
                {result.tips.map((tip, i) => (
                  <View key={i} style={{ flexDirection: "row", gap: 12 }}>
                    <View style={{
                      width: 22, height: 22, borderRadius: 11, backgroundColor: "rgba(124,92,252,0.1)",
                      alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1,
                    }}>
                      <Text style={{ fontSize: 11, fontFamily: "Nunito_700Bold", fontWeight: "700", color: COLORS.primary }}>{i + 1}</Text>
                    </View>
                    <Text style={{ flex: 1, fontSize: 14, color: COLORS.ink2, lineHeight: 21 }}>{tip}</Text>
                  </View>
                ))}
              </View>
            </View>
          </>
        )}
      </View>

      {/* IBCLC referral */}
      {result.see_ibclc && (
        <View style={{
          backgroundColor: "#FFFBF0", borderRadius: 20, padding: 18, marginBottom: 14,
          borderWidth: 1, borderColor: "rgba(244,162,97,0.3)",
          flexDirection: "row", gap: 12,
        }}>
          <Text style={{ fontSize: 24 }}>👩‍⚕️</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontFamily: "Nunito_700Bold", fontWeight: "700", color: COLORS.ink, marginBottom: 4 }}>
              See a certified IBCLC
            </Text>
            <Text style={{ fontSize: 13, color: COLORS.ink2, lineHeight: 20 }}>
              For the most accurate assessment, work with a certified IBCLC. Many offer virtual consultations.
            </Text>
          </View>
        </View>
      )}

      <ConsultRecommendation hasLactationConsultant={hasLactationConsultant} />

      <Text style={{ fontSize: 12, color: COLORS.ink3, textAlign: "center", lineHeight: 18, marginVertical: 16 }}>
        The Pump Coach CARE Check is for informational purposes only, not a clinical assessment. For a personalized evaluation, work with a certified IBCLC.
      </Text>
      <Text style={{ fontSize: 11, color: COLORS.ink3, textAlign: "center", lineHeight: 16, marginBottom: 16 }}>
        CARE Check developed in partnership with Jeanette Mesite Frem, IBCLC (babiesincommon.com) · Pump Coach by Katie Clark, IBCLC
      </Text>

      <View style={{ gap: 10 }}>
        <Button label="Done" onPress={onClose} fullWidth size="lg" />
        <Button label="Start over" variant="ghost" onPress={onRetake} fullWidth />
      </View>
    </ScrollView>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function FlangeAnalyzerScreen() {
  const router      = useRouter();
  const { profile } = useAuthStore();

  const [step,         setStep]        = useState<Step>("side");
  const [side,         setSide]        = useState<FlangeSide | null>(null);
  const [sizeRight,    setSizeRight]   = useState<number | null>(profile?.flange_size_mm ?? null);
  const [sizeLeft,     setSizeLeft]    = useState<number | null>(profile?.flange_size_mm ?? null);
  const [nippleDiamRight, setNippleDiamRight] = useState("");
  const [nippleDiamLeft,  setNippleDiamLeft]  = useState("");
  const [pumpBrand,    setPumpBrand]   = useState(profile?.pump_brand ?? "");
  const [flangeStyle,  setFlangeStyle] = useState<"regular" | "insert" | null>(null);
  const [comfortScores,   setComfortScores]   = useState<ComfortScore[]>([]);
  const [alignmentScore,  setAlignmentScore]  = useState<AlignmentScore | null>(null);
  const [releaseScore,    setReleaseScore]    = useState<ReleaseScore | null>(null);
  const [emptyingScore,   setEmptyingScore]   = useState<EmptyingScore | null>(null);
  const [sessionMin,   setSessionMin]  = useState("");
  const [result,       setResult]      = useState<FlangeFitResult | null>(null);
  const [error,        setError]       = useState<string | null>(null);

  const toggleComfort = (s: ComfortScore) => {
    if (s === "no_pain_gentle_tug") { setComfortScores(["no_pain_gentle_tug"]); return; }
    setComfortScores((prev) => {
      const without = prev.filter((x) => x !== "no_pain_gentle_tug");
      return without.includes(s) ? without.filter((x) => x !== s) : [...without, s];
    });
  };

  const buildInput = (): FlangeFitInput => ({
    side:                      side,
    current_size_mm_right:    sizeRight,
    current_size_mm_left:     sizeLeft,
    pump_brand:                pumpBrand,
    flange_style:               flangeStyle,
    nipple_diameter_mm_right: nippleDiamRight ? parseFloat(nippleDiamRight) : null,
    nipple_diameter_mm_left:  nippleDiamLeft  ? parseFloat(nippleDiamLeft)  : null,
    comfort_scores:             comfortScores,
    alignment_score:            alignmentScore,
    release_score:               releaseScore,
    emptying_score:              emptyingScore,
    session_duration_min:      sessionMin ? parseInt(sessionMin) : null,
  });

  const runAnalysis = async () => {
    setStep("analyzing");
    setError(null);
    try {
      const res = await analyzeWithText(buildInput());
      setResult(res);
      setStep("result");
    } catch (e: any) {
      console.error("Flange analysis error:", e);
      const msg = e?.message ?? e?.error_description ?? JSON.stringify(e) ?? "Unknown error";
      setError(`Analysis failed: ${msg}`);
      setStep("measurements");
    }
  };

  const reset = () => {
    setStep("side");
    setSide(null);
    setComfortScores([]);
    setAlignmentScore(null);
    setReleaseScore(null);
    setEmptyingScore(null);
    setResult(null);
    setError(null);
  };

  const STEP_ORDER: Step[] = ["side", "care_c", "care_a", "care_r", "care_e", "measurements"];
  const stepIndex = STEP_ORDER.indexOf(step);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.cream }}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>

        {/* Header */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 }}>
          <Pressable
            onPress={() => {
              if (step === "result") {
                // Back from result goes to last questionnaire step for editing, not home
                setStep("measurements");
              } else if (stepIndex > 0) {
                setStep(STEP_ORDER[stepIndex - 1]);
              } else {
                router.back();
              }
            }}
          >
            <Text style={{ fontSize: 14, fontFamily: "Nunito_600SemiBold", fontWeight: "600", color: COLORS.ink3 }}>
              {step === "result" ? "← Edit answers" : "← Back"}
            </Text>
          </Pressable>
          <Text style={{ fontSize: 15, fontFamily: "Nunito_700Bold", fontWeight: "700", color: COLORS.ink }}>Flange Fit Analyzer</Text>
          <View style={{ width: 50 }} />
        </View>

        {/* CARE progress pills */}
        {!["side", "analyzing", "result"].includes(step) && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingHorizontal: 20, marginBottom: 8 }}>
            <View style={{ flexDirection: "row", gap: 8, paddingBottom: 4 }}>
              {[
                { id: "care_c",       letter: "C", label: "Comfort"   },
                { id: "care_a",       letter: "A", label: "Alignment" },
                { id: "care_r",       letter: "R", label: "Release"   },
                { id: "care_e",       letter: "E", label: "Emptying"  },
                { id: "measurements", letter: "📏", label: "Size"     },
              ].map(({ id, letter, label }) => {
                const active = step === id;
                return (
                  <View key={id} style={{
                    flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 6,
                    borderRadius: 20,
                    backgroundColor: active ? COLORS.primary : COLORS.muted,
                  }}>
                    <Text style={{ fontSize: 12, fontFamily: "Nunito_800ExtraBold", fontWeight: "800", color: active ? "#fff" : COLORS.ink3 }}>{letter}</Text>
                    <Text style={{ fontSize: 12, color: active ? "rgba(255,255,255,0.85)" : COLORS.ink3 }}>{label}</Text>
                  </View>
                );
              })}
            </View>
          </ScrollView>
        )}

        {/* ── ANALYZING ── */}
        {step === "analyzing" && (
          <View style={{ flex: 1, justifyContent: "center", alignItems: "center", gap: 16, paddingHorizontal: 32 }}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={{ fontSize: 20, fontFamily: "Nunito_800ExtraBold", fontWeight: "800", color: COLORS.ink, textAlign: "center" }}>
              Analyzing your flange fit…
            </Text>
            <Text style={{ fontSize: 14, color: COLORS.ink2, textAlign: "center", lineHeight: 22 }}>
              Reviewing your CARE Check answers to assess flange fit.
            </Text>
          </View>
        )}

        {/* ── RESULT ── */}
        {step === "result" && result && (
          <ResultView
            result={result}
            side={side}
            onRetake={reset}
            onClose={() => router.back()}
            hasLactationConsultant={profile?.has_lactation_consultant ?? null}
          />
        )}

        {/* ── SIDE ── */}
        {step === "side" && (
          <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48 }}>
            <LinearGradient
              colors={[COLORS.primaryMist, COLORS.mauveLight]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={{ borderRadius: 20, padding: 20, marginBottom: 20 }}
            >
              <Text style={{ fontSize: 24, fontWeight: "900", color: COLORS.ink, marginBottom: 6 }}>
                Flange Fit Analyzer
              </Text>
              <Text style={{ fontSize: 14, color: COLORS.ink2, lineHeight: 21 }}>
                Many people need a different flange size or fit on each side. If your fit feels
                different left vs. right, run the CARE Check separately for each — you can start
                over afterward to check the other side.
              </Text>
            </LinearGradient>

            <StepHeader
              letter="📏"
              title="Which side is this for?"
              description="This helps us give you an assessment tailored to that side, since breasts are often asymmetrical."
            />
            <View style={{ gap: 8, marginTop: 16 }}>
              {([
                { val: "both"  as const, label: "Both sides",  sub: "My fit and comfort feel the same on both sides" },
                { val: "right" as const, label: "Right side",  sub: "I want to assess my right side specifically" },
                { val: "left"  as const, label: "Left side",   sub: "I want to assess my left side specifically" },
              ]).map(({ val, label, sub }) => (
                <ChoiceRow key={val} label={label} sub={sub} selected={side === val} onPress={() => setSide(val)} />
              ))}
            </View>
            <View style={{ marginTop: 20 }}>
              <Button label="Next: Comfort →" onPress={() => setStep("care_c")} fullWidth size="lg" disabled={!side} />
            </View>
          </ScrollView>
        )}

        {/* ── C — Comfort ── */}
        {step === "care_c" && (
          <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48 }}>
            <LinearGradient
              colors={[COLORS.primaryMist, COLORS.mauveLight]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={{ borderRadius: 20, padding: 20, marginBottom: 20 }}
            >
              <Text style={{ fontSize: 24, fontWeight: "900", color: COLORS.ink, marginBottom: 6 }}>
                Flange Fit Analyzer
              </Text>
              <Text style={{ fontSize: 14, color: COLORS.ink2, lineHeight: 21, marginBottom: 16 }}>
                The <Text style={{ fontFamily: "Nunito_700Bold", fontWeight: "700" }}>Pump Coach CARE Check</Text> walks you through four areas to assess your flange fit.
              </Text>
              {[
                { letter: "C", title: "Comfort",   desc: "What pumping feels like: sensation and pain" },
                { letter: "A", title: "Alignment",  desc: "How the nipple sits and moves inside the tunnel" },
                { letter: "R", title: "Release",    desc: "How milk flows: spray vs. drip, let-down timing" },
                { letter: "E", title: "Emptying",   desc: "How well the breast empties and output trends" },
              ].map(({ letter, title, desc }) => (
                <View key={letter} style={{ flexDirection: "row", gap: 10, marginBottom: 10 }}>
                  <View style={{
                    width: 24, height: 24, borderRadius: 12, backgroundColor: COLORS.primary,
                    alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1,
                  }}>
                    <Text style={{ color: "#fff", fontSize: 12, fontFamily: "Nunito_800ExtraBold", fontWeight: "800" }}>{letter}</Text>
                  </View>
                  <Text style={{ fontSize: 13, color: COLORS.ink2, flex: 1 }}>
                    <Text style={{ fontFamily: "Nunito_700Bold", fontWeight: "700", color: COLORS.ink }}>{title}: </Text>{desc}
                  </Text>
                </View>
              ))}
            </LinearGradient>

            <StepHeader
              letter="C"
              title="Comfort"
              description="What does pumping feel like? Select everything that applies, both during pumping and after you remove the flange."
            />
            <View style={{ gap: 8, marginTop: 16 }}>
              {([
                { val: "no_pain_gentle_tug",   label: "Comfortable: nothing or a gentle tug",       sub: "Pumping feels fine throughout" },
                { val: "nipple_pinching",       label: "Pinching at the nipple base",                sub: "A squeezing or clamping sensation" },
                { val: "burning_stinging",      label: "Burning or stinging pain",                   sub: "Sharp, hot, or electrical-feeling pain" },
                { val: "deep_breast_aching",    label: "Deep pulling or aching inside the breast",   sub: "Pain felt deeper than the nipple" },
                { val: "nipple_tip_soreness",   label: "Nipple tip soreness or tenderness",          sub: "Tender at the very tip of the nipple" },
                { val: "blanching_after",       label: "Nipple turns white after removing flange",   sub: "Blanching or color change: a sign of compression" },
                { val: "nipple_ridged_creased", label: "Nipple looks ridged or creased after",       sub: "Visible compression lines on the nipple" },
              ] as { val: ComfortScore; label: string; sub: string }[]).map(({ val, label, sub }) => (
                <MultiChoiceRow
                  key={val} label={label} sub={sub}
                  selected={comfortScores.includes(val)}
                  onPress={() => toggleComfort(val)}
                />
              ))}
            </View>
            <View style={{ marginTop: 20 }}>
              <Button label="Next: Alignment →" onPress={() => setStep("care_a")} fullWidth size="lg" disabled={comfortScores.length === 0} />
            </View>
          </ScrollView>
        )}

        {/* ── A — Alignment ── */}
        {step === "care_a" && (
          <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48 }}>
            <StepHeader
              letter="A"
              title="Alignment"
              description="Look at your nipple inside the flange tunnel while the pump is running. What do you see? The ideal: nipple centered, sides lightly touching the walls, slight back-and-forth motion. Only the nipple, not the areola."
            />
            <View style={{ gap: 8, marginTop: 16 }}>
              {([
                { val: "centered_light_touch",  label: "Centered: sides lightly touch the walls",    sub: "Slight rhythmic back-and-forth motion, only the nipple" },
                { val: "too_much_space",         label: "Lots of space: nipple doesn't touch sides",  sub: "Gap visible around the nipple" },
                { val: "areola_pulled_in",       label: "Areola tissue is being pulled into tunnel",  sub: "Dark areola skin entering the tunnel opening" },
                { val: "fills_entire_tunnel",    label: "Nipple fills the whole tunnel wall-to-wall", sub: "No clearance on either side" },
                { val: "side_to_side_movement",  label: "Nipple moves side-to-side excessively",      sub: "Thrashing rather than in-and-out motion" },
                { val: "barely_moves",           label: "Nipple barely moves, almost no motion",      sub: "Little to no visible movement during cycling" },
              ] as { val: AlignmentScore; label: string; sub: string }[]).map(({ val, label, sub }) => (
                <ChoiceRow key={val} label={label} sub={sub} selected={alignmentScore === val} onPress={() => setAlignmentScore(val)} />
              ))}
            </View>
            <View style={{ marginTop: 20 }}>
              <Button label="Next: Release →" onPress={() => setStep("care_r")} fullWidth size="lg" disabled={!alignmentScore} />
            </View>
          </ScrollView>
        )}

        {/* ── R — Release ── */}
        {step === "care_r" && (
          <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48 }}>
            <StepHeader
              letter="R"
              title="Release"
              description="How does your milk flow during pumping? With a good fit and let-down, milk should spray in multiple streams, not drip. This also covers how quickly your let-down happens."
            />
            <View style={{ gap: 8, marginTop: 16 }}>
              {([
                { val: "sprays_streams",       label: "Milk sprays in multiple streams",            sub: "Visible spray or jets of milk: ideal" },
                { val: "drips_slowly",         label: "Milk drips rather than sprays",              sub: "Slow drops rather than a flowing stream" },
                { val: "quick_letdown",        label: "Let-down happens quickly (within ~2 min)",   sub: "Milk starts flowing without much wait" },
                { val: "slow_or_no_letdown",   label: "Let-down is slow or doesn't happen",        sub: "Long wait or no let-down with this pump/flange" },
                { val: "inconsistent_flow",    label: "Flow stops and starts unexpectedly",         sub: "Milk flows, then stops, then starts again mid-session" },
              ] as { val: ReleaseScore; label: string; sub: string }[]).map(({ val, label, sub }) => (
                <ChoiceRow key={val} label={label} sub={sub} selected={releaseScore === val} onPress={() => setReleaseScore(val)} />
              ))}
            </View>
            <View style={{ marginTop: 20 }}>
              <Button label="Next: Emptying →" onPress={() => setStep("care_e")} fullWidth size="lg" disabled={!releaseScore} />
            </View>
          </ScrollView>
        )}

        {/* ── E — Emptying ── */}
        {step === "care_e" && (
          <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48 }}>
            <StepHeader
              letter="E"
              title="Emptying"
              description="How satisfied are you with your output? A well-fitting flange fully empties the breast, which directly supports your supply."
            />
            <View style={{ gap: 8, marginTop: 16 }}>
              {([
                { val: "satisfied_good_output",    label: "Satisfied: output meets my expectations",       sub: "Getting the amount I expect for my stage" },
                { val: "lower_than_expected",       label: "Output seems lower than expected",              sub: "Getting less than I think I should be" },
                { val: "breasts_feel_full_after",   label: "Breasts still feel full after a full session",  sub: "Not fully emptied, milk left behind" },
                { val: "output_has_declined",       label: "Output has been declining over time",           sub: "Noticeably less over the past days or weeks" },
                { val: "not_sure_new_to_pumping",   label: "Not sure, I'm new to pumping",                  sub: "Haven't established a baseline yet" },
              ] as { val: EmptyingScore; label: string; sub: string }[]).map(({ val, label, sub }) => (
                <ChoiceRow key={val} label={label} sub={sub} selected={emptyingScore === val} onPress={() => setEmptyingScore(val)} />
              ))}
            </View>
            <View style={{ marginTop: 20 }}>
              <Button label="Next: Your pump & size →" onPress={() => setStep("measurements")} fullWidth size="lg" disabled={!emptyingScore} />
            </View>
          </ScrollView>
        )}

        {/* ── MEASUREMENTS ── */}
        {step === "measurements" && (
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, paddingBottom: 48 }}>
            <View style={{ marginBottom: 20 }}>
              <Text style={{ fontSize: 22, fontFamily: "Nunito_800ExtraBold", fontWeight: "800", color: COLORS.ink, marginBottom: 4 }}>
                Size &amp; pump info
              </Text>
              <Text style={{ fontSize: 14, color: COLORS.ink2 }}>
                Helps us give you the most accurate size recommendation.
              </Text>
            </View>

            <View style={{ gap: 20 }}>
              {/* Pump brand */}
              <View>
                <Text style={{ fontSize: 13, fontFamily: "Nunito_600SemiBold", fontWeight: "600", color: COLORS.ink2, marginBottom: 8 }}>Pump brand</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {PUMP_BRANDS.map((brand) => (
                    <Pressable
                      key={brand}
                      onPress={() => setPumpBrand(brand)}
                      style={{
                        paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, borderWidth: 1.5,
                        borderColor: pumpBrand === brand ? COLORS.primary : COLORS.border,
                        backgroundColor: pumpBrand === brand ? COLORS.primary : "#fff",
                      }}
                    >
                      <Text style={{ fontSize: 13, fontFamily: "Nunito_600SemiBold", fontWeight: "600", color: pumpBrand === brand ? "#fff" : COLORS.ink }}>
                        {brand}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              {/* Current flange size — right and left, since many people size differently per side */}
              <View>
                <Text style={{ fontSize: 13, fontFamily: "Nunito_600SemiBold", fontWeight: "600", color: COLORS.ink2, marginBottom: 8 }}>
                  Current flange size (mm)
                </Text>
                {([
                  { label: "Right side", value: sizeRight, setValue: setSizeRight },
                  { label: "Left side",  value: sizeLeft,  setValue: setSizeLeft  },
                ]).map(({ label, value, setValue }) => (
                  <View key={label} style={{ marginBottom: 12 }}>
                    <Text style={{ fontSize: 12, color: COLORS.ink3, marginBottom: 6 }}>{label}</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      <View style={{ flexDirection: "row", gap: 8, paddingBottom: 4 }}>
                        {FLANGE_SIZES_MM.map((mm) => (
                          <Pressable
                            key={mm}
                            onPress={() => setValue(value === mm ? null : mm)}
                            style={{
                              width: 52, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5,
                              alignItems: "center",
                              borderColor: value === mm ? COLORS.primary : COLORS.border,
                              backgroundColor: value === mm ? COLORS.primary : "#fff",
                            }}
                          >
                            <Text style={{ fontSize: 13, fontFamily: "Nunito_700Bold", fontWeight: "700", color: value === mm ? "#fff" : COLORS.ink }}>{mm}</Text>
                            <Text style={{ fontSize: 10, color: value === mm ? "rgba(255,255,255,0.7)" : COLORS.ink3 }}>mm</Text>
                          </Pressable>
                        ))}
                      </View>
                    </ScrollView>
                  </View>
                ))}
                <Text style={{ fontSize: 12, color: COLORS.ink3, marginTop: 4 }}>
                  Check the back of the flange or the box it came in. Enter both if they differ, or just one if you use the same size on both sides.
                </Text>
              </View>

              {/* Flange style */}
              <View>
                <Text style={{ fontSize: 14, fontFamily: "Nunito_600SemiBold", color: COLORS.ink, marginBottom: 8 }}>
                  Flange type
                </Text>
                <View style={{ flexDirection: "row", gap: 10 }}>
                  {[
                    { val: "regular" as const, label: "Regular flange", sub: "Rigid plastic, comes with pump" },
                    { val: "insert"  as const, label: "Soft insert",    sub: "Pumpin' Pals, Maymom, etc." },
                  ].map(({ val, label, sub }) => (
                    <Pressable
                      key={val}
                      onPress={() => setFlangeStyle(val)}
                      style={{
                        flex: 1, borderRadius: 14, padding: 12,
                        borderWidth: 1.5,
                        borderColor: flangeStyle === val ? COLORS.primary : COLORS.border,
                        backgroundColor: flangeStyle === val ? COLORS.primaryMist : "#fff",
                      }}
                    >
                      <Text style={{ fontSize: 13, fontFamily: "Nunito_700Bold", color: flangeStyle === val ? COLORS.primary : COLORS.ink, marginBottom: 2 }}>
                        {label}
                      </Text>
                      <Text style={{ fontSize: 11, color: COLORS.ink3, lineHeight: 16 }}>{sub}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              {/* Nipple diameter — right and left */}
              <View>
                <View style={{ flexDirection: "row", gap: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Input
                      label="Nipple tip diameter, right (mm)"
                      value={nippleDiamRight}
                      onChangeText={setNippleDiamRight}
                      placeholder="e.g. 16"
                      keyboardType="decimal-pad"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Input
                      label="Nipple tip diameter, left (mm)"
                      value={nippleDiamLeft}
                      onChangeText={setNippleDiamLeft}
                      placeholder="e.g. 16"
                      keyboardType="decimal-pad"
                    />
                  </View>
                </View>
                <Text style={{ fontSize: 12, color: COLORS.ink3, marginTop: 4, lineHeight: 18 }}>
                  Optional but very helpful. Measure across the tip of the nipple, the widest point of the nipple itself, not the base or areola.
                  {flangeStyle === "insert"
                    ? " For soft inserts, your starting size = this + 1–2mm."
                    : flangeStyle === "regular"
                    ? " For regular flanges, your starting size matches this measurement."
                    : ""}
                </Text>
              </View>

              {/* Session duration */}
              <Input
                label="Typical session length in minutes (optional)"
                value={sessionMin}
                onChangeText={setSessionMin}
                placeholder="e.g. 20"
                keyboardType="number-pad"
              />

              {error && (
                <Text style={{ fontSize: 13, color: COLORS.error, textAlign: "center" }}>{error}</Text>
              )}

              <View>
                <Button label="Analyze my fit →" onPress={runAnalysis} fullWidth size="lg" />
                <Text style={{ fontSize: 12, color: COLORS.ink3, textAlign: "center", marginTop: 8 }}>
                  Your CARE Check answers will be analyzed.
                </Text>
              </View>
            </View>
          </ScrollView>
        )}

      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
