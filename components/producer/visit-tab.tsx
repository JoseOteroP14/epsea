import { ThemedText } from "@/components/themed-text";
import { responsiveFont, verticalScale, widthScale } from "@/utils/responsive";
import { CalendarCheck } from "lucide-react-native";
import React from "react";
import { StyleSheet, View } from "react-native";

interface VisitTabProps {
  producerId: string;
  projectId?: string;
}

export function VisitTab({ producerId, projectId }: VisitTabProps) {
  return (
    <View style={styles.container}>
      <View style={styles.iconContainer}>
        <CalendarCheck size={responsiveFont(48)} color="#1a7a3a" />
      </View>
      <ThemedText type="defaultSemiBold" style={styles.title}>
        Visita al Productor
      </ThemedText>
      <ThemedText style={styles.description}>
        Registre las visitas realizadas al productor y el seguimiento de
        asistencia técnica.
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: verticalScale(16),
    paddingHorizontal: widthScale(20),
  },
  iconContainer: {
    width: widthScale(80),
    height: widthScale(80),
    borderRadius: widthScale(40),
    backgroundColor: "rgba(26, 122, 58, 0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    fontSize: responsiveFont(19),
    textAlign: "center",
  },
  description: {
    fontSize: responsiveFont(17),
    textAlign: "center",
    lineHeight: responsiveFont(22),
  },
});
