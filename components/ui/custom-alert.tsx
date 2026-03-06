import { ThemedText } from "@/components/themed-text";
import { responsiveFont, verticalScale, widthScale } from "@/utils/responsive";
import { AlertTriangle, CheckCircle, Info, XCircle } from "lucide-react-native";
import React, {
    createContext,
    useCallback,
    useContext,
    useRef,
    useState,
} from "react";
import {
    Modal,
    Pressable,
    StyleSheet,
    TouchableOpacity,
    View,
} from "react-native";
import Animated, {
    FadeIn,
    FadeOut,
    ZoomIn,
    ZoomOut,
} from "react-native-reanimated";

// ─── Types ──────────────────────────────────────────────────────────────────

type AlertType = "info" | "success" | "warning" | "error";

interface AlertButton {
  text: string;
  style?: "default" | "cancel" | "destructive";
  onPress?: () => void;
}

interface AlertConfig {
  title: string;
  message?: string;
  type?: AlertType;
  buttons?: AlertButton[];
}

interface AlertContextValue {
  showAlert: (config: AlertConfig) => void;
}

// ─── Context ────────────────────────────────────────────────────────────────

const AlertContext = createContext<AlertContextValue | null>(null);

export function useAlert() {
  const ctx = useContext(AlertContext);
  if (!ctx) {
    throw new Error("useAlert debe usarse dentro de <AlertProvider>");
  }
  return ctx;
}

// ─── Alert Icon ─────────────────────────────────────────────────────────────

const ALERT_THEME: Record<
  AlertType,
  { icon: typeof Info; color: string; bgColor: string }
> = {
  info: { icon: Info, color: "#0284c7", bgColor: "rgba(2,132,199,0.1)" },
  success: {
    icon: CheckCircle,
    color: "#1a7a3a",
    bgColor: "rgba(26,122,58,0.1)",
  },
  warning: {
    icon: AlertTriangle,
    color: "#d97706",
    bgColor: "rgba(217,119,6,0.1)",
  },
  error: { icon: XCircle, color: "#dc2626", bgColor: "rgba(220,38,38,0.1)" },
};

// ─── Provider ───────────────────────────────────────────────────────────────

export function AlertProvider({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  const [config, setConfig] = useState<AlertConfig | null>(null);
  const callbacksRef = useRef<AlertButton[]>([]);

  const showAlert = useCallback((cfg: AlertConfig) => {
    callbacksRef.current = cfg.buttons ?? [{ text: "Aceptar" }];
    setConfig(cfg);
    setVisible(true);
  }, []);

  const handlePress = useCallback((button: AlertButton) => {
    setVisible(false);
    // Delay callback slightly to let the modal animate out
    setTimeout(() => {
      button.onPress?.();
    }, 200);
  }, []);

  const handleBackdropPress = useCallback(() => {
    const cancelBtn = callbacksRef.current.find(
      (b) => b.style === "cancel",
    );
    if (cancelBtn) {
      handlePress(cancelBtn);
    } else {
      setVisible(false);
    }
  }, [handlePress]);

  const alertType = config?.type ?? "info";
  const theme = ALERT_THEME[alertType];
  const Icon = theme.icon;
  const buttons = config?.buttons ?? [{ text: "Aceptar" }];

  return (
    <AlertContext.Provider value={{ showAlert }}>
      {children}
      <Modal
        visible={visible}
        transparent
        animationType="none"
        statusBarTranslucent
        onRequestClose={handleBackdropPress}
      >
        <Pressable style={styles.overlay} onPress={handleBackdropPress}>
          <Animated.View
            entering={FadeIn.duration(200)}
            exiting={FadeOut.duration(150)}
            style={styles.overlayBg}
          />
          <Animated.View
            entering={ZoomIn.duration(250).springify().damping(18)}
            exiting={ZoomOut.duration(150)}
          >
            <Pressable style={styles.alertCard} onPress={() => {}}>
              {/* Icon */}
              <View style={[styles.iconCircle, { backgroundColor: theme.bgColor }]}>
                <Icon size={responsiveFont(28)} color={theme.color} />
              </View>

              {/* Title */}
              <ThemedText
                type="defaultSemiBold"
                style={styles.title}
                lightColor="#11181C"
                darkColor="#11181C"
              >
                {config?.title}
              </ThemedText>

              {/* Message */}
              {config?.message ? (
                <ThemedText
                  style={styles.message}
                  lightColor="#666"
                  darkColor="#666"
                >
                  {config.message}
                </ThemedText>
              ) : null}

              {/* Buttons */}
              <View
                style={[
                  styles.buttonsRow,
                  buttons.length === 1 && styles.buttonsRowSingle,
                ]}
              >
                {buttons.map((btn, idx) => {
                  const isDestructive = btn.style === "destructive";
                  const isCancel = btn.style === "cancel";
                  const isPrimary = !isCancel && !isDestructive;

                  return (
                    <TouchableOpacity
                      key={idx}
                      style={[
                        styles.button,
                        isPrimary && styles.buttonPrimary,
                        isDestructive && styles.buttonDestructive,
                        isCancel && styles.buttonCancel,
                        buttons.length === 1 && styles.buttonFull,
                      ]}
                      onPress={() => handlePress(btn)}
                      activeOpacity={0.7}
                    >
                      <ThemedText
                        style={[
                          styles.buttonText,
                          isPrimary && styles.buttonTextPrimary,
                          isDestructive && styles.buttonTextDestructive,
                          isCancel && styles.buttonTextCancel,
                        ]}
                      >
                        {btn.text}
                      </ThemedText>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </Pressable>
          </Animated.View>
        </Pressable>
      </Modal>
    </AlertContext.Provider>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: widthScale(24),
  },
  overlayBg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  alertCard: {
    width: widthScale(320),
    maxWidth: "92%",
    backgroundColor: "#fff",
    borderRadius: widthScale(18),
    paddingTop: verticalScale(24),
    paddingHorizontal: widthScale(22),
    paddingBottom: verticalScale(18),
    alignItems: "center",
    elevation: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
  },
  iconCircle: {
    width: widthScale(56),
    height: widthScale(56),
    borderRadius: widthScale(28),
    justifyContent: "center",
    alignItems: "center",
    marginBottom: verticalScale(14),
  },
  title: {
    fontSize: responsiveFont(19),
    textAlign: "center",
    marginBottom: verticalScale(6),
  },
  message: {
    fontSize: responsiveFont(15),
    textAlign: "center",
    lineHeight: responsiveFont(22),
    marginBottom: verticalScale(4),
  },
  buttonsRow: {
    flexDirection: "row",
    gap: widthScale(10),
    marginTop: verticalScale(18),
    width: "100%",
  },
  buttonsRowSingle: {
    justifyContent: "center",
  },
  button: {
    flex: 1,
    paddingVertical: verticalScale(12),
    borderRadius: widthScale(10),
    alignItems: "center",
    justifyContent: "center",
  },
  buttonFull: {
    flex: 0,
    paddingHorizontal: widthScale(32),
  },
  buttonPrimary: {
    backgroundColor: "#1a7a3a",
  },
  buttonDestructive: {
    backgroundColor: "#dc2626",
  },
  buttonCancel: {
    backgroundColor: "rgba(0,0,0,0.06)",
  },
  buttonText: {
    fontSize: responsiveFont(15),
    fontWeight: "600",
  },
  buttonTextPrimary: {
    color: "#fff",
  },
  buttonTextDestructive: {
    color: "#fff",
  },
  buttonTextCancel: {
    color: "#555",
  },
});
