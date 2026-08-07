import React from "react";
import { View, Text, ScrollView, Pressable, RefreshControl, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuthStore } from "../../store/authStore";
import { COLORS, SERIF } from "../../lib/constants";
import { fmtRelative } from "../../lib/formatters";
import { useViewerAccess } from "../../hooks/useViewerAccess";

export default function ViewerClientList() {
  const router = useRouter();
  const { setViewingMode, signOut } = useAuthStore();
  const { people, loading, refetch } = useViewerAccess();

  async function openClient(ownerId: string) {
    setViewingMode(ownerId);
    await AsyncStorage.setItem("viewer_mode_pref", "viewer");
    router.push("/(viewer)/dashboard" as any);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.cream }}>
      <View style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 20,
        paddingVertical: 12,
      }}>
        <Text style={{ fontFamily: SERIF, fontSize: 22, color: COLORS.ink }}>
          Your Clients
        </Text>
        <Pressable
          hitSlop={12}
          onPress={async () => {
            await AsyncStorage.setItem("viewer_mode_pref", "own");
            setViewingMode(null);
            router.replace("/(tabs)" as any);
          }}
        >
          <Text style={{ fontSize: 13, color: COLORS.primary, fontFamily: "Nunito_600SemiBold", fontWeight: "600" }}>
            My Account
          </Text>
        </Pressable>
      </View>

      <ScrollView
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} tintColor={COLORS.primary} />}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40, flexGrow: 1 }}
      >
        {loading && people.length === 0 ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 80 }}>
            <ActivityIndicator size="large" color={COLORS.primary} />
          </View>
        ) : people.length === 0 ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 80 }}>
            <Text style={{ fontSize: 40, marginBottom: 12 }}>👋</Text>
            <Text style={{ fontSize: 14, color: COLORS.ink2, textAlign: "center" }}>
              No one has shared their data with you yet
            </Text>
          </View>
        ) : (
          <View style={{
            backgroundColor: "#fff",
            borderRadius: 16,
            borderWidth: 1,
            borderColor: COLORS.border,
            paddingHorizontal: 16,
          }}>
            {people.map((person, i) => (
              <Pressable
                key={person.id}
                onPress={() => openClient(person.id)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  paddingVertical: 14,
                  borderTopWidth: i > 0 ? 1 : 0,
                  borderTopColor: COLORS.border,
                }}
              >
                <View style={{
                  width: 40, height: 40, borderRadius: 20,
                  backgroundColor: COLORS.primaryMist,
                  alignItems: "center", justifyContent: "center",
                  borderWidth: 1, borderColor: COLORS.primary,
                }}>
                  <Text style={{ fontSize: 14, fontFamily: "Nunito_700Bold", fontWeight: "700", color: COLORS.primary }}>
                    {person.initials}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontFamily: "Nunito_700Bold", fontWeight: "700", color: COLORS.ink }}>
                    {person.initials}
                  </Text>
                  <Text style={{ fontSize: 12, color: COLORS.ink3, marginTop: 2 }}>
                    {person.last_logged_at ? `Last logged ${fmtRelative(person.last_logged_at)}` : "No sessions logged yet"}
                  </Text>
                </View>
                <Text style={{ fontSize: 16, color: COLORS.ink3 }}>›</Text>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
