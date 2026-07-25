import { ThemedText } from "@/components/themed-text";
import { responsiveFont, verticalScale } from "@/utils/responsive";
import { Image as ExpoImage, type ImageSource } from "expo-image";
import { X } from "lucide-react-native";
import React from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface VisitPhotoLightboxProps {
  visible: boolean;
  source: ImageSource | string | null;
  label?: string;
  onClose: () => void;
}

/** Visor a pantalla completa para fotos de visita (online/offline). */
export function VisitPhotoLightbox({
  visible,
  source,
  label,
  onClose,
}: VisitPhotoLightboxProps) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const resolved =
    source == null
      ? null
      : typeof source === "string"
        ? { uri: source }
        : source;

  return (
    <Modal
      visible={visible && !!resolved}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.root}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View
          style={[styles.topBar, { paddingTop: Math.max(insets.top, 12) }]}
          pointerEvents="box-none"
        >
          <ThemedText style={styles.label} numberOfLines={1}>
            {label ?? "Fotografía"}
          </ThemedText>
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={onClose}
            activeOpacity={0.8}
            hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
          >
            <X size={responsiveFont(22)} color="#fff" />
          </TouchableOpacity>
        </View>
        {resolved ? (
          <ExpoImage
            source={resolved}
            style={{
              width: width - 24,
              height: height * 0.72,
              alignSelf: "center",
            }}
            contentFit="contain"
            cachePolicy="memory-disk"
          />
        ) : null}
        <ThemedText
          style={[styles.hint, { paddingBottom: Math.max(insets.bottom, 16) }]}
        >
          Toca fuera de la imagen para cerrar
        </ThemedText>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.92)",
    justifyContent: "center",
  },
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  label: {
    color: "#fff",
    fontSize: responsiveFont(15),
    fontWeight: "600",
    flex: 1,
    marginRight: 12,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  hint: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    textAlign: "center",
    color: "rgba(255,255,255,0.55)",
    fontSize: responsiveFont(12),
    marginTop: verticalScale(8),
  },
});
