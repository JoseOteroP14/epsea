import { ThemedText } from "@/components/themed-text";
import { useAuthStore } from "@/store/useAuthStore";
import { apiFetch } from "@/utils/api";
import {
  heightPercent,
  responsiveFont,
  verticalScale,
  widthScale,
} from "@/utils/responsive";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from "react-native-reanimated";

export default function LoginScreen() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { login } = useAuthStore();
  const passwordRef = useRef<TextInput>(null);

  // Animaciones
  const scale = useSharedValue(1);
  const rotation = useSharedValue(0);
  const pulse = useSharedValue(1);

  useEffect(() => {
    // Animación de rotación permanente para el fondo
    rotation.value = withRepeat(
      withTiming(360, { duration: 30000, easing: Easing.linear }),
      -1,
      false
    );

    // Animación de pulso permanente para el fondo
    pulse.value = withRepeat(
      withTiming(1.2, { duration: 4000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, []);

  const animatedLogoStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }, { scale: pulse.value }],
    opacity: withTiming(loading ? 0.3 : 0.6),
  }));

  const animatedSplash2Style = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value * 1.1 }],
    opacity: withTiming(loading ? 0.2 : 0.4),
  }));

  const handleLogin = async () => {
    if (!username || !password) {
      Alert.alert("Error", "Por favor ingresa usuario y contraseña");
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
        login(response.data.user, response.data.access_token);
        router.replace("/(tabs)");
      } else {
        Alert.alert("Error", response.message || "Credenciales inválidas");
      }
    } catch (error: any) {
      Alert.alert(
        "Error",
        error.message || "No se pudo conectar con el servidor"
      );
    } finally {
      setLoading(false);
      scale.value = withSpring(1);
    }
  };

  const buttonAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <LinearGradient colors={["#0a1a10", "#1a3a20", "#0a1a10"]} style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardAvoid}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Decorative elements */}
            <Animated.View style={[styles.inkSplash, styles.inkSplash1, animatedLogoStyle]}>
              <LinearGradient
                colors={["rgba(46, 204, 113, 0.3)", "transparent"]}
                style={styles.inkGradient}
              />
            </Animated.View>
            <Animated.View style={[styles.inkSplash, styles.inkSplash2, animatedSplash2Style]}>
              <LinearGradient
                colors={["rgba(209, 250, 229, 0.2)", "transparent"]}
                style={styles.inkGradient}
              />
            </Animated.View>

            {/* Logo/Title Section */}
            <View style={styles.logoSection}>
              <View style={styles.logoContainer}>
                <LinearGradient
                  colors={["#2ecc71", "#27ae60"]}
                  style={styles.logoGradient}
                >
                  <ThemedText style={styles.logoText}>🌱</ThemedText>
                </LinearGradient>
              </View>
              <ThemedText style={styles.appTitle}>EPSEA</ThemedText>
              <ThemedText style={styles.appSubtitle}>
                Sistema de Gestión Agrícola
              </ThemedText>
            </View>

            {/* Login Card */}
            <BlurView intensity={20} tint="dark" style={styles.glassCard}>
              <View style={styles.cardContent}>
                <ThemedText style={styles.welcomeText}>Bienvenido</ThemedText>
                <ThemedText style={styles.instructionText}>
                  Ingresa tus credenciales para continuar
                </ThemedText>

                <View style={styles.inputContainer}>
                  <View style={styles.inputWrapper}>
                    <TextInput
                      style={styles.input}
                      placeholder="Usuario"
                      placeholderTextColor="rgba(255,255,255,0.5)"
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
                      placeholderTextColor="rgba(255,255,255,0.5)"
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
                    style={[styles.loginButton, loading && styles.loginButtonDisabled]}
                    onPress={handleLogin}
                    disabled={loading}
                    activeOpacity={0.8}
                  >
                    <LinearGradient
                      colors={["#2ecc71", "#27ae60"]}
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
            </BlurView>

            {/* Footer */}
            <View style={styles.footer}>
              <ThemedText style={styles.footerText}>
                © 2024 EPSEA - Todos los derechos reservados
              </ThemedText>
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
  logoContainer: {
    marginBottom: verticalScale(16),
  },
  logoGradient: {
    width: widthScale(80),
    height: widthScale(80),
    borderRadius: widthScale(40),
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#2ecc71",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  logoText: {
    fontSize: responsiveFont(40),
  },
  appTitle: {
    fontSize: responsiveFont(32),
    fontWeight: "bold",
    color: "#fff",
    letterSpacing: 4,
  },
  appSubtitle: {
    fontSize: responsiveFont(14),
    color: "rgba(255,255,255,0.7)",
    marginTop: verticalScale(8),
  },
  glassCard: {
    borderRadius: 24,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  cardContent: {
    padding: widthScale(24),
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  welcomeText: {
    fontSize: responsiveFont(24),
    fontWeight: "bold",
    color: "#fff",
    textAlign: "center",
    marginBottom: verticalScale(8),
  },
  instructionText: {
    fontSize: responsiveFont(14),
    color: "rgba(255,255,255,0.7)",
    textAlign: "center",
    marginBottom: verticalScale(24),
  },
  inputContainer: {
    gap: verticalScale(16),
    marginBottom: verticalScale(24),
  },
  inputWrapper: {
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  input: {
    paddingHorizontal: widthScale(16),
    paddingVertical: verticalScale(14),
    fontSize: responsiveFont(16),
    color: "#fff",
  },
  loginButton: {
    borderRadius: 12,
    overflow: "hidden",
    shadowColor: "#2ecc71",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  loginButtonDisabled: {
    opacity: 0.7,
  },
  buttonGradient: {
    paddingVertical: verticalScale(16),
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: {
    fontSize: responsiveFont(16),
    fontWeight: "bold",
    color: "#fff",
  },
  footer: {
    marginTop: verticalScale(20),
    alignItems: "center",
    paddingBottom: verticalScale(16),
  },
  footerText: {
    fontSize: responsiveFont(12),
    color: "rgba(255,255,255,0.5)",
  },
});
