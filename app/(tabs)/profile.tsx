import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, ScrollView, Pressable, Alert, Linking, Platform, ActionSheetIOS, Share, Modal, Image, ActivityIndicator, TextInput, KeyboardAvoidingView, Switch,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  NOTIF_ENABLED_KEY,
  NOTIF_FREQUENCY_KEY,
  cancelEncouragingNotifications,
  scheduleNextEncouragingNotification,
  type NotifFrequency,
} from "../../lib/encouragementScheduler";
import { decode } from "base64-arraybuffer";
import * as MailComposer from "expo-mail-composer";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { format } from "date-fns";
import { supabase } from "../../lib/supabase";
import { useAuthStore } from "../../store/authStore";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { ConsultRecommendation } from "../../components/ConsultRecommendation";
import { DatePickerField } from "../../components/ui/DatePickerField";
import { babyAgeLabel, babyAgeWeeks } from "../../lib/formatters";
import { primaryBaby } from "../../lib/babies";
import { COLORS, SERIF, PRIVACY_POLICY_URL, TERMS_OF_SERVICE_URL } from "../../lib/constants";
import { PumpingContext, Invitation, ViewerAccount, UserPump, Baby } from "../../types";
import { useUnit } from "../../hooks/useUnit";
import { useViewerAccess } from "../../hooks/useViewerAccess";
import { UnitPref } from "../../lib/units";

const PUMP_BRANDS = ["Spectra", "Medela", "Elvie", "Willow", "Baby Buddha", "Haakaa", "Momcozy", "Lansinoh", "Other"];

const PUMPING_CONTEXT_LABELS: Record<PumpingContext, string> = {
  exclusive_pumping:     "Exclusively pumping",
  equal_pumping_nursing: "Pumping and nursing equally",
  work_pumping:          "Pumping at work, nursing otherwise",
  mostly_nursing:        "Mostly nursing, pumping occasionally",
  mostly_pumping:        "Mostly pumping, nursing occasionally",
  supply_building:       "Building supply",
  triple_feeding:        "Triple feeding",
  weaning:               "Weaning or reducing",
  unspecified:           "Not specified",
};

function SettingRow({
  label, value, onPress, danger = false, disabled = false,
}: {
  label: string; value?: string; onPress?: () => void; danger?: boolean; disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      className="flex-row items-center justify-between py-4 active:bg-muted"
      style={disabled ? { opacity: 0.45 } : undefined}
      accessibilityRole="button"
      accessibilityLabel={value ? `${label}, ${value}` : label}
      accessibilityState={{ disabled: !!disabled }}
    >
      <Text className={`text-sm font-sans ${danger ? "text-red-500" : "text-ink"}`}>{label}</Text>
      <View className="flex-row items-center gap-2">
        {value && <Text className="text-sm text-ink-3">{value}</Text>}
        {onPress && !disabled && <Text className="text-ink-3">›</Text>}
      </View>
    </Pressable>
  );
}

function Divider() {
  return <View className="h-px bg-border" />;
}

function generateCode(displayName: string | null): string {
  const prefix = displayName
    ? displayName.replace(/[^a-zA-Z]/g, "").toUpperCase().slice(0, 5).padEnd(3, "X")
    : "PUMP";
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let suffix = "";
  for (let i = 0; i < 4; i++) suffix += chars[Math.floor(Math.random() * chars.length)];
  return `${prefix}-${suffix}`;
}

function titleCase(str: string) {
  return str.replace(/\b\w/g, c => c.toUpperCase());
}

export default function ProfileScreen() {
  const router = useRouter();
  const { user, profile, babies, signOut, isPremium, loadProfile, knownOwnerId, setViewingMode } = useAuthStore();
  const { people: clientsIView } = useViewerAccess();
  const { unit, changeUnit } = useUnit();
  const SKIP_GAP_ALERTS_KEY = "skip_gap_alerts_pref";

  const [exporting,      setExporting]      = useState(false);
  const [referralCode,   setReferralCode]   = useState<string | null>(null);
  const [notifEnabled,   setNotifEnabled]   = useState(true);
  const [notifFreq,      setNotifFreq]      = useState<NotifFrequency>("daily");
  const [skipGapAlerts,  setSkipGapAlerts]  = useState(false);
  const [referralUses,  setReferralUses]  = useState(0);
  const [savedBanner,      setSavedBanner]      = useState(false);
  const [avatarUploading,  setAvatarUploading]  = useState(false);
  const [editModal, setEditModal] = useState<{
    title: string;
    value: string;
    autoCapitalize: "none" | "sentences" | "words" | "characters";
    onSave: (text: string) => void;
  } | null>(null);
  const [editModalText, setEditModalText] = useState("");
  const [viewers,         setViewers]         = useState<ViewerAccount[]>([]);
  const [viewerProfiles,  setViewerProfiles]  = useState<Record<string, string>>({});
  const [sharingInviteEmail, setSharingInviteEmail] = useState("");
  const [sharingBusy,     setSharingBusy]     = useState(false);
  const [showSharingModal, setShowSharingModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [newPassword,       setNewPassword]       = useState("");
  const [confirmPassword,   setConfirmPassword]   = useState("");
  const [changingPassword,  setChangingPassword]  = useState(false);
  const [userPumps,        setUserPumps]        = useState<UserPump[]>([]);
  const [showPumpsModal,   setShowPumpsModal]   = useState(false);
  const [newPumpName,      setNewPumpName]      = useState("");
  const [pumpSaving,       setPumpSaving]       = useState(false);

  const [showBabiesModal,  setShowBabiesModal]  = useState(false);
  const [babyDraftName,    setBabyDraftName]    = useState("");
  const [babyDraftDob,     setBabyDraftDob]     = useState<Date | null>(null);
  const [showBabyDobPicker, setShowBabyDobPicker] = useState(false);
  const [editingBabyId,    setEditingBabyId]    = useState<string | null>(null);
  const [babySaving,       setBabySaving]       = useState(false);

  useEffect(() => {
    loadReferralCode();
    loadViewers();
    loadUserPumps();
    // Load AsyncStorage preferences
    Promise.all([
      AsyncStorage.getItem(NOTIF_ENABLED_KEY),
      AsyncStorage.getItem(NOTIF_FREQUENCY_KEY),
      AsyncStorage.getItem(SKIP_GAP_ALERTS_KEY),
    ]).then(([en, freq, skipGap]) => {
      if (en !== null) setNotifEnabled(en !== "false");
      if (freq !== null) setNotifFreq(freq as NotifFrequency);
      if (skipGap !== null) setSkipGapAlerts(skipGap === "true");
    });
  }, [profile?.id]);

  const loadReferralCode = async () => {
    if (!profile?.id) return;
    const { data } = await supabase
      .from("referral_codes")
      .select("id, code")
      .eq("user_id", profile.id)
      .maybeSingle();

    if (data) {
      setReferralCode(data.code);
      // Count uses
      const { count } = await supabase
        .from("referral_uses")
        .select("id", { count: "exact", head: true })
        .eq("code_id", data.id);
      setReferralUses(count ?? 0);
    } else {
      // Generate and save a new code
      const code = generateCode(profile.display_name);
      const { data: inserted } = await supabase
        .from("referral_codes")
        .insert({ user_id: profile.id, code })
        .select("code")
        .single();
      if (inserted) setReferralCode(inserted.code);
    }
  };

  const loadViewers = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("viewer_accounts")
      .select("*")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false });
    if (!data) return;
    setViewers(data as ViewerAccount[]);

    // Load display names for each viewer
    if (data.length > 0) {
      const ids = data.map((v: ViewerAccount) => v.viewer_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name, email")
        .in("id", ids);
      const map: Record<string, string> = {};
      (profiles ?? []).forEach((p: any) => {
        map[p.id] = p.display_name || p.email || "Viewer";
      });
      setViewerProfiles(map);
    }
  };

  const loadUserPumps = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("user_pumps")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });
    setUserPumps((data ?? []) as UserPump[]);
  };

  const handleAddPump = async () => {
    const name = newPumpName.trim();
    if (!name || !user) return;
    if (userPumps.length >= 8) {
      Alert.alert("Too many pumps", "You can save up to 8 pumps. Delete one first.");
      return;
    }
    setPumpSaving(true);
    const { data, error } = await supabase
      .from("user_pumps")
      .insert({ user_id: user.id, name })
      .select()
      .single();
    setPumpSaving(false);
    if (error) { Alert.alert("Error", error.message); return; }
    setUserPumps((prev) => [...prev, data as UserPump]);
    setNewPumpName("");
  };

  const handleDeletePump = (pump: UserPump) => {
    Alert.alert(
      `Remove "${pump.name}"?`,
      "This won't affect past session records.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            await supabase.from("user_pumps").delete().eq("id", pump.id);
            setUserPumps((prev) => prev.filter((p) => p.id !== pump.id));
          },
        },
      ]
    );
  };

  const resetBabyDraft = () => {
    setEditingBabyId(null);
    setBabyDraftName("");
    setBabyDraftDob(null);
  };

  const startEditBaby = (baby: Baby) => {
    setEditingBabyId(baby.id);
    setBabyDraftName(baby.name);
    // Bare "yyyy-MM-dd" strings parse as UTC midnight, which rolls back a
    // day once shown in a timezone west of UTC — anchor to local noon.
    setBabyDraftDob(baby.dob ? new Date(`${baby.dob}T12:00:00`) : null);
  };

  const handleSaveBaby = async () => {
    const name = babyDraftName.trim();
    if (!name || !user) return;
    if (!editingBabyId && babies.length >= 6) {
      Alert.alert("Too many babies", "You can save up to 6 babies. Remove one first.");
      return;
    }
    setBabySaving(true);
    const dob = babyDraftDob ? format(babyDraftDob, "yyyy-MM-dd") : null;
    const { error } = editingBabyId
      ? await supabase.from("babies").update({ name, dob }).eq("id", editingBabyId)
      : await supabase.from("babies").insert({ user_id: user.id, name, dob });
    setBabySaving(false);
    if (error) { Alert.alert("Error", error.message); return; }
    resetBabyDraft();
    await loadProfile();
  };

  const handleDeleteBaby = (baby: Baby) => {
    Alert.alert(
      `Remove "${baby.name}"?`,
      "This won't affect past session records.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            await supabase.from("babies").delete().eq("id", baby.id);
            if (editingBabyId === baby.id) resetBabyDraft();
            await loadProfile();
          },
        },
      ]
    );
  };

  const handleCreateInvite = async () => {
    if (!user || !sharingInviteEmail.trim()) return;
    setSharingBusy(true);

    const recipientEmail = sharingInviteEmail.trim().toLowerCase();

    // Revoke any existing pending invite for this email
    await supabase
      .from("invitations")
      .update({ status: "revoked" })
      .eq("owner_id", user.id)
      .eq("email", recipientEmail)
      .eq("status", "pending");

    const { data, error } = await supabase
      .from("invitations")
      .insert({ owner_id: user.id, email: recipientEmail })
      .select("token")
      .single();

    setSharingBusy(false);

    if (error || !data) {
      Alert.alert("Error", error?.message ?? "Could not create invite");
      return;
    }

    const ownerName = profile?.display_name ?? "Someone";
    const babyName = primaryBaby(babies)?.name;
    const appStoreUrl = "https://apps.apple.com/app/id6765497176";

    const subject = `${ownerName} invited you to view her Pump Coach data`;
    const htmlBody = `
      <html>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333;">
          <p>Hi!</p>
          <p>${ownerName} has invited you to view her pumping data${babyName ? ` for ${babyName}` : ""} in Pump Coach.</p>
          <p style="margin-top: 24px;"><strong>Here's how to get started:</strong></p>
          <ol>
            <li>Download Pump Coach (free): <a href="${appStoreUrl}" style="color: #D4A574; text-decoration: none; font-weight: 500;">Download from App Store</a></li>
            <li>Open the app and tap <strong>"Enter invite code"</strong> &mdash; it's at the bottom of the welcome screen, or if you already have an account, on the <strong>Profile</strong> tab under "Received an Invite?"</li>
            <li>Copy and paste this invite code:</li>
          </ol>
          <p style="background: #F5F0E8; border-radius: 8px; padding: 14px 16px; font-family: Menlo, Consolas, monospace; font-size: 13px; word-break: break-all;">${data.token}</p>
          <p>Once you accept, you'll have read-only access to her pumping sessions and data.</p>
          <p style="margin-top: 24px; color: #999; font-size: 14px;">— Pump Coach</p>
        </body>
      </html>
    `;

    const plainTextBody = [
      `Hi!`,
      ``,
      `${ownerName} has invited you to view her pumping data${babyName ? ` for ${babyName}` : ""} in Pump Coach.`,
      ``,
      `Here's how to get started:`,
      ``,
      `1. Download Pump Coach (free):`,
      `   ${appStoreUrl}`,
      ``,
      `2. Open the app and tap "Enter invite code" — it's at the bottom of the welcome screen, or if you already have an account, on the Profile tab under "Received an Invite?".`,
      ``,
      `3. Copy and paste this invite code:`,
      `   ${data.token}`,
      ``,
      `Once you accept, you'll have read-only access to her pumping sessions and data.`,
      ``,
      `— Pump Coach`,
    ].join("\n");

    const isAvailable = await MailComposer.isAvailableAsync();

    if (isAvailable) {
      await MailComposer.composeAsync({
        recipients: [recipientEmail],
        subject,
        body: htmlBody,
        isHtml: true,
      });
    } else {
      // Fallback to share sheet on devices without a mail app configured —
      // reuse the same code-based message as the email body above (this
      // used to reference a clickable invite link that never worked; see
      // "Invite code flow replaces broken invite links").
      await Share.share({ message: plainTextBody });
    }

    setSharingInviteEmail("");
    setShowSharingModal(false);
  };

  const handleRevokeViewer = (v: ViewerAccount) => {
    const name = viewerProfiles[v.viewer_id] ?? "this viewer";
    Alert.alert(
      "Remove access",
      `Remove ${name}'s access to your data?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            await supabase.from("viewer_accounts").delete().eq("id", v.id);
            setViewers((prev) => prev.filter((x) => x.id !== v.id));
          },
        },
      ]
    );
  };

  const handleShare = async () => {
    if (!referralCode) return;
    await Share.share({
      message: `Use my code ${referralCode} to get 7 free days of Pump Coach Premium! Download at https://pumpcoach.app`,
    });
  };

  const handleNotifToggle = async (val: boolean) => {
    setNotifEnabled(val);
    await AsyncStorage.setItem(NOTIF_ENABLED_KEY, val ? "true" : "false");
    if (!val) {
      await cancelEncouragingNotifications();
    } else if (profile?.id) {
      const weeks = babyAgeWeeks(primaryBaby(babies)?.dob ?? null) ?? 0;
      scheduleNextEncouragingNotification(profile.id, weeks).catch(() => {});
    }
  };

  const handleNotifFreqChange = async (freq: NotifFrequency) => {
    setNotifFreq(freq);
    await AsyncStorage.setItem(NOTIF_FREQUENCY_KEY, freq);
    if (notifEnabled && profile?.id) {
      const weeks = babyAgeWeeks(primaryBaby(babies)?.dob ?? null) ?? 0;
      await cancelEncouragingNotifications();
      scheduleNextEncouragingNotification(profile.id, weeks).catch(() => {});
    }
  };

  const handleSkipGapAlertsToggle = async (val: boolean) => {
    setSkipGapAlerts(val);
    await AsyncStorage.setItem(SKIP_GAP_ALERTS_KEY, val ? "true" : "false");
  };

  const handleHydrationToggle = async (val: boolean) => {
    await save({ track_hydration: val });
  };

  const tierLabel = isPremium ? "Premium" : "Free";

  const uid = user?.id ?? profile?.id ?? "";

  const save = useCallback(async (updates: Record<string, unknown>) => {
    if (!uid) {
      Alert.alert("Could not save", "Not signed in. Please restart the app.");
      return false;
    }
    // Refresh token if needed before writing
    await supabase.auth.getSession();
    const { data, error } = await supabase
      .from("profiles")
      .update(updates)
      .eq("id", uid)
      .select();
    if (error) {
      Alert.alert("Could not save", error.message);
      return false;
    }
    if (!data?.length) {
      Alert.alert("Could not save", "Your session may have expired. Please sign out and sign back in.");
      return false;
    }
    await loadProfile();
    setSavedBanner(true);
    setTimeout(() => setSavedBanner(false), 1500);
    return true;
  }, [uid, loadProfile]);

  const handlePickAvatar = async () => {
    try {
      let ImagePicker: typeof import("expo-image-picker");
      try {
        ImagePicker = require("expo-image-picker");
      } catch {
        Alert.alert("Update required", "Please install the latest version of Pump Coach to upload a profile photo.");
        return;
      }

      if (!ImagePicker?.requestMediaLibraryPermissionsAsync) {
        Alert.alert("Update required", "Please install the latest version of Pump Coach to upload a profile photo.");
        return;
      }

      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission needed", "Please allow photo library access in Settings to set a profile photo.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
        base64: true,
      });

      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];

      if (!asset.base64) {
        Alert.alert("Upload failed", "Could not read image data. Please try again.");
        return;
      }

      setAvatarUploading(true);
      try {
        const arrayBuffer = decode(asset.base64);
        const rawExt = asset.uri.split(".").pop()?.toLowerCase().replace(/[^a-z]/g, "") ?? "jpg";
        const ext = rawExt || "jpg";
        const contentType = ext === "png" ? "image/png" : "image/jpeg";
        const path = `${uid}/avatar.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from("avatars")
          .upload(path, arrayBuffer, { contentType, upsert: true });

        if (uploadError) {
          Alert.alert("Upload failed", uploadError.message);
          return;
        }

        const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(path);
        await save({ avatar_url: publicUrl });
      } finally {
        setAvatarUploading(false);
      }
    } catch (e: any) {
      setAvatarUploading(false);
      Alert.alert("Upload failed", e?.message ?? "Something went wrong.");
    }
  };

  const handleUpdateContext = () => {
    const options = Object.entries(PUMPING_CONTEXT_LABELS).filter(([k]) => k !== "unspecified");
    const labels  = options.map(([, label]) => label);

    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: [...labels, "Cancel"], cancelButtonIndex: labels.length, title: "How are you feeding right now?" },
        async (idx) => {
          if (idx === labels.length) return;
          const value = options[idx][0] as PumpingContext;
          await save({ pumping_context: value });
        }
      );
    } else {
      Alert.alert(
        "How are you feeding right now?",
        undefined,
        [
          ...options.map(([value, label]) => ({
            text: label,
            onPress: () => save({ pumping_context: value as PumpingContext }),
          })),
          { text: "Cancel", style: "cancel" },
        ]
      );
    }
  };

  const handleEditDailyGoal = () => {
    const current = profile?.daily_goal_oz ? String(profile.daily_goal_oz) : "";
    if (Platform.OS === "ios") {
      Alert.prompt(
        "Daily goal",
        "How many ounces per day are you aiming for?",
        async (text) => {
          const oz = parseFloat(text);
          if (!isNaN(oz) && oz > 0) {
            await save({ daily_goal_oz: oz });
          }
        },
        "plain-text",
        current,
        "numeric"
      );
    } else {
      setEditModalText(current);
      setEditModal({
        title: "Daily goal",
        value: current,
        autoCapitalize: "none",
        onSave: async (text) => {
          const oz = parseFloat(text);
          if (!isNaN(oz) && oz > 0) await save({ daily_goal_oz: oz });
        },
      });
    }
  };

  const handleFlangeSize = () => {
    const current = profile?.flange_size_mm ? String(profile.flange_size_mm) : "";
    const openAnalyzer = () => router.push("/tools/flange");
    const enterManually = () => {
      Alert.prompt(
        "Flange size",
        "Enter your flange size in mm (e.g. 21, 24, 28)",
        async (text) => {
          const mm = parseFloat(text);
          if (!isNaN(mm) && mm > 0) {
            await save({ flange_size_mm: mm });
          }
        },
        "plain-text",
        current,
        "numeric"
      );
    };

    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ["Enter size manually", "Open Flange Fit Analyzer", "Cancel"],
          cancelButtonIndex: 2,
          title: "Flange size",
          message: "Not sure? Use the analyzer to measure.",
        },
        (idx) => {
          if (idx === 0) enterManually();
          else if (idx === 1) openAnalyzer();
        }
      );
    } else {
      Alert.alert(
        "Flange size",
        "Not sure? Use the analyzer to measure.",
        [
          { text: "Open Flange Fit Analyzer", onPress: openAnalyzer },
          { text: "Cancel", style: "cancel" as const },
        ]
      );
    }
  };

  const handleEditMomName = () => {
    const current = profile?.display_name ?? "";
    setEditModalText(current);
    setEditModal({
      title: "Your name",
      value: current,
      autoCapitalize: "words",
      onSave: async (text) => {
        const name = titleCase(text.trim());
        if (name) await save({ display_name: name });
      },
    });
  };

  const handleEditPumpBrand = () => {
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: [...PUMP_BRANDS, "Cancel"],
          cancelButtonIndex: PUMP_BRANDS.length,
          title: "Pump brand",
        },
        async (idx) => {
          if (idx === PUMP_BRANDS.length) return;
          await save({ pump_brand: PUMP_BRANDS[idx] });
        }
      );
    } else {
      Alert.alert(
        "Pump brand",
        "Select your pump brand:",
        [
          ...PUMP_BRANDS.map((brand) => ({
            text: brand,
            onPress: () => save({ pump_brand: brand }),
          })),
          { text: "Cancel", style: "cancel" as const },
        ]
      );
    }
  };

  const handleUpdateLcStatus = () => {
    const options: Array<{ label: string; value: boolean | null }> = [
      { label: "Yes, I work with one",  value: true  },
      { label: "No, not right now",     value: false },
      { label: "I'm not sure",          value: false },
    ];
    const labels = options.map((o) => o.label);

    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: [...labels, "Cancel"], cancelButtonIndex: labels.length, title: "Working with a lactation consultant?" },
        async (idx) => {
          if (idx === labels.length) return;
          await save({ has_lactation_consultant: options[idx].value });
        }
      );
    } else {
      Alert.alert(
        "Working with a lactation consultant?",
        undefined,
        [
          ...options.map(({ label, value }) => ({
            text: label,
            onPress: () => save({ has_lactation_consultant: value }),
          })),
          { text: "Cancel", style: "cancel" as const },
        ]
      );
    }
  };

  const handleUnitPref = () => {
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ["Ounces (oz)", "Milliliters (ml)", "Cancel"],
          cancelButtonIndex: 2,
          title: "Unit preference",
        },
        (idx) => {
          if (idx === 0) changeUnit("oz");
          else if (idx === 1) changeUnit("ml");
        }
      );
    } else {
      Alert.alert(
        "Unit preference",
        "Choose your preferred unit:",
        [
          { text: "Ounces (oz)", onPress: () => changeUnit("oz") },
          { text: "Milliliters (ml)", onPress: () => changeUnit("ml") },
          { text: "Cancel", style: "cancel" as const },
        ]
      );
    }
  };

  const handleExport = async () => {
    setExporting(true);
    const { data: sessions } = await supabase.from("pump_sessions").select("*").order("started_at", { ascending: false });
    const { data: stash }    = await supabase.from("stash_entries").select("*").order("expressed_at", { ascending: false });
    setExporting(false);

    if (!sessions && !stash) { Alert.alert("Nothing to export yet."); return; }

    // In a real build: write to FileSystem and Share
    Alert.alert("Export ready", `${sessions?.length ?? 0} sessions and ${stash?.length ?? 0} stash entries. File sharing requires a device build.`);
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      "Delete account",
      "This will permanently delete all your data: pumping logs, stash entries, Pump Coach conversations, and your profile. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete my account",
          style: "destructive",
          onPress: async () => {
            const { error } = await supabase.functions.invoke("delete-account");
            if (error) {
              Alert.alert("Error", "Could not delete account. Please try again or contact support.");
              return;
            }
            await signOut();
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.cream }} edges={["top"]}>
      {/* Baby DOB picker modal — used from within the My Babies modal below */}
      <Modal visible={showBabyDobPicker} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowBabyDobPicker(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.cream }} edges={["top", "bottom"]}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border }}>
            <Pressable onPress={() => setShowBabyDobPicker(false)} hitSlop={12}>
              <Text style={{ fontSize: 15, color: COLORS.ink3, fontFamily: "Nunito_600SemiBold", fontWeight: "600" }}>Cancel</Text>
            </Pressable>
            <Text style={{ fontFamily: SERIF, fontSize: 18, color: COLORS.ink }}>Baby's date of birth</Text>
            <Pressable onPress={() => setShowBabyDobPicker(false)} hitSlop={12}>
              <Text style={{ fontSize: 15, color: COLORS.primary, fontFamily: "Nunito_700Bold", fontWeight: "700" }}>Done</Text>
            </Pressable>
          </View>
          <View style={{ padding: 20 }}>
            <DatePickerField
              label="Date of birth"
              value={babyDraftDob ?? new Date()}
              onChange={(d) => setBabyDraftDob(d)}
              mode="date"
              maximumDate={new Date()}
            />
          </View>
        </SafeAreaView>
      </Modal>

      {/* Text field edit modal */}
      <Modal visible={!!editModal} transparent animationType="fade" onRequestClose={() => setEditModal(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
          <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", paddingHorizontal: 24 }} onPress={() => setEditModal(null)}>
            <Pressable onPress={(e) => e.stopPropagation()}>
              <View style={{ backgroundColor: "#fff", borderRadius: 20, padding: 24, gap: 16 }}>
                <Text style={{ fontFamily: SERIF, fontSize: 20, color: COLORS.ink }}>{editModal?.title}</Text>
                <TextInput
                  value={editModalText}
                  onChangeText={setEditModalText}
                  autoCapitalize={editModal?.autoCapitalize ?? "sentences"}
                  autoCorrect={false}
                  autoFocus
                  style={{
                    borderWidth: 1, borderColor: COLORS.border, borderRadius: 12,
                    paddingHorizontal: 14, paddingVertical: 12,
                    fontSize: 16, color: COLORS.ink, fontFamily: "Nunito_400Regular",
                    backgroundColor: COLORS.muted,
                  }}
                />
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <Pressable
                    onPress={() => setEditModal(null)}
                    style={{ flex: 1, paddingVertical: 13, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, alignItems: "center" }}
                  >
                    <Text style={{ fontSize: 15, color: COLORS.ink2, fontFamily: "Nunito_600SemiBold", fontWeight: "600" }}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      editModal?.onSave(editModalText);
                      setEditModal(null);
                    }}
                    style={{ flex: 1, paddingVertical: 13, borderRadius: 12, backgroundColor: COLORS.primary, alignItems: "center" }}
                  >
                    <Text style={{ fontSize: 15, color: "#fff", fontFamily: "Nunito_700Bold", fontWeight: "700" }}>Save</Text>
                  </Pressable>
                </View>
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Header */}
        <View style={{ overflow: "hidden", borderBottomLeftRadius: 36, borderBottomRightRadius: 36, marginBottom: 20 }}>
        <LinearGradient
          colors={["#2E3F40", "#4A5E60"]}
          style={{ paddingTop: 24, paddingBottom: 32, paddingHorizontal: 20, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" }}
        >
          <Text style={{ fontFamily: SERIF, fontSize: 26, color: "#fff" }}>Profile</Text>
          <Pressable
            onPress={() => {
              Alert.alert(
                "Sign out",
                "Are you sure you want to sign out?",
                [
                  { text: "Cancel", style: "cancel" },
                  { text: "Sign out", style: "destructive", onPress: signOut },
                ]
              );
            }}
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, paddingVertical: 4, paddingLeft: 12 })}
          >
            <Text style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", fontFamily: "Nunito_600SemiBold", fontWeight: "600" }}>Sign out</Text>
          </Pressable>
        </LinearGradient>
        </View>

        <View style={{ paddingHorizontal: 20 }}>

        {/* Save confirmation banner */}
        {savedBanner && (
          <View style={{
            backgroundColor: "#4A7C59", borderRadius: 10,
            paddingHorizontal: 16, paddingVertical: 8,
            alignSelf: "center", marginBottom: 12,
            flexDirection: "row", alignItems: "center", gap: 6,
          }}>
            <Text style={{ color: "#fff", fontSize: 13, fontFamily: "Nunito_600SemiBold", fontWeight: "600" }}>Saved ✓</Text>
          </View>
        )}

        {/* Identity card */}
        <Card className="mb-5" padding="md">
          <View className="flex-row items-center gap-4">
            {/* Avatar */}
            <Pressable onPress={handlePickAvatar} style={{ alignItems: "center", gap: 4 }}>
              <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: COLORS.primaryMist, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                {avatarUploading ? (
                  <ActivityIndicator color={COLORS.primary} />
                ) : profile?.avatar_url ? (
                  <Image source={{ uri: profile.avatar_url }} style={{ width: 64, height: 64, borderRadius: 32 }} />
                ) : profile?.display_name ? (
                  <Text style={{ fontSize: 20, fontFamily: "Nunito_800ExtraBold", fontWeight: "800", color: COLORS.primary }}>
                    {profile.display_name.trim().split(/\s+/).map((w: string) => w[0]).slice(0, 2).join("").toUpperCase()}
                  </Text>
                ) : (
                  <Text style={{ fontSize: 26, color: COLORS.primary }}>👤</Text>
                )}
              </View>
              <Text style={{ fontSize: 10, color: COLORS.ink3, fontFamily: "Nunito_600SemiBold", fontWeight: "600" }}>Edit</Text>
            </Pressable>
            <View className="flex-1">
              {profile?.display_name ? (
                <Text className="text-base font-sans-bold text-ink">{profile.display_name}</Text>
              ) : (
                <>
                  <Text className="text-base font-sans-bold text-ink">Hi!</Text>
                  <Text style={{ fontSize: 12, color: COLORS.ink3, marginTop: 1 }}>
                    Add your name in Your Info to personalize your experience.
                  </Text>
                </>
              )}
              <Text className="text-sm text-ink-3">{profile?.email}</Text>
              <View className="flex-row items-center gap-1 mt-1">
                <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, backgroundColor: isPremium ? COLORS.primaryMist : COLORS.muted }}>
                  <Text style={{ fontSize: 12, fontFamily: "Nunito_600SemiBold", fontWeight: "600", color: isPremium ? COLORS.primary : COLORS.ink3 }}>
                    {tierLabel}
                  </Text>
                </View>
                {primaryBaby(babies)?.name && (
                  <Text className="text-xs text-ink-3">
                    · {primaryBaby(babies)!.name}{babies.length > 1 ? ` +${babies.length - 1} more` : ""} {babyAgeLabel(primaryBaby(babies)!.dob)}
                  </Text>
                )}
              </View>
            </View>
          </View>
        </Card>

        {/* Upgrade card (free users only) */}
        {!isPremium && (
          <Pressable
            onPress={() => router.push("/paywall" as any)}
            className="bg-primary rounded-2xl p-5 mb-5 active:bg-primary-600"
            style={{ shadowColor: "#4A5E60", shadowOpacity: 0.25, shadowRadius: 10, elevation: 4 }}
          >
            <Text className="text-white font-sans-bold text-base mb-1">Upgrade to Premium</Text>
            <Text style={{ color: "rgba(255,255,255,0.65)", fontSize: 14 }}>AI Coach, analytics, snapshot sharing & more, from $5/mo with annual</Text>
            <Text className="text-white font-sans-semi mt-3">Start free trial →</Text>
          </Pressable>
        )}

        {/* Your info */}
        <View className="mb-4">
          <Text className="text-xs font-sans-bold text-ink-3 uppercase tracking-wider mb-2 px-1">Your Info</Text>
          <Card padding="none">
            <View className="px-4">
              <SettingRow label="Your name" value={profile?.display_name ?? "Not set"} onPress={handleEditMomName} />
              <Divider />
              <SettingRow
                label="Working with a lactation consultant?"
                value={
                  profile?.has_lactation_consultant === true ? "Yes"
                  : profile?.has_lactation_consultant === false ? "No"
                  : "Not set"
                }
                onPress={handleUpdateLcStatus}
              />
            </View>
          </Card>
        </View>

        {/* Baby & pump info */}
        <View className="mb-4">
          <Text className="text-xs font-sans-bold text-ink-3 uppercase tracking-wider mb-2 px-1">Baby & Pump</Text>
          <Card padding="none">
            <View className="px-4">
              <SettingRow
                label="Babies"
                value={babies.length === 0 ? "Not set" : babies.map((b) => b.name).join(", ")}
                onPress={() => { resetBabyDraft(); setShowBabiesModal(true); }}
              />
              <Divider />
              <SettingRow
                label="Feeding situation"
                value={profile?.pumping_context ? PUMPING_CONTEXT_LABELS[profile.pumping_context] : "Not set"}
                onPress={handleUpdateContext}
              />

              {/* Skip gap alerts — only for non-EP, non-supply-building moms */}
              {profile?.pumping_context !== "exclusive_pumping" &&
               profile?.pumping_context !== "supply_building" && (
                <>
                  <Divider />
                  <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: 14, gap: 12 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, color: COLORS.ink }}>I nurse and pump — skip gap alerts</Text>
                      <Text style={{ fontSize: 11, color: COLORS.ink3, marginTop: 2, lineHeight: 15 }}>
                        Turns off alerts about time between pump sessions
                      </Text>
                    </View>
                    <Switch
                      value={skipGapAlerts}
                      onValueChange={handleSkipGapAlertsToggle}
                      trackColor={{ false: COLORS.border, true: COLORS.primary }}
                      thumbColor="#fff"
                    />
                  </View>
                </>
              )}

              <Divider />
              <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: 14, gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, color: COLORS.ink }}>Track daily hydration</Text>
                  <Text style={{ fontSize: 11, color: COLORS.ink3, marginTop: 2, lineHeight: 15 }}>
                    Log water intake and see how it correlates with your output
                  </Text>
                </View>
                <Switch
                  value={profile?.track_hydration ?? false}
                  onValueChange={handleHydrationToggle}
                  trackColor={{ false: COLORS.border, true: COLORS.primary }}
                  thumbColor="#fff"
                />
              </View>

              <Divider />
              <SettingRow
                label="My pumps"
                value={userPumps.length > 0 ? userPumps.map((p) => p.name).join(", ") : "None added"}
                onPress={() => setShowPumpsModal(true)}
              />
              <Divider />
              <SettingRow label="Pump brand" value={profile?.pump_brand ?? "Not set"} onPress={handleEditPumpBrand} />
              <Divider />
              <SettingRow
                label="Flange size"
                value={profile?.flange_size_mm ? `${profile.flange_size_mm}mm` : "Not set"}
                onPress={handleFlangeSize}
              />
              <Divider />
              <SettingRow
                label="Daily goal"
                value={profile?.daily_goal_oz ? `${profile.daily_goal_oz} oz` : "Not set"}
                onPress={handleEditDailyGoal}
              />
              <Divider />
              <SettingRow
                label="Unit preference"
                value={unit === "ml" ? "Milliliters (ml)" : "Ounces (oz)"}
                onPress={handleUnitPref}
              />
            </View>
          </Card>
        </View>

        {/* Referral */}
        <View className="mb-4">
          <Text className="text-xs font-sans-bold text-ink-3 uppercase tracking-wider mb-2 px-1">Refer a friend</Text>
          <View style={{
            backgroundColor: "#fff", borderRadius: 16, padding: 18,
            shadowColor: "#1A1A2E", shadowOpacity: 0.05, shadowRadius: 8, elevation: 1,
          }}>
            <Text style={{ fontSize: 13, color: COLORS.ink2, marginBottom: 12, lineHeight: 19 }}>
              Share your code and you both get 7 free days of Premium when they sign up.
            </Text>
            <View style={{
              flexDirection: "row", alignItems: "center", justifyContent: "space-between",
              backgroundColor: COLORS.primaryMist, borderRadius: 12, paddingHorizontal: 16,
              paddingVertical: 12, marginBottom: 12,
              borderWidth: 1, borderColor: "rgba(124,92,252,0.15)",
            }}>
              <Text style={{
                fontFamily: "Nunito_800ExtraBold", fontWeight: "800",
                fontSize: 20, color: COLORS.primary, letterSpacing: 1.5,
              }}>
                {referralCode ?? "Loading..."}
              </Text>
              {referralUses > 0 && (
                <Text style={{ fontSize: 12, color: COLORS.ink3 }}>
                  {referralUses} {referralUses === 1 ? "use" : "uses"}
                </Text>
              )}
            </View>
            <Pressable
              onPress={handleShare}
              style={{
                backgroundColor: COLORS.primary, borderRadius: 12,
                paddingVertical: 12, alignItems: "center",
              }}
            >
              <Text style={{ color: "#fff", fontSize: 14, fontFamily: "Nunito_700Bold", fontWeight: "700" }}>
                Share my code
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Notifications */}
        <View className="mb-4">
          <Text className="text-xs font-sans-bold text-ink-3 uppercase tracking-wider mb-2 px-1">Notifications</Text>
          <Card padding="none">
            <View className="px-4">
              <SettingRow
                label="🔔 Pump reminders"
                onPress={() => router.push("/reminders" as any)}
              />
              <Divider />

              {/* Encouraging messages toggle */}
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 14 }}>
                <Text style={{ fontSize: 14, color: COLORS.ink }}>💛 Encouraging messages</Text>
                <Switch
                  value={notifEnabled}
                  onValueChange={handleNotifToggle}
                  trackColor={{ false: COLORS.border, true: COLORS.primary }}
                  thumbColor="#fff"
                />
              </View>

              {/* Frequency selector — only when enabled */}
              {notifEnabled && (
                <>
                  <Divider />
                  <View style={{ paddingVertical: 14, gap: 10 }}>
                    <Text style={{ fontSize: 13, color: COLORS.ink2, marginBottom: 2 }}>Frequency</Text>
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                      {(["daily", "few", "rarely"] as NotifFrequency[]).map((freq) => {
                        const labels: Record<NotifFrequency, string> = {
                          daily:  "Daily",
                          few:    "A few times a week",
                          rarely: "Rarely",
                          off:    "Off",
                        };
                        const selected = notifFreq === freq;
                        return (
                          <Pressable
                            key={freq}
                            onPress={() => handleNotifFreqChange(freq)}
                            style={{
                              paddingHorizontal: 14, paddingVertical: 8,
                              borderRadius: 12, borderWidth: 1.5,
                              backgroundColor: selected ? COLORS.primary : COLORS.muted,
                              borderColor: selected ? COLORS.primary : COLORS.border,
                            }}
                          >
                            <Text style={{
                              fontSize: 13,
                              fontFamily: selected ? "Nunito_700Bold" : "Nunito_400Regular",
                              fontWeight: selected ? "700" : "400",
                              color: selected ? "#fff" : COLORS.ink2,
                            }}>
                              {labels[freq]}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                    <Text style={{ fontSize: 11, color: COLORS.ink3, lineHeight: 16 }}>
                      Messages send around 9:30am. We skip the message on any day you open the app.
                    </Text>
                  </View>
                </>
              )}
            </View>
          </Card>
        </View>

        {/* Tools */}
        <View className="mb-4">
          <Text className="text-xs font-sans-bold text-ink-3 uppercase tracking-wider mb-2 px-1">Tools</Text>
          <Card padding="none">
            <View className="px-4">
              <SettingRow label="🔬 Flange Fit Analyzer" onPress={() => router.push("/tools/flange")} />
              <Divider />
              {isPremium
                ? <SettingRow label="📊 Pump Comparison" onPress={() => router.push("/tools/pump-compare" as any)} />
                : <SettingRow label="📊 Pump Comparison" value="Premium" disabled />
              }
              <Divider />
              <SettingRow label="📅 Return to Work Planner" value="Coming soon" disabled />
              <Divider />
              <SettingRow label="🌙 Weaning Mode" value="Coming soon" disabled />
            </View>
          </Card>
        </View>

        {/* Data & privacy */}
        <View className="mb-4">
          <Text className="text-xs font-sans-bold text-ink-3 uppercase tracking-wider mb-2 px-1">Data & Privacy</Text>
          <Card padding="none">
            <View className="px-4">
              <SettingRow
                label="Export my data (CSV)"
                value="Coming soon"
                disabled
              />
              <Divider />
              <SettingRow label="Privacy Policy" onPress={() => Linking.openURL(PRIVACY_POLICY_URL)} />
              <Divider />
              <SettingRow label="Terms of Service" onPress={() => Linking.openURL(TERMS_OF_SERVICE_URL)} />
            </View>
          </Card>
        </View>

        {/* My Clients — people who shared their data with me (IBCLCs, partners) */}
        {clientsIView.length > 0 && (
          <View className="mb-4">
            <Text className="text-xs font-sans-bold text-ink-3 uppercase tracking-wider mb-2 px-1">My Clients</Text>
            <Card padding="md">
              <Text style={{ fontSize: 13, color: COLORS.ink2, lineHeight: 20, marginBottom: 14 }}>
                People who shared their pumping data with you. Tap to open their dashboard.
              </Text>
              {clientsIView.map((person, i) => (
                <Pressable
                  key={person.id}
                  onPress={async () => {
                    await AsyncStorage.setItem("viewer_mode_pref", "viewer");
                    setViewingMode(person.id);
                    router.replace("/(viewer)/dashboard" as any);
                  }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                    paddingVertical: 12,
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
                      Client {person.initials}
                    </Text>
                    {person.note && (
                      <Text style={{ fontSize: 12, color: COLORS.ink3 }} numberOfLines={1}>
                        {person.note.note_content}
                      </Text>
                    )}
                  </View>
                  <Text style={{ fontSize: 16, color: COLORS.ink3 }}>›</Text>
                </Pressable>
              ))}
            </Card>
          </View>
        )}

        {/* Enter invite code — for viewers who received an invite while already signed in */}
        <View className="mb-4">
          <Text className="text-xs font-sans-bold text-ink-3 uppercase tracking-wider mb-2 px-1">Received an Invite?</Text>
          <Card padding="md">
            <Text style={{ fontSize: 13, color: COLORS.ink2, lineHeight: 20, marginBottom: 14 }}>
              If someone shared their pumping data with you, enter the code from your invitation email here.
            </Text>
            <Pressable
              onPress={() => router.push("/viewer-invite" as any)}
              style={{
                backgroundColor: COLORS.primaryMist,
                borderRadius: 12,
                paddingVertical: 10,
                paddingHorizontal: 20,
                alignSelf: "flex-start",
                borderWidth: 1,
                borderColor: COLORS.primary,
              }}
            >
              <Text style={{ fontSize: 13, fontFamily: "Nunito_700Bold", fontWeight: "700", color: COLORS.primary }}>
                Enter invite code
              </Text>
            </Pressable>
          </Card>
        </View>

        {/* Share data */}
        <View className="mb-4">
          <Text className="text-xs font-sans-bold text-ink-3 uppercase tracking-wider mb-2 px-1">Share My Data</Text>
          <Card padding="md">
            <Text style={{ fontSize: 13, color: COLORS.ink2, lineHeight: 20, marginBottom: 14 }}>
              Invite a partner, family member, or lactation consultant to view your pumping data. We'll open your mail app with a ready-to-send invite.
            </Text>

            <Pressable
              onPress={() => setShowSharingModal(true)}
              style={{
                backgroundColor: COLORS.primary,
                borderRadius: 12,
                paddingVertical: 10,
                paddingHorizontal: 20,
                alignSelf: "flex-start",
                marginBottom: viewers.length > 0 ? 16 : 0,
              }}
            >
              <Text style={{ fontSize: 13, fontFamily: "Nunito_700Bold", fontWeight: "700", color: "#fff" }}>
                + Invite someone
              </Text>
            </Pressable>

            {viewers.length > 0 && (
              <View>
                <Text style={{ fontSize: 12, color: COLORS.ink3, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 }}>
                  Has access
                </Text>
                {viewers.map((v, i) => (
                  <View key={v.id}>
                    {i > 0 && <View style={{ height: 1, backgroundColor: COLORS.border, marginVertical: 8 }} />}
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                      <Text style={{ fontSize: 14, color: COLORS.ink }}>
                        {viewerProfiles[v.viewer_id] ?? "Viewer"}
                      </Text>
                      <Pressable onPress={() => handleRevokeViewer(v)} hitSlop={12}>
                        <Text style={{ fontSize: 12, color: "#E57373", fontFamily: "Nunito_600SemiBold", fontWeight: "600" }}>
                          Remove
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </Card>
        </View>

        {/* Sharing invite modal */}
        <Modal
          visible={showSharingModal}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setShowSharingModal(false)}
        >
          <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.cream }}>
            <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border }}>
                <Pressable onPress={() => setShowSharingModal(false)} hitSlop={12}>
                  <Text style={{ fontSize: 15, color: COLORS.ink3, fontFamily: "Nunito_600SemiBold", fontWeight: "600" }}>Cancel</Text>
                </Pressable>
                <Text style={{ fontFamily: SERIF, fontSize: 18, color: COLORS.ink }}>Invite a viewer</Text>
                <View style={{ width: 56 }} />
              </View>
              <View style={{ padding: 24, gap: 16 }}>
                <Text style={{ fontSize: 14, color: COLORS.ink2, lineHeight: 20 }}>
                  Enter their email address and we'll open your mail app with a pre-written invite ready to send.
                </Text>
                <View>
                  <Text style={{ fontSize: 13, color: COLORS.ink2, marginBottom: 6 }}>Email address</Text>
                  <TextInput
                    value={sharingInviteEmail}
                    onChangeText={setSharingInviteEmail}
                    placeholder="partner@example.com"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoComplete="email"
                    autoFocus
                    style={{
                      borderWidth: 1, borderColor: COLORS.border, borderRadius: 12,
                      paddingHorizontal: 16, paddingVertical: 12, fontSize: 15,
                      backgroundColor: "#fff", color: COLORS.ink,
                    }}
                  />
                </View>
                <Text style={{ fontSize: 12, color: COLORS.ink3, lineHeight: 18 }}>
                  They'll have read-only access. You can remove them at any time from your profile settings.
                </Text>
                <Button
                  label="Send invite email"
                  onPress={handleCreateInvite}
                  loading={sharingBusy}
                  fullWidth
                  size="lg"
                />
              </View>
            </KeyboardAvoidingView>
          </SafeAreaView>
        </Modal>

        {/* My Pumps modal */}
        <Modal visible={showPumpsModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowPumpsModal(false)}>
          <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.cream }}>
            <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
              {/* Header */}
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border }}>
                <Text style={{ fontFamily: SERIF, fontSize: 18, color: COLORS.ink }}>My Pumps</Text>
                <Pressable onPress={() => setShowPumpsModal(false)} hitSlop={12}>
                  <Text style={{ fontSize: 16, color: COLORS.ink3 }}>✕</Text>
                </Pressable>
              </View>

              <ScrollView contentContainerStyle={{ padding: 20, gap: 8 }}>
                {/* Compare pumps — premium, needs 2+ pumps */}
                {isPremium && userPumps.length >= 2 && (
                  <Pressable
                    onPress={() => { setShowPumpsModal(false); router.push("/tools/pump-compare" as any); }}
                    style={{
                      flexDirection: "row", alignItems: "center", justifyContent: "space-between",
                      backgroundColor: COLORS.primaryMist, borderRadius: 14,
                      paddingHorizontal: 16, paddingVertical: 14,
                      borderWidth: 1, borderColor: "rgba(74,94,96,0.2)",
                      marginBottom: 4,
                    }}
                  >
                    <View>
                      <Text style={{ fontSize: 14, fontFamily: "Nunito_700Bold", fontWeight: "700", color: COLORS.primary }}>
                        📊 Compare pump performance
                      </Text>
                      <Text style={{ fontSize: 12, color: COLORS.ink3, marginTop: 2 }}>
                        Output by pump + time of day
                      </Text>
                    </View>
                    <Text style={{ fontSize: 18, color: COLORS.primary }}>›</Text>
                  </Pressable>
                )}

                {userPumps.length === 0 && (
                  <Text style={{ fontSize: 14, color: COLORS.ink3, textAlign: "center", marginTop: 16 }}>
                    No pumps added yet. Add your first pump below.
                  </Text>
                )}

                {userPumps.length > 0 && (
                  <View style={{ backgroundColor: "#fff", borderRadius: 16, overflow: "hidden", borderWidth: 1, borderColor: COLORS.border }}>
                    {userPumps.map((pump, idx) => (
                      <React.Fragment key={pump.id}>
                        {idx > 0 && <View style={{ height: 1, backgroundColor: COLORS.border, marginLeft: 16 }} />}
                        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 14 }}>
                          <Text style={{ fontSize: 15, fontFamily: "Nunito_600SemiBold", fontWeight: "600", color: COLORS.ink }}>
                            {pump.name}
                          </Text>
                          <Pressable onPress={() => handleDeletePump(pump)} hitSlop={12}>
                            <Text style={{ fontSize: 18, color: COLORS.ink3 }}>🗑</Text>
                          </Pressable>
                        </View>
                      </React.Fragment>
                    ))}
                  </View>
                )}

                {/* Add pump */}
                <View style={{ marginTop: 16, backgroundColor: "#fff", borderRadius: 16, padding: 16, borderWidth: 1, borderColor: COLORS.border }}>
                  <Text style={{ fontSize: 13, fontFamily: "Nunito_700Bold", fontWeight: "700", color: COLORS.ink2, marginBottom: 10 }}>
                    Add a pump
                  </Text>
                  <TextInput
                    value={newPumpName}
                    onChangeText={setNewPumpName}
                    placeholder="e.g. Spectra S1, Eufy E20, Momcozy Air"
                    placeholderTextColor={COLORS.ink3}
                    style={{
                      borderWidth: 1, borderColor: COLORS.border, borderRadius: 12,
                      paddingHorizontal: 14, paddingVertical: 10,
                      fontSize: 14, color: COLORS.ink, fontFamily: "Nunito_400Regular",
                      backgroundColor: COLORS.cream, marginBottom: 12,
                    }}
                    autoCapitalize="words"
                    returnKeyType="done"
                    onSubmitEditing={handleAddPump}
                  />
                  <Pressable
                    onPress={handleAddPump}
                    disabled={!newPumpName.trim() || pumpSaving}
                    style={{
                      backgroundColor: newPumpName.trim() ? COLORS.primary : COLORS.muted,
                      borderRadius: 12, paddingVertical: 12, alignItems: "center",
                    }}
                  >
                    {pumpSaving
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <Text style={{ color: "#fff", fontFamily: "Nunito_700Bold", fontWeight: "700", fontSize: 14 }}>Add pump</Text>
                    }
                  </Pressable>
                </View>
              </ScrollView>
            </KeyboardAvoidingView>
          </SafeAreaView>
        </Modal>

        {/* My Babies modal */}
        <Modal visible={showBabiesModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => { setShowBabiesModal(false); resetBabyDraft(); }}>
          <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.cream }}>
            <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border }}>
                <Text style={{ fontFamily: SERIF, fontSize: 18, color: COLORS.ink }}>My Babies</Text>
                <Pressable onPress={() => { setShowBabiesModal(false); resetBabyDraft(); }} hitSlop={12}>
                  <Text style={{ fontSize: 16, color: COLORS.ink3 }}>✕</Text>
                </Pressable>
              </View>

              <ScrollView contentContainerStyle={{ padding: 20, gap: 8 }}>
                {babies.length === 0 && (
                  <Text style={{ fontSize: 14, color: COLORS.ink3, textAlign: "center", marginTop: 16 }}>
                    No babies added yet. Add your first below — twins, triplets, and mixed-age siblings are all supported.
                  </Text>
                )}

                {babies.length > 0 && (
                  <View style={{ backgroundColor: "#fff", borderRadius: 16, overflow: "hidden", borderWidth: 1, borderColor: COLORS.border }}>
                    {babies.map((baby, idx) => (
                      <React.Fragment key={baby.id}>
                        {idx > 0 && <View style={{ height: 1, backgroundColor: COLORS.border, marginLeft: 16 }} />}
                        <Pressable
                          onPress={() => startEditBaby(baby)}
                          style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 14 }}
                        >
                          <View>
                            <Text style={{ fontSize: 15, fontFamily: "Nunito_600SemiBold", fontWeight: "600", color: COLORS.ink }}>
                              {baby.name}
                            </Text>
                            {baby.dob && (
                              <Text style={{ fontSize: 12, color: COLORS.ink3, marginTop: 1 }}>
                                {babyAgeLabel(baby.dob)}
                              </Text>
                            )}
                          </View>
                          <Pressable onPress={() => handleDeleteBaby(baby)} hitSlop={12}>
                            <Text style={{ fontSize: 18, color: COLORS.ink3 }}>🗑</Text>
                          </Pressable>
                        </Pressable>
                      </React.Fragment>
                    ))}
                  </View>
                )}

                {/* Add / edit baby */}
                <View style={{ marginTop: 16, backgroundColor: "#fff", borderRadius: 16, padding: 16, borderWidth: 1, borderColor: COLORS.border }}>
                  <Text style={{ fontSize: 13, fontFamily: "Nunito_700Bold", fontWeight: "700", color: COLORS.ink2, marginBottom: 10 }}>
                    {editingBabyId ? "Edit baby" : "Add a baby"}
                  </Text>
                  <TextInput
                    value={babyDraftName}
                    onChangeText={setBabyDraftName}
                    placeholder="Baby's name"
                    placeholderTextColor={COLORS.ink3}
                    style={{
                      borderWidth: 1, borderColor: COLORS.border, borderRadius: 12,
                      paddingHorizontal: 14, paddingVertical: 10,
                      fontSize: 14, color: COLORS.ink, fontFamily: "Nunito_400Regular",
                      backgroundColor: COLORS.cream, marginBottom: 10,
                    }}
                    autoCapitalize="words"
                    returnKeyType="done"
                  />
                  <Pressable
                    onPress={() => setShowBabyDobPicker(true)}
                    style={{
                      borderWidth: 1, borderColor: COLORS.border, borderRadius: 12,
                      paddingHorizontal: 14, paddingVertical: 10,
                      backgroundColor: COLORS.cream, marginBottom: 12,
                    }}
                  >
                    <Text style={{ fontSize: 14, color: babyDraftDob ? COLORS.ink : COLORS.ink3, fontFamily: "Nunito_400Regular" }}>
                      {babyDraftDob ? format(babyDraftDob, "MMM d, yyyy") : "Date of birth (optional)"}
                    </Text>
                  </Pressable>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    {editingBabyId && (
                      <Pressable
                        onPress={resetBabyDraft}
                        style={{ flex: 1, borderRadius: 12, paddingVertical: 12, alignItems: "center", borderWidth: 1, borderColor: COLORS.border }}
                      >
                        <Text style={{ color: COLORS.ink2, fontFamily: "Nunito_700Bold", fontWeight: "700", fontSize: 14 }}>Cancel</Text>
                      </Pressable>
                    )}
                    <Pressable
                      onPress={handleSaveBaby}
                      disabled={!babyDraftName.trim() || babySaving}
                      style={{
                        flex: 1,
                        backgroundColor: babyDraftName.trim() ? COLORS.primary : COLORS.muted,
                        borderRadius: 12, paddingVertical: 12, alignItems: "center",
                      }}
                    >
                      {babySaving
                        ? <ActivityIndicator size="small" color="#fff" />
                        : <Text style={{ color: "#fff", fontFamily: "Nunito_700Bold", fontWeight: "700", fontSize: 14 }}>{editingBabyId ? "Save" : "Add baby"}</Text>
                      }
                    </Pressable>
                  </View>
                </View>
              </ScrollView>
            </KeyboardAvoidingView>
          </SafeAreaView>
        </Modal>

        {/* Account */}
        <View className="mb-6">
          <Text className="text-xs font-sans-bold text-ink-3 uppercase tracking-wider mb-2 px-1">Account</Text>
          <Card padding="none">
            <View className="px-4">
              {user?.app_metadata?.provider === "email" && (
                <>
                  <SettingRow
                    label="Change password"
                    onPress={() => { setNewPassword(""); setConfirmPassword(""); setShowPasswordModal(true); }}
                  />
                  <Divider />
                </>
              )}
              <SettingRow
                label="Sign out"
                danger
                onPress={() => {
                  Alert.alert(
                    "Sign out",
                    "Are you sure you want to sign out?",
                    [
                      { text: "Cancel", style: "cancel" },
                      { text: "Sign out", style: "destructive", onPress: signOut },
                    ]
                  );
                }}
              />
              <Divider />
              <SettingRow label="Delete account" onPress={handleDeleteAccount} danger />
            </View>
          </Card>
        </View>

        {/* Change password modal */}
        <Modal visible={showPasswordModal} animationType="slide" presentationStyle="formSheet" onRequestClose={() => setShowPasswordModal(false)}>
          <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.cream }}>
            <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border }}>
                <Pressable onPress={() => setShowPasswordModal(false)} hitSlop={12}>
                  <Text style={{ fontSize: 15, color: COLORS.ink3, fontFamily: "Nunito_600SemiBold", fontWeight: "600" }}>Cancel</Text>
                </Pressable>
                <Text style={{ fontFamily: SERIF, fontSize: 18, color: COLORS.ink }}>Change Password</Text>
                <View style={{ width: 48 }} />
              </View>
              <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }} keyboardShouldPersistTaps="handled">
                <View>
                  <Text style={{ fontSize: 13, fontFamily: "Nunito_600SemiBold", fontWeight: "600", color: COLORS.ink2, marginBottom: 6 }}>New password</Text>
                  <TextInput
                    value={newPassword}
                    onChangeText={setNewPassword}
                    secureTextEntry
                    autoCapitalize="none"
                    placeholder="At least 8 characters"
                    style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, padding: 14, fontSize: 15, color: COLORS.ink }}
                  />
                </View>
                <View>
                  <Text style={{ fontSize: 13, fontFamily: "Nunito_600SemiBold", fontWeight: "600", color: COLORS.ink2, marginBottom: 6 }}>Confirm new password</Text>
                  <TextInput
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry
                    autoCapitalize="none"
                    placeholder="Type it again"
                    style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, padding: 14, fontSize: 15, color: COLORS.ink }}
                  />
                </View>
                <Button
                  label={changingPassword ? "Saving…" : "Update password"}
                  loading={changingPassword}
                  fullWidth
                  onPress={async () => {
                    if (newPassword.length < 8) {
                      Alert.alert("Too short", "Password must be at least 8 characters.");
                      return;
                    }
                    if (newPassword !== confirmPassword) {
                      Alert.alert("Passwords don't match", "Please make sure both fields match.");
                      return;
                    }
                    setChangingPassword(true);
                    const { error } = await supabase.auth.updateUser({ password: newPassword });
                    setChangingPassword(false);
                    if (error) {
                      Alert.alert("Couldn't update password", error.message);
                      return;
                    }
                    setShowPasswordModal(false);
                    Alert.alert("Password updated", "Your new password is now active.");
                  }}
                />
              </ScrollView>
            </KeyboardAvoidingView>
          </SafeAreaView>
        </Modal>

        {/* About Pump Coach */}
        <View className="mb-4">
          <Text className="text-xs font-sans-bold text-ink-3 uppercase tracking-wider mb-2 px-1">About Pump Coach</Text>
          <Card padding="md">
            <View style={{ flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 16 }}>
              <Image
                source={require("../../assets/katie-clark.jpg")}
                style={{ width: 56, height: 56, borderRadius: 28, flexShrink: 0 }}
              />
              <View>
                <Text style={{ fontSize: 15, fontFamily: "Nunito_700Bold", fontWeight: "700", color: COLORS.ink }}>Katie Clark</Text>
                <Text style={{ fontSize: 12, color: COLORS.ink3, marginTop: 1 }}>IBCLC</Text>
              </View>
            </View>

            <Text style={{ fontFamily: SERIF, fontSize: 17, color: COLORS.ink, marginBottom: 14, lineHeight: 24 }}>
              Built by someone who has sat across from you.
            </Text>

            <Text style={{ fontSize: 14, color: COLORS.ink2, lineHeight: 22, marginBottom: 10 }}>
              I'm Katie Clark, IBCLC. I've worked with hundreds of pumping moms and kept seeing the same thing: they were tracking their output but had no idea what it meant. They were pumping for 40 minutes and getting nothing. They were using the wrong flange size for years.
            </Text>
            <Text style={{ fontSize: 14, color: COLORS.ink2, lineHeight: 22, marginBottom: 10 }}>
              I built Pump Coach because pumping moms deserve a tool that thinks like a lactation consultant. Not a timer. Not a chart. A coach.
            </Text>
            <Text style={{ fontSize: 14, color: COLORS.ink2, lineHeight: 22, marginBottom: 16 }}>
              Every insight in this app is grounded in the same clinical framework I use with my own clients.
            </Text>

            <View style={{ borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 14 }}>
              <Pressable onPress={() => Linking.openURL("https://www.thebreastfeedingmama.com")}>
                <Text style={{ fontSize: 13, fontFamily: "Nunito_600SemiBold", fontWeight: "600", color: COLORS.primary }}>
                  Visit The Breastfeeding Mama →
                </Text>
              </Pressable>
            </View>
          </Card>
        </View>

        {/* Consult recommendation */}
        <View style={{ marginBottom: 24 }}>
          <ConsultRecommendation hasLactationConsultant={profile?.has_lactation_consultant ?? null} />
        </View>

        {/* Disclaimer */}
        <View style={{
          backgroundColor: COLORS.muted, borderRadius: 16, padding: 16, marginBottom: 20,
          borderWidth: 1, borderColor: COLORS.border,
        }}>
          <Text style={{ fontSize: 12, color: COLORS.ink2, textAlign: "center", lineHeight: 18 }}>
            Pump Coach provides educational support and is not a substitute for medical advice or care.
            Always consult your healthcare provider for medical concerns.
          </Text>
        </View>

        <Text className="text-xs text-ink-3 text-center pb-2">
          Pump Coach v1.0.0 · Your data is encrypted and never sold.
        </Text>
        </View>{/* end paddingHorizontal wrapper */}
      </ScrollView>
    </SafeAreaView>
  );
}
