import { ThemedText } from "@/components/themed-text";
import { responsiveFont, verticalScale, widthScale } from "@/utils/responsive";
import { Info, X } from "lucide-react-native";
import React, { useRef, useState } from "react";
import {
  Modal,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";

interface InfoPopoverProps {
  title?: string;
  content: string;
  iconSize?: number;
  iconColor?: string;
}

export function InfoPopover({
  title,
  content,
  iconSize = 20,
  iconColor = "#1a7a3a",
}: InfoPopoverProps) {
  const [visible, setVisible] = useState(false);
  const [buttonLayout, setButtonLayout] = useState({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  });
  const buttonRef = useRef<View>(null);

  const handleOpen = () => {
    buttonRef.current?.measureInWindow((x, y, width, height) => {
      setButtonLayout({ x, y, width, height });
      setVisible(true);
    });
  };

  // Posicionar el tooltip debajo del botón, alineado a la derecha
  const tooltipTop = buttonLayout.y + buttonLayout.height + 8;
  const tooltipRight = 16; // Margen desde el borde derecho

  const buttonSize = widthScale(Math.max(iconSize + 14, 28));

  return (
    <>
      <View ref={buttonRef} collapsable={false}>
        <TouchableOpacity
          style={[
            styles.infoButton,
            {
              width: buttonSize,
              height: buttonSize,
              borderRadius: buttonSize / 2,
            },
          ]}
          onPress={handleOpen}
          activeOpacity={0.7}
        >
          <Info size={responsiveFont(iconSize)} color={iconColor} />
        </TouchableOpacity>
      </View>

      <Modal
        visible={visible}
        animationType="fade"
        transparent
        onRequestClose={() => setVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setVisible(false)}>
          <View style={styles.overlay}>
            <TouchableWithoutFeedback>
              <View
                style={[
                  styles.tooltipContainer,
                  {
                    position: "absolute",
                    top: tooltipTop,
                    right: tooltipRight,
                  },
                ]}
              >
                {/* Arrow pointing up */}
                <View style={styles.tooltipArrow} />

                <View style={styles.tooltipContent}>
                  <View style={styles.tooltipHeader}>
                    {title && (
                      <ThemedText
                        type="defaultSemiBold"
                        style={styles.tooltipTitle}
                        lightColor="#333"
                        darkColor="#333"
                      >
                        {title}
                      </ThemedText>
                    )}
                    <TouchableOpacity
                      onPress={() => setVisible(false)}
                      style={styles.closeButton}
                    >
                      <X size={responsiveFont(16)} color="#666" />
                    </TouchableOpacity>
                  </View>
                  <ThemedText
                    style={styles.tooltipText}
                    lightColor="#555"
                    darkColor="#555"
                  >
                    {content}
                  </ThemedText>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  infoButton: {
    backgroundColor: "rgba(26, 122, 58, 0.08)",
    justifyContent: "center",
    alignItems: "center",
  },
  overlay: {
    flex: 1,
    backgroundColor: "transparent",
  },
  tooltipContainer: {
    maxWidth: widthScale(280),
    minWidth: widthScale(200),
  },
  tooltipArrow: {
    position: "absolute",
    top: -8,
    right: widthScale(14),
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderBottomWidth: 8,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderBottomColor: "#fff",
    zIndex: 1,
  },
  tooltipContent: {
    backgroundColor: "#fff",
    borderRadius: widthScale(12),
    padding: widthScale(12),
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },
  tooltipHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: verticalScale(8),
  },
  tooltipTitle: {
    fontSize: responsiveFont(17),
    flex: 1,
    marginRight: widthScale(8),
  },
  closeButton: {
    width: widthScale(26),
    height: widthScale(26),
    borderRadius: widthScale(13),
    backgroundColor: "rgba(0,0,0,0.05)",
    justifyContent: "center",
    alignItems: "center",
  },
  tooltipText: {
    fontSize: responsiveFont(17),
    lineHeight: responsiveFont(20),
  },
});
