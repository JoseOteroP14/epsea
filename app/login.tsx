import { ThemedText } from "@/components/themed-text";
import { useAlert } from "@/components/ui/custom-alert";
import { useAuthStore } from "@/store/useAuthStore";
import { useSyncStore } from "@/store/useSyncStore";
import { apiFetch } from "@/utils/api";
import {
    heightPercent,
    responsiveFont,
    verticalScale,
    widthScale,
} from "@/utils/responsive";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Image,
    Keyboard,
    KeyboardAvoidingView,
    Modal,
    ScrollView,
    StyleSheet,
    TextInput,
    TouchableOpacity,
    TouchableWithoutFeedback,
    View
} from "react-native";
import Animated, {
    Easing,
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withSpring,
    withTiming,
} from "react-native-reanimated";

function normalizeName(value?: string | null): string | undefined {
  if (typeof value !== "string") return undefined;
  const cleaned = value.trim().replace(/\s+/g, " ");
  return cleaned.length > 0 ? cleaned : undefined;
}

export default function LoginScreen() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncStage, setSyncStage] = useState("");
  const router = useRouter();
  const { login } = useAuthStore();
  const { showAlert } = useAlert();
  const passwordRef = useRef<TextInput>(null);

  // Animaciones
  const scale = useSharedValue(1);
  const rotation = useSharedValue(0);
  const pulse = useSharedValue(1);

  useEffect(() => {
    rotation.value = withRepeat(
      withTiming(360, { duration: 30000, easing: Easing.linear }),
      -1,
      false,
    );

    pulse.value = withRepeat(
      withTiming(1.2, { duration: 4000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, []);

  const animatedLogoStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }, { scale: pulse.value }],
    opacity: withTiming(loading ? 0.4 : 0.8),
  }));

  const animatedSplash2Style = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value * 1.1 }],
    opacity: withTiming(loading ? 0.3 : 0.7),
  }));

  const handleLogin = async () => {
    if (!username || !password) {
      showAlert({ title: "Error", message: "Por favor ingresa usuario y contraseña", type: "error" });
      return;
    }

    Keyboard.dismiss();
    setLoading(true);
    scale.value = withSpring(0.95);

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
        const dataAny = response.data as any;
        const mappedUser = {
          ...userData,
          first_name:
            normalizeName(userData.first_name) ??
            normalizeName(userData.firstName) ??
            normalizeName(dataAny?.first_name) ??
            normalizeName(dataAny?.firstName),
          last_name:
            normalizeName(userData.last_name) ??
            normalizeName(userData.lastName) ??
            normalizeName(dataAny?.last_name) ??
            normalizeName(dataAny?.lastName),
        };

        await login(mappedUser, response.data.access_token);
        setLoading(false);
        scale.value = withSpring(1);

        // Ask if user wants to sync before entering the app
        Alert.alert(
          "Sincronizar datos",
          "¿Desea sincronizar los datos con el servidor? Esto descargará sus proyectos y encuestas más recientes.",
          [
            {
              text: "No, continuar",
              style: "cancel",
              onPress: () => router.replace("/(tabs)"),
            },
            {
              text: "Sí, sincronizar",
              onPress: async () => {
                setSyncing(true);
                setSyncStage("Iniciando sincronización...");
                try {
                  await useSyncStore.getState().startDownload((progress) => {
                    setSyncStage(progress.stage);
                  });
                } catch (e) {
                  // Continue to app even if sync fails
                } finally {
                  setSyncing(false);
                  router.replace("/(tabs)");
                }
              },
            },
          ],
          { cancelable: false },
        );
        return;
      } else {
        showAlert({ title: "Error", message: response.message || "Credenciales inválidas", type: "error" });
        setLoading(false);
        scale.value = withSpring(1);
      }
    } catch (error: any) {
      showAlert({
        title: "Error",
        message: error.message || "No se pudo conectar con el servidor",
        type: "error",
      });
      setLoading(false);
      scale.value = withSpring(1);
    }
  };

  const buttonAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <LinearGradient
      colors={["#ffffff", "#d5f5e3", "#a9dfbf", "#d5f5e3", "#ffffff"]}
      locations={[0, 0.25, 0.5, 0.75, 1]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.container}
    >
      {/* Sync progress overlay — blocks all interaction during download */}
      <Modal visible={syncing} transparent animationType="fade">
        <View style={styles.syncOverlay}>
          <View style={styles.syncCard}>
            <ActivityIndicator size="large" color="#1a7a3a" style={{ marginBottom: verticalScale(16) }} />
            <ThemedText style={styles.syncTitle}>Sincronizando...</ThemedText>
            <ThemedText style={styles.syncStage}>{syncStage}</ThemedText>
          </View>
        </View>
      </Modal>
      <KeyboardAvoidingView behavior="padding" style={styles.keyboardAvoid}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            {/* Decorative elements */}
            <Animated.View
              style={[styles.inkSplash, styles.inkSplash1, animatedLogoStyle]}
            >
              <LinearGradient
                colors={[
                  "rgba(26, 122, 58, 0.45)",
                  "rgba(39, 174, 96, 0.1)",
                  "transparent",
                ]}
                style={styles.inkGradient}
              />
            </Animated.View>
            <Animated.View
              style={[
                styles.inkSplash,
                styles.inkSplash2,
                animatedSplash2Style,
              ]}
            >
              <LinearGradient
                colors={[
                  "rgba(26, 122, 58, 0.35)",
                  "rgba(209, 250, 229, 0.15)",
                  "transparent",
                ]}
                style={styles.inkGradient}
              />
            </Animated.View>

            {/* Logo/Title Section */}
            <View style={styles.logoSection}>
              <Image
                source={require("@/assets/images/Epsea.png")}
                style={styles.logoImage}
                resizeMode="contain"
              />
            </View>

            {/* Login Card — glassmorphism via View */}
            <View style={styles.glassCard}>
              <ThemedText style={styles.welcomeText}>Bienvenido</ThemedText>
              <ThemedText style={styles.instructionText}>
                Ingresa tus credenciales para continuar
              </ThemedText>

              <View style={styles.inputContainer}>
                <View style={styles.inputWrapper}>
                  <TextInput
                    style={styles.input}
                    placeholder="Usuario"
                    placeholderTextColor="rgba(0,0,0,0.35)"
                    value={username}
                    onChangeText={setUsername}
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="next"
                    onSubmitEditing={() => passwordRef.current?.focus()}
                    blurOnSubmit={false}
                  />
                </View>

                <View style={styles.inputWrapper}>
                  <TextInput
                    ref={passwordRef}
                    style={styles.input}
                    placeholder="Contraseña"
                    placeholderTextColor="rgba(0,0,0,0.35)"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                    returnKeyType="done"
                    onSubmitEditing={handleLogin}
                  />
                </View>
              </View>

              <Animated.View style={buttonAnimatedStyle}>
                <TouchableOpacity
                  style={[
                    styles.loginButton,
                    loading && styles.loginButtonDisabled,
                  ]}
                  onPress={handleLogin}
                  disabled={loading}
                  activeOpacity={0.8}
                >
                  <LinearGradient
                    colors={["#1a7a3a", "#156b33"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.buttonGradient}
                  >
                    {loading ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <ThemedText style={styles.buttonText}>
                        Iniciar Sesión
                      </ThemedText>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
              </Animated.View>
            </View>
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardAvoid: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: widthScale(24),
    paddingVertical: verticalScale(20),
  },
  inkSplash: {
    position: "absolute",
    borderRadius: 999,
    overflow: "hidden",
  },
  inkSplash1: {
    width: widthScale(300),
    height: widthScale(300),
    top: -heightPercent(10),
    right: -widthScale(20),
  },
  inkSplash2: {
    width: widthScale(250),
    height: widthScale(250),
    bottom: -heightPercent(15),
    left: -widthScale(15),
  },
  inkGradient: {
    width: "100%",
    height: "100%",
    borderRadius: 999,
  },
  logoSection: {
    alignItems: "center",
    marginBottom: verticalScale(40),
  },
  logoImage: {
    width: widthScale(260),
    height: widthScale(140),
    marginBottom: verticalScale(16),
  },
  glassCard: {
    borderRadius: 24,
    padding: widthScale(24),
    backgroundColor: "rgba(255,255,255,0.45)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.8)",
  },
  welcomeText: {
    fontSize: responsiveFont(24),
    fontWeight: "bold",
    color: "#1a3a20",
    textAlign: "center",
    marginBottom: verticalScale(8),
  },
  instructionText: {
    fontSize: responsiveFont(17),
    color: "rgba(0,0,0,0.5)",
    textAlign: "center",
    marginBottom: verticalScale(24),
  },
  inputContainer: {
    gap: verticalScale(16),
    marginBottom: verticalScale(24),
  },
  inputWrapper: {
    backgroundColor: "rgba(255,255,255,0.55)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.8)",
  },
  input: {
    paddingHorizontal: widthScale(16),
    paddingVertical: verticalScale(14),
    fontSize: responsiveFont(17),
    color: "#11181C",
  },
  loginButton: {
    borderRadius: 12,
    overflow: "hidden",
    shadowColor: "#1a7a3a",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  loginButtonDisabled: {
  },
  buttonGradient: {
    paddingVertical: verticalScale(16),
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: {
    fontSize: responsiveFont(17),
    fontWeight: "bold",
    color: "#fff",
  },
  syncOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: widthScale(24),
  },
  syncCard: {
    backgroundColor: "#fff",
    borderRadius: widthScale(16),
    padding: widthScale(28),
    alignItems: "center",
    width: "100%",
    maxWidth: widthScale(340),
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  syncTitle: {
    fontSize: responsiveFont(19),
    fontWeight: "700",
    color: "#1a3a20",
    marginBottom: verticalScale(8),
  },
  syncStage: {
    fontSize: responsiveFont(15),
    color: "rgba(0,0,0,0.5)",
    textAlign: "center",
  },
});
