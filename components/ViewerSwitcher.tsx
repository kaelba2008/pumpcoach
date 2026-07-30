import React, { useState } from "react";
import { View, Text, Pressable, ActionSheetIOS, TextInput, Modal, ScrollView, Alert } from "react-native";
import { useFocusEffect } from "expo-router";
import { COLORS, SERIF } from "../lib/constants";
import { useViewerAccess } from "../hooks/useViewerAccess";

interface ViewerSwitcherProps {
  currentViewingUserId: string | null;
  onViewUserChange: (userId: string | null) => void;
}

export function ViewerSwitcher({ currentViewingUserId, onViewUserChange }: ViewerSwitcherProps) {
  const { people, loading, saveNote, refetch } = useViewerAccess();

  useFocusEffect(() => {
    refetch();
  });
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [editingNote, setEditingNote] = useState("");

  if (loading || people.length === 0) return null;

  const currentPerson = people.find((p) => p.id === currentViewingUserId);
  const isViewingOther = currentViewingUserId !== null;

  const handleOpenPicker = () => {
    const options = [
      ...people.map((p) => p.initials),
      "Done",
    ];

    ActionSheetIOS.showActionSheetWithOptions(
      {
        options,
        destructiveButtonIndex: -1,
        cancelButtonIndex: options.length - 1,
        userInterfaceStyle: "dark",
      },
      (selectedIndex) => {
        if (selectedIndex != null && selectedIndex < people.length) {
          onViewUserChange(people[selectedIndex].id);
        }
      }
    );
  };

  const handleOpenNoteModal = () => {
    if (currentPerson?.note) {
      setEditingNote(currentPerson.note.note_content);
    } else {
      setEditingNote("");
    }
    setShowNoteModal(true);
  };

  const handleSaveNote = async () => {
    if (!currentViewingUserId) return;

    try {
      await saveNote(currentViewingUserId, editingNote);
      setShowNoteModal(false);
    } catch (err) {
      Alert.alert("Error", "Failed to save note");
    }
  };

  return (
    <>
      {!isViewingOther && people.length > 0 && (
        <Pressable
          onPress={handleOpenPicker}
          style={{
            backgroundColor: "#fff",
            borderBottomWidth: 1,
            borderBottomColor: COLORS.border,
            paddingHorizontal: 20,
            paddingVertical: 12,
          }}
        >
          <Text style={{ fontSize: 12, color: COLORS.primary, fontWeight: "600" }}>
            👁 View client data →
          </Text>
        </Pressable>
      )}

      {isViewingOther && currentPerson && (
        <View style={{ backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: COLORS.border }}>
          {/* Viewing indicator */}
          <View style={{ paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <View>
                <Text style={{ fontSize: 11, color: COLORS.ink3, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
                  Viewing
                </Text>
                <Text style={{ fontSize: 16, fontWeight: "600", color: COLORS.ink, fontFamily: SERIF }}>
                  {currentPerson.initials}
                </Text>
              </View>
              <Pressable onPress={handleOpenPicker} style={{ padding: 8 }}>
                <Text style={{ fontSize: 12, color: COLORS.primary, fontWeight: "600" }}>
                  Switch →
                </Text>
              </Pressable>
            </View>
          </View>

          {/* Notes preview */}
          {currentPerson.note && (
            <Pressable onPress={handleOpenNoteModal} style={{ paddingHorizontal: 20, paddingVertical: 12 }}>
              <Text style={{ fontSize: 11, color: COLORS.ink3, marginBottom: 4 }}>Notes from Viewer</Text>
              <Text
                style={{ fontSize: 13, color: COLORS.ink2, lineHeight: 18 }}
                numberOfLines={2}
              >
                {currentPerson.note.note_content}
              </Text>
            </Pressable>
          )}

          {/* Add/edit notes button */}
          <Pressable
            onPress={handleOpenNoteModal}
            style={{
              paddingHorizontal: 20,
              paddingVertical: 12,
              borderTopWidth: 1,
              borderTopColor: COLORS.border,
              backgroundColor: COLORS.cream,
            }}
          >
            <Text style={{ fontSize: 12, color: COLORS.primary, fontWeight: "600" }}>
              {currentPerson.note ? "Edit notes" : "Add notes"}
            </Text>
          </Pressable>
        </View>
      )}

      {/* Notes Modal */}
      <Modal visible={showNoteModal} animationType="slide" presentationStyle="formSheet">
        <ScrollView contentContainerStyle={{ padding: 20 }} style={{ backgroundColor: COLORS.cream, flex: 1 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <Text style={{ fontSize: 18, fontWeight: "600", fontFamily: SERIF, color: COLORS.ink }}>
              Notes for {currentPerson?.initials}
            </Text>
            <Pressable onPress={() => setShowNoteModal(false)}>
              <Text style={{ fontSize: 24, color: COLORS.ink }}>×</Text>
            </Pressable>
          </View>

          <TextInput
            value={editingNote}
            onChangeText={setEditingNote}
            placeholder="Write your notes here..."
            multiline
            numberOfLines={8}
            style={{
              borderWidth: 1,
              borderColor: COLORS.border,
              borderRadius: 12,
              padding: 12,
              fontFamily: "Nunito_400Regular",
              fontSize: 14,
              color: COLORS.ink,
              textAlignVertical: "top",
            }}
          />

          <Pressable
            onPress={handleSaveNote}
            style={{
              backgroundColor: COLORS.primary,
              borderRadius: 12,
              paddingVertical: 12,
              marginTop: 20,
            }}
          >
            <Text style={{ color: "#fff", textAlign: "center", fontWeight: "600", fontSize: 16 }}>
              Save Notes
            </Text>
          </Pressable>
        </ScrollView>
      </Modal>
    </>
  );
}
