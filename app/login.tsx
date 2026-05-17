import { useAlert } from "@/components/ui/custom-alert";
import { useAuthStore } from "@/store/useAuthStore";
import { useSyncStore } from "@/store/useSyncStore";
import { apiFetch } from "@/utils/api";
import {
  moderateScale,
  responsiveFont,
  SCREEN_HEIGHT,
  SCREEN_WIDTH,
} from "@/utils/responsive";
import { LinearGradient } from "expo-linear-gradient";
import {
  ArrowRight,
  Eye,
  EyeOff,
  Lock,
  User,
} from "lucide-react-native";
import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import Svg, { Path } from "react-native-svg";

function normalizeName(value?: string | null): string | undefined {
  if (typeof value !== "string") return undefined;
  const cleaned = value.trim().replace(/\s+/g, " ");
  return cleaned.length > 0 ? cleaned : undefined;
}

function clamp(min: number, value: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

type FocusedField = "" | "user" | "pass";

export default function LoginScreen() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [focusedField, setFocusedField] = useState<FocusedField>("");
  const [loading, setLoading] = useState(false);

  const router = useRouter();
  const { login } = useAuthStore();
  const { showAlert } = useAlert();
  const passwordRef = useRef<TextInput>(null);

  const { width, height } = useWindowDimensions();
  const isCompact = width <= 820;
  const isPhone = width <= 480;
  const isTablet = width <= 1024 && !isCompact;
  const isMedium = width <= 1200 && !isTablet && !isCompact;

  const formWidthPercent = isTablet ? 0.46 : isMedium ? 0.44 : 0.42;
  const centerLogoLeft = isMedium ? 0.24 : 0.26;
  const topWhiteHeight = isPhone ? height * 0.42 : height * 0.48;
  const centerLogoSize = isCompact
    ? clamp(170, width * 0.42, 290)
    : clamp(215, width * 0.32, 430);
  const centerLogoTop = isCompact
    ? (isPhone ? height * 0.21 : height * 0.24)
    : height * 0.5;
  const epseaLogoHeight = isCompact ? 116 : 160;
  const unicorLogoHeight = isCompact ? 38 : 50;
  const formMarginTop = isPhone ? height * 0.42 : height * 0.48;

  const handleLogin = async () => {
    if (!username || !password) {
      showAlert({
        title: "Campos requeridos",
        message: "Por favor ingresa tu usuario y contraseña",
        type: "error",
      });
      return;
    }

    Keyboard.dismiss();
    setLoading(true);

    try {
      const formData = new FormData();
      formData.append("username", username);
      formData.append("password", password);

      const response = await apiFetch<{
        code: string;
        message: string;
        status: number;
        data: {
          user: {
            user_id: number;
            username: string;
            first_name?: string;
            last_name?: string;
            firstName?: string;
            lastName?: string;
            roles: {
              id: number;
              role_id: number;
              user_id: number;
              project_id: number | null;
            }[];
          };
          access_token: string;
        };
      }>("/auth/login", {
        method: "POST",
        body: formData,
      });

      if (response.code === "SUCCESS" && response.data) {
        const userData = response.data.user;
        const dataAny = response.data as Record<string, unknown>;
        const mappedUser = {
          ...userData,
          first_name:
            normalizeName(userData.first_name) ??
            normalizeName(userData.firstName) ??
            normalizeName(dataAny?.first_name as string) ??
            normalizeName(dataAny?.firstName as string),
          last_name:
            normalizeName(userData.last_name) ??
            normalizeName(userData.lastName) ??
            normalizeName(dataAny?.last_name as string) ??
            normalizeName(dataAny?.lastName as string),
        };

        await login(mappedUser, response.data.access_token);
        setLoading(false);

        showAlert({
          title: "Sincronizar datos",
          message:
            "¿Desea descargar sus proyectos y encuestas más recientes? La sincronización continuará en segundo plano (verá una notificación en Android). Puede usar otras apps y le avisaremos al terminar.",
          type: "info",
          cancelable: false,
          buttons: [
            {
              text: "No, continuar",
              style: "cancel",
              onPress: () => router.replace("/(tabs)"),
            },
            {
              text: "Sí, sincronizar",
              style: "default",
              onPress: () => {
                router.replace("/(tabs)");
                useSyncStore.getState().startDownloadDetached();
              },
            },
          ],
        });
        return;
      }

      showAlert({
        title: "Error",
        message: response.message || "Credenciales inválidas",
        type: "error",
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : "No se pudo conectar con el servidor";
      showAlert({
        title: "Error",
        message,
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  const iconColor =
    focusedField === "user" || focusedField === "pass"
      ? "rgba(255, 255, 255, 0.85)"
      : "rgba(255, 255, 255, 0.4)";

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={
          isCompact
            ? ["#7CB586", "#073610"]
            : ["#7CB586", "#107823", "#0C5A1A", "#073610"]
        }
        locations={isCompact ? [0, 1] : [0, 0.3, 0.6, 1]}
        start={isCompact ? { x: 0.5, y: 0 } : { x: 0, y: 0.5 }}
        end={isCompact ? { x: 0.5, y: 1 } : { x: 1, y: 0.5 }}
        style={StyleSheet.absoluteFill}
      />

      {!isCompact && (
        <Svg
          width={width}
          height={height}
          viewBox="0 0 1000 1000"
          preserveAspectRatio="none"
          style={styles.organicSvg}
          pointerEvents="none"
        >
          <Path
            d="M 0,0 L 560,0 C 580,250 580,750 560,1000 L 0,1000 Z"
            fill="white"
          />
        </Svg>
      )}

      {isCompact && (
        <View
          style={[
            styles.mobileWhiteCard,
            {
              height: Math.max(topWhiteHeight, isPhone ? 220 : 260),
              borderBottomLeftRadius: width * 0.6,
              borderBottomRightRadius: width * 0.6,
            },
          ]}
          pointerEvents="none"
        />
      )}

      <View
        pointerEvents="none"
        style={[
          styles.lottieZone,
          {
            top: centerLogoTop,
            left: isCompact ? width / 2 : width * centerLogoLeft,
            width: centerLogoSize,
            height: centerLogoSize,
            transform: [
              { translateX: -centerLogoSize / 2 },
              { translateY: -centerLogoSize / 2 },
            ],
          },
        ]}
      >
        <Image
          source={require("@/assets/images/Epsea.png")}
          style={styles.logoCenterEpsea}
          resizeMode="contain"
        />
      </View>

      <View
        pointerEvents="none"
        style={[
          styles.corner,
          styles.cornerTl,
          { left: isCompact ? 16 : 22 },
        ]}
      >
        <Image
          source={require("@/assets/images/OIP.jpg")}
          style={[styles.logoEpsea, { height: epseaLogoHeight }]}
          resizeMode="contain"
        />
      </View>

      <View
        pointerEvents="none"
        style={[
          styles.corner,
          styles.cornerTrWhite,
          isCompact
            ? { top: 20, right: 16 }
            : { top: 24, right: width * 0.44 },
        ]}
      >
        <View
          style={[
            styles.logosBottom,
            isCompact && styles.logosBottomCompact,
          ]}
        >
          <Image
            source={require("@/assets/images/logo.png")}
            style={[styles.logoUnicor, { height: unicorLogoHeight }]}
            resizeMode="contain"
          />
        </View>
      </View>

      <KeyboardAwareScrollView
        style={[
          styles.formSide,
          isCompact
            ? {
                flex: 1,
                width: "100%",
                paddingHorizontal: isPhone ? 20 : 24,
              }
            : {
                width: width * formWidthPercent,
                paddingHorizontal: isTablet ? 28 : isMedium ? 32 : 48,
                paddingVertical: 40,
              },
        ]}
        contentContainerStyle={[
          styles.formScroll,
          isCompact && {
            flexGrow: 1,
            paddingTop: formMarginTop + (isPhone ? 24 : 28),
            paddingBottom: isPhone ? 48 : 56,
          },
          !isCompact && [styles.formScrollWide, { minHeight: height }],
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        bottomOffset={isPhone ? 36 : 28}
        extraKeyboardSpace={16}
        bounces={isCompact}
      >
            <View
              style={[
                styles.formBox,
                isCompact && { maxWidth: "100%" },
              ]}
            >
              <Text
                style={[
                  styles.formTitle,
                  isTablet && { fontSize: responsiveFont(28.8) },
                  isPhone && { fontSize: responsiveFont(26.4) },
                ]}
              >
                Iniciar Sesión
              </Text>
              <Text style={styles.formSub}>
                Ingresa tus credenciales para acceder al sistema
              </Text>

              <View style={styles.fields}>
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>Usuario</Text>
                  <View style={styles.inputRow}>
                    <User
                      size={17}
                      color={
                        focusedField === "user"
                          ? "rgba(255, 255, 255, 0.85)"
                          : iconColor
                      }
                      style={styles.fieldIcon}
                    />
                    <TextInput
                      style={[
                        styles.fieldInput,
                        focusedField === "user" && styles.fieldInputFocused,
                      ]}
                      placeholder="Ingresa tu usuario"
                      placeholderTextColor="rgba(255, 255, 255, 0.32)"
                      value={username}
                      onChangeText={setUsername}
                      autoCapitalize="none"
                      autoCorrect={false}
                      returnKeyType="next"
                      onFocus={() => setFocusedField("user")}
                      onBlur={() => setFocusedField("")}
                      onSubmitEditing={() => passwordRef.current?.focus()}
                      blurOnSubmit={false}
                    />
                  </View>
                </View>

                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>Contraseña</Text>
                  <View style={styles.inputRow}>
                    <Lock
                      size={17}
                      color={
                        focusedField === "pass"
                          ? "rgba(255, 255, 255, 0.85)"
                          : iconColor
                      }
                      style={styles.fieldIcon}
                    />
                    <TextInput
                      ref={passwordRef}
                      style={[
                        styles.fieldInput,
                        styles.fieldInputPw,
                        focusedField === "pass" && styles.fieldInputFocused,
                      ]}
                      placeholder="Ingresa tu contraseña"
                      placeholderTextColor="rgba(255, 255, 255, 0.32)"
                      value={password}
                      onChangeText={setPassword}
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                      autoCorrect={false}
                      returnKeyType="done"
                      onFocus={() => setFocusedField("pass")}
                      onBlur={() => setFocusedField("")}
                      onSubmitEditing={handleLogin}
                    />
                    <Pressable
                      style={styles.eyeBtn}
                      onPress={() => setShowPassword((v) => !v)}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={
                        showPassword
                          ? "Ocultar contraseña"
                          : "Mostrar contraseña"
                      }
                    >
                      {showPassword ? (
                        <EyeOff size={17} color="rgba(255, 255, 255, 0.4)" />
                      ) : (
                        <Eye size={17} color="rgba(255, 255, 255, 0.4)" />
                      )}
                    </Pressable>
                  </View>
                </View>

                <Pressable
                  style={({ pressed }) => [
                    styles.submitBtn,
                    loading && styles.submitBtnDisabled,
                    pressed && !loading && styles.submitBtnPressed,
                  ]}
                  onPress={handleLogin}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color="#ffffff" size="small" />
                  ) : (
                    <View style={styles.btnContent}>
                      <Text style={styles.submitBtnText}>Ingresar</Text>
                      <ArrowRight size={18} color="#ffffff" />
                    </View>
                  )}
                </Pressable>
              </View>
            </View>
      </KeyboardAwareScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    width: SCREEN_WIDTH,
    minHeight: SCREEN_HEIGHT,
    overflow: "hidden",
    backgroundColor: "#073610",
  },
  organicSvg: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
  },
  mobileWhiteCard: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: "#ffffff",
    zIndex: 1,
  },
  lottieZone: {
    position: "absolute",
    zIndex: 3,
  },
  logoCenterEpsea: {
    width: "100%",
    height: "100%",
  },
  corner: {
    position: "absolute",
    zIndex: 4,
  },
  cornerTl: {
    top: 16,
    alignItems: "flex-start",
  },
  cornerTrWhite: {
    alignItems: "flex-end",
  },
  logoEpsea: {
    width: undefined,
    aspectRatio: 1.2,
    marginTop: -14,
  },
  logosBottom: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "rgba(255, 255, 255, 0.92)",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  logoUnicor: {
    width: undefined,
    marginTop: 25,
    aspectRatio: 2.5,
  },
  formSide: {
    position: "absolute",
    top: 0,
    right: 0,
    height: "100%",
    zIndex: 4,
    justifyContent: "center",
    alignItems: "center",
  },
  formScroll: {
    flexGrow: 1,
    justifyContent: "flex-start",
    width: "100%",
  },
  formScrollWide: {
    justifyContent: "center",
  },
  formBox: {
    width: "100%",
    maxWidth: 370,
  },
  formTitle: {
    fontSize: responsiveFont(33.6),
    fontWeight: "800",
    color: "#ffffff",
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  formSub: {
    fontSize: responsiveFont(13.9),
    color: "rgba(255, 255, 255, 0.58)",
    marginBottom: 34,
    lineHeight: moderateScale(20),
  },
  fields: {
    gap: 18,
  },
  field: {
    gap: 6,
  },
  fieldLabel: {
    fontSize: responsiveFont(13.1),
    fontWeight: "600",
    color: "rgba(255, 255, 255, 0.82)",
    marginLeft: 2,
  },
  inputRow: {
    position: "relative",
    justifyContent: "center",
  },
  fieldIcon: {
    position: "absolute",
    left: 13,
    zIndex: 1,
  },
  fieldInput: {
    height: 46,
    paddingLeft: 42,
    paddingRight: 14,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderWidth: 1.5,
    borderColor: "rgba(255, 255, 255, 0.18)",
    borderRadius: 12,
    fontSize: responsiveFont(14.9),
    color: "#ffffff",
  },
  fieldInputFocused: {
    backgroundColor: "rgba(255, 255, 255, 0.16)",
    borderColor: "rgba(255, 255, 255, 0.48)",
  },
  fieldInputPw: {
    paddingRight: 44,
  },
  logosBottomCompact: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 8,
  },
  eyeBtn: {
    position: "absolute",
    right: 12,
    padding: 4,
    zIndex: 1,
  },
  submitBtn: {
    height: 48,
    marginTop: 6,
    backgroundColor: "rgba(255, 255, 255, 0.18)",
    borderWidth: 1.5,
    borderColor: "rgba(255, 255, 255, 0.32)",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  submitBtnPressed: {
    backgroundColor: "rgba(255, 255, 255, 0.28)",
    borderColor: "rgba(255, 255, 255, 0.52)",
  },
  submitBtnDisabled: {
    opacity: 0.55,
  },
  btnContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  submitBtnText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: responsiveFont(16),
  },
});
