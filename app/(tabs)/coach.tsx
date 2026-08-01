import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View, Text, ScrollView, TextInput, Pressable, Modal,
  KeyboardAvoidingView, Platform, ActivityIndicator, FlatList,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";
import { useAuthStore } from "../../store/authStore";
import { detectRedFlags } from "../../lib/redFlags";
import { RedFlagBanner } from "../../components/ui/RedFlagBanner";
import { LinearGradient } from "expo-linear-gradient";
import { SESSION_QUICK_PROMPTS, COLORS, SERIF } from "../../lib/constants";
import { AiMessage } from "../../types";
import { fmtRelative, babyAgeWeeks } from "../../lib/formatters";
import { ConsultRecommendation } from "../../components/ConsultRecommendation";

const CONSULT_TRIGGER_PHRASES = [
  "ibclc", "lactation consultant", "reach out", "professional support",
  "healthcare provider", "consult", "in person", "see someone",
];

function messageHasConsultRecommendation(text: string): boolean {
  const lower = text.toLowerCase();
  return CONSULT_TRIGGER_PHRASES.some((phrase) => lower.includes(phrase));
}

function sanitizeResponse(text: string): string {
  const result = text
    // Strip markdown bold/italic
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/_(.+?)_/g, "$1")
    // Strip markdown headers
    .replace(/^#{1,6}\s+/gm, "")
    // Strip markdown horizontal rules
    .replace(/^[-*_]{3,}\s*$/gm, "")
    // Strip backtick code
    .replace(/`(.+?)`/g, "$1")
    // Replace em dashes and en dashes with commas
    .replace(/—/g, ",")   // em dash —
    .replace(/–/g, ",")   // en dash –
    // Strip emoji (Unicode emoji ranges)
    .replace(/[\u{1F000}-\u{1FFFF}]/gu, "")
    .replace(/[\u{2600}-\u{27BF}]/gu, "")
    .replace(/[\u{FE00}-\u{FEFF}]/gu, "")
    // Collapse 3+ blank lines to 2
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (__DEV__) console.log("[Coach] SANITIZED response:", result.slice(0, 80));
  return result;
}

export default function CoachScreen() {
  const router  = useRouter();
  const { user, profile, babies, isPremium } = useAuthStore();

  const [messages,       setMessages]       = useState<AiMessage[]>([]);
  const [input,          setInput]          = useState("");
  const [loading,        setLoading]        = useState(false);
  const [redFlag,        setRedFlag]        = useState<string | null>(null);
  const [convId,         setConvId]         = useState<string | null>(null);

  // Report a response
  const [reportTarget,   setReportTarget]   = useState<{ index: number; content: string } | null>(null);
  const [reportReason,   setReportReason]   = useState<string | null>(null);
  const [reportNotes,    setReportNotes]    = useState("");
  const [reportSending,  setReportSending]  = useState(false);
  const [reportSent,     setReportSent]     = useState(false);

  const REPORT_REASONS = [
    "The advice does not seem right",
    "It recommended something it should not have",
    "Other",
  ];

  const scrollRef = useRef<ScrollView>(null);

  const buildContextNote = useCallback(async () => {
    if (!user) return "";
    const { data: sessions } = await supabase
      .from("pump_sessions")
      .select("started_at, total_oz, duration_sec")
      .gte("started_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .order("started_at", { ascending: false });

    const { data: stash } = await supabase
      .from("stash_entries")
      .select("oz")
      .is("used_at", null)
      .is("discarded_at", null);

    const weekOz   = sessions?.reduce((s, r) => s + (r.total_oz ?? 0), 0) ?? 0;
    const stashOz  = stash?.reduce((s, r) => s + r.oz, 0) ?? 0;
    const count    = sessions?.length ?? 0;
    const avgOz    = count > 0 ? (weekOz / count).toFixed(1) : "unknown";

    // Use weeks postpartum instead of exact DOB to minimize PII sent to Claude
    let babyContext: string | null = null;
    const weeksOldValues = babies
      .map((b) => babyAgeWeeks(b.dob))
      .filter((w): w is number => w != null);
    if (weeksOldValues.length > 0) {
      const youngestWeeks = Math.min(...weeksOldValues);
      babyContext = babies.length > 1
        ? `Babies: ${babies.length}, youngest ${youngestWeeks} weeks postpartum`
        : `Baby: ${youngestWeeks} weeks postpartum`;
    }

    const lcContext =
      profile?.has_lactation_consultant === true  ? "Has a lactation consultant: yes" :
      profile?.has_lactation_consultant === false ? "Has a lactation consultant: no" :
      "Has a lactation consultant: not specified";

    const parts = [
      babyContext,
      profile?.pump_brand ? `Pump: ${profile.pump_brand} ${profile.pump_model ?? ""}`.trim() : null,
      profile?.flange_size_mm ? `Current flange: ${profile.flange_size_mm}mm` : null,
      `Last 7 days: ${count} sessions, ${weekOz.toFixed(1)} oz total, avg ${avgOz} oz/session`,
      stashOz > 0 ? `Freezer stash: ${stashOz.toFixed(1)} oz` : null,
      profile?.daily_goal_oz ? `Daily goal: ${profile.daily_goal_oz} oz` : null,
      lcContext,
    ].filter(Boolean);

    return parts.join(" | ");
  }, [user, profile]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return;
    if (!isPremium) return;

    const userMsg: AiMessage = { role: "user", content: text.trim(), ts: new Date().toISOString() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    // Red flag check
    const flag = detectRedFlags(text);
    if (flag.detected) setRedFlag(flag.message);
    else setRedFlag(null);

    try {
      const context = await buildContextNote();

      // Call Supabase Edge Function (system prompt lives server-side; we only send user context)
      const { data, error } = await supabase.functions.invoke("ai-coach", {
        body: {
          messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
          context,
        },
      });

      if (error) throw error;

      const assistantMsg: AiMessage = {
        role:    "assistant",
        content: sanitizeResponse(data.content ?? "I'm having trouble responding right now. Please try again."),
        ts:      new Date().toISOString(),
      };

      const finalMessages = [...newMessages, assistantMsg];
      setMessages(finalMessages);

      // Persist conversation
      if (convId) {
        await supabase.from("ai_conversations").update({ messages: finalMessages, updated_at: new Date().toISOString() }).eq("id", convId);
      } else {
        const { data: conv } = await supabase
          .from("ai_conversations")
          .insert({ user_id: user?.id, title: text.slice(0, 50), messages: finalMessages })
          .select("id")
          .single();
        if (conv) setConvId(conv.id);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Something went wrong. Please try again.", ts: new Date().toISOString() },
      ]);
    } finally {
      setLoading(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  const startNewConv = () => {
    setMessages([]);
    setConvId(null);
    setRedFlag(null);
    setInput("");
  };

  const submitReport = async () => {
    if (!reportTarget || !reportReason) return;
    setReportSending(true);
    try {
      await supabase.from("coach_reports").insert({
        user_id:          user?.id ?? null,
        message_content:  reportTarget.content,
        reason:           reportReason,
        notes:            reportNotes.trim() || null,
        conversation_id:  convId,
        reported_at:      new Date().toISOString(),
      });
      setReportSent(true);
    } catch {
      // silent — report sending is best-effort
    } finally {
      setReportSending(false);
    }
  };

  const closeReportSheet = () => {
    setReportTarget(null);
    setReportReason(null);
    setReportNotes("");
    setReportSent(false);
  };

  return (
    <SafeAreaView className="flex-1 bg-cream">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1"
        keyboardVerticalOffset={0}
      >
        {/* Header */}
        <View style={{ overflow: "hidden", borderBottomLeftRadius: 36, borderBottomRightRadius: 36 }}>
        <LinearGradient
          colors={["#2E3F40", "#4A5E60"]}
          style={{ paddingTop: 20, paddingBottom: 32, paddingHorizontal: 20, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
        >
          <View>
            <Text style={{ fontFamily: SERIF, fontSize: 22, color: "#fff" }}>Pump Coach</Text>
            <Text style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", fontFamily: "Nunito_600SemiBold", fontWeight: "600", letterSpacing: 0.3, marginTop: 2 }}>
              Built by Katie Clark, IBCLC
            </Text>
          </View>
          {messages.length > 0 && (
            <Pressable
              onPress={startNewConv}
              accessibilityRole="button"
              accessibilityLabel="Start new chat"
            >
              <Text style={{ fontSize: 13, fontFamily: "Nunito_600SemiBold", fontWeight: "600", color: "rgba(255,255,255,0.7)" }}>New chat</Text>
            </Pressable>
          )}
        </LinearGradient>
        </View>

        {/* Paywall gate */}
        {!isPremium ? (
          <View style={{ flex: 1, paddingHorizontal: 24, justifyContent: "center", gap: 24 }}>
            <View style={{ alignItems: "center", gap: 12 }}>
              <View style={{
                width: 72, height: 72, borderRadius: 36,
                backgroundColor: COLORS.primaryMist,
                alignItems: "center", justifyContent: "center",
              }}>
                <Text style={{ fontSize: 34 }}>💬</Text>
              </View>
              <Text style={{ fontFamily: SERIF, fontSize: 22, color: COLORS.ink, textAlign: "center" }}>
                AI Coach is Premium
              </Text>
              <Text style={{ fontSize: 14, color: COLORS.ink2, textAlign: "center", lineHeight: 22 }}>
                Get personalized, data-driven answers to your pumping questions, plus trend analysis, stash planning, and more.
              </Text>
            </View>
            <View style={{
              backgroundColor: "#fff", borderRadius: 20, padding: 20, gap: 10,
              shadowColor: COLORS.ink, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
              borderWidth: 1, borderColor: COLORS.border,
            }}>
              {["AI Coach: ask anything", "Full trend analytics", "Smart stash planner", "Return to work tools"].map((f) => (
                <View key={f} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: COLORS.primaryMist, alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ fontSize: 11, color: COLORS.primary, fontFamily: "Nunito_700Bold", fontWeight: "700" }}>✓</Text>
                  </View>
                  <Text style={{ fontSize: 14, color: COLORS.ink }}>{f}</Text>
                </View>
              ))}
            </View>
            <Pressable
              onPress={() => router.push("/paywall" as any)}
              style={({ pressed }) => ({
                backgroundColor: COLORS.primary, borderRadius: 20, paddingVertical: 16,
                alignItems: "center", opacity: pressed ? 0.9 : 1,
              })}
            >
              <Text style={{ fontSize: 15, fontFamily: "Nunito_700Bold", fontWeight: "700", color: "#fff" }}>Upgrade to Premium</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {/* Messages */}
            <ScrollView
              ref={scrollRef}
              className="flex-1 px-4"
              contentContainerStyle={{ paddingTop: 12, paddingBottom: 12 }}
              onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
            >
              {redFlag && <RedFlagBanner message={redFlag} />}

              {messages.length === 0 ? (
                <View className="gap-4">
                  <View style={{ backgroundColor: COLORS.primaryMist, borderRadius: 24, padding: 20, flexDirection: "row", gap: 14, alignItems: "flex-start" }}>
                    <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.primary, alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2 }}>
                      <Text style={{ fontSize: 18 }}>💬</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontFamily: "Nunito_700Bold", fontWeight: "700", color: COLORS.ink, marginBottom: 4 }}>Ask me anything about pumping.</Text>
                      <Text style={{ fontSize: 13, color: COLORS.ink2, lineHeight: 20 }}>
                        I will use your tracked data to give you personalized, IBCLC-guided answers.
                      </Text>
                    </View>
                  </View>

                  <Text style={{ fontSize: 11, color: COLORS.ink3, textAlign: "center", lineHeight: 17, paddingHorizontal: 8 }}>
                    Pump Coach provides educational support and is not a substitute for medical advice.
                  </Text>

                  <Text className="text-xs font-sans-semi text-ink-3 uppercase tracking-wider px-1">
                    Common questions
                  </Text>
                  <FlatList
                    data={SESSION_QUICK_PROMPTS}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    keyExtractor={(item) => item}
                    contentContainerStyle={{ gap: 8, paddingHorizontal: 2, paddingBottom: 4, paddingRight: 16 }}
                    renderItem={({ item }) => (
                      <Pressable
                        onPress={() => sendMessage(item)}
                        accessibilityRole="button"
                        accessibilityLabel={item}
                        accessibilityHint="Sends this question to the coach"
                        style={({ pressed }) => ({
                          backgroundColor: pressed ? COLORS.primaryMist : "#fff",
                          borderWidth: 1.5,
                          borderColor: pressed ? COLORS.primary : "rgba(124,92,252,0.25)",
                          borderRadius: 20,
                          paddingHorizontal: 14,
                          paddingVertical: 10,
                          maxWidth: 240,
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 6,
                          shadowColor: COLORS.ink,
                          shadowOpacity: 0.06,
                          shadowRadius: 4,
                          elevation: 1,
                        })}
                      >
                        <Text style={{ fontSize: 13, color: COLORS.ink, lineHeight: 18, flexShrink: 1 }}>{item}</Text>
                        <Text style={{ fontSize: 13, color: COLORS.primary, flexShrink: 0 }}>→</Text>
                      </Pressable>
                    )}
                  />

                  <ConsultRecommendation hasLactationConsultant={profile?.has_lactation_consultant ?? null} />
                </View>
              ) : (
                <View className="gap-3">
                  {messages.map((msg, i) => (
                    <View key={i} style={{ alignSelf: msg.role === "user" ? "flex-end" : "flex-start", maxWidth: "85%" }}>
                      <View
                        className={`rounded-2xl px-4 py-3 ${
                          msg.role === "user"
                            ? "bg-primary"
                            : "bg-surface border border-border"
                        }`}
                        style={msg.role === "assistant" ? { shadowColor: "#1A1A2E", shadowOpacity: 0.05, shadowRadius: 6, elevation: 1 } : {}}
                      >
                        <Text
                          className={`text-sm leading-5 ${
                            msg.role === "user" ? "text-white" : "text-ink"
                          }`}
                        >
                          {msg.content}
                        </Text>
                        <Text style={{ fontSize: 11, marginTop: 4, color: msg.role === "user" ? "rgba(255,255,255,0.5)" : "#B09880" }}>
                          {fmtRelative(msg.ts)}
                        </Text>
                      </View>
                      {/* Flag icon — assistant messages only */}
                      {msg.role === "assistant" && (
                        <Pressable
                          onPress={() => setReportTarget({ index: i, content: msg.content })}
                          style={{ alignSelf: "flex-start", marginTop: 4, paddingHorizontal: 4, paddingVertical: 2 }}
                          hitSlop={8}
                          accessibilityRole="button"
                          accessibilityLabel="Report this response"
                          accessibilityHint="Opens a form to flag this AI response as inaccurate or inappropriate"
                        >
                          <Text style={{ fontSize: 11, color: COLORS.ink3 }}>⚑ Report</Text>
                        </Pressable>
                      )}
                      {/* Contextual consult card when AI recommends professional support */}
                      {msg.role === "assistant" && messageHasConsultRecommendation(msg.content) && (
                        <View style={{ marginTop: 8, width: "100%" }}>
                          <ConsultRecommendation hasLactationConsultant={profile?.has_lactation_consultant ?? null} />
                        </View>
                      )}
                    </View>
                  ))}

                  {loading && (
                    <View className="self-start bg-surface border border-border rounded-2xl px-4 py-3 flex-row items-center gap-2">
                      <ActivityIndicator size="small" color={COLORS.primary} />
                      <Text className="text-sm text-ink-2">Thinking…</Text>
                    </View>
                  )}
                </View>
              )}
            </ScrollView>

            {/* Input */}
            <View className="flex-row items-end gap-2 px-4 py-3 bg-surface border-t border-border">
              <TextInput
                className="flex-1 bg-muted rounded-2xl px-4 py-3 text-ink text-sm min-h-[44px] max-h-[120px]"
                value={input}
                onChangeText={setInput}
                placeholder="Ask me anything…"
                placeholderTextColor={COLORS.ink3}
                accessibilityLabel="Message to coach"
                multiline
                returnKeyType="default"
              />
              <Pressable
                onPress={() => sendMessage(input)}
                disabled={!input.trim() || loading}
                className={`w-11 h-11 rounded-full items-center justify-center ${
                  input.trim() && !loading ? "bg-primary active:bg-primary-600" : "bg-border"
                }`}
                accessibilityRole="button"
                accessibilityLabel="Send message"
                accessibilityState={{ disabled: !input.trim() || loading }}
              >
                <Text className="text-white text-lg">↑</Text>
              </Pressable>
            </View>
          </>
        )}
      </KeyboardAvoidingView>

      {/* ── Report a response bottom sheet ── */}
      <Modal
        visible={!!reportTarget}
        transparent
        animationType="slide"
        onRequestClose={closeReportSheet}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" }}
          onPress={closeReportSheet}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            accessibilityViewIsModal={true}
            style={{
              backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24,
              padding: 24, paddingBottom: 40, gap: 20,
            }}
          >
            {reportSent ? (
              <View style={{ alignItems: "center", gap: 12, paddingVertical: 16 }}>
                <Text style={{ fontSize: 24 }}>✓</Text>
                <Text style={{ fontFamily: "Nunito_700Bold", fontWeight: "700", fontSize: 16, color: COLORS.ink, textAlign: "center" }}>
                  Thanks for letting us know.
                </Text>
                <Text style={{ fontSize: 14, color: COLORS.ink2, textAlign: "center", lineHeight: 20 }}>
                  We review every report to keep the coaching safe and accurate.
                </Text>
                <Pressable
                  onPress={closeReportSheet}
                  style={{ marginTop: 8, backgroundColor: COLORS.primary, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 32 }}
                >
                  <Text style={{ color: "#fff", fontFamily: "Nunito_700Bold", fontWeight: "700", fontSize: 14 }}>Done</Text>
                </Pressable>
              </View>
            ) : (
              <>
                <View>
                  <Text style={{ fontFamily: "Nunito_700Bold", fontWeight: "700", fontSize: 17, color: COLORS.ink, marginBottom: 6 }}>
                    Something off with this answer?
                  </Text>
                  <Text style={{ fontSize: 13, color: COLORS.ink3, lineHeight: 18 }}>
                    Select a reason and we will review it.
                  </Text>
                </View>

                <View style={{ gap: 10 }}>
                  {REPORT_REASONS.map((reason) => (
                    <Pressable
                      key={reason}
                      onPress={() => setReportReason(reason)}
                      style={{
                        flexDirection: "row", alignItems: "center", gap: 12,
                        padding: 14, borderRadius: 14, borderWidth: 1.5,
                        borderColor: reportReason === reason ? COLORS.primary : COLORS.border,
                        backgroundColor: reportReason === reason ? "rgba(74,94,96,0.05)" : "#fff",
                      }}
                    >
                      <View style={{
                        width: 18, height: 18, borderRadius: 9, borderWidth: 2, flexShrink: 0,
                        borderColor: reportReason === reason ? COLORS.primary : COLORS.border,
                        backgroundColor: reportReason === reason ? COLORS.primary : "transparent",
                        alignItems: "center", justifyContent: "center",
                      }}>
                        {reportReason === reason && (
                          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: "#fff" }} />
                        )}
                      </View>
                      <Text style={{ fontSize: 14, color: COLORS.ink, flex: 1 }}>{reason}</Text>
                    </Pressable>
                  ))}
                </View>

                <View>
                  <Text style={{ fontSize: 13, color: COLORS.ink2, marginBottom: 8 }}>
                    Additional notes (optional)
                  </Text>
                  <TextInput
                    value={reportNotes}
                    onChangeText={(t) => setReportNotes(t.slice(0, 200))}
                    placeholder="Tell us more..."
                    placeholderTextColor={COLORS.ink3}
                    multiline
                    style={{
                      backgroundColor: COLORS.muted, borderRadius: 12,
                      padding: 12, fontSize: 14, color: COLORS.ink,
                      minHeight: 80, textAlignVertical: "top",
                      borderWidth: 1, borderColor: COLORS.border,
                    }}
                  />
                  <Text style={{ fontSize: 11, color: COLORS.ink3, textAlign: "right", marginTop: 4 }}>
                    {reportNotes.length}/200
                  </Text>
                </View>

                <View style={{ flexDirection: "row", gap: 12 }}>
                  <Pressable
                    onPress={closeReportSheet}
                    style={{ flex: 1, borderRadius: 14, paddingVertical: 14, alignItems: "center", borderWidth: 1.5, borderColor: COLORS.border }}
                  >
                    <Text style={{ fontSize: 14, color: COLORS.ink, fontFamily: "Nunito_600SemiBold", fontWeight: "600" }}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    onPress={submitReport}
                    disabled={!reportReason || reportSending}
                    style={{
                      flex: 2, borderRadius: 14, paddingVertical: 14, alignItems: "center",
                      backgroundColor: reportReason ? COLORS.primary : COLORS.muted,
                      opacity: reportSending ? 0.7 : 1,
                    }}
                  >
                    {reportSending
                      ? <ActivityIndicator color="#fff" size="small" />
                      : <Text style={{ fontSize: 14, color: "#fff", fontFamily: "Nunito_700Bold", fontWeight: "700" }}>Submit</Text>
                    }
                  </Pressable>
                </View>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
