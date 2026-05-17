import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import {
    DarkTheme,
    DefaultTheme,
    ThemeProvider,
} from "@react-navigation/native";
import {
    Stack,
    useRootNavigationState,
    useRouter,
    useSegments,
} from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import "react-native-reanimated";

import { DatabaseProvider } from "@/components/database-provider";
import { SyncBackgroundCoordinator } from "@/components/sync-background-coordinator";
import { registerAndroidForegroundSyncService } from "@/utils/sync/android-foreground-sync";

registerAndroidForegroundSyncService();
import { AlertProvider } from "@/components/ui/custom-alert";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useAuthStore } from "@/store/useAuthStore";

export const unstable_settings = {
  anchor: "(tabs)",
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const { isAuthenticated, isHydrated } = useAuthStore();
  const segments = useSegments();
  const router = useRouter();
  const navigationState = useRootNavigationState();
  const [isMounted, setIsMounted] = React.useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    // Wait for everything to be ready: hydration complete, component mounted, navigation state initialized, and segments available
    if (!isHydrated || !isMounted || !navigationState?.key || !segments) return;

    const performRedirect = () => {
      const currentSegment = segments[0];

      if (!isAuthenticated && currentSegment !== "login") {
        router.replace("/login");
      } else if (isAuthenticated && currentSegment === "login") {
        router.replace("/(tabs)");
      }
    };

    // Use requestAnimationFrame to ensure the navigator is fully painted and stable
    const frame = requestAnimationFrame(performRedirect);
    return () => cancelAnimationFrame(frame);
  }, [isAuthenticated, isHydrated, segments, navigationState?.key, isMounted, router]);

  return (
    <DatabaseProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <KeyboardProvider>
        <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
          <BottomSheetModalProvider>
            <AlertProvider>
            <SyncBackgroundCoordinator />
            <Stack screenOptions={{ animation: "fade", animationDuration: 250 }}>
              <Stack.Screen name="login" options={{ headerShown: false }} />
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen
                name="modal"
                options={{ presentation: "modal", title: "Modal" }}
              />
              <Stack.Screen name="+not-found" options={{ title: "Oops!" }} />
            </Stack>
            <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />
            </AlertProvider>
          </BottomSheetModalProvider>
        </ThemeProvider>
        </KeyboardProvider>
      </GestureHandlerRootView>
    </DatabaseProvider>
  );
}
