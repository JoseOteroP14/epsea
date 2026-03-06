// components/GreenPaletteViewer.tsx
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { GreenPalette } from "@/constants/colors";

export default function GreenPaletteViewer() {
  return (
    <View style={styles.container}>
      {Object.entries(GreenPalette).map(([name, color]) => (
        <View key={name} style={styles.row}>
          <View style={[styles.swatch, { backgroundColor: color as string }]} />
          <Text style={styles.text}>
            {name}: {color}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
    backgroundColor: "#fff",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  swatch: {
    width: 48,
    height: 48,
    borderRadius: 8,
    marginRight: 16,
    borderWidth: 1,
    bordercolor: "#11181C",
  },
  text: {
    fontSize: 16,
    color: "#222",
  },
});
