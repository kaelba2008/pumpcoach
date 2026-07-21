import React from "react";
import { Tabs } from "expo-router";
import { Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, SANS_BOLD, SANS } from "../../lib/constants";

type IoniconsName = React.ComponentProps<typeof Ionicons>["name"];

function TabIcon({
  icon,
  iconFocused,
  label,
  focused,
}: {
  icon: IoniconsName;
  iconFocused: IoniconsName;
  label: string;
  focused: boolean;
}) {
  return (
    <View style={{ alignItems: "center", gap: 3, paddingTop: 6, minWidth: 56 }}>
      <Ionicons
        name={focused ? iconFocused : icon}
        size={24}
        color={focused ? COLORS.primary : COLORS.ink3}
      />
      <Text
        style={{
          fontSize: 10,
          fontFamily: focused ? SANS_BOLD : SANS,
          color: focused ? COLORS.primary : COLORS.ink3,
        }}
      >
        {label}
      </Text>
      {focused && (
        <View style={{
          width: 16, height: 2, borderRadius: 1,
          backgroundColor: COLORS.primary, marginTop: 1,
        }} />
      )}
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: {
          backgroundColor: "#fff",
          borderTopColor: COLORS.border,
          borderTopWidth: 1,
          height: 84,
          paddingBottom: 16,
          shadowColor: COLORS.ink,
          shadowOpacity: 0.06,
          shadowRadius: 12,
          elevation: 8,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="home-outline" iconFocused="home" label="Home" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="stash"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="snow-outline" iconFocused="snow" label="Stash" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="snapshot"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="bar-chart-outline" iconFocused="bar-chart" label="Supply" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="coach"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="chatbubble-outline" iconFocused="chatbubble" label="Coach" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="person-outline" iconFocused="person" label="Profile" focused={focused} />
          ),
        }}
      />
    </Tabs>
  );
}
